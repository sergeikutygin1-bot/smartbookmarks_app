import Foundation

/// Generic API response wrapper
struct APIResponse<T: Codable>: Codable {
    let data: T
}

/// List response with pagination metadata
struct BookmarkListResponse: Codable {
    let data: [Bookmark]
    let total: Int
    let cursor: String?
}

/// Single bookmark response
struct BookmarkResponse: Codable {
    let data: Bookmark
}

/// Search response with results and metadata
struct SearchResponse: Codable {
    let query: String
    let results: [SearchResult]
    let metadata: SearchMetadata
}

/// Individual search result
struct SearchResult: Codable, Identifiable {
    let id: String
    let score: Double
    let bookmark: Bookmark?
}

/// Search metadata
struct SearchMetadata: Codable {
    let totalItems: Int
    let resultsCount: Int
    let semanticWeight: Double
    let minScore: Double
}

/// API error response
struct APIError: Codable, Error, LocalizedError {
    let error: String
    let message: String?
    let details: [String: AnyCodable]?

    var errorDescription: String? {
        return message ?? error
    }
}

/// Network error types
enum NetworkError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError(Error)
    case httpError(statusCode: Int, message: String)
    case timeout
    case networkUnavailable
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .noData:
            return "No data received from server"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .httpError(let statusCode, let message):
            return "Server error (\(statusCode)): \(message)"
        case .timeout:
            return "Request timed out"
        case .networkUnavailable:
            return "No internet connection"
        case .unknown(let error):
            return "Unexpected error: \(error.localizedDescription)"
        }
    }
}
