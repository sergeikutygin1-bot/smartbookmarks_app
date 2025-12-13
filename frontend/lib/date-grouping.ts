import {
  isToday,
  isThisYear,
  differenceInDays,
  format,
  startOfDay,
} from "date-fns";
import { Bookmark } from "@/store/bookmarksStore";

export interface BookmarkGroup {
  label: string;
  bookmarks: Bookmark[];
}

/**
 * Groups bookmarks by date in Apple Notes style:
 * - "Today" - bookmarks edited today
 * - "Previous 30 Days" - bookmarks edited in last 30 days (excluding today)
 * - Month names (e.g., "September") - current year bookmarks older than 30 days
 * - Year (e.g., "2024") - bookmarks from previous years
 *
 * @param bookmarks - Array of bookmarks to group
 * @returns Array of bookmark groups in chronological order
 */
export function groupBookmarksByDate(bookmarks: Bookmark[]): BookmarkGroup[] {
  if (!bookmarks || bookmarks.length === 0) {
    return [];
  }

  const now = new Date();
  const groups = new Map<string, Bookmark[]>();

  bookmarks.forEach((bookmark) => {
    const updatedAt = bookmark.updatedAt;
    const daysDiff = differenceInDays(startOfDay(now), startOfDay(updatedAt));

    let label: string;

    if (isToday(updatedAt)) {
      label = "Today";
    } else if (daysDiff <= 30) {
      label = "Previous 30 Days";
    } else if (isThisYear(updatedAt)) {
      // Month name for current year (e.g., "September", "July")
      label = format(updatedAt, "MMMM");
    } else {
      // Year for previous years (e.g., "2024", "2023")
      label = format(updatedAt, "yyyy");
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(bookmark);
  });

  // Convert to array and maintain logical order
  const sectionOrder = ["Today", "Previous 30 Days"];
  const result: BookmarkGroup[] = [];

  // Add "Today" and "Previous 30 Days" first (if they exist)
  sectionOrder.forEach((label) => {
    if (groups.has(label)) {
      result.push({ label, bookmarks: groups.get(label)! });
      groups.delete(label);
    }
  });

  // Add remaining groups (months/years) in reverse chronological order
  const remaining = Array.from(groups.entries())
    .sort((a, b) => {
      // Sort by the first bookmark's updatedAt date in each group (most recent first)
      const dateA = a[1][0]?.updatedAt || new Date(0);
      const dateB = b[1][0]?.updatedAt || new Date(0);
      return dateB.getTime() - dateA.getTime();
    })
    .map(([label, bookmarks]) => ({ label, bookmarks }));

  return [...result, ...remaining];
}
