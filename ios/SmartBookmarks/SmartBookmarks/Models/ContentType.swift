import Foundation

/// Content type of a bookmark (article, video, tweet, PDF, etc.)
enum ContentType: String, Codable, CaseIterable, Hashable, Sendable {
    case article
    case video
    case tweet
    case pdf
    case other

    /// SF Symbol icon name for each content type
    var icon: String {
        switch self {
        case .article:
            return "doc.text"
        case .video:
            return "play.rectangle"
        case .tweet:
            return "bubble.left"
        case .pdf:
            return "doc.richtext"
        case .other:
            return "link"
        }
    }

    /// Human-readable display name
    var displayName: String {
        switch self {
        case .article:
            return "Article"
        case .video:
            return "Video"
        case .tweet:
            return "Tweet"
        case .pdf:
            return "PDF"
        case .other:
            return "Link"
        }
    }
}
