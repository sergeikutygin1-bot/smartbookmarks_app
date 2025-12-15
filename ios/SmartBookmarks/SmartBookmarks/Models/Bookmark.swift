import Foundation

/// Main bookmark model matching backend schema
struct Bookmark: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var url: String
    var title: String
    var domain: String
    var summary: String?
    var contentType: ContentType
    var tags: [String]
    var createdAt: Date
    var updatedAt: Date
    var processedAt: Date?
    var embedding: [Double]?
    var embeddedAt: Date?

    /// Custom equality to handle optional arrays
    static func == (lhs: Bookmark, rhs: Bookmark) -> Bool {
        return lhs.id == rhs.id &&
            lhs.url == rhs.url &&
            lhs.title == rhs.title &&
            lhs.domain == rhs.domain &&
            lhs.summary == rhs.summary &&
            lhs.contentType == rhs.contentType &&
            lhs.tags == rhs.tags &&
            lhs.createdAt == rhs.createdAt &&
            lhs.updatedAt == rhs.updatedAt &&
            lhs.processedAt == rhs.processedAt &&
            lhs.embeddedAt == rhs.embeddedAt
    }

    /// Custom hash to handle optional arrays
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(url)
        hasher.combine(title)
    }

    /// Check if bookmark has been enriched
    var isEnriched: Bool {
        return processedAt != nil
    }

    /// Check if bookmark has embeddings for semantic search
    var hasEmbedding: Bool {
        return embedding != nil && !(embedding?.isEmpty ?? true)
    }
}

// MARK: - Codable Custom Date Handling

extension Bookmark {
    enum CodingKeys: String, CodingKey {
        case id, url, title, domain, summary, contentType, tags
        case createdAt, updatedAt, processedAt, embedding, embeddedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        url = try container.decode(String.self, forKey: .url)
        title = try container.decode(String.self, forKey: .title)
        domain = try container.decode(String.self, forKey: .domain)
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
        contentType = try container.decode(ContentType.self, forKey: .contentType)
        tags = try container.decode([String].self, forKey: .tags)

        // ISO8601 date decoding
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let createdAtString = try container.decode(String.self, forKey: .createdAt)
        createdAt = dateFormatter.date(from: createdAtString) ?? Date()

        let updatedAtString = try container.decode(String.self, forKey: .updatedAt)
        updatedAt = dateFormatter.date(from: updatedAtString) ?? Date()

        if let processedAtString = try container.decodeIfPresent(String.self, forKey: .processedAt) {
            processedAt = dateFormatter.date(from: processedAtString)
        } else {
            processedAt = nil
        }

        if let embeddedAtString = try container.decodeIfPresent(String.self, forKey: .embeddedAt) {
            embeddedAt = dateFormatter.date(from: embeddedAtString)
        } else {
            embeddedAt = nil
        }

        embedding = try container.decodeIfPresent([Double].self, forKey: .embedding)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(id, forKey: .id)
        try container.encode(url, forKey: .url)
        try container.encode(title, forKey: .title)
        try container.encode(domain, forKey: .domain)
        try container.encodeIfPresent(summary, forKey: .summary)
        try container.encode(contentType, forKey: .contentType)
        try container.encode(tags, forKey: .tags)

        // ISO8601 date encoding
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        try container.encode(dateFormatter.string(from: createdAt), forKey: .createdAt)
        try container.encode(dateFormatter.string(from: updatedAt), forKey: .updatedAt)

        if let processedAt = processedAt {
            try container.encode(dateFormatter.string(from: processedAt), forKey: .processedAt)
        }

        if let embeddedAt = embeddedAt {
            try container.encode(dateFormatter.string(from: embeddedAt), forKey: .embeddedAt)
        }

        try container.encodeIfPresent(embedding, forKey: .embedding)
    }
}
