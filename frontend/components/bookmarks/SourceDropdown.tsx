"use client";

import { useFilterStore } from "@/store/filterStore";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

interface SourceDropdownProps {
  fullWidth?: boolean;
}

export function SourceDropdown({ fullWidth = false }: SourceDropdownProps) {
  const { selectedSources, toggleSource } = useFilterStore();
  const { data: bookmarks } = useBookmarks();

  // Extract unique domains from bookmarks
  const uniqueDomains = Array.from(
    new Set(bookmarks?.map(b => b.domain) || [])
  ).sort();

  // If no domains available, disable the dropdown
  if (uniqueDomains.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={`h-9 px-4 text-sm font-normal border-sidebar-border bg-sidebar text-foreground opacity-50 cursor-not-allowed ${fullWidth ? 'w-full justify-between' : 'min-w-[110px]'}`}
      >
        <span>Source</span>
        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 px-4 text-sm font-normal border-sidebar-border bg-sidebar text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 ${fullWidth ? 'w-full justify-between' : 'min-w-[110px]'}`}
        >
          <span>
            Source
            {selectedSources.length > 0 && (
              <span className="ml-1.5 opacity-70">({selectedSources.length})</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 max-h-80 overflow-y-auto" align="start">
        <div className="space-y-1.5">
          {uniqueDomains.map((domain) => {
            const isSelected = selectedSources.includes(domain);
            return (
              <div
                key={domain}
                className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                onClick={() => toggleSource(domain)}
              >
                <Checkbox
                  checked={isSelected}
                  className="h-4 w-4 pointer-events-none"
                />
                <label className="text-sm cursor-pointer flex-1 truncate" title={domain}>
                  {domain}
                </label>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
