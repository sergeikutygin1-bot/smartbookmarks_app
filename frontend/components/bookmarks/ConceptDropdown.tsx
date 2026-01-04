"use client";

import { useFilterStore } from "@/store/filterStore";
import { useAllConcepts } from "@/hooks/useGraphMetadata";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ConceptDropdownProps {
  fullWidth?: boolean;
}

export function ConceptDropdown({ fullWidth = false }: ConceptDropdownProps) {
  const { selectedConcepts, toggleConcept } = useFilterStore();
  const { data: concepts, isLoading } = useAllConcepts(50);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 px-4 text-sm font-normal border-sidebar-border bg-sidebar text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 ${fullWidth ? 'w-full justify-between' : 'min-w-[120px]'}`}
        >
          <span className="flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5" />
            Concepts
            {selectedConcepts.length > 0 && (
              <span className="ml-1.5 opacity-70">({selectedConcepts.length})</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {concepts?.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No concepts found. Enrich bookmarks to generate concepts.
              </div>
            ) : (
              concepts?.map((concept: any) => {
                const isSelected = selectedConcepts.includes(concept.id);
                return (
                  <div
                    key={concept.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                    onClick={() => toggleConcept(concept.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="h-4 w-4 pointer-events-none"
                    />
                    <label className="text-sm cursor-pointer flex-1 truncate">
                      {concept.name}
                    </label>
                    <span className="text-xs opacity-70">
                      {concept.occurrenceCount}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
