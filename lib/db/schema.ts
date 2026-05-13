export const SCHEMA = {
  lists: '&id, user_id, deleted_at, updated_at',
  todos: '&id, list_id, goal_id, user_id, deleted_at, updated_at',
  goals: '&id, list_id, user_id, deleted_at, updated_at',
  goal_progress: '&id, goal_id, todo_id, deleted_at, updated_at',
  meta: '&key',
} as const
