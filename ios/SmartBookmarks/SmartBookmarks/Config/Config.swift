import Foundation

enum Config {
    /// API Base URL for bookmarks CRUD operations
    nonisolated(unsafe) static var apiBaseURL: String {
        #if DEBUG
        // For device testing, use your Mac's local IP address
        // To find your IP: System Settings → Network → Wi-Fi → Details → TCP/IP
        // Replace "localhost" with your machine's IP when testing on physical device
        return "http://localhost:3000/api"
        #else
        // Production URL
        return "https://api.smartbookmarks.com/api"
        #endif
    }

    /// Enrichment Service URL for AI processing
    nonisolated(unsafe) static var enrichmentBaseURL: String {
        #if DEBUG
        return "http://localhost:3002"
        #else
        return "https://api.smartbookmarks.com"
        #endif
    }

    /// Standard request timeout
    nonisolated(unsafe) static let requestTimeout: TimeInterval = 30

    /// Longer timeout for AI enrichment processing
    nonisolated(unsafe) static let enrichmentTimeout: TimeInterval = 90

    /// Polling interval for enrichment job status (in seconds)
    nonisolated(unsafe) static let pollingInterval: TimeInterval = 2

    /// Maximum polling duration before timing out (in seconds)
    nonisolated(unsafe) static let maxPollingDuration: TimeInterval = 120

    /// Auto-save debounce interval (in seconds)
    nonisolated(unsafe) static let autoSaveDebounce: TimeInterval = 0.5
}
