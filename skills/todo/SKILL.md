---
name: todo
description: Next-todo task management skill. Create, complete, query tasks, and generate daily digests via the openclaw-ingest and daily-digest APIs.
metadata: {"openclaw":{"requires":{"env":["NEXT_TODO_API_URL","NEXT_TODO_JWT"],"bins":["curl","jq"]}}}
---

# Todo Skill

Unified skill for managing todo tasks in next-todo.

## Actions

This skill supports multiple actions via the `action` field:

- `create` - Create a new task
- `complete` - Mark a task as completed
- `query` - Query tasks (all, pending, completed, or specific task)
- `digest` - Generate daily digest

---

## Action: Create

### Trigger

- "帮我添加一个任务：..."
- "记录一下：..."
- "创建一个待办事项..."
- "提醒我..."
- "加一条 todo..."

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Task title |
| `content` | No | Task details |
| `due_date` | No | Due date (ISO 8601) |
| `priority` | No | 0-3 (0=none, 1=low, 2=medium, 3=high) |

### Execution

```bash
# Generate event_id
event_id="evt_openclaw_$(date +%s%N)"

# Create task
curl -s -X POST "${NEXT_TODO_API_URL}/functions/v1/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"create\",
    \"event_id\": \"$event_id\",
    \"title\": \"$title\",
    \"content\": \"${content:-}\",
    \"due_date\": \"${due_date:-}\",
    \"priority\": ${priority:-0}
  }"
```

---

## Action: Complete

### Trigger

- "完成任务 {task_id}"
- "把 xxx 标记为已完成"
- "完成 todo {task_id}"

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `task_id` | Yes | UUID of task to complete |

### Execution

```bash
curl -s -X POST "${NEXT_TODO_API_URL}/functions/v1/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"complete\",
    \"task_id\": \"$task_id\"
  }"
```

---

## Action: Query

### Trigger

- "列出我的任务"
- "有什么待办"
- "显示未完成的任务"
- "查询任务 {task_id}"
- "看看我完成了什么"

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `task_id` | No | Query specific task by UUID |
| `status` | No | `all`, `pending`, or `completed` (default: `all`) |
| `limit` | No | Max results 1-50 (default: 10) |

### Execution

```bash
# Query all tasks
curl -s -X POST "${NEXT_TODO_API_URL}/functions/v1/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"query\",
    \"status\": \"${status:-all}\",
    \"limit\": ${limit:-10}
  }" | jq -r '.tasks[] | "\(.id[:8]) | \(.completed | if . then "✓" else "○" end) | \(.title)"'

# Query specific task
curl -s -X POST "${NEXT_TODO_API_URL}/functions/v1/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"query\",
    \"task_id\": \"$task_id\"
  }" | jq -r '.task | "\(.title)\n状态: \(.completed | if . then "已完成" else "待完成" end)\n截止日期: \(.due_date // "无")"'
```

---

## Action: Digest

### Trigger

- "今天有什么待办"
- "给我看看今日摘要"
- "今天的待办任务"

### Execution

```bash
exec curl -s -X POST "${NEXT_TODO_API_URL}/functions/v1/daily-digest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"date\": \"$(date +%Y-%m-%d)\",
    \"timezone\": \"${TZ:-Asia/Shanghai}\"
  }"
```

---

## Cron Setup

For daily digest at 08:00:

```bash
openclaw cron add \
  --name "Daily Todo Digest" \
  --cron "0 8 * * *" \
  --tz "Asia/Shanghai" \
  --target "main" \
  --message "使用 todo skill 的 digest action 调用 daily-digest API" \
  --announce
```

---

## Response Handling

### Success

All actions return `success: true` on success.

### Error Codes

| HTTP | Meaning |
|------|---------|
| 400 | Invalid request parameters |
| 401 | JWT authentication failed |
| 404 | Task not found (query/complete) |
| 500 | Server error |
