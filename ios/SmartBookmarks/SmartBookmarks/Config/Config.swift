import Foundation

enum Config: Sendable {
    /// API Base URL for bookmarks CRUD operations
    nonisolated(unsafe) static var apiBaseURL: String {
        #if DEBUG
        // Unified backend on port 3002 (both CRUD and enrichment)
        // Using Mac's local IP address for physical device testing
        // To find your IP: System Settings → Network → Wi-Fi → Details → TCP/IP
        return "http://192.168.1.6:3002/api"
        #else
        // Production URL
        return "https://api.smartbookmarks.com/api"
        #endif
    }

    /// Enrichment Service URL for AI processing
    nonisolated(unsafe) static var enrichmentBaseURL: String {
        #if DEBUG
        return "http://192.168.1.6:3002"
        #else
        return "https://api.smartbookmarks.com"
        #endif
    }

    /// Standard request timeout
    static let requestTimeout: TimeInterval = 30

    /// Longer timeout for AI enrichment processing
    static let enrichmentTimeout: TimeInterval = 90

    /// Polling interval for enrichment job status (in seconds)
    static let pollingInterval: TimeInterval = 2

    /// Maximum polling duration before timing out (in seconds)
    static let maxPollingDuration: TimeInterval = 120

    /// Auto-save debounce interval (in seconds)
    static let autoSaveDebounce: TimeInterval = 0.5
}
