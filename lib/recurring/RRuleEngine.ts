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
            // UNTIL格式通常是 YYYYMMDDTHHMMSSZ
            let dateStr = value;
            if (value.match(/^\d{8}T\d{6}Z$/)) {
              // 转换为ISO格式
              dateStr = `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}T${value.substring(9, 11)}:${value.substring(11, 13)}:${value.substring(13, 15)}Z`;
            }
            parsed.until = new Date(dateStr);
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
   * @param originalDueDate 原任务的到期日期（作为计算基准）
   * @param maxIterations 最大迭代次数，防止无限循环
   * @returns 下一个到期日期，如果重复已结束则返回null
   */
  static calculateNextDueDate(
    rrule: string,
    originalDueDate: Date,
    maxIterations = 100
  ): Date | null {
    try {
      const parsed = this.parseRRule(rrule);
      const interval = parsed.interval || 1;
      
      // 使用原任务到期日期作为基准
      const nextDate = new Date(originalDueDate);
      let iterations = 0;

      console.log(`[RRuleEngine] 计算下一个到期日期 - RRULE: ${rrule}, 原到期日期: ${originalDueDate.toISOString()}`);

      // 检查UNTIL条件 - 只有当原日期已经超过UNTIL时才直接返回null
      // 否则继续计算，在结果中检查UNTIL条件

      // 对于月度重复任务的特殊处理
      if (parsed.freq === 'MONTHLY' && parsed.bymonthday?.length) {
        const targetDay = parsed.bymonthday[0];
        
        console.log(`[RRuleEngine] 处理月度重复任务 - 目标日期: ${targetDay}号`);
        
        // 保存原始时间信息
        const originalHours = nextDate.getHours();
        const originalMinutes = nextDate.getMinutes();
        const originalSeconds = nextDate.getSeconds();
        const originalMs = nextDate.getMilliseconds();
        
        // 计算下个月的目标日期
        const currentYear = nextDate.getFullYear();
        const currentMonth = nextDate.getMonth();
        const targetMonth = currentMonth + interval;
        
        // 先设置到目标月份的1号，避免日期溢出
        nextDate.setFullYear(currentYear, targetMonth, 1);
        
        // 然后尝试设置目标日期
        const actualTargetMonth = nextDate.getMonth();
        nextDate.setDate(targetDay);
        
        // 如果设置日期后月份发生变化，说明该月没有这个日期
        if (nextDate.getMonth() !== actualTargetMonth) {
          // 回退到该月最后一天
          nextDate.setMonth(actualTargetMonth + 1, 0);
          console.log(`[RRuleEngine] 月末日期调整 - 目标日期${targetDay}号不存在，使用月末: ${nextDate.getDate()}号`);
        }
        
        // 恢复原始时间信息
        nextDate.setHours(originalHours, originalMinutes, originalSeconds, originalMs);
        
        console.log(`[RRuleEngine] 月度重复计算完成 - 下次到期: ${nextDate.toISOString()}`);
        
        // 检查UNTIL条件
        if (parsed.until && nextDate > parsed.until) {
          console.log(`[RRuleEngine] 重复已结束 - 计算日期超过UNTIL限制`);
          return null;
        }
        
        return nextDate;
      }

      // 其他频率的处理逻辑
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
            // 非特定日期的月度重复
            const currentDay = nextDate.getDate();
            nextDate.setMonth(nextDate.getMonth() + interval);
            
            // 处理月末日期问题
            if (nextDate.getDate() !== currentDay) {
              // 如果日期发生变化，说明目标月份没有这个日期，使用月末
              nextDate.setDate(0);
              console.log(`[RRuleEngine] 月度重复日期调整 - 使用月末日期`);
            }
            break;
            
          case 'YEARLY':
            if (parsed.bymonth?.length && parsed.bymonthday?.length) {
              const targetMonth = parsed.bymonth[0] - 1; // 月份从0开始
              const targetDay = parsed.bymonthday[0];
              
              nextDate.setFullYear(nextDate.getFullYear() + interval);
              nextDate.setMonth(targetMonth);
              nextDate.setDate(targetDay);
              
              // 处理闰年问题（如2月29日）
              if (nextDate.getMonth() !== targetMonth) {
                nextDate.setMonth(targetMonth + 1, 0); // 使用该月最后一天
                console.log(`[RRuleEngine] 年度重复日期调整 - 处理闰年问题`);
              }
            } else {
              nextDate.setFullYear(nextDate.getFullYear() + interval);
            }
            break;
            
          default:
            throw new Error(`不支持的重复频率: ${parsed.freq}`);
        }

        // 确保新日期在原日期之后
        if (nextDate > originalDueDate) {
          // 检查UNTIL条件
          if (parsed.until && nextDate > parsed.until) {
            console.log(`[RRuleEngine] 重复已结束 - 计算日期超过UNTIL限制`);
            return null;
          }
          
          console.log(`[RRuleEngine] 计算完成 - 下次到期: ${nextDate.toISOString()}`);
          return nextDate;
        }
      }

      console.warn(`[RRuleEngine] 达到最大迭代次数 (${maxIterations})，停止计算`);
      return null;
      
    } catch (error) {
      console.error(`[RRuleEngine] 日期计算失败:`, error);
      return null;
    }
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

    // 添加起始日期
    if (currentDate >= startDate && currentDate <= endDate) {
      dates.push(new Date(currentDate));
      count++;
    }

    while (count < maxCount) {
      const nextDate = this.calculateNextDueDate(rrule, currentDate);
      if (!nextDate || nextDate > endDate) {
        break;
      }
      dates.push(new Date(nextDate));
      currentDate = new Date(nextDate);
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
    try {
      const parsed = this.parseRRule(rrule);

      // 检查UNTIL条件
      if (parsed.until && currentDate >= parsed.until) {
        console.log(`[RRuleEngine] 重复已结束 - 达到UNTIL限制: ${parsed.until.toISOString()}`);
        return true;
      }

      // 检查COUNT条件
      if (parsed.count && instanceCount >= parsed.count) {
        console.log(`[RRuleEngine] 重复已结束 - 达到COUNT限制: ${parsed.count}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[RRuleEngine] 检查重复结束状态失败:`, error);
      return true; // 出错时认为重复已结束，避免无限生成
    }
  }

  /**
   * 验证日期是否有效
   */
  static isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * 安全地处理月末日期
   * @param year 年份
   * @param month 月份 (0-11)
   * @param day 日期
   * @returns 调整后的有效日期
   */
  static getValidMonthDate(year: number, month: number, day: number): Date {
    const date = new Date(year, month, day);
    
    // 如果设置的日期导致月份发生变化，说明该月没有这个日期
    if (date.getMonth() !== month) {
      // 返回该月的最后一天
      return new Date(year, month + 1, 0);
    }
    
    return date;
  }

  /**
   * 处理闰年和月末日期的边界情况
   * @param baseDate 基准日期
   * @param targetMonth 目标月份 (0-11)
   * @param targetDay 目标日期
   * @returns 调整后的有效日期
   */
  static handleDateBoundaries(baseDate: Date, targetMonth?: number, targetDay?: number): Date {
    const year = baseDate.getFullYear();
    const month = targetMonth !== undefined ? targetMonth : baseDate.getMonth();
    const day = targetDay !== undefined ? targetDay : baseDate.getDate();
    
    return this.getValidMonthDate(year, month, day);
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