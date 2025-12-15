import SwiftUI

struct ContentView: View {
    @StateObject private var listViewModel = BookmarkListViewModel(useMockAPI: true)

    var body: some View {
        NavigationSplitView {
            // Sidebar with bookmark list
            BookmarkListSidebar(
                viewModel: listViewModel
            )
        } detail: {
            // Detail view with selected bookmark
            if let selectedBookmark = listViewModel.selectedBookmark {
                BookmarkDetailContainer(
                    bookmark: selectedBookmark,
                    onBookmarkUpdated: { updatedBookmark in
                        listViewModel.updateBookmark(updatedBookmark)
                    },
                    onBookmarkDeleted: {
                        Task {
                            await listViewModel.deleteBookmark(id: selectedBookmark.id)
                        }
                    }
                )
            } else {
                // Empty state when no bookmark is selected
                ContentUnavailableView(
                    "No Bookmark Selected",
                    systemImage: "bookmark",
                    description: Text("Select a bookmark from the list or add a new one")
                )
            }
        }
        .task {
            await listViewModel.loadBookmarks()
        }
    }
}

// MARK: - Bookmark List Sidebar

struct BookmarkListSidebar: View {
    @ObservedObject var viewModel: BookmarkListViewModel

    var body: some View {
        List(selection: $viewModel.selectedBookmark) {
            ForEach(viewModel.bookmarks) { bookmark in
                BookmarkRow(bookmark: bookmark)
                    .tag(bookmark)
            }
            .onDelete { offsets in
                Task {
                    await viewModel.deleteBookmark(at: offsets)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Bookmarks")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $viewModel.searchQuery, prompt: "Search bookmarks...")
        .onChange(of: viewModel.searchQuery) { _, _ in
            Task {
                await viewModel.loadBookmarks()
            }
        }
        .refreshable {
            await viewModel.refresh()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: {
                    Task {
                        await viewModel.createEmptyBookmark()
                    }
                }) {
                    Label("Add Bookmark", systemImage: "plus")
                }
            }
        }
        .overlay {
            if viewModel.isLoading && !viewModel.hasBookmarks {
                ProgressView("Loading...")
            } else if !viewModel.hasBookmarks {
                ContentUnavailableView(
                    "No Bookmarks",
                    systemImage: "bookmark.slash",
                    description: Text("Add your first bookmark with the + button")
                )
            }
        }
    }
}

// MARK: - Bookmark Row (Placeholder)

struct BookmarkRow: View {
    let bookmark: Bookmark

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: bookmark.contentType.icon)
                    .foregroundStyle(.secondary)
                    .font(.caption)

                Text(bookmark.domain)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(bookmark.createdAt.relativeTime)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Text(bookmark.title)
                .font(.headline)
                .lineLimit(2)

            if let summary = bookmark.summary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if !bookmark.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(bookmark.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption2)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.appAccent.opacity(0.1))
                                .foregroundStyle(Color.appAccent)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Bookmark Detail Container (Placeholder)

struct BookmarkDetailContainer: View {
    let bookmark: Bookmark
    let onBookmarkUpdated: (Bookmark) -> Void
    let onBookmarkDeleted: () -> Void

    @StateObject private var viewModel: BookmarkDetailViewModel

