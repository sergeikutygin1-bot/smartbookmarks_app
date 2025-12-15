import Foundation

/// Result of AI enrichment process
struct EnrichmentResult: Codable {
    let url: String
    let title: String
    let domain: String
    let contentType: ContentType
    let extractedContent: ExtractedContent
    let analysis: Analysis
    let tagging: Tagging
    let embedding: [Double]?
    let embeddedAt: Date?
    let enrichedAt: Date
    let modelUsed: String
    let processingTimeMs: Int?
}

/// Extracted content from the URL
struct ExtractedContent: Codable {
    let rawText: String
    let cleanText: String
    let images: [String]?
    let metadata: [String: AnyCodable]?
}

/// AI-generated analysis
struct Analysis: Codable {
    let summary: String
    let keyPoints: [String]
}

/// AI-generated tags
struct Tagging: Codable {
    let tags: [String]
}

/// Helper for flexible JSON decoding
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            value = dictionary.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}
