// components/RecurrenceSelector.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { RRuleEngine, RRULE_PATTERNS } from "../lib/recurring/RRuleEngine";

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
    ? "自定义重复"
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
      <div className="recurrence-selector" ref={dropdownRef}>
        <div
          className={`recurrence-field ${hasValue ? "has-value" : ""} ${
            disabled ? "disabled" : ""
          }`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleTriggerClick}
        >
          <span className="recurrence-text">{displayText}</span>
          <div className="recurrence-controls">
            {hasValue && isHovered ? (
              <button
                type="button"
                className="recurrence-clear-btn"
                onClick={handleClearRecurrence}
                title="停止重复"
              >
                ×
              </button>
            ) : (
              <span className="recurrence-arrow">▼</span>
            )}
          </div>
        </div>

        {isOpen && !disabled && (
          <div className="recurrence-dropdown">
            {recurrenceOptions.map((option, index) => (
              <div
                key={index}
                className={`recurrence-option ${
                  option.value === value && value !== null && !option.isCustom ? "selected" : ""
                }`}
                onClick={() => handleOptionClick(option)}
              >
                <span className="option-label">{option.label}</span>
                {option.description && (
                  <span className="option-description">
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
      
      if (parsed.interval) {
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
  const [interval, setInterval] = useState(initialVals.interval);
  
  // 周重复状态
  const [selectedDays, setSelectedDays] = useState<number[]>(initialVals.selectedDays); 
  
  // 月重复状态
  const [monthlyMode, setMonthlyMode] = useState<"date" | "weekday" | "workday">(initialVals.monthlyMode);
  const [selectedDate, setSelectedDate] = useState(initialVals.selectedDate);
  const [selectedWeekday, setSelectedWeekday] = useState(initialVals.selectedWeekday);
  const [weekPosition, setWeekPosition] = useState<"first" | "last">(initialVals.weekPosition);
  const [workdayPosition, setWorkdayPosition] = useState<"first" | "last">(initialVals.workdayPosition);
  
  // 年重复状态
  const [selectedMonth, setSelectedMonth] = useState(initialVals.selectedMonth);
  
  // 跳过选项
  const [skipHolidays, setSkipHolidays] = useState(initialVals.skipHolidays);
  const [skipWeekends, setSkipWeekends] = useState(initialVals.skipWeekends);

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
            setRepeatMode("按日期");
            setSelectedDate(parsed.bymonthday[0] || 1);
          } else if (parsed.byday) {
            setRepeatMode("按星期");
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
    let rrule = `FREQ=${frequency};INTERVAL=${interval}`;

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
            if (selectedDate === -1) {
              rrule += `;BYMONTHDAY=-1`;
            } else {
              rrule += `;BYMONTHDAY=${selectedDate}`;
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
        rrule += `;BYMONTH=${selectedMonth};BYMONTHDAY=${selectedDate}`;
        break;
    }

    return rrule;
  };

  const handleSave = () => {
    const rrule = generateRRule();
    onSave(rrule);
  };

  const getPreviewText = () => {
    try {
      const rrule = generateRRule();
      return RRuleEngine.generateHumanReadableDescription(rrule);
    } catch {
      return "自定义重复";
    }
  };

  const renderFrequencyOptions = () => {
    switch (frequency) {
      case "WEEKLY":
        return (
          <div className="frequency-options">
            <div className="option-label">选择星期</div>
            <div className="weekdays-grid">
              {weekDays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={`weekday-btn ${
                    selectedDays.includes(day.value) ? "selected" : ""
                  }`}
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
          <div className="frequency-options">
            <div className="monthly-tabs">
              <button
                type="button"
                className={`tab-btn ${monthlyMode === "date" ? "active" : ""}`}
                onClick={() => setMonthlyMode("date")}
              >
                按日期
              </button>
              <button
                type="button"
                className={`tab-btn ${monthlyMode === "weekday" ? "active" : ""}`}
                onClick={() => setMonthlyMode("weekday")}
              >
                按星期
              </button>
              <button
                type="button"
                className={`tab-btn ${monthlyMode === "workday" ? "active" : ""}`}
                onClick={() => setMonthlyMode("workday")}
              >
                按工作日
              </button>
            </div>

            <div className="monthly-content">
              {monthlyMode === "date" && (
                <div className="date-picker">
                  <div className="calendar-mini">
                    <div className="calendar-header">
                      <span>{monthNames[new Date().getMonth()]}</span>
                    </div>
                    <div className="dates-grid">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => (
                        <button
                          key={date}
                          type="button"
                          className={`date-btn ${selectedDate === date ? "selected" : ""}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          {date}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`date-btn last-day ${selectedDate === -1 ? "selected" : ""}`}
                        onClick={() => setSelectedDate(-1)}
                      >
                        最后一天
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {monthlyMode === "weekday" && (
                <div className="weekday-picker">
                  <div className="picker-row">
                    <select
                      value={weekPosition}
                      onChange={(e) => setWeekPosition(e.target.value as "first" | "last")}
                      className="position-select"
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
                      className="weekday-select"
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
                <div className="workday-picker">
                  <select
                    value={workdayPosition}
                    onChange={(e) => setWorkdayPosition(e.target.value as "first" | "last")}
                    className="workday-select"
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
          <div className="frequency-options">
            <div className="yearly-picker">
              <div className="picker-row">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="month-select"
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
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(parseInt(e.target.value) || 1)}
                  className="date-input"
                />
                <span>日</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content custom-recurrence-modal">
        <div className="modal-header">
          <h2>自定义重复</h2>
          <button className="modal-close" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* 重复基础设置 */}
          <div className="recurrence-basic">
            <div className="basic-row">
              <select className="base-type-select" disabled>
                <option value="按到期日期">按到期日期</option>
              </select>
            </div>
            
            <div className="frequency-row">
              <span className="frequency-prefix">每</span>
              <input
                type="number"
                min="1"
                max="99"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                className="interval-input"
              />
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="frequency-select"
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
          <div className="skip-options">
            <label className="skip-option">
              <input
                type="checkbox"
                checked={skipHolidays}
                onChange={(e) => setSkipHolidays(e.target.checked)}
              />
              <span>跳过法定节假日</span>
            </label>

            {frequency === "DAILY" && (
              <label className="skip-option">
                <input
                  type="checkbox"
                  checked={skipWeekends}
                  onChange={(e) => setSkipWeekends(e.target.checked)}
                />
                <span>跳过双休日</span>
              </label>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-small" onClick={onCancel}>
            取消
          </button>
          <button className="btn-small confirm" onClick={handleSave}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
