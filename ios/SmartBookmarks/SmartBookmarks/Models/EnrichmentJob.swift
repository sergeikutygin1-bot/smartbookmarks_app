import Foundation

/// Response when queuing an enrichment job
struct EnrichmentJobResponse: Codable {
    let jobId: String
    let status: String  // "queued" | "active" | "completed" | "failed"
    let message: String
}

/// Status response when polling an enrichment job
struct EnrichmentJobStatus: Codable {
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
struct JobProgress: Codable, Equatable {
    let extraction: String  // "pending" | "in_progress" | "completed"
    let analysis: String
    let tagging: String
    let embedding: String

    /// Get current step description for UI
    var currentStep: String {
        if extraction != "completed" {
            return "Extracting content"
        } else if analysis != "completed" {
            return "Analyzing content"
        } else if tagging != "completed" {
            return "Generating tags"
        } else if embedding != "completed" {
            return "Creating embeddings"
        }
        return "Processing"
    }

    /// Calculate overall progress (0.0 to 1.0)
    var percentage: Double {
        var completed = 0
        let total = 4

        if extraction == "completed" { completed += 1 }
        if analysis == "completed" { completed += 1 }
        if tagging == "completed" { completed += 1 }
        if embedding == "completed" { completed += 1 }

        return Double(completed) / Double(total)
    }
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
