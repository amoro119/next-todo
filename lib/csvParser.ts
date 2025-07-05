// lib/csvParser.ts
import { Todo } from './types';

interface ParsedCsvResult {
  todos: Partial<Todo>[];
  removedTodos: Partial<Todo>[];
}

/**
 * (For Storage - Fallback) Converts a local date string (e.g., '2025-06-30') from the user's
 * selection into a full UTC ISO string representing the end of that day in Beijing Time (UTC+8).
 */
const localDateToEndOfDayUTC = (localDate: string | null | undefined): string | null => {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  try {
    const dateInUTC8 = new Date(`${localDate}T23:59:59.999+08:00`);
    return dateInUTC8.toISOString();
  } catch (e) {
    console.error("Error converting local date to UTC:", localDate, e);
    return null;
  }
};

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
        if (allRows[i][0] === 'Folder Name' && allRows[i][1] === 'List Name') {
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

    if (titleIndex === -1 || statusIndex === -1) { throw new Error('CSV文件缺少必要的列: Title, Status'); }

    const todos: Partial<Todo>[] = [];
    const removedTodos: Partial<Todo>[] = [];

    const priorityMap: { [key: string]: number } = {'2': 3, '1': 2, '0': 1, '': 0};
    
    for (const values of dataRows) {
        if (values.length < headers.length || !values[titleIndex]) continue;

        // --- CORRECTED DATE PARSING LOGIC ---
        const rawDueDateStr = dueDateIndex > -1 ? values[dueDateIndex] : undefined;
        const rawStartDateStr = startDateIndex > -1 ? values[startDateIndex] : undefined;

        let dueDate: string | null = null;
        if (rawDueDateStr && rawDueDateStr.includes('T')) {
            // Priority 1: If it's a full timestamp, parse it directly to preserve the exact time.
            dueDate = parseDateTime(rawDueDateStr);
        } else {
            // Priority 2: If it's just a date, use the fallback to calculate the end of that day.
            dueDate = localDateToEndOfDayUTC(rawDueDateStr);
        }

        let startDate: string | null = null;
        if (rawStartDateStr && rawStartDateStr.includes('T')) {
            startDate = parseDateTime(rawStartDateStr);
        } else {
            startDate = localDateToEndOfDayUTC(rawStartDateStr);
        }
        // --- END OF CORRECTION ---

        const completedTime = completedTimeIndex > -1 ? parseDateTime(values[completedTimeIndex]) : null;
        const status = values[statusIndex];

        const newTodo: Partial<Todo> = {
            title: values[titleIndex]?.trim() || '无标题',
            removed: status === '-1' ? 1 : 0,
            completed_time: completedTime,
            completed: completedTime ? 1 : 0,
            due_date: dueDate,
            content: contentIndex > -1 ? values[contentIndex] || null : null,
            priority: priorityMap[priorityIndex > -1 ? values[priorityIndex] : ''] ?? 0,
            tags: tagsIndex > -1 ? values[tagsIndex] || null : null,
            created_time: createdTimeIndex > -1 ? parseDateTime(values[createdTimeIndex]) : new Date().toISOString(),
            start_date: startDate,
            list_name: listNameIndex > -1 ? values[listNameIndex] || null : null,
        };

        if (newTodo.removed) {
            removedTodos.push(newTodo);
        } else {
            todos.push(newTodo);
        }
    }
    return { todos, removedTodos };
}