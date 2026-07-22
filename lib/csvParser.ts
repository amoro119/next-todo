// lib/csvParser.ts
import type { Todo } from './db/types';
import { RRuleEngine } from './recurring/RRuleEngine';
import { localDateToDbUTC } from './utils/dateUtils';
import { v5 as uuidv5 } from 'uuid';

export type ParsedDidaTodo = Partial<Todo> & { list_name?: string | null };

export interface ParsedCsvResult {
  todos: ParsedDidaTodo[];
  removedTodos: ParsedDidaTodo[];
}

const DIDA_IMPORT_NAMESPACE = uuidv5.URL;

/**
 * Parses a full timestamp string (like '2025-06-30T16:00:00+0000') into a standard UTC ISO string.
 */
const parseDateTime = (dateTimeStr: string | undefined): string | null => {
    if (!dateTimeStr) return null;
    try {
      // Handles formats like '2025-06-30T16:00:00+0000' by replacing +0000 with Z
      const normalizedDateStr = dateTimeStr.replace(/\+0000$/, 'Z');
      return new Date(normalizedDateStr).toISOString();
    } catch (e) {
      console.error(`Could not parse date: ${dateTimeStr}`, e);
      return null;
    }
};

/**
 * 解析来自滴答清单/TickTick 备份文件的 CSV 内容。
 * @param csvContent CSV 文件的原始字符串内容。
 * @returns 包含活动和已删除待办事项数组的对象。
 */
