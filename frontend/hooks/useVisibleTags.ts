"use client";

import { useState, useEffect, RefObject } from "react";

interface UseVisibleTagsOptions {
  tags: string[];
  containerRef: RefObject<HTMLDivElement>;
  minVisible?: number;
  maxBeforeShowAll?: number;
}

/**
 * Custom hook to calculate how many tags can fit in a container based on actual pixel measurements
 *
 * Logic:
 * - If 3 or fewer tags fit: show those + "+X" indicator
 * - If 4 tags fit: show 4 + "+X" indicator
 * - If 5+ tags fit: show all tags without indicator
 */
export function useVisibleTags({
  tags,
  containerRef,
  minVisible = 3,
  maxBeforeShowAll = 5,
}: UseVisibleTagsOptions) {
  const [visibleCount, setVisibleCount] = useState(minVisible);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || tags.length === 0) {
      return;
    }

    const calculateVisibleTags = () => {
      // Get container width with safety margin to prevent overflow
      const containerWidth = container.offsetWidth;
      if (containerWidth === 0) return;

      // Add safety margin to account for rounding errors and ensure tags fully fit
      const SAFETY_MARGIN = 8; // Extra pixels to ensure no truncation
      const availableWidth = containerWidth - SAFETY_MARGIN;

      // Create a temporary measurement element
      const measurementDiv = document.createElement("div");
      measurementDiv.style.position = "absolute";
      measurementDiv.style.visibility = "hidden";
      measurementDiv.style.whiteSpace = "nowrap";
      measurementDiv.style.display = "flex";
      measurementDiv.style.gap = "6px"; // gap-1.5 = 6px
      document.body.appendChild(measurementDiv);

      // Measure each tag width
      const tagWidths: number[] = [];
      const GAP = 6; // gap-1.5

      tags.forEach((tag) => {
        const badge = document.createElement("span");
        badge.className = "text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground rounded-md inline-flex items-center";
        badge.style.fontSize = "10px"; // text-[10px]
        badge.style.paddingLeft = "0.375rem"; // px-1.5
        badge.style.paddingRight = "0.375rem"; // px-1.5
        badge.textContent = tag;
        measurementDiv.appendChild(badge);
        tagWidths.push(badge.offsetWidth);
      });

      // Also measure the "+X" indicator for different values
      const indicatorBadge = document.createElement("span");
      indicatorBadge.className = "text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground rounded-md inline-flex items-center";
      indicatorBadge.style.fontSize = "10px";
      indicatorBadge.style.paddingLeft = "0.375rem";
      indicatorBadge.style.paddingRight = "0.375rem";
      indicatorBadge.textContent = "+99"; // Measure worst case
      measurementDiv.appendChild(indicatorBadge);
      const INDICATOR_WIDTH = indicatorBadge.offsetWidth;

      // Clean up measurement element
      document.body.removeChild(measurementDiv);

      // Calculate how many tags fit in a single line
      let count = 0;

      // First, try to fit all tags without indicator
      let totalWidthAllTags = 0;
      for (let i = 0; i < tagWidths.length; i++) {
        const gap = i > 0 ? GAP : 0;
        totalWidthAllTags += gap + tagWidths[i];
      }

      // If all tags fit within available width, show them all!
      if (totalWidthAllTags <= availableWidth) {
        setVisibleCount(tags.length);
        return;
      }

      // Otherwise, calculate how many fit with "+X" indicator
      let totalWidth = 0;
      for (let i = 0; i < tagWidths.length; i++) {
        const tagWidth = tagWidths[i];
        const gap = i > 0 ? GAP : 0;

        // Check if we can fit this tag + gap + the "+X" indicator + gap
        const widthWithIndicator = totalWidth + gap + tagWidth + GAP + INDICATOR_WIDTH;

        if (widthWithIndicator <= availableWidth) {
          totalWidth += gap + tagWidth;
          count = i + 1;
        } else {
          break;
        }
      }

      // Ensure we show at least minVisible tags (unless we have fewer total tags)
      const finalCount = Math.min(Math.max(minVisible, count), tags.length);

      setVisibleCount(finalCount);
    };

    // Calculate on mount and when tags change
    calculateVisibleTags();

    // Set up ResizeObserver to recalculate on container resize
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleTags();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [tags, containerRef, minVisible, maxBeforeShowAll]);

  return visibleCount;
}
