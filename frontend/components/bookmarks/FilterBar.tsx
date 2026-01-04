"use client";

import { useState } from "react";
import { useFilterStore } from "@/store/filterStore";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TypeDropdown } from "./TypeDropdown";
import { SourceDropdown } from "./SourceDropdown";
import { DateRangeDropdown } from "./DateRangeDropdown";
import { ConceptDropdown } from "./ConceptDropdown";
import { EntityDropdown } from "./EntityDropdown";

export function FilterBar() {
  const { clearFilters, hasActiveFilters } = useFilterStore();
  const [showFilters, setShowFilters] = useState(true);

  return (
    <div className="flex-shrink-0 border-b border-sidebar-border">
      {/* Toggle button */}
      <div className="px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full justify-between h-8 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-all duration-200"
        >
          Filters
          {showFilters ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Collapsible filter section */}
      {showFilters && (
        <div className="px-4 pb-3 space-y-2">
          {/* Five dropdown filters - full width stacked */}
          <TypeDropdown fullWidth />
          <SourceDropdown fullWidth />
          <DateRangeDropdown fullWidth />
          <ConceptDropdown fullWidth />
          <EntityDropdown fullWidth />

          {/* Clear button when filters are active */}
          {hasActiveFilters() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="w-full h-8 text-xs hover:bg-primary hover:text-primary-foreground transition-all duration-200"
            >
              Clear all filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
