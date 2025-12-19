import Foundation

/// Real API client for backend communication
/// Handles job-based enrichment with polling
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    nonisolated private let decoder: JSONDecoder
    nonisolated private let encoder: JSONEncoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = Config.requestTimeout
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        // Configure JSON decoder with ISO8601 dates (with fractional seconds)
        let jsonDecoder = JSONDecoder()
        jsonDecoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try ISO8601 with fractional seconds first (e.g., "2025-12-16T11:19:43.295Z")
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) {
                return date
            }

            // Fallback to ISO8601 without fractional seconds (e.g., "2025-12-16T11:19:43Z")
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) {
                return date
            }

            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date format: \(dateString)")
        }
        self.decoder = jsonDecoder

        // Configure JSON encoder with ISO8601 dates (with fractional seconds)
        let jsonEncoder = JSONEncoder()
        jsonEncoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            try container.encode(formatter.string(from: date))
        }
        self.encoder = jsonEncoder
    }

    // MARK: - Bookmarks CRUD

    func fetchBookmarks(
        query: String? = nil,
        type: ContentType? = nil,
        source: String? = nil,
        dateFrom: Date? = nil,
        dateTo: Date? = nil
    ) async throws -> [Bookmark] {
        var components = URLComponents(string: "\(Config.apiBaseURL)/bookmarks")!
        var queryItems: [URLQueryItem] = []

        if let query = query, !query.isEmpty {
            queryItems.append(URLQueryItem(name: "q", value: query))
        }
        if let type = type {
            queryItems.append(URLQueryItem(name: "type", value: type.rawValue))
        }
        if let source = source {
            queryItems.append(URLQueryItem(name: "source", value: source))
        }
        if let dateFrom = dateFrom {
            queryItems.append(URLQueryItem(name: "dateFrom", value: ISO8601DateFormatter().string(from: dateFrom)))
        }
        if let dateTo = dateTo {
            queryItems.append(URLQueryItem(name: "dateTo", value: ISO8601DateFormatter().string(from: dateTo)))
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            print("[APIClient] ERROR: Invalid URL for bookmarks endpoint")
            throw NetworkError.invalidURL
        }

        print("[APIClient] Fetching bookmarks from: \(url.absoluteString)")

        do {
            let (data, response) = try await session.data(from: url)
            try validateResponse(response)

            // Log raw response for debugging
            if let responseString = String(data: data, encoding: .utf8) {
                print("[APIClient] Response size: \(data.count) bytes")
                print("[APIClient] Response preview: \(responseString.prefix(200))...")
            }

            do {
                let bookmarkResponse = try decoder.decode(BookmarkListResponse.self, from: data)
                print("[APIClient] Successfully decoded \(bookmarkResponse.data.count) bookmarks")
                return bookmarkResponse.data
            } catch let decodingError as DecodingError {
                print("[APIClient] Decoding error: \(decodingError)")
                // Log the response data for debugging decoding issues
                if let responseString = String(data: data, encoding: .utf8) {
                    print("[APIClient] Failed response: \(responseString.prefix(500))")
                }
                throw NetworkError.decodingError(decodingError)
            }
        } catch {
            print("[APIClient] Fetch error: \(error)")
            throw error
        }
    }

    func createBookmark(url: String, title: String? = nil) async throws -> Bookmark {
        guard let apiURL = URL(string: "\(Config.apiBaseURL)/bookmarks") else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Always include url field (backend requires it even if empty)
        var body: [String: Any] = ["url": url]
        if let title = title, !title.isEmpty {
            body["title"] = title
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let bookmarkResponse = try decoder.decode(BookmarkResponse.self, from: data)
        return bookmarkResponse.data
    }

    func updateBookmark(_ bookmark: Bookmark) async throws -> Bookmark {
        guard let apiURL = URL(string: "\(Config.apiBaseURL)/bookmarks/\(bookmark.id)") else {
            throw NetworkError.invalidURL
        }

        print("[APIClient] Updating bookmark \(bookmark.id)")
        print("  - URL: \(bookmark.url)")
        print("  - Domain: \(bookmark.domain)")
        print("  - Title: \(bookmark.title)")
        print("  - Tags: \(bookmark.tags)")
        print("  - Summary: \(bookmark.summary?.prefix(50) ?? "nil")")
        print("  - ContentType: \(bookmark.contentType)")
        print("  - Has embedding: \(bookmark.embedding != nil)")
        print("  - ProcessedAt: \(String(describing: bookmark.processedAt))")

        var request = URLRequest(url: apiURL)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // ISO8601 date formatter for optional dates
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // Send all updatable fields including enrichment data
        var body: [String: Any] = [
            "url": bookmark.url,
            "domain": bookmark.domain,  // CRITICAL: Send domain to backend
            "title": bookmark.title,
            "tags": bookmark.tags,
            "contentType": bookmark.contentType.rawValue
        ]

        // Include summary if present
        if let summary = bookmark.summary, !summary.isEmpty {
            body["summary"] = summary
        }

        // Include enrichment fields if present
        if let embedding = bookmark.embedding {
            body["embedding"] = embedding
            print("  - Sending embedding with \(embedding.count) dimensions")
        }

        if let embeddedAt = bookmark.embeddedAt {
            body["embeddedAt"] = dateFormatter.string(from: embeddedAt)
            print("  - Sending embeddedAt: \(dateFormatter.string(from: embeddedAt))")
        }

        if let processedAt = bookmark.processedAt {
            body["processedAt"] = dateFormatter.string(from: processedAt)
            print("  - Sending processedAt: \(dateFormatter.string(from: processedAt))")
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        print("[APIClient] Sending PATCH request with body fields: \(body.keys.joined(separator: ", "))")

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        if let responseString = String(data: data, encoding: .utf8) {
            print("[APIClient] Update response: \(responseString.prefix(300))")
        }

        let bookmarkResponse = try decoder.decode(BookmarkResponse.self, from: data)
        print("[APIClient] Successfully updated bookmark")
        print("  - Response has embedding: \(bookmarkResponse.data.embedding != nil)")
        print("  - Response processedAt: \(String(describing: bookmarkResponse.data.processedAt))")

        return bookmarkResponse.data
    }

    func deleteBookmark(id: String) async throws {
        guard let apiURL = URL(string: "\(Config.apiBaseURL)/bookmarks/\(id)") else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "DELETE"

        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }

    // MARK: - Enrichment (Job-Based)

    /// Queue an enrichment job and return job ID
    func enrichBookmark(url: String, existingTags: [String] = []) async throws -> EnrichmentJobResponse {
        guard let apiURL = URL(string: "\(Config.enrichmentBaseURL)/enrich") else {
            print("[APIClient] ERROR: Invalid enrichment URL")
            throw NetworkError.invalidURL
        }

        print("[APIClient] Queueing enrichment for URL: \(url)")

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = Config.enrichmentTimeout

        let body: [String: Any] = [
            "url": url,
            "existingTags": existingTags
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await session.data(for: request)
            try validateResponse(response)

            if let responseString = String(data: data, encoding: .utf8) {
                print("[APIClient] Enrichment queued response: \(responseString)")
            }

            let jobResponse = try decoder.decode(EnrichmentJobResponse.self, from: data)
            print("[APIClient] Job queued successfully: \(jobResponse.jobId)")
            return jobResponse
        } catch {
            print("[APIClient] Enrichment queue error: \(error)")
            throw error
        }
    }

    /// Get current status of enrichment job
    func pollEnrichmentJob(jobId: String) async throws -> EnrichmentJobStatus {
        guard let apiURL = URL(string: "\(Config.enrichmentBaseURL)/enrich/\(jobId)") else {
            print("[APIClient] ERROR: Invalid poll URL for job: \(jobId)")
            throw NetworkError.invalidURL
        }

        do {
            let (data, response) = try await session.data(from: apiURL)
            try validateResponse(response)

            if let responseString = String(data: data, encoding: .utf8) {
                print("[APIClient] Poll response for \(jobId): \(responseString.prefix(300))")
            }

            let status = try decoder.decode(EnrichmentJobStatus.self, from: data)
            print("[APIClient] Job \(jobId) status: \(status.status), progress: \(status.progress?.step ?? "none")")
            return status
        } catch let decodingError as DecodingError {
            print("[APIClient] Polling decode error for \(jobId): \(decodingError)")
            throw NetworkError.decodingError(decodingError)
        } catch {
            print("[APIClient] Polling error for \(jobId): \(error)")
            throw error
        }
    }

    // MARK: - Search

    func search(
        query: String,
        bookmarks: [Bookmark],
        topK: Int = 10,
        semanticWeight: Double = 0.6
    ) async throws -> [SearchResult] {
        guard let apiURL = URL(string: "\(Config.enrichmentBaseURL)/search") else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Prepare searchable items
        let searchableItems = bookmarks.map { bookmark in
            [
                "id": bookmark.id,
                "title": bookmark.title,
                "summary": bookmark.summary ?? "",
                "tags": bookmark.tags,
                "embedding": bookmark.embedding ?? []
            ] as [String: Any]
        }

        let body: [String: Any] = [
            "query": query,
            "bookmarks": searchableItems,
            "topK": topK,
            "semanticWeight": semanticWeight
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let searchResponse = try decoder.decode(SearchResponse.self, from: data)
        return searchResponse.results
    }

    // MARK: - Private Helpers

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.unknown(NSError(domain: "Invalid response", code: -1))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.httpError(
                statusCode: httpResponse.statusCode,
                message: HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
            )
        }
    }
}

// MARK: - Protocol for Mock/Real API Switching

protocol BookmarkAPIProtocol {
    func fetchBookmarks(
        query: String?,
        type: ContentType?,
        source: String?,
        dateFrom: Date?,
        dateTo: Date?
    ) async throws -> [Bookmark]
    func createBookmark(url: String, title: String?) async throws -> Bookmark
    func updateBookmark(_ bookmark: Bookmark) async throws -> Bookmark
    func deleteBookmark(id: String) async throws
    func enrichBookmark(url: String, existingTags: [String]) async throws -> EnrichmentJobResponse
    func pollEnrichmentJob(jobId: String) async throws -> EnrichmentJobStatus
}

// Add protocol conformance
extension APIClient: BookmarkAPIProtocol {}
extension MockAPIClient: BookmarkAPIProtocol {}
