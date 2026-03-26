'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarProps {
  month: Date;
  selectedDate: string | null; // YYYY-MM-DD
  markedDates: Map<string, number>; // date -> slot count
  onSelectDate: (date: string) => void;
  onMonthChange: (month: Date) => void;
  locale: string;
}

const DAY_LABELS_PL = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
const DAY_LABELS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function MiniCalendar({
  month,
  selectedDate,
  markedDates,
  onSelectDate,
  onMonthChange,
  locale,
}: MiniCalendarProps) {
  const year = month.getFullYear();
  const mon = month.getMonth();

  const dayLabels = locale === 'pl' ? DAY_LABELS_PL : DAY_LABELS_EN;

  // Month name using Intl
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);

  // First day of month (0=Sunday, convert to Monday-based)
  const firstDayOfMonth = new Date(year, mon, 1).getDay();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Monday-based

  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = toDateStr(new Date());

  const prevMonth = () => {
    onMonthChange(new Date(year, mon - 1, 1));
  };

  const nextMonth = () => {
    onMonthChange(new Date(year, mon + 1, 1));
  };

  // Build grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete the last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold text-htg-fg capitalize">{monthName}</h3>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-htg-surface transition-colors text-htg-fg-muted hover:text-htg-fg"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map((label) => (
          <div key={label} className="text-center text-xs font-medium text-htg-fg-muted py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }

          const dateStr = toDateStr(new Date(year, mon, day));
          const isPast = dateStr < today;
          const isSelected = dateStr === selectedDate;
          const slotCount = markedDates.get(dateStr) ?? 0;
          const hasSlots = slotCount > 0;
          const isToday = dateStr === today;

          return (
            <button
              key={dateStr}
              onClick={() => !isPast && hasSlots && onSelectDate(dateStr)}
              disabled={isPast || !hasSlots}
              className={`
                aspect-square flex flex-col items-center justify-center rounded-lg text-sm relative transition-colors
                ${isPast ? 'text-htg-fg-muted/40 cursor-not-allowed' : ''}
                ${!isPast && !hasSlots ? 'text-htg-fg-muted cursor-default' : ''}
                ${!isPast && hasSlots && !isSelected ? 'text-htg-fg hover:bg-htg-surface cursor-pointer' : ''}
                ${isSelected ? 'bg-htg-sage text-white ring-2 ring-htg-sage ring-offset-2' : ''}
                ${isToday && !isSelected ? 'font-bold' : ''}
              `}
            >
              {day}
              {hasSlots && !isPast && (
                <span
                  className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-htg-sage'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
