"use client";

import { useFilterStore } from "@/store/filterStore";
import { useAllEntities } from "@/hooks/useGraphMetadata";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, Sparkles, Building2, User, Cpu, Package, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ENTITY_ICONS = {
  person: User,
  company: Building2,
  technology: Cpu,
  product: Package,
  location: MapPin,
};

interface EntityDropdownProps {
  fullWidth?: boolean;
}

export function EntityDropdown({ fullWidth = false }: EntityDropdownProps) {
  const { selectedEntities, toggleEntity } = useFilterStore();
  const { data: entities, isLoading } = useAllEntities(undefined, 50);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 px-4 text-sm font-normal border-sidebar-border bg-sidebar text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200 ${fullWidth ? 'w-full justify-between' : 'min-w-[120px]'}`}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Entities
            {selectedEntities.length > 0 && (
              <span className="ml-1.5 opacity-70">({selectedEntities.length})</span>
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
            {entities?.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No entities found. Enrich bookmarks to extract entities.
              </div>
            ) : (
              entities?.map((entity: any) => {
                const isSelected = selectedEntities.includes(entity.id);
                const Icon = ENTITY_ICONS[entity.entityType as keyof typeof ENTITY_ICONS] || Building2;

                return (
                  <div
                    key={entity.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                    onClick={() => toggleEntity(entity.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="h-4 w-4 pointer-events-none"
                    />
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <label className="text-sm cursor-pointer flex-1 truncate">
                      {entity.name}
                    </label>
                    <span className="text-xs opacity-70">
                      {entity.occurrenceCount}
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
