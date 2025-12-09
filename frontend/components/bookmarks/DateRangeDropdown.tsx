"use client";

import { useState } from "react";
import { useFilterStore } from "@/store/filterStore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronDown, X } from "lucide-react";
import { format } from "date-fns";

type DatePreset = {
  label: string;
  getValue: () => { from: Date; to: Date };
};

const DATE_PRESETS: DatePreset[] = [
  {
    label: "Last day",
    getValue: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 1);
      return { from, to };
    },
  },
  {
    label: "Last week",
    getValue: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      return { from, to };
    },
  },
  {
    label: "Last month",
    getValue: () => {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      return { from, to };
    },
  },
];

interface DateRangeDropdownProps {
  fullWidth?: boolean;
}

export function DateRangeDropdown({ fullWidth = false }: DateRangeDropdownProps) {
  const { dateRange, setDateRange } = useFilterStore();
  const [customMode, setCustomMode] = useState(false);

  const hasDateFilter = dateRange.from !== null || dateRange.to !== null;

  const handlePresetClick = (preset: DatePreset) => {
    const range = preset.getValue();
    setDateRange(range.from, range.to);
    setCustomMode(false);
  };

  const handleClearDate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDateRange(null, null);
    setCustomMode(false);
  };

  const getButtonLabel = () => {
    if (!hasDateFilter) return "Date";
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`;
    }
    if (dateRange.from) {
      return `From ${format(dateRange.from, "MMM d")}`;
    }
    if (dateRange.to) {
      return `Until ${format(dateRange.to, "MMM d")}`;
    }
    return "Date";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 px-4 text-sm font-normal border-sidebar-border bg-sidebar text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 ${fullWidth ? 'w-full' : 'min-w-[100px]'}`}
        >
          <div className={`flex items-center ${fullWidth ? 'w-full justify-between' : ''}`}>
            <div className="flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
              <span className={hasDateFilter ? "" : "opacity-70"}>
                {getButtonLabel()}
              </span>
            </div>
            {hasDateFilter ? (
              <X
                className="ml-2 h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClearDate}
              />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 space-y-1 border-b w-[200px]">
          <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">Quick select</div>
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm font-normal h-8 px-2 hover:bg-primary hover:text-primary-foreground transition-all duration-200"
              onClick={() => handlePresetClick(preset)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sm font-normal h-8 px-2 hover:bg-primary hover:text-primary-foreground transition-all duration-200"
            onClick={() => setCustomMode(!customMode)}
          >
            {customMode ? "Hide custom range" : "Custom range"}
          </Button>
        </div>

        {customMode && (
          <div className="p-3">
            <Calendar
              mode="range"
              selected={{
                from: dateRange.from || undefined,
                to: dateRange.to || undefined,
              }}
              onSelect={(range) => {
                if (range) {
                  setDateRange(range.from || null, range.to || null);
                }
              }}
              numberOfMonths={1}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
