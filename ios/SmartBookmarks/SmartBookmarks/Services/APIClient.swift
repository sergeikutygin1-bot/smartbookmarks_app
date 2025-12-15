import Foundation

/// Real API client for backend communication
/// Handles job-based enrichment with polling
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = Config.requestTimeout
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        // Configure JSON decoder with ISO8601 dates
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        // Configure JSON encoder with ISO8601 dates
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
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
            throw NetworkError.invalidURL
        }

        let (data, response) = try await session.data(from: url)
        try validateResponse(response)

        let bookmarkResponse = try decoder.decode(BookmarkListResponse.self, from: data)
        return bookmarkResponse.data
    }

    func createBookmark(url: String, title: String? = nil) async throws -> Bookmark {
        guard let apiURL = URL(string: "\(Config.apiBaseURL)/bookmarks") else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "url": url,
            "title": title ?? ""
        ].filter { !$0.value.isEmpty }

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

        var request = URLRequest(url: apiURL)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Only send fields that can be updated
        let body: [String: Any] = [
            "title": bookmark.title,
            "summary": bookmark.summary ?? "",
            "tags": bookmark.tags,
            "contentType": bookmark.contentType.rawValue
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        let bookmarkResponse = try decoder.decode(BookmarkResponse.self, from: data)
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
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = Config.enrichmentTimeout

        let body: [String: Any] = [
            "url": url,
            "existingTags": existingTags
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try validateResponse(response)

        return try decoder.decode(EnrichmentJobResponse.self, from: data)
    }

    /// Get current status of enrichment job
    func pollEnrichmentJob(jobId: String) async throws -> EnrichmentJobStatus {
        guard let apiURL = URL(string: "\(Config.enrichmentBaseURL)/enrich/\(jobId)") else {
            throw NetworkError.invalidURL
        }

        let (data, response) = try await session.data(from: apiURL)
        try validateResponse(response)

        return try decoder.decode(EnrichmentJobStatus.self, from: data)
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
