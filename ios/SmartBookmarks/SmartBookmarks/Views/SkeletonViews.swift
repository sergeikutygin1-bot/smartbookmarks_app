import SwiftUI

/// Skeleton loading view for bookmark rows
/// Shows placeholder content with subtle shimmer animation during loading
struct SkeletonBookmarkRow: View {
    @State private var isAnimating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header (icon, domain, time)
            HStack {
                SkeletonShape(width: 12, height: 12)
                SkeletonShape(width: 80, height: 10)
                Spacer()
                SkeletonShape(width: 50, height: 10)
            }

            // Title (2 lines)
            SkeletonShape(width: .infinity, height: 16)
            SkeletonShape(width: 200, height: 16)

            // Summary (2 lines)
            SkeletonShape(width: .infinity, height: 12)
            SkeletonShape(width: 150, height: 12)

            // Tags
            HStack(spacing: 4) {
                SkeletonShape(width: 60, height: 20, cornerRadius: 10)
                SkeletonShape(width: 80, height: 20, cornerRadius: 10)
                SkeletonShape(width: 70, height: 20, cornerRadius: 10)
            }
        }
        .padding(.vertical, 4)
        .opacity(isAnimating ? 0.5 : 1.0)
        .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: isAnimating)
        .onAppear {
            isAnimating = true
        }
    }
}

/// Basic skeleton shape with shimmer effect
struct SkeletonShape: View {
    let width: CGFloat?
    let height: CGFloat
    let cornerRadius: CGFloat

    init(width: CGFloat?, height: CGFloat, cornerRadius: CGFloat = 4) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.2))
            .frame(width: width, height: height)
            .cornerRadius(cornerRadius)
    }
}

/// Container view that shows skeleton rows during loading
struct SkeletonBookmarkList: View {
    let count: Int

    init(count: Int = 5) {
        self.count = count
    }

    var body: some View {
        ForEach(0..<count, id: \.self) { _ in
            SkeletonBookmarkRow()
                .listRowBackground(Color.clear)
        }
    }
}

#Preview {
    NavigationStack {
        List {
            SkeletonBookmarkList()
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Bookmarks")
        .navigationBarTitleDisplayMode(.inline)
    }
}
