import { Goal, Todo } from '@/lib/types';
import { GoalGroup } from '@/components/goals/GoalGroupContainer';

/**
 * 将待办事项按目标分组
 */
export function groupTodosByGoal(todos: Todo[], goals: Goal[]): GoalGroup[] {
  // 创建目标映射
  const goalMap = new Map<string, Goal>();
  goals.forEach(goal => {
    goalMap.set(goal.id, goal);
  });

  // 按目标ID分组
  const groupMap = new Map<string | null, Todo[]>();
  
  todos.forEach(todo => {
    const goalId = todo.goal_id;
    if (!groupMap.has(goalId)) {
      groupMap.set(goalId, []);
    }
    groupMap.get(goalId)!.push(todo);
  });

  // 转换为 GoalGroup 数组
  const groups: GoalGroup[] = [];
  
  groupMap.forEach((todos, goalId) => {
    const goal = goalId ? goalMap.get(goalId) || null : null;
    groups.push({
      goal,
      todos: todos.sort((a, b) => {
        // 按排序权重排序，如果没有权重则按创建时间
        const weightA = a.sort_weight || 0;
        const weightB = b.sort_weight || 0;
        if (weightA !== weightB) {
          return weightA - weightB;
        }
        return new Date(a.created_time).getTime() - new Date(b.created_time).getTime();
      })
    });
  });

  // 对分组进行排序：有目标的分组在前，按目标优先级和创建时间排序
  return groups.sort((a, b) => {
    // 未分组的任务放在最后
    if (!a.goal && !b.goal) return 0;
    if (!a.goal) return 1;
    if (!b.goal) return -1;

    // 按目标优先级排序（降序）
    if (a.goal.priority !== b.goal.priority) {
      return b.goal.priority - a.goal.priority;
    }

    // 按目标创建时间排序（降序）
    return new Date(b.goal.created_time).getTime() - new Date(a.goal.created_time).getTime();
  });
}

/**
 * 过滤目标分组
 */
export function filterGoalGroups(
  groups: GoalGroup[],
  options: {
    showCompleted?: boolean;
    showUngrouped?: boolean;
    goalIds?: string[];
    searchTerm?: string;
  } = {}
): GoalGroup[] {
  const {
    showCompleted = true,
    showUngrouped = true,
    goalIds,
    searchTerm
  } = options;

  return groups
    .filter(group => {
      // 过滤未分组任务
      if (!group.goal && !showUngrouped) {
        return false;
      }

      // 过滤特定目标
      if (goalIds && group.goal && !goalIds.includes(group.goal.id)) {
        return false;
      }

      // 搜索过滤
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesGoal = group.goal && (
          group.goal.name.toLowerCase().includes(term) ||
          (group.goal.description && group.goal.description.toLowerCase().includes(term))
        );
        const matchesTodo = group.todos.some(todo =>
          todo.title.toLowerCase().includes(term) ||
          (todo.notes && todo.notes.toLowerCase().includes(term))
        );
        if (!matchesGoal && !matchesTodo) {
          return false;
        }
      }

      return true;
    })
    .map(group => ({
      ...group,
      todos: group.todos.filter(todo => {
        // 过滤已完成任务
        if (!showCompleted && todo.completed) {
          return false;
        }

        // 搜索过滤（如果目标不匹配，则需要任务匹配）
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const goalMatches = group.goal && (
            group.goal.name.toLowerCase().includes(term) ||
            (group.goal.description && group.goal.description.toLowerCase().includes(term))
          );
          
          if (!goalMatches) {
            return todo.title.toLowerCase().includes(term) ||
                   (todo.notes && todo.notes.toLowerCase().includes(term));
          }
        }

        return true;
      })
    }))
    .filter(group => group.todos.length > 0); // 移除空分组
}

/**
 * 获取目标分组统计信息
 */
export function getGoalGroupStats(groups: GoalGroup[]): {
  totalGroups: number;
  totalTodos: number;
  completedTodos: number;
  groupsWithGoals: number;
  ungroupedTodos: number;
} {
  let totalTodos = 0;
  let completedTodos = 0;
  let groupsWithGoals = 0;
  let ungroupedTodos = 0;

  groups.forEach(group => {
    totalTodos += group.todos.length;
    completedTodos += group.todos.filter(todo => todo.completed).length;
    
    if (group.goal) {
      groupsWithGoals++;
    } else {
      ungroupedTodos += group.todos.length;
    }
  });

  return {
    totalGroups: groups.length,
    totalTodos,
    completedTodos,
    groupsWithGoals,
    ungroupedTodos
  };
}

/**
 * 检查分组是否为空（没有任务或所有任务都已完成）
 */
export function isGoalGroupEmpty(group: GoalGroup, hideCompleted = false): boolean {
  if (group.todos.length === 0) return true;
  if (hideCompleted) {
    return group.todos.every(todo => todo.completed);
  }
  return false;
}

/**
 * 获取分组的进度百分比
 */
export function getGoalGroupProgress(group: GoalGroup): number {
  if (group.todos.length === 0) return 0;
  const completedCount = group.todos.filter(todo => todo.completed).length;
  return Math.round((completedCount / group.todos.length) * 100);
}

/**
 * 按状态分组任务
 */
export function groupTodosByStatus(todos: Todo[]): {
  pending: Todo[];
  completed: Todo[];
  overdue: Todo[];
} {
  const now = new Date();
  
  return todos.reduce((acc, todo) => {
    if (todo.completed) {
      acc.completed.push(todo);
    } else if (todo.due_date && new Date(todo.due_date) < now) {
      acc.overdue.push(todo);
    } else {
      acc.pending.push(todo);
    }
    return acc;
  }, {
    pending: [] as Todo[],
    completed: [] as Todo[],
    overdue: [] as Todo[]
  });
}