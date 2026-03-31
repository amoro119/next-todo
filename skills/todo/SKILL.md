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
- `update` - Edit/update an existing task
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
| `due_date` | No | Due date (ISO 8601)，若用户未指定，系统后端将自动分配默认截止日期；若用户指定，则需按标准格式传入该参数 |
| `priority` | No | 0-3 (0=none, 1=low, 2=medium, 3=high) |

### Execution

```bash
# Generate event_id
event_id="evt_openclaw_$(date +%s%N)"

# Create task
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
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

## Action: Update

### Trigger

- "编辑任务 {task_id}"
- "修改任务 {task_id}"
- "更新任务 {task_id}"
- "把 xxx 改为 yyy"

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `task_id` | Yes | UUID of task to update |
| `title` | No | New task title |
| `content` | No | New task details |
| `due_date` | No | New due date (ISO 8601) |
| `start_date` | No | New start date (ISO 8601) |
| `priority` | No | 0-3 (0=none, 1=low, 2=medium, 3=high) |
| `tags` | No | Task tags (comma-separated string) |

### Execution

```bash
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"update\",
    \"task_id\": \"$task_id\",
    \"title\": \"${title:-}\",
    \"content\": \"${content:-}\",
    \"due_date\": \"${due_date:-}\",
    \"start_date\": \"${start_date:-}\",
    \"priority\": ${priority:-null},
    \"tags\": \"${tags:-}\"
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
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
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
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"query\",
    \"status\": \"${status:-all}\",
    \"limit\": ${limit:-10}
  }" | jq -r '.tasks[] | "\(.id[:8]) | \(.completed | if . then "✓" else "○" end) | \(.title)"'

# Query specific task
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
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

从 openclaw-ingest 获取任务数据并生成每日摘要：

```bash
# 获取任务数据
response=$(curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "query",
    "status": "all",
    "limit": 50
  }')

# 解析统计数据
total=$(echo "$response" | jq '[.tasks[]] | length')
pending=$(echo "$response" | jq '[.tasks[] | select(.completed == false)] | length')
completed=$(echo "$response" | jq '[.tasks[] | select(.completed == true)] | length')
high_priority=$(echo "$response" | jq '[.tasks[] | select(.completed == false and .priority == 3)] | length')

# 获取今日和过期任务
today=$(date +%Y-%m-%d)
due_today=$(echo "$response" | jq --arg today "$today" '[.tasks[] | select(.completed == false and .due_date == $today)] | length')
overdue=$(echo "$response" | jq --arg today "$today" '[.tasks[] | select(.completed == false and .due_date < $today)] | length')

# 生成摘要输出
echo "📋 今日任务摘要"
echo "==============="
echo ""
echo "📊 统计：共 ${total} 个任务 | 待完成 ${pending} | 已完成 ${completed}"
echo ""

if [ "$high_priority" -gt 0 ]; then
  echo "🔴 高优先级待办：${high_priority} 个"
fi

if [ "$due_today" -gt 0 ]; then
  echo "📅 今日截止：${due_today} 个"
fi

if [ "$overdue" -gt 0 ]; then
  echo "⚠️ 已过期：${overdue} 个"
fi

echo ""
echo "📝 待办列表："
echo "$response" | jq -r '.tasks[] | select(.completed == false) | "  ○ \(.title)\(if .due_date then " [截止: \(.due_date)]" else "" end)\(if .priority == 3 then " 🔴" elif .priority == 2 then " 🟡" elif .priority == 1 then " 🟢" else "" end)"' | head -10
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
  --message "使用 todo skill 的 digest action 调用 openclaw-ingest API" \
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