    init(
        bookmark: Bookmark,
        onBookmarkUpdated: @escaping (Bookmark) -> Void,
        onBookmarkDeleted: @escaping () -> Void
    ) {
        self.bookmark = bookmark
        self.onBookmarkUpdated = onBookmarkUpdated
        self.onBookmarkDeleted = onBookmarkDeleted
        _viewModel = StateObject(wrappedValue: BookmarkDetailViewModel(bookmark: bookmark, useMockAPI: true))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    Label(viewModel.bookmark.domain, systemImage: "globe")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Text(viewModel.bookmark.contentType.displayName)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.1))
                        .clipShape(Capsule())
                }

                // URL
                Link(destination: URL(string: viewModel.bookmark.url)!) {
                    Text(viewModel.bookmark.url)
                        .font(.caption)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Divider()

                // Title
                VStack(alignment: .leading, spacing: 4) {
                    Text("Title")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    TextField("Title", text: Binding(
                        get: { viewModel.bookmark.title },
                        set: { viewModel.updateTitle($0) }
                    ), axis: .vertical)
                    .font(.title2.bold())
                }

                // Summary
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Summary")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Spacer()

                        // Enrich button
                        Button(action: {
                            Task {
                                await viewModel.enrich()
                            }
                        }) {
                            HStack(spacing: 4) {
                                if viewModel.enrichmentStatus.isLoading {
                                    ProgressView()
                                        .scaleEffect(0.7)
                                } else {
                                    Image(systemName: "sparkles")
                                }
                                Text(viewModel.enrichmentStatus.displayText)
                                    .font(.caption)
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(viewModel.enrichmentStatus.isLoading)
                    }

                    TextField(
                        "AI-generated summary will appear here...",
                        text: Binding(
                            get: { viewModel.bookmark.summary ?? "" },
                            set: { viewModel.updateSummary($0) }
                        ),
                        axis: .vertical
                    )
                    .lineLimit(3...10)
                }

                // Tags
                VStack(alignment: .leading, spacing: 8) {
                    Text("Tags")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    // Display tags
                    if !viewModel.bookmark.tags.isEmpty {
                        FlowLayout(spacing: 8) {
                            ForEach(viewModel.bookmark.tags, id: \.self) { tag in
                                HStack(spacing: 4) {
                                    Text(tag)
                                    Button {
                                        viewModel.removeTag(tag)
                                    } label: {
                                        Image(systemName: "xmark")
                                            .font(.caption2)
                                    }
                                }
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.appAccent.opacity(0.1))
                                .foregroundStyle(Color.appAccent)
                                .clipShape(Capsule())
                            }
                        }
                    }
                }

                Divider()

                // Metadata
                VStack(alignment: .leading, spacing: 4) {
                    Text("Created \(viewModel.bookmark.createdAt.shortDate)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)

                    if let processedAt = viewModel.bookmark.processedAt {
                        Text("Enriched \(processedAt.relativeTime)")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Bookmark")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .status) {
                if viewModel.saveStatus != .idle {
                    HStack(spacing: 4) {
                        switch viewModel.saveStatus {
                        case .saving:
                            ProgressView()
                                .scaleEffect(0.6)
                            Text("Saving...")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        case .saved:
                            Image(systemName: "checkmark")
                                .foregroundStyle(.green)
                            Text("Saved")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        case .error(let message):
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.red)
                            Text(message)
                                .font(.caption)
                                .foregroundStyle(.red)
                                .lineLimit(1)
                        default:
                            EmptyView()
                        }
                    }
                }
            }
        }
        .onAppear {
            viewModel.onBookmarkUpdated = onBookmarkUpdated
        }
    }
}

// MARK: - Add Bookmark Sheet (Placeholder)

struct AddBookmarkSheet: View {
    @StateObject private var viewModel = AddBookmarkViewModel(useMockAPI: true)
    @Environment(\.dismiss) private var dismiss

    let onBookmarkCreated: (Bookmark) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("https://...", text: $viewModel.url)
                            .textContentType(.URL)
                            .keyboardType(.URL)
                            .autocapitalization(.none)
                            .autocorrectionDisabled()

                        Button(action: viewModel.pasteFromClipboard) {
                            Image(systemName: "doc.on.clipboard")
                        }
                        .buttonStyle(.borderless)
                    }
                } header: {
                    Text("URL")
                } footer: {
                    Text("Paste any web link to save it")
                }

                if let error = viewModel.error {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Add Bookmark")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        Task {
                            if let bookmark = await viewModel.createBookmark() {
                                onBookmarkCreated(bookmark)
                            }
                        }
                    }
                    .disabled(!viewModel.canSubmit)
                }
            }
            .interactiveDismissDisabled(viewModel.isCreating)
            .overlay {
                if viewModel.isCreating {
                    ProgressView()
                }
            }
        }
    }
}

// MARK: - Flow Layout (Simple Tag Layout)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(
                at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y),
                proposal: .unspecified
            )
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var rowHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                if x + size.width > maxWidth, x > 0 {
                    x = 0
                    y += rowHeight + spacing
                    rowHeight = 0
                }
                positions.append(CGPoint(x: x, y: y))
                rowHeight = max(rowHeight, size.height)
                x += size.width + spacing
            }

            self.size = CGSize(width: maxWidth, height: y + rowHeight)
        }
    }
}

#Preview {
    ContentView()
}
