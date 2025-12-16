import Foundation
import SwiftUI
import Combine

/// ViewModel for the bookmark list view
/// Handles loading, filtering, and managing the bookmark collection
@MainActor
class BookmarkListViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var bookmarks: [Bookmark] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var searchQuery = ""
    @Published var selectedType: ContentType?
    @Published var selectedBookmark: Bookmark?

    // MARK: - Private Properties

    private let api: any BookmarkAPIProtocol

    // MARK: - Initialization

    init(useMockAPI: Bool = true) {
        self.api = useMockAPI ? MockAPIClient.shared : APIClient.shared
    }

    // MARK: - Public Methods

    /// Load bookmarks with optional filters
    func loadBookmarks() async {
        isLoading = true
        error = nil

        do {
            bookmarks = try await api.fetchBookmarks(
                query: searchQuery.isEmpty ? nil : searchQuery,
                type: selectedType,
                source: nil,
                dateFrom: nil,
                dateTo: nil
            )
            // Sort by last updated (most recent first)
            bookmarks.sort { $0.updatedAt > $1.updatedAt }
        } catch {
            self.error = error.localizedDescription
            print("Failed to load bookmarks: \(error)")
        }

        isLoading = false
    }

    /// Delete bookmark at specific offsets
    func deleteBookmark(at offsets: IndexSet) async {
        for index in offsets {
            let bookmark = bookmarks[index]
            do {
                try await api.deleteBookmark(id: bookmark.id)
                bookmarks.remove(at: index)

                // Clear selection if deleted bookmark was selected
                if selectedBookmark?.id == bookmark.id {
                    selectedBookmark = nil
                }
            } catch {
                self.error = error.localizedDescription
                print("Failed to delete bookmark: \(error)")
            }
        }
    }

    /// Delete specific bookmark by ID
    func deleteBookmark(id: String) async {
        do {
            try await api.deleteBookmark(id: id)
            bookmarks.removeAll { $0.id == id }

            // Clear selection if deleted bookmark was selected
            if selectedBookmark?.id == id {
                selectedBookmark = nil
            }

            // Haptic feedback for successful deletion
            HapticManager.shared.light()
        } catch {
            self.error = error.localizedDescription
            print("Failed to delete bookmark: \(error)")

            // Haptic feedback for error
            HapticManager.shared.error()
        }
    }

    /// Refresh the bookmark list (pull-to-refresh)
    func refresh() async {
        await loadBookmarks()
    }

    /// Update the search query and reload
    func updateSearchQuery(_ query: String) {
        searchQuery = query
        Task {
            // Debounce search to avoid excessive API calls
            try? await Task.sleep(for: .milliseconds(300))
            await loadBookmarks()
        }
    }

    /// Filter by content type
    func filterByType(_ type: ContentType?) {
        selectedType = type
        Task {
            await loadBookmarks()
        }
    }

    /// Add a new bookmark to the list
    func addBookmark(_ bookmark: Bookmark) {
        // Insert at the beginning (newest first)
        bookmarks.insert(bookmark, at: 0)
        selectedBookmark = bookmark
    }

    /// Create a new empty bookmark and select it
    func createEmptyBookmark() async {
        do {
            // Create empty bookmark (empty URL so placeholder shows)
            let bookmark = try await api.createBookmark(url: "", title: "New Bookmark")

            // Add to list and select
            bookmarks.insert(bookmark, at: 0)
            selectedBookmark = bookmark

            // Haptic feedback for successful creation
            HapticManager.shared.light()
        } catch {
            self.error = error.localizedDescription
            print("Failed to create empty bookmark: \(error)")

            // Haptic feedback for error
            HapticManager.shared.error()
        }
    }

    /// Update an existing bookmark in the list
    func updateBookmark(_ bookmark: Bookmark) {
        if let index = bookmarks.firstIndex(where: { $0.id == bookmark.id }) {
            bookmarks[index] = bookmark

            // Update selected bookmark if it's the same one
            if selectedBookmark?.id == bookmark.id {
                selectedBookmark = bookmark
            }
        }
    }

    // MARK: - Computed Properties

    /// Check if there are any bookmarks
    var hasBookmarks: Bool {
        !bookmarks.isEmpty
    }

    /// Check if currently showing filtered results
    var isFiltering: Bool {
        !searchQuery.isEmpty || selectedType != nil
    }

    /// Get count of bookmarks
    var bookmarkCount: Int {
        bookmarks.count
    }

    /// Group bookmarks by last update date (Today, Previous 30 Days, Previous 6 Months, Older)
    var groupedBookmarks: [(String, [Bookmark])] {
        let now = Date()
        let thirtyDaysAgo = Calendar.current.date(byAdding: .day, value: -30, to: now) ?? now
        let sixMonthsAgo = Calendar.current.date(byAdding: .month, value: -6, to: now) ?? now

        // Filter by updatedAt instead of createdAt
        let today = bookmarks.filter { Calendar.current.isDateInToday($0.updatedAt) }
        let previous30Days = bookmarks.filter {
            !Calendar.current.isDateInToday($0.updatedAt) &&
            $0.updatedAt >= thirtyDaysAgo
        }
        let previous6Months = bookmarks.filter {
            $0.updatedAt < thirtyDaysAgo &&
            $0.updatedAt >= sixMonthsAgo
        }
        let older = bookmarks.filter { $0.updatedAt < sixMonthsAgo }

        var grouped: [(String, [Bookmark])] = []

        if !today.isEmpty {
            grouped.append(("Today", today))
        }
        if !previous30Days.isEmpty {
            grouped.append(("Previous 30 Days", previous30Days))
        }
        if !previous6Months.isEmpty {
            grouped.append(("Previous 6 Months", previous6Months))
        }
        if !older.isEmpty {
            grouped.append(("Older", older))
        }

        return grouped
    }
}
