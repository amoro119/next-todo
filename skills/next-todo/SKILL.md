---
name: next-todo
description: Use for Next Todo task changes, queries, and digests.
version: 1.1.0
metadata:
  hermes:
    tags: [productivity, todo, tasks, automation]
    category: productivity
    requires_toolsets: [terminal]
required_environment_variables:
  - name: NEXT_TODO_API_URL
    prompt: Next Todo API base URL
    required_for: Calling the Next Todo ingest endpoint
  - name: OPENCLAW_API_KEY
    prompt: Preferred Next Todo ingest API key
    required_for: Authenticating Next Todo requests
    optional: true
  - name: NEXT_TODO_JWT
    prompt: Existing Next Todo user JWT (compatibility fallback)
    required_for: Authenticating Next Todo requests when OPENCLAW_API_KEY is unavailable
    optional: true
---

# Next Todo

## When to Use

Use this skill when the user asks to create, edit, reschedule, move, complete, list, inspect, or filter tasks, or asks for today's tasks or a daily digest.

## Procedure

Use the `terminal` tool and bundled client for every API call. Do not construct JSON with string interpolation and do not print either credential.

The `metadata.hermes.tags` in this file are skill-catalog labels only; they are not tags for a task.

## Environment Setup

Hermes loads this skill's environment from `$HERMES_HOME/.env`, which defaults to `~/.hermes/.env`. Configure the API URL there and use the dedicated `OPENCLAW_API_KEY` as the preferred credential:

```dotenv
NEXT_TODO_API_URL=https://<project-ref>.supabase.co/functions/v1
OPENCLAW_API_KEY=<dedicated-ingest-secret>
```

Existing installations may use `NEXT_TODO_JWT`; the client accepts it as a compatibility fallback, but user JWTs can expire and should eventually be replaced by the dedicated key. Do not move production secrets into the repository. Codex should receive the same variables through its process/session environment rather than reading Hermes' private file directly. Never print either credential or ask the user to paste one into chat.

## Platform Support

On Windows, Hermes runs terminal commands through Git Bash. Install Git for Windows and `jq`, and ensure `bash`, `curl`, `jq`, and `mktemp` are available in that Bash environment. WSL is the most predictable option. A PowerShell-only terminal is not supported by this Bash client; report the missing runtime instead of rewriting the request as an inline PowerShell call.

```bash
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" <action> [options]
```

## Operating rules

1. Infer task fields from the user's request. Ask only when a missing value would materially change the result.
2. For `update` and `complete`, obtain the full task UUID first. If the user supplied only a title, query tasks and continue only when one match is unambiguous; otherwise ask the user to choose.
3. Pass only fields the user explicitly asked to change. Omitted update options remain unchanged.
4. Interpret natural-language dates and times in `Asia/Shanghai`. The client accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS]`, or the API-compatible `YYYY-MM-DDTHH:MM:SS[.sss]Z` form.
5. Treat a date-only `--due-date` as 23:59:59 and a date-only `--start-date` as 00:00:00. If neither date is provided during creation, the server assigns today's default range.
6. Keep list and tag semantics separate: “清单/列表” maps to `--list-id` or `--list-name`; “标签/tag” maps to `--tags`. Never put a list name, list description, or list request into `--tags`.
7. If the user gives a list name, pass `--list-name` and let the API resolve it. Do not invent a UUID. If the API reports that the list is missing or ambiguous, ask the user to choose a list; do not fall back to tags.
8. Summarize successful JSON responses for the user. Preserve full UUIDs for tasks that may be updated or completed in a follow-up.
9. On a non-zero client exit, report the API error concisely. Never claim a mutation succeeded unless the response has a 2xx HTTP status.

## Create

```bash
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" create \
  --title "提交周报" \
  --content "包含本周风险和下周计划" \
  --due-date "2026-08-07" \
  --priority 2
