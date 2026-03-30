/**
 * 通用日期格式化工具函数
 * 处理各种数据库日期格式并转换为本地日期显示
 */

/**
 * 将数据库中的日期字符串转换为本地日期对象
 * @param dateString 数据库中的日期字符串
 * @returns Date对象或null（如果无效）
 */
export function parseDatabaseDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  // 尝试解析不同的日期格式
  let date: Date | null = null;
  
  // 如果是 YYYY-MM-DD 格式
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    date = new Date(year, month - 1, day);
  }
  // 如果是数据库格式 YYYY-MM-DD 16:00:00+00 或类似格式
  else if (/^(\d{4}-\d{2}-\d{2})/.test(dateString)) {
    const match = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const [year, month, day] = match[1].split('-').map(Number);
      date = new Date(year, month - 1, day);
    }
  }
  // 其他格式尝试直接解析
  else {
    date = new Date(dateString);
  }
  
  // 检查日期是否有效
  if (!date || isNaN(date.getTime())) {
    console.error('Invalid date string:', dateString);
    return null;
  }
  
  return date;
}

/**
 * 格式化日期为本地化字符串
 * @param dateString 数据库中的日期字符串
 * @param options 格式化选项
 * @returns 格式化后的日期字符串
 */
export function formatDate(
  dateString: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
): string {
  if (!dateString) return '';
  
  const date = parseDatabaseDate(dateString);
  if (!date) return '无效日期';
  
  try {
    return date.toLocaleDateString('zh-CN', options);
  } catch (error) {
    console.error('Error formatting date:', error);
    return '无效日期';
  }
}

/**
 * 格式化日期为短格式（用于列表显示）
 * @param dateString 数据库中的日期字符串
 * @returns 格式化后的日期字符串
 */
export function formatShortDate(dateString: string | null | undefined): string {
  return formatDate(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * 格式化日期时间为本地化字符串
 * @param dateString 数据库中的日期时间字符串
 * @returns 格式化后的日期时间字符串
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  const date = parseDatabaseDate(dateString);
  if (!date) return '无效日期';
  
  try {
    return date.toLocaleString('zh-CN');
  } catch (error) {
    console.error('Error formatting date time:', error);
    return '无效日期';
  }
}

/**
 * 将本地日期(YYYY-MM-DD)转换为数据库存储的UTC格式
 * 东八区(Asia/Shanghai)零点对齐: UTC+8 00:00 = UTC+0 前一天 16:00
 * @param localDate 本地日期字符串 (YYYY-MM-DD)
 * @returns UTC格式字符串 (YYYY-MM-DD 16:00:00+00) 或 null
 */
export function localDateToDbUTC(localDate: string | null | undefined): string | null {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  
  try {
    const [year, month, day] = localDate.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 16, 0));
    d.setUTCDate(d.getUTCDate() - 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 16:00:00+00`;
  } catch (e) {
    console.error('Error converting local date to UTC:', localDate, e);
    return null;
  }
}

/**
 * 将数据库UTC日期转换为本地日期(YYYY-MM-DD)
 * @param dbDate 数据库UTC字符串 (YYYY-MM-DD 16:00:00+00 或 ISO 8601)
 * @returns 本地日期字符串 (YYYY-MM-DD) 或空字符串
 */
export function dbUTCToLocalDate(dbDate: string | null | undefined): string {
  if (!dbDate) return '';
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(dbDate)) {
    return dbDate;
  }
  
  try {
    const match = dbDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const [year, month, day] = match[1].split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day, 16, 0));
      d.setUTCDate(d.getUTCDate() + 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    
    const d = new Date(dbDate);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error('Error parsing UTC date:', dbDate, e);
  }
  
  return '';
}