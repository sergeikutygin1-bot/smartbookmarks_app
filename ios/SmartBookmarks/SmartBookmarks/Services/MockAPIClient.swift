import Foundation

/// Mock API client for development without backend
/// Simulates realistic delays and enrichment job flow
actor MockAPIClient {
    static let shared = MockAPIClient()

    private var bookmarks: [Bookmark] = []
    private var activeJobs: [String: (status: String, progress: JobProgress?, result: EnrichmentResult?)] = [:]

    private init() {
        // Initialize with sample bookmarks
        bookmarks = Self.sampleBookmarks
    }

    // MARK: - Bookmarks CRUD

    func fetchBookmarks(
        query: String? = nil,
        type: ContentType? = nil,
        source: String? = nil,
        dateFrom: Date? = nil,
        dateTo: Date? = nil
    ) async throws -> [Bookmark] {
        // Simulate network delay
        try await Task.sleep(for: .milliseconds(500))

        var results = bookmarks

        // Filter by query (title or domain)
        if let query = query, !query.isEmpty {
            results = results.filter { bookmark in
                bookmark.title.localizedCaseInsensitiveContains(query) ||
                bookmark.domain.localizedCaseInsensitiveContains(query) ||
                bookmark.tags.contains(where: { $0.localizedCaseInsensitiveContains(query) })
            }
        }

        // Filter by type
        if let type = type {
            results = results.filter { $0.contentType == type }
        }

        return results.sorted { $0.createdAt > $1.createdAt }
    }

    func createBookmark(url: String, title: String? = nil) async throws -> Bookmark {
        // Simulate network delay
        try await Task.sleep(for: .milliseconds(300))

        guard let urlObj = URL(string: url) else {
            throw NetworkError.invalidURL
        }

        let bookmark = Bookmark(
            id: UUID().uuidString,
            url: url,
            title: title ?? urlObj.host ?? "Untitled",
            domain: urlObj.host ?? "unknown",
            summary: nil,
            contentType: .other,
            tags: [],
            createdAt: Date(),
            updatedAt: Date(),
            processedAt: nil,
            embedding: nil,
            embeddedAt: nil
        )

        bookmarks.append(bookmark)
        return bookmark
    }

    func updateBookmark(_ bookmark: Bookmark) async throws -> Bookmark {
        // Simulate network delay
        try await Task.sleep(for: .milliseconds(200))

        guard let index = bookmarks.firstIndex(where: { $0.id == bookmark.id }) else {
            throw NetworkError.httpError(statusCode: 404, message: "Bookmark not found")
        }

        var updated = bookmark
        updated.updatedAt = Date()
        bookmarks[index] = updated

        return updated
    }

    func deleteBookmark(id: String) async throws {
        // Simulate network delay
        try await Task.sleep(for: .milliseconds(200))

        bookmarks.removeAll { $0.id == id }
    }

    // MARK: - Enrichment (Job-Based)

    func enrichBookmark(url: String, existingTags: [String] = []) async throws -> EnrichmentJobResponse {
        // Simulate queuing delay
        try await Task.sleep(for: .milliseconds(100))

        let jobId = "mock-\(UUID().uuidString.prefix(8))"

        // Initialize job
        activeJobs[jobId] = (
            status: "queued",
            progress: JobProgress(
                extraction: "pending",
                analysis: "pending",
                tagging: "pending",
                embedding: "pending"
            ),
            result: nil
        )

        // Simulate background processing
        Task {
            await simulateEnrichmentJob(jobId: jobId, url: url, existingTags: existingTags)
        }

        return EnrichmentJobResponse(
            jobId: jobId,
            status: "queued",
            message: "Enrichment job queued"
        )
    }

    func pollEnrichmentJob(jobId: String) async throws -> EnrichmentJobStatus {
        guard let job = activeJobs[jobId] else {
            throw NetworkError.httpError(statusCode: 404, message: "Job not found")
        }

        return EnrichmentJobStatus(
            jobId: jobId,
            status: job.status,
            progress: job.progress,
            result: job.result,
            error: nil,
            queuedAt: Date(),
            startedAt: job.status == "active" ? Date() : nil,
            completedAt: job.status == "completed" ? Date() : nil
        )
    }

    // MARK: - Private Helpers

    private func simulateEnrichmentJob(jobId: String, url: String, existingTags: [String]) async {
        do {
            // Step 1: Extraction (0.4 seconds - faster for dev)
            activeJobs[jobId] = (
                status: "active",
                progress: JobProgress(extraction: "in_progress", analysis: "pending", tagging: "pending", embedding: "pending"),
                result: nil
            )
            try await Task.sleep(for: .milliseconds(400))

            // Step 2: Analysis (0.5 seconds - faster for dev)
            activeJobs[jobId] = (
                status: "active",
                progress: JobProgress(extraction: "completed", analysis: "in_progress", tagging: "pending", embedding: "pending"),
                result: nil
            )
            try await Task.sleep(for: .milliseconds(500))

            // Step 3: Tagging (0.3 seconds - faster for dev)
            activeJobs[jobId] = (
                status: "active",
                progress: JobProgress(extraction: "completed", analysis: "completed", tagging: "in_progress", embedding: "pending"),
                result: nil
            )
            try await Task.sleep(for: .milliseconds(300))

            // Step 4: Embedding (0.3 seconds - faster for dev)
            activeJobs[jobId] = (
                status: "active",
                progress: JobProgress(extraction: "completed", analysis: "completed", tagging: "completed", embedding: "in_progress"),
                result: nil
            )
            try await Task.sleep(for: .milliseconds(300))

            // Step 5: Complete
            let result = EnrichmentResult(
                url: url,
                title: "Mock: \(URL(string: url)?.host ?? "Article")",
                domain: URL(string: url)?.host ?? "example.com",
                contentType: .article,
                extractedContent: ExtractedContent(
                    rawText: "This is mock extracted content...",
                    cleanText: "This is mock extracted content...",
                    images: nil,
                    metadata: nil
                ),
                analysis: Analysis(
                    summary: "This is a mock AI-generated summary of the article. The content discusses various topics related to technology and innovation.",
                    keyPoints: [
                        "First key point from the article",
                        "Second important insight",
                        "Third notable observation"
                    ]
                ),
                tagging: Tagging(
                    tags: existingTags + ["technology", "innovation", "mock-tag"]
                ),
                embedding: Array(repeating: 0.1, count: 1536),
                embeddedAt: Date(),
                enrichedAt: Date(),
                modelUsed: "mock-gpt-4",
                processingTimeMs: 1500
            )

            activeJobs[jobId] = (
                status: "completed",
                progress: JobProgress(extraction: "completed", analysis: "completed", tagging: "completed", embedding: "completed"),
                result: result
            )

        } catch {
            activeJobs[jobId] = (
                status: "failed",
                progress: nil,
                result: nil
            )
        }
    }

    // MARK: - Sample Data

    private static var sampleBookmarks: [Bookmark] {
        [
            Bookmark(
                id: UUID().uuidString,
                url: "https://www.paulgraham.com/wealth.html",
                title: "How to Make Wealth",
                domain: "paulgraham.com",
                summary: "An essay about creating wealth through startups and the importance of solving hard problems.",
                contentType: .article,
                tags: ["entrepreneurship", "startups", "essay"],
                createdAt: Date().addingTimeInterval(-86400 * 5),
                updatedAt: Date().addingTimeInterval(-86400 * 5),
                processedAt: Date().addingTimeInterval(-86400 * 4),
                embedding: Array(repeating: 0.1, count: 1536),
                embeddedAt: Date().addingTimeInterval(-86400 * 4)
            ),
            Bookmark(
                id: UUID().uuidString,
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                title: "Rick Astley - Never Gonna Give You Up (Official Video)",
                domain: "youtube.com",
                summary: "The official video for Rick Astley's 1987 hit 'Never Gonna Give You Up'.",
                contentType: .video,
                tags: ["music", "80s", "classic"],
                createdAt: Date().addingTimeInterval(-86400 * 3),
                updatedAt: Date().addingTimeInterval(-86400 * 3),
                processedAt: Date().addingTimeInterval(-86400 * 2),
                embedding: Array(repeating: 0.2, count: 1536),
                embeddedAt: Date().addingTimeInterval(-86400 * 2)
            ),
            Bookmark(
                id: UUID().uuidString,
                url: "https://twitter.com/elonmusk/status/123456789",
                title: "Elon Musk on Twitter",
                domain: "twitter.com",
                summary: "A tweet about space exploration and innovation.",
                contentType: .tweet,
                tags: ["twitter", "space", "innovation"],
                createdAt: Date().addingTimeInterval(-86400),
                updatedAt: Date().addingTimeInterval(-86400),
                processedAt: Date().addingTimeInterval(-43200),
                embedding: Array(repeating: 0.3, count: 1536),
                embeddedAt: Date().addingTimeInterval(-43200)
            ),
            Bookmark(
                id: UUID().uuidString,
                url: "https://example.com/not-yet-enriched",
                title: "Unenriched Bookmark Example",
                domain: "example.com",
                summary: nil,
                contentType: .other,
                tags: [],
                createdAt: Date().addingTimeInterval(-3600),
                updatedAt: Date().addingTimeInterval(-3600),
                processedAt: nil,
                embedding: nil,
                embeddedAt: nil
            )
        ]
    }
}
