// components/RecurrenceSelector.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { RRuleEngine, RRULE_PATTERNS } from "../lib/recurring/RRuleEngine";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RecurrenceSelectorProps {
  value: string | null;
  onChange: (rrule: string | null) => void;
  disabled?: boolean;
}

interface RecurrenceOption {
  label: string;
  value: string | null;
  description?: string;
  isCustom?: boolean;
}

// 动态生成重复选项（基于当前日期）
const generateRecurrenceOptions = (): RecurrenceOption[] => {
  const now = new Date();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const currentWeekday = weekdays[now.getDay()];
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;

  return [
    { label: "每天", value: RRULE_PATTERNS.daily },
    { label: `每周（${currentWeekday}）`, value: RRULE_PATTERNS.weekly },
    {
      label: `每月（${currentDay}日）`,
      value: RRULE_PATTERNS.monthlyByDay(currentDay),
    },
    {
      label: `每年（${currentMonth}月${currentDay}日）`,
      value: RRULE_PATTERNS.yearlyByDate(currentMonth, currentDay),
    },
    {
      label: "每周工作日（周一至周五）",
      value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    },
    {
      label: "法定工作日",
      value: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
      description: "跳过节假日",
    },
    { label: "自定义", value: null, isCustom: true },
  ];
};

export default function RecurrenceSelector({
  value,
  onChange,
  disabled,
}: RecurrenceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const recurrenceOptions = generateRecurrenceOptions();
  // 只在value不为null时才查找匹配的选项，避免匹配到"自定义"选项
  const currentOption = value
    ? recurrenceOptions.find((opt) => opt.value === value && !opt.isCustom)
    : null;

  const displayText = currentOption
    ? currentOption.label
    : value
    ? (() => {
        try {
          return RRuleEngine.generateHumanReadableDescription(value);
        } catch (error) {
          console.error('Error generating human readable description:', error);
          return "自定义重复";
        }
      })()
    : "设置重复规则";
  const hasValue = !!value;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOptionClick = (option: RecurrenceOption) => {
    if (option.isCustom) {
      setShowCustomModal(true);
    } else {
      onChange(option.value);
    }
    setIsOpen(false);
  };

  const handleClearRecurrence = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setIsHovered(false);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleMouseEnter = () => {
    if (hasValue && !disabled) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <>
      <div className="relative inline-block w-full" ref={dropdownRef}>
        <div
          className={`w-full px-2.5 py-2.5 border border-border rounded-lg bg-background text-sm cursor-pointer flex items-center justify-between min-h-[44px] transition-all duration-200 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleTriggerClick}
        >
          <span className="flex-1 text-left text-foreground">{displayText}</span>
          <div className="flex items-center justify-center w-6 h-6 shrink-0">
            {hasValue && isHovered ? (
              <button
                type="button"
                className="bg-destructive border-none rounded-full w-5 h-5 flex items-center justify-center cursor-pointer text-sm font-bold text-white leading-none hover:scale-110 transition-transform"
                onClick={handleClearRecurrence}
                title="停止重复"
              >
                ×
              </button>
            ) : (
              <span className="text-xs text-muted-foreground select-none">▼</span>
            )}
          </div>
        </div>

        {isOpen && !disabled && (
          <div className="absolute top-full left-0 right-0 z-[1000] bg-background border border-border rounded-lg mt-1 max-h-[300px] overflow-y-auto">
            {recurrenceOptions.map((option, index) => (
              <div
                key={index}
                className={`px-4 py-3 cursor-pointer border-b border-border last:border-b-0 transition-colors duration-200 flex flex-col items-start hover:bg-muted ${option.value === value && value !== null && !option.isCustom ? "bg-foreground text-background" : ""}`}
                onClick={() => handleOptionClick(option)}
              >
                <span className="text-sm font-medium">{option.label}</span>
                {option.description && (
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCustomModal && (
        <CustomRecurrenceModal
          initialValue={value}
          onSave={(rrule) => {
            onChange(rrule);
            setShowCustomModal(false);
          }}
          onCancel={() => setShowCustomModal(false)}
        />
      )}
    </>
  );
}

interface CustomRecurrenceModalProps {
  initialValue: string | null;
  onSave: (rrule: string) => void;
  onCancel: () => void;
}

function CustomRecurrenceModal({
  initialValue,
  onSave,
  onCancel,
}: CustomRecurrenceModalProps) {
  // 初始化状态的默认值
  const getDefaultValues = () => {
    const now = new Date();
    return {
      frequency: "WEEKLY",
      interval: 1,
      selectedDays: [now.getDay()],
      monthlyMode: "date" as const,
      selectedDate: now.getDate(),
      selectedWeekday: now.getDay(),
      weekPosition: "first" as const,
      workdayPosition: "first" as const,
      selectedMonth: now.getMonth() + 1,
      skipHolidays: false,
      skipWeekends: false
    };
  };

  // 根据initialValue解析RRule
  const parseRRule = (rrule: string | null) => {
    if (!rrule) return getDefaultValues();
    
    try {
      const parsed = RRuleEngine.parseRRule(rrule);
      const defaults = getDefaultValues();
      
      // 根据解析的RRule更新状态
      const result = { ...defaults };
      
      if (parsed.freq) {
        result.frequency = parsed.freq;
      }
      
      if (parsed.interval !== undefined) {
        result.interval = parsed.interval;
      }
      
      if (parsed.byweekday && parsed.byweekday.length > 0) {
        result.selectedDays = parsed.byweekday;
      }
      
      if (parsed.bymonthday && parsed.bymonthday.length > 0) {
        result.selectedDate = parsed.bymonthday[0];
        result.monthlyMode = "date";
      }
      
      if (parsed.bymonth && parsed.bymonth.length > 0) {
        result.selectedMonth = parsed.bymonth[0];
      }
      
      return result;
    } catch (error) {
      console.error('Error parsing RRule:', error);
      return getDefaultValues();
    }
  };

  // 根据initialValue初始化状态
  const initialVals = parseRRule(initialValue);
  
  // 核心状态
  const [frequency, setFrequency] = useState(initialVals.frequency);
  const [interval, setInterval] = useState<number | null>(initialVals.interval);
  
  // 周重复状态
  const [selectedDays, setSelectedDays] = useState<number[]>(initialVals.selectedDays); 
  
  // 月重复状态
  const [monthlyMode, setMonthlyMode] = useState<"date" | "weekday" | "workday">(initialVals.monthlyMode);
  const [selectedDate, setSelectedDate] = useState<number | null>(initialVals.selectedDate);
  const [selectedWeekday, setSelectedWeekday] = useState(initialVals.selectedWeekday);
  const [weekPosition, setWeekPosition] = useState<"first" | "last">(initialVals.weekPosition);
  const [workdayPosition, setWorkdayPosition] = useState<"first" | "last">(initialVals.workdayPosition);
  
  // 年重复状态
  const [selectedMonth, setSelectedMonth] = useState(initialVals.selectedMonth);
  
  // 跳过选项
  const [skipHolidays, setSkipHolidays] = useState(initialVals.skipHolidays);
  const [skipWeekends, setSkipWeekends] = useState(initialVals.skipWeekends);
  
  // 错误状态
  const [intervalError, setIntervalError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [validationError, setValidationError] = useState('');

  const weekDays = [
    { label: "日", value: 0 },
    { label: "一", value: 1 },
    { label: "二", value: 2 },
    { label: "三", value: 3 },
    { label: "四", value: 4 },
    { label: "五", value: 5 },
    { label: "六", value: 6 },
  ];

  const frequencyOptions = [
    { label: "天", value: "DAILY" },
    { label: "周", value: "WEEKLY" },
    { label: "月", value: "MONTHLY" },
    { label: "年", value: "YEARLY" },
  ];

  const monthNames = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月"
  ];

  const weekdayNames = [
    { label: "周日", value: 0 },
    { label: "周一", value: 1 },
    { label: "周二", value: 2 },
    { label: "周三", value: 3 },
    { label: "周四", value: 4 },
    { label: "周五", value: 5 },
    { label: "周六", value: 6 },
  ];

  const positionOptions = [
    { label: "第一个", value: "first" },
    { label: "最后一个", value: "last" },
  ];

  useEffect(() => {
    // 解析初始值
    if (initialValue) {
      try {
        const parsed = RRuleEngine.parseRRule(initialValue);
        setFrequency(parsed.freq);
        setInterval(parsed.interval || 1);
        if (parsed.byweekday) {
          setSelectedDays(parsed.byweekday);
        }
        // 根据频率设置默认的重复模式
        if (parsed.freq === "MONTHLY") {
          if (parsed.bymonthday) {
            setMonthlyMode("date");
            setSelectedDate(parsed.bymonthday[0] || 1);
          } else if (parsed.byday) {
            setMonthlyMode("weekday");
          }
        }
      } catch (error) {
        console.error("Error parsing initial RRULE:", error);
      }
    } else {
      // 设置默认值
      const today = new Date();
      setSelectedDate(today.getDate());
      setSelectedWeekday(today.getDay());
    }
  }, [initialValue]);

  const toggleDay = (dayValue: number) => {
    if (frequency === "WEEKLY") {
      setSelectedDays((prev) =>
        prev.includes(dayValue)
          ? prev.filter((d) => d !== dayValue)
          : [...prev, dayValue].sort()
      );
    }
  };

  const generateRRule = () => {
    // 处理interval为null的情况，默认为1
    const intervalValue = interval === null ? 1 : interval;
    let rrule = `FREQ=${frequency};INTERVAL=${intervalValue}`;

    switch (frequency) {
      case "DAILY":
        if (skipWeekends) {
          rrule += `;BYDAY=MO,TU,WE,TH,FR`;
        }
        break;
        
      case "WEEKLY":
        if (selectedDays.length > 0) {
          const dayNames = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
          const byDay = selectedDays.map((day) => dayNames[day]).join(",");
          rrule += `;BYDAY=${byDay}`;
        }
        break;
        
      case "MONTHLY":
        switch (monthlyMode) {
          case "date":
            // 处理selectedDate为null的情况
            if (selectedDate !== null) {
              if (selectedDate === -1) {
                rrule += `;BYMONTHDAY=-1`;
              } else {
                rrule += `;BYMONTHDAY=${selectedDate}`;
              }
            }
            break;
          case "weekday":
            const dayNames = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
            const position = weekPosition === "first" ? "1" : "-1";
            rrule += `;BYDAY=${position}${dayNames[selectedWeekday]}`;
            break;
          case "workday":
            const workPosition = workdayPosition === "first" ? "1" : "-1";
            rrule += `;BYDAY=${workPosition}MO,${workPosition}TU,${workPosition}WE,${workPosition}TH,${workPosition}FR`;
            break;
        }
        break;
        
      case "YEARLY":
        // 处理selectedDate为null的情况
        if (selectedDate !== null) {
          rrule += `;BYMONTH=${selectedMonth};BYMONTHDAY=${selectedDate}`;
        }
        break;
    }

    return rrule;
  };

  const handleSave = () => {
    const rrule = generateRRule();
    onSave(rrule);
  };

  const renderFrequencyOptions = () => {
    switch (frequency) {
      case "WEEKLY":
        return (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground mb-3">选择星期</div>
            <div className="flex gap-2 justify-between">
              {weekDays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={`w-[44px] h-[44px] rounded-xl border border-border bg-background cursor-pointer text-sm font-semibold flex items-center justify-center transition-all duration-200 hover:shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5 ${selectedDays.includes(day.value) ? "bg-green-400 text-foreground border-foreground scale-100 shadow-none" : ""}`}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        );

      case "MONTHLY":
        return (
          <div className="space-y-3">
            <div className="flex gap-1 mb-3">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors duration-150 ${monthlyMode === "date" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
                onClick={() => setMonthlyMode("date")}
              >
                按日期
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors duration-150 ${monthlyMode === "weekday" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
                onClick={() => setMonthlyMode("weekday")}
              >
                按星期
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors duration-150 ${monthlyMode === "workday" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
                onClick={() => setMonthlyMode("workday")}
              >
                按工作日
              </button>
            </div>

            <div>
              {monthlyMode === "date" && (
                <div>
                  <div className="bg-background border border-border rounded-lg p-3">
                    <div className="text-center py-2 text-sm font-medium text-foreground">
                      <span>{monthNames[new Date().getMonth()]}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => (
                        <button
                          key={date}
                          type="button"
                          className={`w-8 h-8 rounded-md border text-xs font-medium transition-all duration-200 cursor-pointer flex items-center justify-center hover:shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5 ${selectedDate === date ? "bg-foreground text-background border-foreground scale-100 shadow-none" : "border-border bg-background"}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          {date}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`col-span-2 w-auto h-8 rounded-md border text-xs font-medium transition-all duration-200 cursor-pointer flex items-center justify-center hover:shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5 ${selectedDate === -1 ? "bg-foreground text-background border-foreground scale-100 shadow-none" : "border-border bg-background"}`}
                        onClick={() => setSelectedDate(-1)}
                      >
                        最后一天
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {monthlyMode === "weekday" && (
                <div>
                  <div className="flex items-center gap-2">
                    <select
                      value={weekPosition}
                      onChange={(e) => setWeekPosition(e.target.value as "first" | "last")}
                      className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    >
                      {positionOptions.map((pos) => (
                        <option key={pos.value} value={pos.value}>
                          {pos.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedWeekday}
                      onChange={(e) => setSelectedWeekday(parseInt(e.target.value))}
                      className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    >
                      {weekdayNames.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {monthlyMode === "workday" && (
                <div>
                  <select
                    value={workdayPosition}
                    onChange={(e) => setWorkdayPosition(e.target.value as "first" | "last")}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                  >
                    <option value="first">第一个工作日</option>
                    <option value="last">最后一个工作日</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        );

      case "YEARLY":
        return (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
                >
                  {monthNames.map((month, index) => (
                    <option key={index + 1} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={selectedDate === null ? '' : selectedDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setSelectedDate(null);
                    } else {
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue >= 1 && numValue <= 31) {
                        setSelectedDate(numValue);
                      }
                    }
                    // 清除错误状态
                    if (dateError) {
                      setDateError(false);
                    }
                  }}
                  className={`w-20 px-3 py-3 rounded-lg border bg-background text-center text-sm font-semibold ${dateError ? 'border-red-500' : 'border-border'}`}
                />
                <span className="text-sm text-foreground">日</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>自定义重复</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6 px-6 py-6">
          {/* 重复基础设置 */}
          <div className="flex flex-col gap-4">
            <div>
              <select className="w-full px-3 py-3 rounded-lg border border-border bg-muted/50 text-muted-foreground text-sm" disabled>
                <option value="按到期日期">按到期日期</option>
              </select>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground font-medium">每</span>
              <input
                type="number"
                min="1"
                max="99"
                value={interval === null ? '' : interval}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setInterval(null);
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 1 && numValue <= 99) {
                      setInterval(numValue);
                    }
                  }
                  // 清除错误状态
                  if (intervalError) {
                    setIntervalError(false);
                  }
                }}
                className={`w-20 px-3 py-3 rounded-lg border bg-background text-center text-sm font-semibold ${intervalError ? 'border-red-500' : 'border-border'}`}
              />
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="flex-1 px-3 py-3 rounded-lg border border-border bg-background text-foreground text-sm"
              >
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 频率特定选项 */}
          {renderFrequencyOptions()}

          {/* 跳过选项 */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={skipHolidays}
                onChange={(e) => setSkipHolidays(e.target.checked)}
              />
              <span>跳过法定节假日</span>
            </label>

            {frequency === "DAILY" && (
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipWeekends}
                  onChange={(e) => setSkipWeekends(e.target.checked)}
                />
                <span>跳过双休日</span>
              </label>
            )}
          </div>
          {validationError && (
            <p role="alert" className="text-sm text-[oklch(var(--destructive))]">
              {validationError}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" onClick={() => {
            // 重置错误状态
            setIntervalError(false);
            setDateError(false);
            setValidationError('');
            
            // 验证输入框不为空
            let hasError = false;
            
            if (interval === null) {
              setIntervalError(true);
              hasError = true;
            }
            
            if (frequency === "MONTHLY" && monthlyMode === "date" && selectedDate === null) {
              setDateError(true);
              hasError = true;
            }
            
            if (frequency === "YEARLY" && selectedDate === null) {
              setDateError(true);
              hasError = true;
            }
            
            // 如果有错误，显示提示并返回
            if (hasError) {
              setValidationError('请填写所有必填项');
              return;
            }
            
            handleSave();
          }}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