export function parseDidaCsv(csvContent: string): ParsedCsvResult {
    const robustCsvParser = (csv: string): string[][] => {
        const rows: string[][] = [];
        let row: string[] = [];
        let field = '';
        let inQuotes = false;
        csv = csv.replace(/\r\n/g, '\n');
        if (!csv.endsWith('\n')) csv += '\n';

        for (let i = 0; i < csv.length; i++) {
            const char = csv[i];
            if (inQuotes) {
                if (char === '"') {
                    if (i + 1 < csv.length && csv[i + 1] === '"') {
                        field += '"'; i++;
                    } else { inQuotes = false; }
                } else { field += char; }
            } else {
                if (char === '"') { inQuotes = true;
                } else if (char === ',') { row.push(field); field = '';
                } else if (char === '\n') {
                    row.push(field); rows.push(row); row = []; field = '';
                } else { field += char; }
            }
        }
        return rows;
    };

    const allRows = robustCsvParser(csvContent);
    let headerRowIndex = -1;
    for (let i = 0; i < allRows.length; i++) {
        if (allRows[i][0]?.replace(/^\uFEFF/, '') === 'Folder Name' && allRows[i][1] === 'List Name') {
            allRows[i][0] = allRows[i][0].replace(/^\uFEFF/, '');
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) { throw new Error('CSV文件格式不正确，找不到表头。'); }

    const headers = allRows[headerRowIndex];
    const dataRows = allRows.slice(headerRowIndex + 1);

    const titleIndex = headers.indexOf('Title');
    const statusIndex = headers.indexOf('Status');
    const dueDateIndex = headers.indexOf('Due Date');
    const contentIndex = headers.indexOf('Content');
    const tagsIndex = headers.indexOf('Tags');
    const priorityIndex = headers.indexOf('Priority');
    const createdTimeIndex = headers.indexOf('Created Time');
    const completedTimeIndex = headers.indexOf('Completed Time');
    const startDateIndex = headers.indexOf('Start Date');
    const listNameIndex = headers.indexOf('List Name');
    const repeatIndex = headers.indexOf('Repeat');
    const reminderIndex = headers.indexOf('Reminder');
    const taskIdIndex = headers.indexOf('taskId');

    if (titleIndex === -1 || statusIndex === -1) { throw new Error('CSV文件缺少必要的列: Title, Status'); }

    const todos: ParsedDidaTodo[] = [];
    const removedTodos: ParsedDidaTodo[] = [];

    // 滴答导出值为 0=无、1=低、3=中、5=高；本项目使用 0..3。
    const priorityMap: Record<string, number> = {'0': 0, '1': 1, '3': 2, '5': 3, '': 0};
    const listOrder = new Map<string, number>();
    
    for (const values of dataRows) {
        if (values.length < headers.length || values.every((value) => value === '')) continue;

        // --- CORRECTED DATE PARSING LOGIC ---
        const rawDueDateStr = dueDateIndex > -1 ? values[dueDateIndex] : undefined;
        const rawStartDateStr = startDateIndex > -1 ? values[startDateIndex] : undefined;

        let dueDate: string | null = null;
        if (rawDueDateStr && rawDueDateStr.includes('T')) {
            // Priority 1: If it's a full timestamp, parse it directly to preserve the exact time.
            dueDate = parseDateTime(rawDueDateStr);
        } else {
            // Priority 2: If it's just a date, use the zero-point alignment for UTC+8
            dueDate = localDateToDbUTC(rawDueDateStr);
        }

        let startDate: string | null = null;
        if (rawStartDateStr && rawStartDateStr.includes('T')) {
            startDate = parseDateTime(rawStartDateStr);
        } else {
            startDate = localDateToDbUTC(rawStartDateStr);
        }
        // --- END OF CORRECTION ---

        const status = values[statusIndex];
        const parsedCompletedTime = completedTimeIndex > -1 ? parseDateTime(values[completedTimeIndex]) : null;
        const createdTime = createdTimeIndex > -1
            ? parseDateTime(values[createdTimeIndex])
            : null;
        const completed = status === '2';
        const completedTime = completed ? parsedCompletedTime : null;
        const deleted = status === '-1';
        const listName = listNameIndex > -1 ? values[listNameIndex]?.trim() || null : null;
        const nextSortOrder = listOrder.get(listName ?? '') ?? 0;
        listOrder.set(listName ?? '', nextSortOrder + 1);
        const sourceTaskId = taskIdIndex > -1 ? values[taskIdIndex]?.trim() : '';
        const stableIdentity = [
            'next-todo:dida',
            sourceTaskId || `row-${nextSortOrder}`,
            listName ?? '',
            createdTime ?? '',
            values[titleIndex]?.trim() ?? '',
        ].join(':');

        // 处理重复任务字段
        const repeatStr = repeatIndex > -1 ? values[repeatIndex]?.trim() : '';
        const reminderStr = reminderIndex > -1 ? values[reminderIndex]?.trim() : '';
        
        // 解析和验证重复规则
        let isRecurring = false;
        let repeat: string | null = null;
        
        if (repeatStr && repeatStr !== '') {
            try {
                // 验证 RRULE 格式
                if (RRuleEngine.validateRRule(repeatStr)) {
                    isRecurring = true;
                    repeat = repeatStr;
                } else {
                    console.warn(`Invalid RRULE format for task "${values[titleIndex]}": ${repeatStr}`);
                }
            } catch (error) {
                console.warn(`Error parsing RRULE for task "${values[titleIndex]}": ${repeatStr}`, error);
            }
        }
        
        // 解析提醒设置
        const reminder = (reminderStr && reminderStr !== '') ? reminderStr : null;

        const newTodo: ParsedDidaTodo = {
            id: uuidv5(stableIdentity, DIDA_IMPORT_NAMESPACE),
            title: values[titleIndex]?.trim() || '无标题',
            deleted,
            deleted_at: deleted ? (parsedCompletedTime ?? createdTime ?? new Date(0).toISOString()) : null,
            completed_time: completedTime,
            completed,
            sort_order: nextSortOrder,
            due_date: dueDate,
            content: contentIndex > -1 ? values[contentIndex] || null : null,
            priority: priorityMap[priorityIndex > -1 ? values[priorityIndex] : ''] ?? 0,
            tags: tagsIndex > -1 ? values[tagsIndex] || null : null,
            created_time: createdTime ?? new Date(0).toISOString(),
            start_date: startDate,
            list_name: listName,
            
            // 重复任务相关字段
            repeat: repeat,
            reminder: reminder,
            is_recurring: isRecurring,
            recurring_parent_id: null, // 导入的都是原始任务
            instance_number: null, // 导入的都是原始任务
            next_due_date: isRecurring ? dueDate : null // 如果是重复任务，设置下次到期日期
        };

        if (newTodo.deleted) {
            removedTodos.push(newTodo);
        } else {
            todos.push(newTodo);
        }
    }
    return { todos, removedTodos };
}
