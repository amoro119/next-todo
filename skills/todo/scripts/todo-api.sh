#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  todo-api.sh create --title TITLE [--content TEXT] [--due-date DATE] [--start-date DATE]
                     [--priority 0-3] [--tags CSV] [--list-id UUID | --list-name NAME]
                     [--event-id ID]
  todo-api.sh update --task-id UUID [--title TITLE] [--content TEXT] [--due-date DATE]
                     [--start-date DATE] [--priority 0-3] [--tags CSV]
                     [--list-id UUID | --list-name NAME | --clear-list]
  todo-api.sh complete --task-id UUID
  todo-api.sh query [--task-id UUID] [--status all|pending|completed]
                    [--limit N] [--list-id UUID | --list-name NAME]
  todo-api.sh digest [--limit N]

Dates are interpreted as Asia/Shanghai wall-clock values. Accepted forms:
  YYYY-MM-DD
  YYYY-MM-DDTHH:MM[:SS]
  YYYY-MM-DDTHH:MM:SS[.sss]Z
EOF
}

die() {
  printf 'todo-api: %s\n' "$*" >&2
  exit 2
}

require_value() {
  local option="$1"
  local remaining="$2"
  [[ "$remaining" -ge 2 ]] || die "$option requires a value"
}

validate_uuid() {
  local value="$1"
  local label="$2"
  [[ "$value" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[1-8][[:xdigit:]]{3}-[89AaBb][[:xdigit:]]{3}-[[:xdigit:]]{12}$ ]] \
    || die "$label must be a full UUID"
}

