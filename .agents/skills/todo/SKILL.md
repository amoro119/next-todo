---
name: todo
description: Use for Next Todo task changes, queries, and digests.
---

# Next Todo for Codex

Read the canonical workflow at `../../../skills/todo/SKILL.md` completely before acting. Use the same API contract, action rules, safety requirements, and verification criteria defined there.

## Codex runtime adaptations

1. Resolve `../../../skills/todo/scripts/todo-api.sh` relative to this file and run that absolute path. Do not use the Hermes-only `${HERMES_SKILL_DIR}` token.
2. Check that `NEXT_TODO_API_URL` and `OPENCLAW_API_KEY` are present in the command environment without printing their values. If either is missing, tell the user which variable to configure; never ask them to paste the API key into chat.
3. Use the host Codex automation capability when the user asks for a schedule. Ignore the Hermes-specific `cronjob` example in the canonical workflow.
4. Prefer the bundled script over inline `curl` commands. Preserve its non-zero exit status and report API failures accurately.
5. Preserve the canonical list/tag distinction: a “清单/列表” uses `--list-id` or `--list-name`; only an explicit “标签/tag” request uses `--tags`.
