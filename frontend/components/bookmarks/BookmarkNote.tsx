"use client";

import { useState, useEffect, useRef } from "react";
import { Bookmark } from "@/store/bookmarksStore";
import { useUpdateBookmark, useEnrichBookmark } from "@/hooks/useBookmarks";
import { useEnrichmentStore } from "@/store/enrichmentStore";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Tag, Sparkles, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface BookmarkNoteProps {
  bookmark: Bookmark;
}

export function BookmarkNote({ bookmark }: BookmarkNoteProps) {
  const updateMutation = useUpdateBookmark();
  const enrichMutation = useEnrichBookmark();

  // Get enrichment status from global store
  const enrichmentStatus = useEnrichmentStore(state => state.getEnrichmentStatus(bookmark.id));
  const isEnriching = useEnrichmentStore(state => state.isEnriching(bookmark.id));

  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url);
  const [summary, setSummary] = useState(bookmark.summary || "");
  const [tags, setTags] = useState<string[]>(bookmark.tags);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [isUrlValid, setIsUrlValid] = useState(true);
  const lastInvalidUrlRef = useRef<string>("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Track if we're actively saving
  const isSaving = updateMutation.isPending;

  // Validate URL format (basic check only - backend will verify accessibility)
  const validateUrl = (urlString: string): boolean => {
    if (!urlString || urlString === '') return true; // Empty is okay (untitled bookmark)

    try {
      const url = new URL(urlString);

      // Only check for http/https protocol - backend handles everything else
      if (!['http:', 'https:'].includes(url.protocol)) {
        return false;
      }

      return true;
    } catch {
      // If URL() constructor fails, it's definitely invalid
      return false;
    }
  };

  // Validate URL and show toast if invalid
  const validateAndNotify = (urlToValidate: string) => {
    if (!urlToValidate || urlToValidate === '') {
      setIsUrlValid(true);
      lastInvalidUrlRef.current = "";
      return true;
    }

    const isValid = validateUrl(urlToValidate);
    setIsUrlValid(isValid);

    // Only show toast once per invalid URL (using ref for immediate sync)
    if (!isValid && urlToValidate !== lastInvalidUrlRef.current) {
      lastInvalidUrlRef.current = urlToValidate; // Update immediately to prevent duplicate toasts
      toast.error("Invalid URL - Please enter a valid URL starting with http:// or https://", {
        duration: 5000,
        className: "font-semibold",
      });
    } else if (isValid) {
      lastInvalidUrlRef.current = "";
    }

    return isValid;
  };

  // Handle URL change (no immediate validation)
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    // Don't validate immediately - wait for debounce or user action
  };

  // Sync local state when:
  // 1. Bookmark ID changes (user selects different bookmark)
  // 2. Enrichment completes for THIS bookmark
  // Store previous ID to detect changes
  const prevIdRef = useRef<string>();
  const prevEnrichmentStatusRef = useRef<string>();

  useEffect(() => {
    const idChanged = prevIdRef.current !== bookmark.id;
    const enrichmentCompleted =
      prevEnrichmentStatusRef.current === 'processing' &&
      enrichmentStatus === 'success';

    // DEFENSIVE CHECK: Verify we're syncing the correct bookmark
    // This prevents race conditions where enrichment data from one bookmark
    // incorrectly appears in another bookmark's form
    const shouldSync = idChanged || enrichmentCompleted;

    if (shouldSync) {
      // Double-check: if enrichment completed, it must be for THIS bookmark
      if (enrichmentCompleted && prevIdRef.current && prevIdRef.current !== bookmark.id) {
        console.warn(
          `[BookmarkNote] RACE CONDITION PREVENTED: ` +
          `Enrichment completed for bookmark ${prevIdRef.current}, ` +
          `but now viewing bookmark ${bookmark.id}. Skipping sync.`
        );
        prevIdRef.current = bookmark.id;
        prevEnrichmentStatusRef.current = enrichmentStatus;
        return;
      }

      console.log(
        `[BookmarkNote] ✓ Syncing to bookmark: ${bookmark.id} ` +
        `(ID changed: ${idChanged}, enrichment completed: ${enrichmentCompleted})`
      );
      setTitle(bookmark.title);
      setUrl(bookmark.url);
      setSummary(bookmark.summary || "");
      setTags(bookmark.tags);
      setIsAddingTag(false);
      setNewTagValue("");
      setIsUrlValid(true);
      lastInvalidUrlRef.current = "";
    } else {
      console.log(
        `[BookmarkNote] ⊘ Skipping sync for ${bookmark.id} ` +
        `(ID changed: ${idChanged}, enrichment completed: ${enrichmentCompleted})`
      );
    }

    prevIdRef.current = bookmark.id;
    prevEnrichmentStatusRef.current = enrichmentStatus;
  }, [bookmark.id, bookmark.title, bookmark.url, bookmark.summary, bookmark.tags, enrichmentStatus]);

  // Focus tag input when adding tag
  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [isAddingTag]);

  // Debounced URL validation - validate after user stops typing for 3 seconds
  useEffect(() => {
    if (!url || url === '') {
      setIsUrlValid(true);
      return;
    }

    const timer = setTimeout(() => {
      validateAndNotify(url);
    }, 3000); // 3 seconds after user stops typing

    return () => clearTimeout(timer);
  }, [url]);

  // Auto-save with debounce
  useEffect(() => {
    // Don't save if bookmark ID is undefined
    if (!bookmark.id) {
      return;
    }

    const timer = setTimeout(() => {
      const hasChanges =
        title !== bookmark.title ||
        url !== bookmark.url ||
        summary !== bookmark.summary ||
        JSON.stringify(tags) !== JSON.stringify(bookmark.tags);

      if (hasChanges) {
        updateMutation.mutate({
          id: bookmark.id,
          data: { title, url, summary, tags },
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [title, url, summary, tags, bookmark.id, bookmark.title, bookmark.url, bookmark.summary, bookmark.tags]);

  // Handle adding a new tag
  const handleAddTag = () => {
    const trimmedTag = newTagValue.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTagValue("");
      setIsAddingTag(false);
    }
  };

  // Handle removing a tag
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  // Handle tag input key press
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setNewTagValue("");
      setIsAddingTag(false);
    }
  };

  // Handle enrich with AI
  const handleEnrich = async () => {
    if (!bookmark.id || isEnriching) return;

    // Validate URL before enriching
    if (!validateAndNotify(url)) {
      return; // Don't proceed if URL is invalid
    }

    console.log(`[BookmarkNote] Starting enrichment for: ${bookmark.id}`);

    try {
      const enrichedBookmark = await enrichMutation.mutateAsync(bookmark.id);

      console.log(`[BookmarkNote] Enrichment completed for: ${bookmark.id}`);

      // CRITICAL: Only update local state if this enrichment is for the CURRENTLY displayed bookmark
      // User might have switched to a different bookmark while enrichment was processing
      if (enrichedBookmark.id === bookmark.id) {
        // Update local state with enriched data
        setTitle(enrichedBookmark.title);
        setSummary(enrichedBookmark.summary || "");
        setTags(enrichedBookmark.tags);

        // Show success toast (only if still viewing this bookmark)
        toast.success("AI enrichment completed!", {
          description: "Summary, tags, and metadata have been updated.",
          classNames: {
            description: "!text-foreground/90 !font-medium", // Higher contrast description
          },
        });
      } else {
        console.log(`[BookmarkNote] Enrichment completed for ${enrichedBookmark.id}, but now viewing ${bookmark.id}. Skipping local state update.`);

        // Show a different toast since user is viewing a different bookmark
        toast.success("Enrichment completed in background", {
          description: "A bookmark was enriched while you were viewing another one.",
        });
      }
    } catch (error) {
      // Check if this was an abort (user cancelled)
      const isAborted = error instanceof Error && error.name === 'AbortError';

      if (isAborted) {
        console.log(`[BookmarkNote] Enrichment cancelled for: ${bookmark.id}`);
        // Don't show error toast for intentional cancellations
        return;
      }

      // Check if this is a URL validation error (expected, not a bug)
      const isUrlError = error instanceof Error && error.name === 'URLValidationError';

      // Only log unexpected errors to console (URL validation errors are expected user feedback)
      if (!isUrlError) {
        console.error(`[BookmarkNote] Enrichment failed for: ${bookmark.id}`, error);
      }

      // Extract error message
      const errorMessage = error instanceof Error
        ? error.message
        : "An unexpected error occurred while enriching the bookmark.";

      // Determine error type for better user messaging
      const isUrlAccessError = errorMessage.includes('URL could not be accessed') ||
                               errorMessage.includes('not accessible') ||
                               errorMessage.includes('Could not connect');
      const isRetryFailure = errorMessage.includes('Failed after');

      const errorTitle = isUrlAccessError
        ? "Unable to access URL"
        : isRetryFailure
        ? "AI enrichment failed after multiple attempts"
        : "AI enrichment failed";

      const errorDescription = isUrlAccessError
        ? errorMessage + " Please verify the URL is correct and try again."
        : errorMessage;

      // Show detailed error toast
      toast.error(errorTitle, {
        description: errorDescription,
        duration: 8000, // Longer duration for important errors
        classNames: {
          description: "!text-foreground/90 !font-medium", // Higher contrast description
        },
        action: isUrlAccessError ? undefined : {
          label: "Try Again",
          onClick: () => handleEnrich(),
        },
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full p-10 overflow-y-auto relative"
    >
      {/* Auto-save and enriching indicators - subtle, non-intrusive, top-right */}
      <AnimatePresence>
        {isSaving && !isEnriching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 right-6 text-[10px] font-medium text-muted-foreground pointer-events-none"
          >
            Saving...
          </motion.div>
        )}
        {isEnriching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 right-6 text-sm font-medium text-primary pointer-events-none flex items-center gap-2"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            {enrichmentStatus === 'queued' ? 'Queued for enrichment...' : 'Enriching with AI...'}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Title - Golden Ratio: 56px (3.5rem) - Commanding headline */}
        <div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled bookmark"
            className="title-display !text-[56px] !leading-[1.1] font-bold border-0 px-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 h-auto py-3 transition-all duration-200 hover:bg-muted/20 rounded-md"
          />
        </div>

        {/* URL with cobalt "Open" button */}
        <div className="flex items-center gap-3">
          <ExternalLink className={`h-4 w-4 flex-shrink-0 ${!isUrlValid ? 'text-destructive' : 'text-primary'}`} />
          <Input
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://example.com"
            className={`text-xs border-0 px-2 focus-visible:ring-2 focus-visible:ring-offset-0 h-auto py-1 font-medium transition-all duration-200 hover:bg-muted/20 rounded-md -ml-2 ${
              !isUrlValid
                ? 'text-destructive focus-visible:ring-destructive'
                : 'text-primary focus-visible:ring-primary'
            }`}
          />
          <Button
            size="sm"
            variant="default"
            className="flex-shrink-0 h-8 text-xs font-semibold transition-all duration-200"
            onClick={() => {
              if (validateAndNotify(url)) {
                window.open(url, '_blank');
              }
            }}
            disabled={!url}
          >
            Open
          </Button>
        </div>

        {/* Source info - Small: 12px (0.75rem) */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold">{bookmark.domain}</span>
          <span>•</span>
          <span className="capitalize">{bookmark.contentType}</span>
          <span>•</span>
          <span>{bookmark.createdAt.toLocaleDateString()}</span>
        </div>

        {/* Tags - Pink accents */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-[20px] font-display font-semibold">Tags</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence mode="popLayout">
              {tags.map((tag) => (
                <motion.div
                  key={tag}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Badge className="text-sm px-3 py-1 font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-md group">
                    <span>{tag}</span>
                    <X
                      className="h-3 w-3 ml-2 opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer !pointer-events-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag(tag);
                      }}
                    />
                  </Badge>
                </motion.div>
              ))}
            </AnimatePresence>

            {isAddingTag ? (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex gap-2"
              >
                <Input
                  ref={tagInputRef}
                  value={newTagValue}
                  onChange={(e) => setNewTagValue(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleAddTag}
                  placeholder="Enter tag name"
                  className="h-7 text-sm px-3 w-32 focus-visible:ring-2 focus-visible:ring-primary"
                />
              </motion.div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddingTag(true)}
                className="h-7 text-sm px-3 border-2 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 font-semibold rounded-md"
              >
                + Add tag
              </Button>
            )}
          </div>
        </div>

        {/* Summary - Section heading: 20px, Body: 17px */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[20px] font-display font-semibold">Summary</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-sm gap-2 hover:bg-primary hover:text-primary-foreground transition-all duration-200 group"
              onClick={handleEnrich}
              disabled={isEnriching || !url}
            >
              {isEnriching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enriching...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-primary group-hover:text-primary-foreground transition-all duration-200" />
                  Enrich with AI
                </>
              )}
            </Button>
          </div>
          <MarkdownEditor
            key={bookmark.id}
            content={summary}
            onChange={(newSummary) => setSummary(newSummary)}
            placeholder="Click to add a summary or notes about this bookmark..."
          />
        </div>
      </div>
    </motion.div>
  );
}
