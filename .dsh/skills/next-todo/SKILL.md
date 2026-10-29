---
name: next-todo
description: Manage Next Todo tasks, lists, and daily digests when the user asks to create, edit, reschedule, move, complete, query, or summarize Next Todo tasks.
---

# Next Todo for DeepSeek Harness

## When to Use

Use this skill when the user asks to create, edit, reschedule, move, complete, list, inspect, or filter tasks, or asks for today's tasks or a daily digest.

## Procedure

Use the DSH `bash` tool and bundled client for every API call. Resolve `scripts/todo-api.sh` against the base directory supplied in `<skill_resources>`, then use that absolute path in every command. DSH does not set a skill-directory environment variable; `<skill-dir>` below stands for that resolved directory. Do not construct JSON with string interpolation and do not print either credential.

## Built-in DSH todo plugin

Next Todo tasks belong to the external API. DSH's `todo_write` only updates a session's implementation plan; never use it as a substitute for creating, querying, or completing Next Todo tasks.

When the user asks to disable or restore the built-in `@deepseek-ai/dsh-tool-todo` plugin, use `scripts/configure-tool-todo.py` (Python 3 and PyYAML required). Resolve it against this skill's resource base. Use the active `DSH_PROFILE_DIR` for the profile path; identify the installed `@deepseek-ai/dsh-web-app/presets` directory from the DSH installation. Do not guess a different profile or edit installed package files.

```bash
python3 "<skill-dir>/scripts/configure-tool-todo.py" disable \
  --profile-dir "<active-profile-dir>" \
  --preset-source-dir "<installed-dsh-web-app>/presets"
```

Use `status` to inspect or `enable` to restore the tool. Run `status` after changing it. The helper preserves existing preset settings, writes `disabled: true` to `tool-todo` inside standard/cordis/ptc preset configurations, and creates a private backup of the profile patch. Cordis replaces each preset's complete config; the helper retains that current config rather than supplying a partial plugin list. Saved preset overrides freeze their plugin lists, so review them against shipped presets after DSH upgrades.

This is a persistent profile-wide switch, not a per-skill or per-turn toggle. Only change it when requested; ordinary task operations must not rewrite profile configuration. Already running agents keep their previous preset generation. Report that DSH must reload the profile and that existing sessions need a host restart to adopt the new preset; do not claim the tool has disappeared from a live session solely because the file changed. Coordinate a restart separately if it would interrupt active work.

## Environment Setup

The client accepts `NEXT_TODO_API_URL` and either `OPENCLAW_API_KEY` (preferred) or `NEXT_TODO_JWT` (compatibility fallback) from the runtime environment. As an optional local setup, this DSH client loads `${DSH_HOME:-$HOME/.dsh}/next-todo.env`; this is a client convention, not automatic DSH environment collection. Exported runtime values take precedence over that file.

```dotenv
NEXT_TODO_API_URL=https://<project-ref>.supabase.co/functions/v1
OPENCLAW_API_KEY=<dedicated-ingest-secret>
```

Keep the optional file private (`chmod 600`) and outside the repository. Run the bundled client directly before diagnosing missing configuration: checking `env`, `printenv`, or shell variable presence in the parent process does not test the private file loaded by the client. Do not block execution because the parent process lacks these variables. Only report missing configuration if the client itself reports it. Authentication requires the URL and at least one credential; `NEXT_TODO_JWT` is not required when `OPENCLAW_API_KEY` is configured, and vice versa.

If the client reports missing configuration, identify the missing variable names and ask the user to configure them locally. An HTTP 401 means the server rejected authentication, not that the parent environment was empty. Do not print credential values, request credentials in chat, or read another agent's private environment file. The script checks its required variables before sending a request.

## Platform Support

The client requires Bash, curl, jq, and mktemp. On Windows, use a Bash-capable DSH runtime such as Git Bash or WSL. Install Git for Windows and `jq`, and ensure `bash`, `curl`, `jq`, and `mktemp` are available in that Bash environment. WSL is the most predictable option. A PowerShell-only terminal is not supported by this Bash client; report the missing runtime instead of rewriting the request as an inline PowerShell call.

```bash
bash "<skill-dir>/scripts/todo-api.sh" <action> [options]
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
bash "<skill-dir>/scripts/todo-api.sh" create \
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
bash "<skill-dir>/scripts/todo-api.sh" update \
  --task-id "00000000-0000-4000-8000-000000000000" \
  --title "提交最终周报" \
  --priority 3
```

Supported changes are `--title`, `--content`, `--due-date`, `--start-date`, `--priority`, `--tags`, `--list-id`, and `--list-name`. Use `--clear-list` to remove a task from its list. Empty `--content ""` or `--tags ""` clears that field. The current API does not support clearing start or due dates.

## Complete

```bash
bash "<skill-dir>/scripts/todo-api.sh" complete \
  --task-id "00000000-0000-4000-8000-000000000000"
```

`status: already_completed` is also a successful, idempotent result even though the current response omits `success: true`.

## Query

```bash
# Pending tasks
bash "<skill-dir>/scripts/todo-api.sh" query --status pending

# A bounded list
bash "<skill-dir>/scripts/todo-api.sh" query --status all --limit 20

# Tasks in one list
bash "<skill-dir>/scripts/todo-api.sh" query \
  --status pending \
  --list-id "00000000-0000-4000-8000-000000000000"

# Tasks in a named list
bash "<skill-dir>/scripts/todo-api.sh" query \
  --status pending \
  --list-name "工作"

# One task
bash "<skill-dir>/scripts/todo-api.sh" query \
  --task-id "00000000-0000-4000-8000-000000000000"
```

`--status` accepts `all`, `pending`, or `completed` and defaults to `all`. `--limit` must be a positive integer. When presenting a list, include status, title, list name when present, due date when present, and the full UUID.

## Digest

```bash
bash "<skill-dir>/scripts/todo-api.sh" digest
```

Pass `--limit N` only when the user explicitly asks for a bounded digest. Return `digest.summary`; use `digest.stats` when a compact numerical overview is useful.

## Automation

Create a schedule only when the user explicitly asks for automation. Use the DSH `schedule_create` tool when it is available. For a daily 08:00 digest:

```json
{
  "title": "每日待办摘要",
  "prompt": "加载 next-todo skill，执行 digest，并在当前会话返回摘要。",
  "daily": {"time": "08:00:00", "time_zone": "Asia/Shanghai"}
}
```

After creation, use `schedule_list` to verify the saved ID, time zone, schedule, and prompt. DSH delivers the scheduled prompt to the originating session; sending results to another channel requires an available integration and the user's request. If schedule tools are unavailable, report that limitation; do not invent a scheduling tool or install a scheduler.

## Pitfalls

- If `bash`, `curl`, or `jq` is unavailable, report the missing binary. Do not install software without the user's approval.
- On Windows, verify the command is running inside Git Bash or WSL; do not assume PowerShell can execute this `.sh` client.
- If authentication fails, check the variable names and runtime environment: `OPENCLAW_API_KEY` is preferred; `NEXT_TODO_JWT` is a temporary compatibility fallback. Do not search arbitrary files for secrets.
- Treat `NEXT_TODO_API_URL` as the base functions URL; the client appends `/openclaw-ingest`.
- DSH does not collect the `required_environment_variables` frontmatter. Use the runtime environment or the private DSH client environment file documented above.
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
- For automation, call `schedule_list` after creation and confirm the saved schedule, time zone, and prompt that loads `next-todo`.