```

Options:

| Option | Required | Meaning |
|---|---:|---|
| `--title` | yes | Non-empty task title |
| `--content` | no | Task details |
| `--due-date` | no | Due date/time |
| `--start-date` | no | Start date/time |
| `--priority` | no | `0` none, `1` low, `2` medium, `3` high |
| `--tags` | no | Comma-separated tags |
| `--list-id` | no | Destination list UUID |
| `--list-name` | no | Destination list name; resolved to `list_id` by the API |
| `--event-id` | no | Stable idempotency key; generated when omitted |

Reuse the same `--event-id` when intentionally retrying a create request after an uncertain network result.

## Update

```bash
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" update \
  --task-id "00000000-0000-4000-8000-000000000000" \
  --title "提交最终周报" \
  --priority 3
```

Supported changes are `--title`, `--content`, `--due-date`, `--start-date`, `--priority`, `--tags`, `--list-id`, and `--list-name`. Use `--clear-list` to remove a task from its list. Empty `--content ""` or `--tags ""` clears that field. The current API does not support clearing start or due dates.

## Complete

```bash
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" complete \
  --task-id "00000000-0000-4000-8000-000000000000"
```

`status: already_completed` is also a successful, idempotent result even though the current response omits `success: true`.

## Query

```bash
# Pending tasks
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" query --status pending

# A bounded list
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" query --status all --limit 20

# Tasks in one list
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" query \
  --status pending \
  --list-id "00000000-0000-4000-8000-000000000000"

# Tasks in a named list
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" query \
  --status pending \
  --list-name "工作"

# One task
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" query \
  --task-id "00000000-0000-4000-8000-000000000000"
```

`--status` accepts `all`, `pending`, or `completed` and defaults to `all`. `--limit` must be a positive integer. When presenting a list, include status, title, list name when present, due date when present, and the full UUID.

## Digest

```bash
bash "${HERMES_SKILL_DIR}/scripts/todo-api.sh" digest
```

Pass `--limit N` only when the user explicitly asks for a bounded digest. Return `digest.summary`; use `digest.stats` when a compact numerical overview is useful.

## Automation

Create a schedule only when the user explicitly asks for automation. Use Hermes' native `cronjob` tool so the scheduled session loads this skill:

```text
cronjob(
  action="create",
  name="daily-todo-digest",
  schedule="every day at 08:00",
  skill="next-todo",
  prompt="调用 next-todo skill 的 digest，并发送摘要。",
  deliver="origin",
)
```

Confirm the delivery target when `origin` is unavailable or the user wants another channel. After creation, list the job and report its ID, schedule, and delivery target.

## Pitfalls

- If `bash`, `curl`, or `jq` is unavailable, report the missing binary. Do not install software without the user's approval.
- On Windows, verify the command is running inside Git Bash or WSL; do not assume PowerShell can execute this `.sh` client.
- If authentication fails, check the variable names and runtime environment: `OPENCLAW_API_KEY` is preferred; `NEXT_TODO_JWT` is a temporary compatibility fallback. Do not search arbitrary files for secrets.
- Treat `NEXT_TODO_API_URL` as the base functions URL; the client appends `/openclaw-ingest`.
- Let Hermes collect missing environment variables through its secure skill setup. Never ask the user to paste `OPENCLAW_API_KEY` into a chat.
- Do not use partial task IDs for mutations; the API requires a full UUID.
- Do not represent a list as a tag. A list is a relation (`list_id`); tags remain a comma-separated tag field.
- Do not retry a create request with a new event ID after an uncertain response, because that can create a duplicate.

API outcomes:

| HTTP | Meaning |
|---:|---|
| 200-299 | Request accepted; inspect `status` and returned data |
| 400 | Invalid action or parameters |
| 401 | Invalid OpenClaw API key or user token |
| 404 | Task or list not found |
| 409 | The list name is ambiguous, or a newer server revision conflicted with the mutation |
| 500 | Server or sync failure |

## Verification

- The bundled client rejects invalid options before sending a request and exits non-zero for transport errors, non-JSON responses, and non-2xx statuses.
- For `create`, verify `status` is `created` or `ignored_duplicate` and retain `task_id`.
- For `update`, verify `status` is `updated`; for `complete`, accept `completed` or `already_completed`.
- For `query`, verify `count` matches the returned task array when both are present.
- For automation, call `cronjob(action="list")` after creation and confirm the saved schedule and attached `next-todo` skill.
