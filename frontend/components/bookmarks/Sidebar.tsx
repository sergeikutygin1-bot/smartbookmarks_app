"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookmarkList } from "./BookmarkList";
import { Search, Plus } from "lucide-react";

interface SidebarProps {
  onCreateClick: () => void;
}

export function Sidebar({ onCreateClick }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-display font-bold text-sidebar-foreground">
            Bookmarks
          </h1>
          <Button
            size="sm"
            onClick={onCreateClick}
            className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
            variant="ghost"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-sidebar-accent border-sidebar-border"
          />
        </div>
      </div>

      {/* Bookmark List */}
      <BookmarkList />
    </div>
  );
}
