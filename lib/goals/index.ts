// 目标模块的主要导出文件
export { GoalsService, createGoalsService } from './GoalsService';
export type { GoalQueryOptions } from './GoalsService';

// 从 types.ts 重新导出目标相关的类型
export type {
  Goal,
  GoalWithProgress,
  TodoWithGoal,
  GoalGroup,
  GroupedTodoItem,
  GoalFormData
} from '@/lib/types';

export {
  GoalPriority,
  GoalStatus,
  validateGoalData,
  sanitizeGoalData,
  validateTodoGoalAssociation,
  sanitizeTodoGoalData,
  validateGoalFormData,
  createDefaultGoal,
  createDefaultGoalFormData,
  calculateGoalProgress,
  getGoalStatus,
  isGoalOverdue,
  getGoalPriorityLabel
} from '@/lib/types';