import Foundation
import Combine

/// ViewModel for bookmark detail view
/// Handles enrichment with job polling, auto-save with debounce, and field editing
@MainActor
class BookmarkDetailViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var bookmark: Bookmark
    @Published var isSaving = false
    @Published var enrichmentStatus: EnrichmentStatus = .idle
    @Published var enrichmentProgress: JobProgress?
    @Published var saveStatus: SaveStatus = .idle
    @Published var error: String?

    // MARK: - Save Status

    enum SaveStatus: Equatable {
        case idle
        case saving
        case saved
        case error(String)
    }

    // MARK: - Private Properties

    private let api: any BookmarkAPIProtocol
    private var saveTask: Task<Void, Never>?
    private var pollingTask: Task<Void, Never>?
    private let debounceInterval: TimeInterval

    // MARK: - Callbacks

    var onBookmarkUpdated: ((Bookmark) -> Void)?

    // MARK: - Initialization

    init(bookmark: Bookmark, useMockAPI: Bool = true) {
        self.bookmark = bookmark
        self.api = useMockAPI ? MockAPIClient.shared : APIClient.shared
        self.debounceInterval = Config.autoSaveDebounce
    }

    // MARK: - Auto-Save

    /// Schedule auto-save after debounce period
    func scheduleAutoSave() {
        // Cancel any existing save task
        saveTask?.cancel()

        // Schedule new save task
        saveTask = Task {
            do {
                try await Task.sleep(for: .seconds(debounceInterval))
                guard !Task.isCancelled else { return }
                await save()
            } catch {
                // Task was cancelled, ignore
            }
        }
    }

    /// Save bookmark immediately
    func save() async {
        print("[BookmarkDetailViewModel] save() called")
        print("  - Bookmark ID: \(bookmark.id)")
        print("  - Title: \(bookmark.title)")
        print("  - Has embedding: \(bookmark.embedding != nil)")
        print("  - ProcessedAt: \(String(describing: bookmark.processedAt))")

        saveStatus = .saving
        isSaving = true

        do {
            print("[BookmarkDetailViewModel] Calling api.updateBookmark()...")
            bookmark = try await api.updateBookmark(bookmark)
            print("[BookmarkDetailViewModel] Bookmark saved successfully!")
            print("  - Response bookmark has embedding: \(bookmark.embedding != nil)")
            print("  - Response bookmark processedAt: \(String(describing: bookmark.processedAt))")

            saveStatus = .saved

            // Notify parent
            onBookmarkUpdated?(bookmark)
            print("[BookmarkDetailViewModel] Parent notified of bookmark update")

            // Note: No haptic feedback for auto-save (feels disconnected)
            // Haptics are only for immediate user actions

            // Reset to idle after showing "Saved"
            try? await Task.sleep(for: .seconds(2))
            if case .saved = saveStatus {
                saveStatus = .idle
                print("[BookmarkDetailViewModel] Save status reset to idle")
            }
        } catch {
            print("[BookmarkDetailViewModel] ERROR: Failed to save bookmark: \(error)")
            saveStatus = .error(error.localizedDescription)
            self.error = error.localizedDescription

            // Show error haptic only for user-initiated saves (not auto-save)
            // For now, skip haptics entirely on save errors to avoid confusion
        }

        isSaving = false
        print("[BookmarkDetailViewModel] save() completed")
    }

    // MARK: - Enrichment

    /// Start enrichment job with polling
    func enrich() async {
        // Cancel any existing polling
        pollingTask?.cancel()

        enrichmentStatus = .queuing
        error = nil

        do {
            // Step 1: Queue the enrichment job
            let jobResponse = try await api.enrichBookmark(
                url: bookmark.url,
                existingTags: bookmark.tags
            )

            enrichmentStatus = .processing(jobId: jobResponse.jobId, progress: nil)

            // Step 2: Poll for completion
            pollingTask = Task {
                await pollEnrichmentJob(jobId: jobResponse.jobId)
            }

        } catch {
            enrichmentStatus = .failed(error.localizedDescription)
            self.error = error.localizedDescription
            print("Failed to queue enrichment: \(error)")
        }
    }

    /// Poll enrichment job status until completion
    private func pollEnrichmentJob(jobId: String) async {
        let startTime = Date()
        var pollCount = 0

        print("[BookmarkDetailViewModel] Starting polling for job: \(jobId)")

        while !Task.isCancelled {
            do {
                pollCount += 1
                let elapsed = Date().timeIntervalSince(startTime)
                print("[BookmarkDetailViewModel] Poll #\(pollCount) - Elapsed: \(String(format: "%.1f", elapsed))s")

                // Check if we've exceeded max polling duration
                if elapsed > Config.maxPollingDuration {
                    print("[BookmarkDetailViewModel] ERROR: Polling timeout after \(Config.maxPollingDuration)s")
                    enrichmentStatus = .failed("Enrichment timed out")
                    return
                }

                // Get job status
                let status = try await getJobStatus(jobId: jobId)
                print("[BookmarkDetailViewModel] Job status: \(status.status)")

                // Update progress
                enrichmentProgress = status.progress
                if let progress = status.progress {
                    print("[BookmarkDetailViewModel] Progress: \(progress.step) - \(progress.message) (\(progress.percentage)%)")
                }

                switch status.status {
                case "completed":
                    print("[BookmarkDetailViewModel] ✓ Job completed!")
                    guard let result = status.result else {
                        print("[BookmarkDetailViewModel] ERROR: No result in completed job")
                        enrichmentStatus = .failed("No result returned")
                        HapticManager.shared.error()
                        return
                    }

                    print("[BookmarkDetailViewModel] Enrichment result received:")
                    print("  - Has result: true")
                    print("  - Title: \(result.title)")
                    print("  - Has summary: \(!result.analysis.summary.isEmpty)")
                    print("  - Tags count: \(result.tagging.tags.count)")
                    print("  - Has embedding: \(result.embedding != nil)")

                    // Apply enrichment results
                    print("[BookmarkDetailViewModel] Applying enrichment results to bookmark...")
                    applyEnrichmentResults(result)
                    enrichmentStatus = .completed

                    // Haptic feedback for successful enrichment
                    HapticManager.shared.success()

                    // Auto-save after enrichment
                    print("[BookmarkDetailViewModel] Saving enriched bookmark to backend...")
                    await save()
                    print("[BookmarkDetailViewModel] Enrichment flow completed!")
                    return

                case "failed":
                    print("[BookmarkDetailViewModel] ERROR: Job failed - \(status.error ?? "Unknown error")")
                    enrichmentStatus = .failed(status.error ?? "Enrichment failed")
                    HapticManager.shared.error()
                    return

                case "queued", "active":
                    print("[BookmarkDetailViewModel] Job still processing...")
                    enrichmentStatus = .processing(jobId: jobId, progress: status.progress)

                    // Continue polling
                    print("[BookmarkDetailViewModel] Sleeping for \(Config.pollingInterval)s before next poll...")
                    try await Task.sleep(for: .seconds(Config.pollingInterval))

                default:
                    print("[BookmarkDetailViewModel] ERROR: Unknown job status: \(status.status)")
                    enrichmentStatus = .failed("Unknown status: \(status.status)")
                    return
                }

            } catch {
                guard !Task.isCancelled else {
                    print("[BookmarkDetailViewModel] Polling cancelled")
                    return
                }
                print("[BookmarkDetailViewModel] ERROR: Failed to poll enrichment job: \(error)")
                enrichmentStatus = .failed(error.localizedDescription)
                self.error = error.localizedDescription
                return
            }
        }
    }

    /// Get enrichment job status from API
    private func getJobStatus(jobId: String) async throws -> EnrichmentJobStatus {
        return try await api.pollEnrichmentJob(jobId: jobId)
    }

    /// Apply enrichment results to bookmark
    private func applyEnrichmentResults(_ result: EnrichmentResult) {
        print("[BookmarkDetailViewModel] Applying enrichment results:")
        print("  - Title: \(result.title)")
        print("  - Domain: \(result.domain)")
        print("  - Summary: \(result.analysis.summary.prefix(100))...")
        print("  - Tags: \(result.tagging.tags)")
        print("  - ContentType: \(result.contentType)")
        print("  - Has embedding: \(result.embedding != nil)")
        print("  - Embedding count: \(result.embedding?.count ?? 0)")
        print("  - EmbeddedAt: \(String(describing: result.embeddedAt))")

        bookmark.title = result.title
        bookmark.domain = result.domain  // Update domain with actual source
        bookmark.summary = result.analysis.summary
        bookmark.tags = result.tagging.tags
        bookmark.contentType = result.contentType
        bookmark.embedding = result.embedding
        bookmark.embeddedAt = result.embeddedAt
        bookmark.processedAt = Date()
        bookmark.updatedAt = Date()

        print("[BookmarkDetailViewModel] Bookmark updated locally:")
        print("  - Title: \(bookmark.title)")
        print("  - Domain: \(bookmark.domain)")
        print("  - Summary: \(bookmark.summary?.prefix(100) ?? "nil")...")
        print("  - Tags: \(bookmark.tags)")
        print("  - Has embedding: \(bookmark.embedding != nil)")
        print("  - ProcessedAt: \(String(describing: bookmark.processedAt))")
    }

    // MARK: - Field Updates

    /// Update bookmark URL
    func updateURL(_ url: String) {
        bookmark.url = url
        scheduleAutoSave()
    }

    /// Update bookmark title
    func updateTitle(_ title: String) {
        bookmark.title = title
        scheduleAutoSave()
    }

    /// Update bookmark summary
    func updateSummary(_ summary: String) {
        bookmark.summary = summary.isEmpty ? nil : summary
        scheduleAutoSave()
    }

    /// Add tag
    func addTag(_ tag: String) {
        let trimmed = tag.trimmed
        guard !trimmed.isEmpty, !bookmark.tags.contains(trimmed) else { return }

        bookmark.tags.append(trimmed)
        scheduleAutoSave()
    }

    /// Remove tag
    func removeTag(_ tag: String) {
        bookmark.tags.removeAll { $0 == tag }
        scheduleAutoSave()
    }

    // MARK: - Cleanup

    deinit {
        saveTask?.cancel()
        pollingTask?.cancel()
    }
}
