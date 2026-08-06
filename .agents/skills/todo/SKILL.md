---
name: todo
description: Use for Next Todo task changes, queries, and digests.
---

# Next Todo for Codex

Read the canonical workflow at `../../../skills/todo/SKILL.md` completely before acting. Use the same API contract, action rules, safety requirements, and verification criteria defined there.

## Codex runtime adaptations

1. Resolve `../../../skills/todo/scripts/todo-api.sh` relative to this file and run that absolute path. Do not use the Hermes-only `${HERMES_SKILL_DIR}` token.
2. Check that `NEXT_TODO_API_URL` and either `OPENCLAW_API_KEY` (preferred) or `NEXT_TODO_JWT` (compatibility fallback) are present in the command environment without printing their values. If the URL or both credentials are missing, tell the user which variable to configure; never read `~/.hermes/.env` directly or ask them to paste a credential into chat.
3. Use the host Codex automation capability when the user asks for a schedule. Ignore the Hermes-specific `cronjob` example in the canonical workflow.
4. Prefer the bundled script over inline `curl` commands. Preserve its non-zero exit status and report API failures accurately.
5. Preserve the canonical list/tag distinction: a “清单/列表” uses `--list-id` or `--list-name`; only an explicit “标签/tag” request uses `--tags`.
6. On Windows, run the client from Git Bash or WSL with `bash`, `curl`, `jq`, and `mktemp`; do not invoke the `.sh` file from a PowerShell-only terminal.
