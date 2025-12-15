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
        saveStatus = .saving
        isSaving = true

        do {
            bookmark = try await api.updateBookmark(bookmark)
            saveStatus = .saved

            // Notify parent
            onBookmarkUpdated?(bookmark)

            // Reset to idle after showing "Saved"
            try? await Task.sleep(for: .seconds(2))
            if case .saved = saveStatus {
                saveStatus = .idle
            }
        } catch {
            saveStatus = .error(error.localizedDescription)
            self.error = error.localizedDescription
            print("Failed to save bookmark: \(error)")
        }

        isSaving = false
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

        while !Task.isCancelled {
            do {
                // Check if we've exceeded max polling duration
                if Date().timeIntervalSince(startTime) > Config.maxPollingDuration {
                    enrichmentStatus = .failed("Enrichment timed out")
                    return
                }

                // Get job status
                let status = try await getJobStatus(jobId: jobId)

                // Update progress
                enrichmentProgress = status.progress

                switch status.status {
                case "completed":
                    guard let result = status.result else {
                        enrichmentStatus = .failed("No result returned")
                        return
                    }

                    // Apply enrichment results
                    await applyEnrichmentResults(result)
                    enrichmentStatus = .completed

                    // Auto-save after enrichment
                    await save()
                    return

                case "failed":
                    enrichmentStatus = .failed(status.error ?? "Enrichment failed")
                    return

                case "queued", "active":
                    enrichmentStatus = .processing(jobId: jobId, progress: status.progress)

                    // Continue polling
                    try await Task.sleep(for: .seconds(Config.pollingInterval))

                default:
                    enrichmentStatus = .failed("Unknown status: \(status.status)")
                    return
                }

            } catch {
                guard !Task.isCancelled else { return }
                enrichmentStatus = .failed(error.localizedDescription)
                self.error = error.localizedDescription
                print("Failed to poll enrichment job: \(error)")
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
        bookmark.title = result.title
        bookmark.summary = result.analysis.summary
        bookmark.tags = result.tagging.tags
        bookmark.contentType = result.contentType
        bookmark.embedding = result.embedding
        bookmark.embeddedAt = result.embeddedAt
        bookmark.processedAt = Date()
        bookmark.updatedAt = Date()
    }

    // MARK: - Field Updates

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