normalize_datetime() {
  local value="$1"
  local boundary="$2"

  if [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    if [[ "$boundary" == "end" ]]; then
      printf '%sT23:59:59.000Z' "$value"
    else
      printf '%sT00:00:00.000Z' "$value"
    fi
    return
  fi

  if [[ "$value" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})[T\ ]([0-9]{2}:[0-9]{2})$ ]]; then
    printf '%sT%s:00.000Z' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return
  fi

  if [[ "$value" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2})[T\ ]([0-9]{2}:[0-9]{2}:[0-9]{2})$ ]]; then
    printf '%sT%s.000Z' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return
  fi

  if [[ "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$ ]]; then
    printf '%s' "$value"
    return
  fi

  die "invalid date/time '$value'"
}

json_set_string() {
  local key="$1"
  local value="$2"
  payload="$(jq --arg key "$key" --arg value "$value" '. + {($key): $value}' <<<"$payload")"
}

json_set_number() {
  local key="$1"
  local value="$2"
  payload="$(jq --arg key "$key" --argjson value "$value" '. + {($key): $value}' <<<"$payload")"
}

json_set_null() {
  local key="$1"
  payload="$(jq --arg key "$key" '. + {($key): null}' <<<"$payload")"
}

[[ $# -ge 1 ]] || {
  usage >&2
  exit 2
}

action="$1"
shift

title=''
content=''
due_date=''
start_date=''
priority=''
tags=''
list_id=''
list_name=''
event_id=''
task_id=''
status='all'
limit=''

title_set=0
content_set=0
due_date_set=0
start_date_set=0
priority_set=0
tags_set=0
list_mode='unset'
event_id_set=0
task_id_set=0
status_set=0
limit_set=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)
      require_value "$1" "$#"
      title="$2"
      title_set=1
      shift 2
      ;;
    --content)
      require_value "$1" "$#"
      content="$2"
      content_set=1
      shift 2
      ;;
    --due-date)
      require_value "$1" "$#"
      due_date="$(normalize_datetime "$2" end)"
      due_date_set=1
      shift 2
      ;;
    --start-date)
      require_value "$1" "$#"
      start_date="$(normalize_datetime "$2" start)"
      start_date_set=1
      shift 2
      ;;
    --priority)
      require_value "$1" "$#"
      [[ "$2" =~ ^[0-3]$ ]] || die "--priority must be 0, 1, 2, or 3"
      priority="$2"
      priority_set=1
      shift 2
      ;;
    --tags)
      require_value "$1" "$#"
      tags="$2"
      tags_set=1
      shift 2
      ;;
    --list-id)
      require_value "$1" "$#"
      [[ "$list_mode" == 'unset' ]] || die "--list-id cannot be combined with another list option"
      validate_uuid "$2" '--list-id'
      list_id="$2"
      list_mode='value'
      shift 2
      ;;
    --list-name)
      require_value "$1" "$#"
      [[ -n "$2" ]] || die "--list-name cannot be empty"
      [[ "$list_mode" == 'unset' ]] || die "--list-name cannot be combined with another list option"
      list_name="$2"
      list_mode='name'
      shift 2
      ;;
    --clear-list)
      [[ "$list_mode" == 'unset' ]] || die "--clear-list cannot be combined with another list option"
      list_mode='null'
      shift
      ;;
    --event-id)
      require_value "$1" "$#"
      event_id="$2"
      event_id_set=1
      shift 2
      ;;
    --task-id)
      require_value "$1" "$#"
      validate_uuid "$2" '--task-id'
      task_id="$2"
      task_id_set=1
      shift 2
      ;;
    --status)
      require_value "$1" "$#"
      case "$2" in
        all|pending|completed) ;;
        *) die "--status must be all, pending, or completed" ;;
      esac
      status="$2"
      status_set=1
      shift 2
      ;;
    --limit)
      require_value "$1" "$#"
      [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "--limit must be a positive integer"
      limit="$2"
      limit_set=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option '$1'"
      ;;
  esac
done

payload='{}'

case "$action" in
  create)
    [[ "$title_set" -eq 1 && -n "$title" ]] || die "create requires a non-empty --title"
    [[ "$task_id_set" -eq 0 && "$status_set" -eq 0 && "$limit_set" -eq 0 ]] \
      || die "create received an option for another action"
    [[ "$list_mode" != 'null' ]] || die "create does not support --clear-list"

    if [[ "$event_id_set" -eq 0 ]]; then
      event_id="evt_todo_$(date +%s)_$$_${RANDOM}"
    fi
    [[ -n "$event_id" ]] || die "--event-id cannot be empty"
    payload="$(jq -n \
      --arg action 'create' \
      --arg event_id "$event_id" \
      --arg title "$title" \
      '{action: $action, event_id: $event_id, title: $title}')"
    [[ "$content_set" -eq 0 ]] || json_set_string content "$content"
    [[ "$due_date_set" -eq 0 ]] || json_set_string due_date "$due_date"
    [[ "$start_date_set" -eq 0 ]] || json_set_string start_date "$start_date"
    [[ "$priority_set" -eq 0 ]] || json_set_number priority "$priority"
    [[ "$tags_set" -eq 0 ]] || json_set_string tags "$tags"
    [[ "$list_mode" != 'value' ]] || json_set_string list_id "$list_id"
    [[ "$list_mode" != 'name' ]] || json_set_string list_name "$list_name"
    ;;
  update)
    [[ "$task_id_set" -eq 1 ]] || die "update requires --task-id"
    [[ "$event_id_set" -eq 0 && "$status_set" -eq 0 && "$limit_set" -eq 0 ]] \
      || die "update received an option for another action"
    [[ "$title_set" -eq 0 || -n "$title" ]] || die "--title cannot be empty"
    [[ "$title_set" -eq 1 || "$content_set" -eq 1 || "$due_date_set" -eq 1 \
      || "$start_date_set" -eq 1 || "$priority_set" -eq 1 || "$tags_set" -eq 1 \
      || "$list_mode" != 'unset' ]] || die "update requires at least one changed field"

    payload="$(jq -n --arg action 'update' --arg task_id "$task_id" \
      '{action: $action, task_id: $task_id}')"
    [[ "$title_set" -eq 0 ]] || json_set_string title "$title"
    [[ "$content_set" -eq 0 ]] || json_set_string content "$content"
    [[ "$due_date_set" -eq 0 ]] || json_set_string due_date "$due_date"
    [[ "$start_date_set" -eq 0 ]] || json_set_string start_date "$start_date"
    [[ "$priority_set" -eq 0 ]] || json_set_number priority "$priority"
    [[ "$tags_set" -eq 0 ]] || json_set_string tags "$tags"
    [[ "$list_mode" != 'value' ]] || json_set_string list_id "$list_id"
    [[ "$list_mode" != 'name' ]] || json_set_string list_name "$list_name"
    [[ "$list_mode" != 'null' ]] || json_set_null list_id
    ;;
  complete)
    [[ "$task_id_set" -eq 1 ]] || die "complete requires --task-id"
    [[ "$title_set" -eq 0 && "$content_set" -eq 0 && "$due_date_set" -eq 0 \
      && "$start_date_set" -eq 0 && "$priority_set" -eq 0 && "$tags_set" -eq 0 \
      && "$list_mode" == 'unset' && "$event_id_set" -eq 0 && "$status_set" -eq 0 \
      && "$limit_set" -eq 0 ]] || die "complete received an option for another action"
    payload="$(jq -n --arg action 'complete' --arg task_id "$task_id" \
      '{action: $action, task_id: $task_id}')"
    ;;
  query)
    [[ "$title_set" -eq 0 && "$content_set" -eq 0 && "$due_date_set" -eq 0 \
      && "$start_date_set" -eq 0 && "$priority_set" -eq 0 && "$tags_set" -eq 0 \
      && "$list_mode" != 'null' && "$event_id_set" -eq 0 ]] \
      || die "query received an option for another action"
    [[ "$task_id_set" -eq 0 || ( "$status_set" -eq 0 && "$limit_set" -eq 0 \
      && "$list_mode" == 'unset' ) ]] || die "--task-id cannot be combined with query filters"

    payload="$(jq -n --arg action 'query' '{action: $action}')"
    if [[ "$task_id_set" -eq 1 ]]; then
      json_set_string task_id "$task_id"
    else
      json_set_string status "$status"
      [[ "$limit_set" -eq 0 ]] || json_set_number limit "$limit"
      [[ "$list_mode" != 'value' ]] || json_set_string list_id "$list_id"
      [[ "$list_mode" != 'name' ]] || json_set_string list_name "$list_name"
    fi
    ;;
  digest)
    [[ "$title_set" -eq 0 && "$content_set" -eq 0 && "$due_date_set" -eq 0 \
      && "$start_date_set" -eq 0 && "$priority_set" -eq 0 && "$tags_set" -eq 0 \
      && "$list_mode" == 'unset' && "$event_id_set" -eq 0 && "$task_id_set" -eq 0 \
      && "$status_set" -eq 0 ]] || die "digest received an option for another action"
    payload="$(jq -n --arg action 'digest' '{action: $action}')"
    [[ "$limit_set" -eq 0 ]] || json_set_number limit "$limit"
    ;;
  *)
    usage >&2
    die "unknown action '$action'"
    ;;
