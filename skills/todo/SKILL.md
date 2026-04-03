---
name: todo
description: Next-todo task management skill. Create, complete, query tasks, and generate daily digests via the openclaw-ingest API.
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
| `limit` | No | Max results to return (default: no limit, return all) |

### Execution

```bash
# Query all tasks (no limit, returns all)
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"query\",
    \"status\": \"${status:-all}\"
  }" | jq -r '.tasks[] | "\(.id[:8]) | \(.completed | if . then "✓" else "○" end) | \(.title)"'

# Query with limit
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d "{
    \"action\": \"query\",
    \"status\": \"${status:-all}\",
    \"limit\": $limit
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

查询待完成任务并生成每日摘要。

### Trigger

- "今天有什么待办"
- "给我看看今日摘要"
- "今天的待办任务"

### Execution

**方案 A（推荐）：** 直接调用服务端 digest 接口生成摘要（不传 limit 返回全部任务）：

```bash
curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "digest"
  }' | jq -r '.digest.summary'
```

**兜底方案（客户端处理）：** 如果服务端不支持 digest action，则回退到本地生成：

```bash
# 先尝试服务端 digest
response=$(curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
  -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"action": "digest"}')

# 检查服务端是否支持 digest
if echo "$response" | jq -e '.digest' > /dev/null 2>&1; then
  # 服务端支持，直接输出摘要
  echo "$response" | jq -r '.digest.summary'
else
  # 兜底：本地生成摘要（只查询待完成任务）
  response=$(curl -s -X POST "${NEXT_TODO_API_URL}/openclaw-ingest" \
    -H "Authorization: Bearer ${NEXT_TODO_JWT}" \
    -H "Content-Type: application/json" \
    -d '{"action": "query", "status": "pending"}')

  today=$(date +%Y-%m-%d)
  
  # 分类任务
  overdue=$(echo "$response" | jq --arg today "$today" '[.tasks[] | select(.due_date and .due_date < $today)]')
  due_today=$(echo "$response" | jq --arg today "$today" '[.tasks[] | select((.due_date // "") | startswith($today))]')
  upcoming=$(echo "$response" | jq --arg today "$today" '[.tasks[] | select(.due_date == null or .due_date > $today)]')

  echo "📋 今日任务摘要"
  echo "==============="

  # 已过期
  overdue_count=$(echo "$overdue" | jq 'length')
  if [ "$overdue_count" -gt 0 ]; then
    echo ""
    echo "⚠️ 已过期 ${overdue_count} 个"
    echo "$overdue" | jq -r '.[] | "  ○ \(.title) [截止: \(.due_date[5:10])]"'
  fi

  # 今日截止
  due_today_count=$(echo "$due_today" | jq 'length')
  if [ "$due_today_count" -gt 0 ]; then
    echo ""
    echo "📅 今日截止 ${due_today_count} 个"
    echo "$due_today" | jq -r '.[] | "  ○ \(.title)"'
  fi

  # 近期待办
  upcoming_count=$(echo "$upcoming" | jq 'length')
  if [ "$upcoming_count" -gt 0 ]; then
    echo ""
    echo "📝 近期待办"
    echo "$upcoming" | jq -r '.[] | "  ○ \(.title)\(if .due_date then " [截止: \(.due_date[5:10])]" else "（无截止日）" end)"' | head -10
  fi

  # 没有任务
  if [ "$overdue_count" -eq 0 ] && [ "$due_today_count" -eq 0 ] && [ "$upcoming_count" -eq 0 ]; then
    echo ""
    echo "🎉 没有待办任务，享受你的自由时间！"
  fi
fi
```

### Response Format

服务端 digest 接口返回：

```json
{
  "success": true,
  "digest": {
    "date": "2026-03-31",
    "summary": "📋 今日任务摘要\n===============\n\n⚠️ 已过期 4 个\n  ○ 任务A [截止: 03-31]\n  ○ 任务B [截止: 04-01]\n\n📅 今日截止 3 个\n  ○ 任务C\n  ○ 任务D\n\n📝 近期待办\n  ○ 任务E [截止: 04-06]\n  ○ 任务F（无截止日）",
    "stats": {
      "total": 10,
      "pending": 10,
      "due_today": 3,
      "overdue": 4
    },
    "tasks": [...]
  }
}
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
