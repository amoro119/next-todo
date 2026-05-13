/**
 * 通用日期格式化工具函数
 * 处理各种数据库日期格式并转换为本地日期显示
 *
 * 存储约定：数据库中日期字段以 UTC+0 存储，表示东八区当天零点
 *   例：东八区 2026-05-13 00:00 → 数据库 "2026-05-12 16:00:00+00"
 *
 * 显示约定：所有日期展示以 Asia/Shanghai 时区为准
 */

// 数据库 UTC 格式：YYYY-MM-DD HH:mm:ss+00 或 YYYY-MM-DD HH:mm:ss+HH
const DB_UTC_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}$/;

/**
 * 将数据库中的日期字符串转换为本地日期对象
 * @param dateString 数据库中的日期字符串
 * @returns Date对象或null（如果无效）
 */
export function parseDatabaseDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  let date: Date | null = null;

  // 纯日期 YYYY-MM-DD：用本地时间构造，避免 JS 将其解释为 UTC 导致时区偏移
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    date = new Date(year, month - 1, day);
  }
  // 数据库 UTC 格式 "YYYY-MM-DD HH:mm:ss+00"：保留时区信息交给 JS 原生解析
  // new Date("2026-05-12 16:00:00+00") → UTC 5/12 16:00，UTC+8 下等于 5/13 00:00
  else if (DB_UTC_PATTERN.test(dateString)) {
    date = new Date(dateString);
  }
  // 其他格式（ISO 8601 等）直接解析
  else {
    date = new Date(dateString);
  }

  if (!date || isNaN(date.getTime())) {
    console.error('Invalid date string:', dateString);
    return null;
  }

  return date;
}

/**
 * 将数据库 UTC 日期字符串转换为用于展示的 YYYY-MM-DD 字符串（Asia/Shanghai 时区）
 * 这是展示层的统一入口，替代各组件中分散的 utcToLocalDateString 实现。
 *
 * @param utcDate 数据库中的日期字符串（任意格式）
 * @returns YYYY-MM-DD 格式字符串，空字符串表示无效
 */
export function dbUTCToDisplayDate(utcDate: string | null | undefined): string {
  if (!utcDate) return '';

  // 纯日期字符串无需转换，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) return utcDate;

  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) {
      console.error('Invalid date for display:', utcDate);
      return '';
    }
    // en-CA locale 输出 YYYY-MM-DD 格式，timeZone 指定东八区
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    console.error('Error converting UTC date for display:', utcDate, e);
    return '';
  }
}

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
    return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', ...options });
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

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = parseDatabaseDate(dateString);
  if (!date) return '无效日期';

  try {
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
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