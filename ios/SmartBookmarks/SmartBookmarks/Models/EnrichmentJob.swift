import Foundation

/// Response when queuing an enrichment job
struct EnrichmentJobResponse: Sendable {
    let jobId: String
    let status: String  // "queued" | "active" | "completed" | "failed"
    let message: String
}

/// Status response when polling an enrichment job
struct EnrichmentJobStatus: Sendable {
    let jobId: String
    let status: String  // "queued" | "active" | "completed" | "failed"
    let progress: JobProgress?
    let result: EnrichmentResult?
    let error: String?
    let queuedAt: Date?
    let startedAt: Date?
    let completedAt: Date?
}

/// Progress tracking for enrichment job
/// Matches backend structure: { step, message, timestamp, percentage }
struct JobProgress: Equatable, Sendable {
    let step: String  // "extraction" | "analysis" | "tagging" | "embedding"
    let message: String
    let timestamp: String
    let percentage: Int

    /// Get current step description for UI
    var currentStep: String {
        return message
    }

    /// Calculate overall progress (0.0 to 1.0)
    var percentageDecimal: Double {
        return Double(percentage) / 100.0
    }
}

// MARK: - Codable Conformance (nonisolated)

extension EnrichmentJobResponse: Codable {
}

extension EnrichmentJobStatus: Codable {
}

extension JobProgress: Codable {
}

/// Enrichment status for UI state management
enum EnrichmentStatus: Equatable {
    case idle
    case queuing
    case processing(jobId: String, progress: JobProgress?)
    case completed
    case failed(String)

    var isLoading: Bool {
        switch self {
        case .queuing, .processing:
            return true
        default:
            return false
        }
    }

    var displayText: String {
        switch self {
        case .idle:
            return "Enrich"
        case .queuing:
            return "Queuing..."
        case .processing(_, let progress):
            return progress?.currentStep ?? "Processing..."
        case .completed:
            return "Enriched"
        case .failed:
            return "Failed"
        }
    }
}
