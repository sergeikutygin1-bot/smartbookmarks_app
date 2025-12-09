"use client";

import { useFilterStore } from "@/store/filterStore";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { Bookmark } from "@/store/bookmarksStore";

const CONTENT_TYPES: Array<{ value: Bookmark['contentType']; label: string }> = [
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "tweet", label: "Tweet" },
  { value: "pdf", label: "PDF" },
  { value: "other", label: "Other" },
];

interface TypeDropdownProps {
  fullWidth?: boolean;
}

export function TypeDropdown({ fullWidth = false }: TypeDropdownProps) {
  const { selectedTypes, toggleType } = useFilterStore();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 px-4 text-sm font-normal border-sidebar-border bg-sidebar text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 ${fullWidth ? 'w-full justify-between' : 'min-w-[100px]'}`}
        >
          <span>
            Type
            {selectedTypes.length > 0 && (
              <span className="ml-1.5 opacity-70">({selectedTypes.length})</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="start">
        <div className="space-y-1.5">
          {CONTENT_TYPES.map(({ value, label }) => {
            const isSelected = selectedTypes.includes(value);
            return (
              <div
                key={value}
                className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                onClick={() => toggleType(value)}
              >
                <Checkbox
                  checked={isSelected}
                  className="h-4 w-4 pointer-events-none"
                />
                <label className="text-sm cursor-pointer flex-1">
                  {label}
                </label>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