esac

[[ -n "${NEXT_TODO_API_URL:-}" ]] || die 'NEXT_TODO_API_URL is not set'
[[ -n "${OPENCLAW_API_KEY:-}" ]] || die 'OPENCLAW_API_KEY is not set'

response_file="$(mktemp "${TMPDIR:-/tmp}/todo-api.XXXXXX")"
trap 'rm -f "$response_file"' EXIT
api_url="${NEXT_TODO_API_URL%/}/openclaw-ingest"

if ! http_code="$(curl \
  --silent \
  --show-error \
  --connect-timeout 10 \
  --max-time 60 \
  --output "$response_file" \
  --write-out '%{http_code}' \
  --request POST \
  --header "Authorization: Bearer ${OPENCLAW_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data-binary "$payload" \
  "$api_url")"; then
  if [[ "$action" == 'create' ]]; then
    printf 'todo-api: retry this create with --event-id %s\n' "$event_id" >&2
  fi
  die 'request failed before receiving an HTTP response'
fi

if ! jq -e . "$response_file" >/dev/null 2>&1; then
  printf 'todo-api: API returned non-JSON content (HTTP %s)\n' "$http_code" >&2
  cat "$response_file" >&2
  exit 1
fi

case "$http_code" in
  2??)
    jq . "$response_file"
    ;;
  *)
    printf 'todo-api: API request failed (HTTP %s)\n' "$http_code" >&2
    jq . "$response_file" >&2
    if [[ "$action" == 'create' ]]; then
      printf 'todo-api: retry this create with --event-id %s\n' "$event_id" >&2
    fi
    exit 1
    ;;
esac
