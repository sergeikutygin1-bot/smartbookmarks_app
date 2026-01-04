"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bookmark } from "@/store/bookmarksStore";
import { useUpdateBookmark, useEnrichBookmark } from "@/hooks/useBookmarks";
import { useEnrichmentStore } from "@/store/enrichmentStore";
import { useAutoSave } from "@/hooks/use-auto-save";
import { bookmarkFormSchema, BookmarkFormData } from "@/lib/validators/bookmark";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Sparkles, Lightbulb, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useBookmarkMetadata } from "@/hooks/useBookmarkMetadata";
import { ConceptBadge } from "./ConceptBadge";
import { EntityBadge } from "./EntityBadge";
import { useFilterStore } from "@/store/filterStore";

interface BookmarkNoteProps {
  bookmark: Bookmark;
}

export function BookmarkNote({ bookmark }: BookmarkNoteProps) {
  const updateMutation = useUpdateBookmark();
  const enrichMutation = useEnrichBookmark();

  // Get enrichment status from global store
  const enrichmentStatus = useEnrichmentStore(state => state.getEnrichmentStatus(bookmark.id));
  const isEnriching = useEnrichmentStore(state => state.isEnriching(bookmark.id));

  // Fetch concepts and entities for this bookmark
  const { data: metadata } = useBookmarkMetadata(bookmark.id);

  const { selectedConcepts, selectedEntities, setConcepts, setEntities } = useFilterStore();

  // Initialize form with React Hook Form + Zod validation
  const {
    register,
    watch,
    setValue,
    formState: { errors, isDirty },
    reset,
  } = useForm({
    resolver: zodResolver(bookmarkFormSchema),
    defaultValues: {
      title: bookmark.title,
      url: bookmark.url,
      summary: bookmark.summary || '',
    },
  });

  // Watch all form values for auto-save
  const formData = watch();

  // Auto-save with debounce using our custom hook
  const saveStatus = useAutoSave(
    formData,
    async (data) => {
      if (!bookmark.id || !isDirty) return;

      await updateMutation.mutateAsync({
        id: bookmark.id,
        data,
      });
    },
    {
      delay: 500,
      enabled: isDirty && !!bookmark.id && !isEnriching,
    }
  );

  // Sync form when bookmark changes or enrichment completes
  const prevIdRef = useRef<string | undefined>(undefined);
  const prevEnrichmentStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const idChanged = prevIdRef.current !== bookmark.id;
    const enrichmentCompleted =
      prevEnrichmentStatusRef.current === 'processing' &&
      enrichmentStatus === 'success';

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

      // Reset form with new bookmark data
      reset({
        title: bookmark.title,
        url: bookmark.url,
        summary: bookmark.summary || '',
      });
    }

    prevIdRef.current = bookmark.id;
    prevEnrichmentStatusRef.current = enrichmentStatus;
  }, [bookmark.id, bookmark.title, bookmark.url, bookmark.summary, enrichmentStatus, reset]);

  // Click handlers for filtering
  const handleConceptClick = (concept: { id: string; name: string }) => {
    setConcepts([concept.id]);
    toast.success(`Filtering by concept: ${concept.name}`);
  };

  const handleEntityClick = (entity: { id: string; name: string }) => {
    setEntities([entity.id]);
    toast.success(`Filtering by entity: ${entity.name}`);
  };

  // Handle enrich with AI
  const handleEnrich = async () => {
    if (!bookmark.id || isEnriching) return;

    // Validate URL before enriching (using Zod)
    const urlValidation = bookmarkFormSchema.shape.url.safeParse(formData.url);
    if (!urlValidation.success) {
      toast.error("Invalid URL", {
        description: "Please enter a valid URL before enriching.",
      });
      return;
    }

    console.log(`[BookmarkNote] Starting enrichment for: ${bookmark.id}`);

    try {
      const enrichedBookmark = await enrichMutation.mutateAsync(bookmark.id);

      console.log(`[BookmarkNote] Enrichment completed for: ${bookmark.id}`);

      // Only update form if this enrichment is for the CURRENTLY displayed bookmark
      if (enrichedBookmark.id === bookmark.id) {
        // Reset form with enriched data
        reset({
          title: enrichedBookmark.title,
          url: enrichedBookmark.url,
          summary: enrichedBookmark.summary || '',
        });

        toast.success("AI enrichment completed!", {
          description: "Summary, concepts, and entities have been updated.",
          classNames: {
            description: "!text-foreground/90 !font-medium",
          },
        });
      } else {
        console.log(`[BookmarkNote] Enrichment completed for ${enrichedBookmark.id}, but now viewing ${bookmark.id}. Skipping form update.`);

        toast.success("Enrichment completed in background", {
          description: "A bookmark was enriched while you were viewing another one.",
        });
      }
    } catch (error) {
      // Check if this was an abort (user cancelled)
      const isAborted = error instanceof Error && error.name === 'AbortError';

      if (isAborted) {
        console.log(`[BookmarkNote] Enrichment cancelled for: ${bookmark.id}`);
        return;
      }

      // Check if this is a URL validation error
      const isUrlError = error instanceof Error && error.name === 'URLValidationError';

      if (!isUrlError) {
        console.error(`[BookmarkNote] Enrichment failed for: ${bookmark.id}`, error);
      }

      const errorMessage = error instanceof Error
        ? error.message
        : "An unexpected error occurred while enriching the bookmark.";

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

      toast.error(errorTitle, {
        description: errorDescription,
        duration: 8000,
        classNames: {
          description: "!text-foreground/90 !font-medium",
        },
        action: isUrlAccessError ? undefined : {
          label: "Try Again",
          onClick: () => handleEnrich(),
        },
      });
    }
  };

  // Determine save indicator text
  const getSaveIndicator = () => {
    if (isEnriching) {
      return (
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
      );
    }

    if (saveStatus === 'saving') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-4 right-6 text-[10px] font-medium text-muted-foreground pointer-events-none"
        >
          Saving...
        </motion.div>
      );
    }

    if (saveStatus === 'saved') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-4 right-6 text-[10px] font-medium text-muted-foreground pointer-events-none"
        >
          Saved
        </motion.div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full p-10 overflow-y-auto relative"
    >
      {/* Auto-save and enriching indicators */}
      <AnimatePresence>
        {getSaveIndicator()}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Title - Golden Ratio: 56px (3.5rem) */}
        <div>
          <Input
            {...register('title')}
            placeholder="Untitled bookmark"
            className="title-display !text-[56px] !leading-[1.1] font-bold border-0 px-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 h-auto py-3 transition-all duration-200 hover:bg-muted/20 rounded-md"
          />
          {errors.title && (
            <p className="text-sm text-destructive mt-2">{errors.title.message}</p>
          )}
        </div>

        {/* URL with Open button */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <ExternalLink className={`h-4 w-4 flex-shrink-0 ${errors.url ? 'text-destructive' : 'text-primary'}`} />
            <Input
              {...register('url')}
              placeholder="https://example.com"
              className={`text-xs border-0 px-2 focus-visible:ring-2 focus-visible:ring-offset-0 h-auto py-1 font-medium transition-all duration-200 hover:bg-muted/20 rounded-md -ml-2 ${
                errors.url
                  ? 'text-destructive focus-visible:ring-destructive'
                  : 'text-primary focus-visible:ring-primary'
              }`}
            />
            <Button
              size="sm"
              variant="default"
              className="flex-shrink-0 h-8 text-xs font-semibold transition-all duration-200"
              onClick={() => {
                if (formData.url) {
                  window.open(formData.url, '_blank');
                }
              }}
              disabled={!formData.url || !!errors.url}
            >
              Open
            </Button>
          </div>
          {errors.url && (
            <p className="text-sm text-destructive">{errors.url.message}</p>
          )}
        </div>

        {/* Source info */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold">{bookmark.domain}</span>
          <span>•</span>
          <span className="capitalize">{bookmark.contentType}</span>
          <span>•</span>
          <span>{bookmark.createdAt.toLocaleDateString()}</span>
        </div>

        {/* Concepts & Entities - Read-only AI-generated */}
        <div className="space-y-6">
          {/* Concepts */}
          {metadata?.concepts && metadata.concepts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-purple-600" />
                <span className="text-[20px] font-display font-semibold">Concepts</span>
                <Badge variant="outline" className="text-[10px] px-2 py-0">
                  AI-generated
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {metadata.concepts.map((concept) => (
                  <ConceptBadge
                    key={concept.id}
                    concept={concept}
                    weight={concept.weight}
                    onClick={handleConceptClick}
                    size="default"
                    showWeight
                    isActive={selectedConcepts.includes(concept.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Entities */}
          {metadata?.entities && metadata.entities.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <span className="text-[20px] font-display font-semibold">Entities</span>
                <Badge variant="outline" className="text-[10px] px-2 py-0">
                  AI-generated
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {metadata.entities.map((entity) => (
                  <EntityBadge
                    key={entity.id}
                    entity={entity}
                    weight={entity.weight}
                    onClick={handleEntityClick}
                    size="default"
                    showWeight
                    isActive={selectedEntities.includes(entity.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!metadata?.concepts || metadata.concepts.length === 0) &&
           (!metadata?.entities || metadata.entities.length === 0) && (
            <div className="text-sm text-muted-foreground italic flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>No metadata yet. Click "Enrich with AI" to generate concepts and entities.</span>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[20px] font-display font-semibold">Summary</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-sm gap-2 hover:bg-primary hover:text-primary-foreground transition-all duration-200 group"
              onClick={handleEnrich}
              disabled={isEnriching || !formData.url}
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
            content={formData.summary || ''}
            onChange={(newSummary) => setValue('summary', newSummary, { shouldDirty: true })}
            placeholder="Click to add a summary or notes about this bookmark..."
          />
          {errors.summary && (
            <p className="text-sm text-destructive">{errors.summary.message}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Skeleton loading state for BookmarkNote
 * Matches the structure and dimensions of the actual note editor
 */
export function BookmarkNoteSkeleton() {
  return (
    <div className="h-full p-10 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Title Skeleton - Large, commanding */}
        <Skeleton className="h-[70px] w-3/4" />

        {/* URL + Open button */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 flex-shrink-0" /> {/* Icon */}
          <Skeleton className="h-6 flex-1" /> {/* URL */}
          <Skeleton className="h-8 w-16 flex-shrink-0" /> {/* Open button */}
        </div>

        {/* Source info (domain, type, date) */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-2" /> {/* Separator dot */}
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-2" /> {/* Separator dot */}
          <Skeleton className="h-4 w-28" />
        </div>

        {/* Tags Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" /> {/* Tag icon */}
            <Skeleton className="h-6 w-16" /> {/* "Tags" label */}
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
        </div>

        {/* Summary Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-24" /> {/* "Summary" label */}
            <Skeleton className="h-8 w-32" /> {/* "Enrich with AI" button */}
          </div>
          <Skeleton className="h-64 w-full rounded-md" /> {/* Summary textarea */}
        </div>
      </div>
    </div>
  );
}
