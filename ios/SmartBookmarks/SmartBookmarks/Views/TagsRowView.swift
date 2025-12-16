import SwiftUI

/// Optimized tags row view that avoids nested ScrollView performance issues
/// Uses a single-line truncating layout for better performance in lists
struct TagsRowView: View {
    let tags: [String]
    let maxVisibleTags: Int

    init(tags: [String], maxVisibleTags: Int = 3) {
        self.tags = tags
        self.maxVisibleTags = maxVisibleTags
    }

    var body: some View {
        HStack(spacing: 4) {
            // Show first N tags
            ForEach(Array(tags.prefix(maxVisibleTags)), id: \.self) { tag in
                TagBadge(text: tag)
            }

            // Show "+N more" if there are hidden tags
            if tags.count > maxVisibleTags {
                Text("+\(tags.count - maxVisibleTags)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Individual tag badge component
struct TagBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.appAccent.opacity(0.1))
            .foregroundStyle(Color.appAccent)
            .clipShape(Capsule())
            .lineLimit(1)
    }
}

#Preview {
    VStack(spacing: 16) {
        TagsRowView(tags: ["swift", "ios", "development"])
        TagsRowView(tags: ["swift", "ios", "development", "xcode", "swiftui", "performance"])
        TagsRowView(tags: [])
    }
    .padding()
}
