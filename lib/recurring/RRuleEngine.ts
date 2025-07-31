// lib/recurring/RRuleEngine.ts
import { ParsedRRule } from '../types';

/**
 * RRULE解析和计算引擎
 * 基于RFC 5545标准，支持滴答清单使用的所有RRULE格式
 */
export class RRuleEngine {
  /**
   * 解析RRULE字符串为结构化对象
   * 支持的格式示例：
   * - FREQ=YEARLY;INTERVAL=1
   * - FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15
   * - FREQ=WEEKLY;INTERVAL=1
   * - FREQ=DAILY;INTERVAL=1
   */
  static parseRRule(rrule: string): ParsedRRule {
    if (!rrule || typeof rrule !== 'string') {
      throw new Error('Invalid RRULE: must be a non-empty string');
    }

    const parts = rrule.split(';');
    const parsed: Partial<ParsedRRule> = {};

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (!key || !value) continue;

      switch (key.toUpperCase()) {
        case 'FREQ':
          const freq = value.toUpperCase();
          if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
            throw new Error(`Invalid FREQ value: ${value}`);
          }
          parsed.freq = freq as ParsedRRule['freq'];
          break;

        case 'INTERVAL':
          const interval = parseInt(value, 10);
          if (isNaN(interval) || interval < 1) {
            throw new Error(`Invalid INTERVAL value: ${value}`);
          }
          parsed.interval = interval;
          break;

        case 'BYMONTHDAY':
          const monthdays = value.split(',').map(d => {
            const day = parseInt(d, 10);
            if (isNaN(day) || day < 1 || day > 31) {
              throw new Error(`Invalid BYMONTHDAY value: ${d}`);
            }
            return day;
          });
          parsed.bymonthday = monthdays;
          break;

        case 'BYMONTH':
          const months = value.split(',').map(m => {
            const month = parseInt(m, 10);
            if (isNaN(month) || month < 1 || month > 12) {
              throw new Error(`Invalid BYMONTH value: ${m}`);
            }
            return month;
          });
          parsed.bymonth = months;
          break;

        case 'BYDAY':
          // 简化处理，将工作日转换为数字 (0=Sunday, 1=Monday, ...)
          const weekdays = value.split(',').map(day => {
            const dayMap: { [key: string]: number } = {
              'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
            };
            const cleanDay = day.replace(/^-?\d*/, ''); // 移除前缀数字
            if (!(cleanDay in dayMap)) {
              throw new Error(`Invalid BYDAY value: ${day}`);
            }
            return dayMap[cleanDay];
          });
          parsed.byweekday = weekdays;
          break;

        case 'COUNT':
          const count = parseInt(value, 10);
          if (isNaN(count) || count < 1) {
            throw new Error(`Invalid COUNT value: ${value}`);
          }
          parsed.count = count;
          break;

        case 'UNTIL':
          try {
            parsed.until = new Date(value);
            if (isNaN(parsed.until.getTime())) {
              throw new Error(`Invalid UNTIL date: ${value}`);
            }
          } catch {
            throw new Error(`Invalid UNTIL date format: ${value}`);
          }
          break;
      }
    }

    if (!parsed.freq) {
      throw new Error('RRULE must contain FREQ');
    }

    // 设置默认值
    return {
      freq: parsed.freq,
      interval: parsed.interval ?? 1,
      bymonthday: parsed.bymonthday,
      bymonth: parsed.bymonth,
      byweekday: parsed.byweekday,
      count: parsed.count,
      until: parsed.until
    };
  }

  /**
   * 验证RRULE格式是否正确
   */
  static validateRRule(rrule: string): boolean {
    try {
      this.parseRRule(rrule);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 计算下一个到期日期
   * @param rrule RRULE字符串
   * @param currentDate 当前日期
   * @param startDate 开始日期（可选，默认使用currentDate）
   * @returns 下一个到期日期，如果重复已结束则返回null
   */
  static calculateNextDueDate(
  rrule: string,
  currentDate: Date,
  startDate?: Date,
  maxIterations = 100 // 限制最大递归深度
): Date | null {
  const parsed = this.parseRRule(rrule);
  const baseDate = startDate || currentDate;
  const interval = parsed.interval || 1;

  if (parsed.until && currentDate >= parsed.until) {
    return null;
  }

  let nextDate = new Date(baseDate);
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    switch (parsed.freq) {
      case 'DAILY':
        nextDate.setDate(nextDate.getDate() + interval);
        break;
      case 'WEEKLY':
        nextDate.setDate(nextDate.getDate() + 7 * interval);
        break;
      case 'MONTHLY':
        if (parsed.bymonthday?.length) {
          const targetDay = parsed.bymonthday[0];
          nextDate.setMonth(nextDate.getMonth() + interval);
          nextDate.setDate(targetDay);
          if (nextDate.getDate() !== targetDay) {
            nextDate.setDate(0); // fallback to last day of previous month
          }
        } else {
          nextDate.setMonth(nextDate.getMonth() + interval);
        }
        break;
      case 'YEARLY':
        if (parsed.bymonth?.length && parsed.bymonthday?.length) {
          const targetMonth = parsed.bymonth[0] - 1;
          const targetDay = parsed.bymonthday[0];
          nextDate.setFullYear(nextDate.getFullYear() + interval);
          nextDate.setMonth(targetMonth);
          nextDate.setDate(targetDay);
        } else {
          nextDate.setFullYear(nextDate.getFullYear() + interval);
        }
        break;
      default:
        throw new Error(`Unsupported frequency: ${parsed.freq}`);
    }

    if (nextDate > currentDate) {
      if (parsed.until && nextDate > parsed.until) {
        return null;
      }
      return nextDate;
    }
  }

  console.warn('Max iterations reached in calculateNextDueDate');
  return null;
}

  /**
   * 计算指定范围内的所有到期日期
   */
  static calculateDueDatesInRange(
    rrule: string,
    startDate: Date,
    endDate: Date,
    maxCount: number = 100
  ): Date[] {
    const dates: Date[] = [];
    let currentDate = new Date(startDate);
    let count = 0;

    while (currentDate <= endDate && count < maxCount) {
      const nextDate = this.calculateNextDueDate(rrule, currentDate, startDate);
      if (!nextDate || nextDate > endDate) {
        break;
      }
      dates.push(new Date(nextDate));
      currentDate = new Date(nextDate);
      currentDate.setDate(currentDate.getDate() + 1); // 避免无限循环
      count++;
    }

    return dates;
  }

  /**
   * 检查重复规则是否已结束
   */
  static isRecurrenceEnded(
    rrule: string,
    currentDate: Date,
    instanceCount: number
  ): boolean {
    const parsed = this.parseRRule(rrule);

    // 检查UNTIL条件
    if (parsed.until && currentDate >= parsed.until) {
      return true;
    }

    // 检查COUNT条件
    if (parsed.count && instanceCount >= parsed.count) {
      return true;
    }

    return false;
  }

  /**
   * 生成人类可读的重复描述
   */
  static generateHumanReadableDescription(rrule: string): string {
    try {
      const parsed = this.parseRRule(rrule);
      const interval = parsed.interval || 1;

      let description = '';

      switch (parsed.freq) {
        case 'DAILY':
          if (interval === 1) {
            description = '每天';
          } else {
            description = `每${interval}天`;
          }
          break;

        case 'WEEKLY':
          if (interval === 1) {
            description = '每周';
          } else {
            description = `每${interval}周`;
          }
          break;

        case 'MONTHLY':
          if (parsed.bymonthday && parsed.bymonthday.length > 0) {
            const day = parsed.bymonthday[0];
            if (interval === 1) {
              description = `每月${day}号`;
            } else {
              description = `每${interval}个月的${day}号`;
            }
          } else {
            if (interval === 1) {
              description = '每月';
            } else {
              description = `每${interval}个月`;
            }
          }
          break;

        case 'YEARLY':
          if (parsed.bymonth && parsed.bymonthday) {
            const month = parsed.bymonth[0];
            const day = parsed.bymonthday[0];
            if (interval === 1) {
              description = `每年${month}月${day}号`;
            } else {
              description = `每${interval}年的${month}月${day}号`;
            }
          } else {
            if (interval === 1) {
              description = '每年';
            } else {
              description = `每${interval}年`;
            }
          }
          break;

        default:
          description = '自定义重复';
      }

      // 添加结束条件描述
      if (parsed.until) {
        const untilStr = parsed.until.toLocaleDateString('zh-CN');
        description += `，直到${untilStr}`;
      } else if (parsed.count) {
        description += `，共${parsed.count}次`;
      }

      return description;
    } catch (error) {
      console.error('Error generating description for RRULE:', rrule, error);
      return '重复任务';
    }
  }
}

// 导出常用的RRULE模式（基于滴答清单实际数据）
export const RRULE_PATTERNS = {
  // 每日重复
  daily: 'FREQ=DAILY;INTERVAL=1',
  
  // 每周重复
  weekly: 'FREQ=WEEKLY;INTERVAL=1',
  
  // 每月重复（使用当前日期）
  monthly: 'FREQ=MONTHLY;INTERVAL=1',
  
  // 每月特定日期重复
  monthlyByDay: (day: number) => `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${day}`,
  
  // 每年重复
  yearly: 'FREQ=YEARLY;INTERVAL=1',
  
  // 每年特定日期重复
  yearlyByDate: (month: number, day: number) => 
    `FREQ=YEARLY;INTERVAL=1;BYMONTH=${month};BYMONTHDAY=${day}`,
  
  // 每季度重复（每3个月）
  quarterly: (day: number) => `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${day}`,
};