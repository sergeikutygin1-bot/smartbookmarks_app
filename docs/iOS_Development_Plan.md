# iOS Native Swift App Development Plan

## Overview

This document outlines the step-by-step plan to develop a native iOS app for Smart Bookmarks using Swift and SwiftUI. The app will live in the same repository and communicate with the existing backend API.

---

## Architecture Decision

**Approach:** Native Swift with SwiftUI
**Location:** `/ios` directory in the existing monorepo
**Communication:** REST API calls to the backend server
**Data Sync:** Backend is source of truth, local cache for offline

---

## Target Directory Structure

```
smartbookmarks_app/
├── ios/                              # NEW: iOS app
│   ├── SmartBookmarks/               # Main app target
│   │   ├── App/
│   │   │   ├── SmartBookmarksApp.swift
│   │   │   └── ContentView.swift
│   │   ├── Config/
│   │   │   ├── Config.swift          # API URLs, environment
│   │   │   └── Constants.swift
│   │   ├── Models/
│   │   │   ├── Bookmark.swift
│   │   │   ├── Tag.swift
│   │   │   ├── EnrichmentResult.swift
│   │   │   └── SearchResult.swift
│   │   ├── Services/
│   │   │   ├── APIClient.swift       # HTTP client
│   │   │   ├── BookmarkService.swift
│   │   │   ├── SearchService.swift
│   │   │   └── StorageService.swift  # Local persistence
│   │   ├── ViewModels/
│   │   │   ├── BookmarkListViewModel.swift
│   │   │   ├── BookmarkDetailViewModel.swift
│   │   │   ├── SearchViewModel.swift
│   │   │   └── AddBookmarkViewModel.swift
│   │   ├── Views/
│   │   │   ├── BookmarkList/
│   │   │   │   ├── BookmarkListView.swift
│   │   │   │   └── BookmarkRowView.swift
│   │   │   ├── BookmarkDetail/
│   │   │   │   ├── BookmarkDetailView.swift
│   │   │   │   ├── EditableField.swift
│   │   │   │   └── TagsView.swift
│   │   │   ├── AddBookmark/
│   │   │   │   └── AddBookmarkView.swift
│   │   │   ├── Search/
│   │   │   │   └── SearchView.swift
│   │   │   └── Components/
│   │   │       ├── EnrichButton.swift
│   │   │       ├── ContentTypeBadge.swift
│   │   │       ├── LoadingView.swift
│   │   │       └── EmptyStateView.swift
│   │   ├── Extensions/
│   │   │   ├── Date+Extensions.swift
│   │   │   ├── Color+Extensions.swift
│   │   │   └── String+Extensions.swift
│   │   └── Resources/
│   │       ├── Assets.xcassets
│   │       └── Info.plist
│   ├── SmartBookmarksShare/          # Share Extension target
│   │   ├── ShareViewController.swift
│   │   ├── Info.plist
│   │   └── MainInterface.storyboard
│   ├── SmartBookmarksTests/          # Unit tests
│   ├── SmartBookmarksUITests/        # UI tests
│   └── SmartBookmarks.xcodeproj      # Xcode project
├── frontend/                          # Existing web app
├── backend/                           # Existing API server
└── docs/
```

---

## Phase 1: Project Foundation

### Step 1.1: Create Xcode Project
- [ ] Create new Xcode project in `/ios` directory
- [ ] Select "App" template with SwiftUI
- [ ] Product Name: `SmartBookmarks`
- [ ] Bundle Identifier: `com.yourcompany.smartbookmarks`
- [ ] Enable Swift Package Manager
- [ ] Set minimum iOS deployment target: iOS 16.0

### Step 1.2: Configure Project Settings
- [ ] Add App Groups capability (for Share Extension data sharing)
- [ ] Configure development team
- [ ] Set up code signing
- [ ] Add `.gitignore` entries for Xcode artifacts:
  ```
  # Xcode
  ios/*.xcodeproj/xcuserdata/
  ios/*.xcodeproj/project.xcworkspace/xcuserdata/
  ios/DerivedData/
  ios/.build/
  ```

### Step 1.3: Add Dependencies (Swift Package Manager)
```swift
// Package.swift dependencies
dependencies: [
    // None required for MVP - using native URLSession and SwiftUI
]
```

**Optional packages for later:**
- `KeychainSwift` - Secure token storage (when adding auth)
- `Kingfisher` - Image caching (if showing bookmark thumbnails)

---

## Phase 2: Core Data Models

### Step 2.1: Define Bookmark Model
Create `Models/Bookmark.swift` matching the TypeScript interface:

```swift
import Foundation

struct Bookmark: Codable, Identifiable, Equatable {
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
}

enum ContentType: String, Codable, CaseIterable {
    case article
    case video
    case tweet
    case pdf
    case other

    var icon: String {
        switch self {
        case .article: return "doc.text"
        case .video: return "play.rectangle"
        case .tweet: return "bubble.left"
        case .pdf: return "doc.richtext"
        case .other: return "link"
        }
    }

    var displayName: String {
        switch self {
        case .article: return "Article"
        case .video: return "Video"
        case .tweet: return "Tweet"
        case .pdf: return "PDF"
        case .other: return "Link"
        }
    }
}
```

### Step 2.2: Define Enrichment Result Model
Create `Models/EnrichmentResult.swift`:

```swift
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

struct ExtractedContent: Codable {
    let rawText: String
    let cleanText: String
    let images: [String]?
    let metadata: [String: AnyCodable]?
}

struct Analysis: Codable {
    let summary: String
    let keyPoints: [String]
}

struct Tagging: Codable {
    let tags: [String]
}
```

### Step 2.3: Define API Response Models
Create `Models/APIResponse.swift`:

```swift
struct BookmarkListResponse: Codable {
    let data: [Bookmark]
    let total: Int
}

struct BookmarkResponse: Codable {
    let data: Bookmark
}

struct SearchResponse: Codable {
    let query: String
    let results: [SearchResult]
    let metadata: SearchMetadata
}

struct SearchResult: Codable {
    let id: String
    let score: Double
}

struct SearchMetadata: Codable {
    let totalItems: Int
    let resultsCount: Int
    let semanticWeight: Double
    let minScore: Double
}

struct APIError: Codable, Error {
    let error: String
    let message: String?
}
```

---

## Phase 3: Networking Layer

### Step 3.1: Create Configuration
Create `Config/Config.swift`:

```swift
import Foundation

enum Config {
    static var apiBaseURL: String {
        #if DEBUG
        // Local development - change to your machine's IP for device testing
        return "http://localhost:3000/api"
        #else
        // Production URL
        return "https://api.smartbookmarks.com"
        #endif
    }

    static var enrichmentBaseURL: String {
        #if DEBUG
        return "http://localhost:3002"
        #else
        return "https://api.smartbookmarks.com"
        #endif
    }

    static let requestTimeout: TimeInterval = 30
    static let enrichmentTimeout: TimeInterval = 60 // Longer for AI processing
}
```

### Step 3.2: Create API Client
Create `Services/APIClient.swift`:

```swift
import Foundation

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = Config.requestTimeout
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Bookmarks

    func fetchBookmarks(
        query: String? = nil,
        type: ContentType? = nil,
        source: String? = nil,
        dateFrom: Date? = nil,
        dateTo: Date? = nil
    ) async throws -> [Bookmark] {
        var components = URLComponents(string: "\(Config.apiBaseURL)/bookmarks")!
        var queryItems: [URLQueryItem] = []

        if let query = query { queryItems.append(.init(name: "q", value: query)) }
        if let type = type { queryItems.append(.init(name: "type", value: type.rawValue)) }
        if let source = source { queryItems.append(.init(name: "source", value: source)) }
        if let dateFrom = dateFrom {
            queryItems.append(.init(name: "dateFrom", value: ISO8601DateFormatter().string(from: dateFrom)))
        }
        if let dateTo = dateTo {
            queryItems.append(.init(name: "dateTo", value: ISO8601DateFormatter().string(from: dateTo)))
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        let (data, _) = try await session.data(from: components.url!)
        let response = try decoder.decode(BookmarkListResponse.self, from: data)
        return response.data
    }

    func createBookmark(url: String, title: String? = nil) async throws -> Bookmark {
        var request = URLRequest(url: URL(string: "\(Config.apiBaseURL)/bookmarks")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["url": url, "title": title].compactMapValues { $0 }
        request.httpBody = try encoder.encode(body)

        let (data, _) = try await session.data(for: request)
        let response = try decoder.decode(BookmarkResponse.self, from: data)
        return response.data
    }

    func updateBookmark(_ bookmark: Bookmark) async throws -> Bookmark {
        var request = URLRequest(url: URL(string: "\(Config.apiBaseURL)/bookmarks/\(bookmark.id)")!)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(bookmark)

        let (data, _) = try await session.data(for: request)
        let response = try decoder.decode(BookmarkResponse.self, from: data)
        return response.data
    }

    func deleteBookmark(id: String) async throws {
        var request = URLRequest(url: URL(string: "\(Config.apiBaseURL)/bookmarks/\(id)")!)
        request.httpMethod = "DELETE"
        _ = try await session.data(for: request)
    }

    // MARK: - Enrichment

    func enrichBookmark(id: String, url: String, existingTags: [String] = []) async throws -> EnrichmentResult {
        var request = URLRequest(url: URL(string: "\(Config.enrichmentBaseURL)/enrich")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = Config.enrichmentTimeout

        let body = ["url": url, "existingTags": existingTags] as [String: Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await session.data(for: request)
        return try decoder.decode(EnrichmentResult.self, from: data)
    }

    // MARK: - Search

    func search(
        query: String,
        bookmarks: [Bookmark],
        topK: Int = 10,
        semanticWeight: Double = 0.6
    ) async throws -> [SearchResult] {
        var request = URLRequest(url: URL(string: "\(Config.enrichmentBaseURL)/search")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Prepare searchable items
        let searchableItems = bookmarks.map { bookmark in
            [
                "id": bookmark.id,
                "title": bookmark.title,
                "tags": bookmark.tags,
                "embedding": bookmark.embedding ?? []
            ] as [String: Any]
        }

        let body: [String: Any] = [
            "query": query,
            "bookmarks": searchableItems,
            "topK": topK,
            "semanticWeight": semanticWeight
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await session.data(for: request)
        let response = try decoder.decode(SearchResponse.self, from: data)
        return response.results
    }
}
```

---

## Phase 4: ViewModels

### Step 4.1: BookmarkListViewModel
Create `ViewModels/BookmarkListViewModel.swift`:

```swift
import Foundation
import SwiftUI

@MainActor
class BookmarkListViewModel: ObservableObject {
    @Published var bookmarks: [Bookmark] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var searchQuery = ""
    @Published var selectedType: ContentType?

    private let api = APIClient.shared

    func loadBookmarks() async {
        isLoading = true
        error = nil

        do {
            bookmarks = try await api.fetchBookmarks(
                query: searchQuery.isEmpty ? nil : searchQuery,
                type: selectedType
            )
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func deleteBookmark(at offsets: IndexSet) async {
        for index in offsets {
            let bookmark = bookmarks[index]
            do {
                try await api.deleteBookmark(id: bookmark.id)
                bookmarks.remove(at: index)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func refresh() async {
        await loadBookmarks()
    }
}
```

### Step 4.2: BookmarkDetailViewModel
Create `ViewModels/BookmarkDetailViewModel.swift`:

```swift
import Foundation
import Combine

@MainActor
class BookmarkDetailViewModel: ObservableObject {
    @Published var bookmark: Bookmark
    @Published var isSaving = false
    @Published var isEnriching = false
    @Published var saveStatus: SaveStatus = .idle
    @Published var error: String?

    private let api = APIClient.shared
    private var saveTask: Task<Void, Never>?
    private let debounceInterval: TimeInterval = 0.5

    enum SaveStatus {
        case idle
        case saving
        case saved
        case error(String)
    }

    init(bookmark: Bookmark) {
        self.bookmark = bookmark
    }

    // Auto-save with debounce
    func scheduleAutoSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(debounceInterval * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await save()
        }
    }

    func save() async {
        saveStatus = .saving
        isSaving = true

        do {
            bookmark = try await api.updateBookmark(bookmark)
            saveStatus = .saved

            // Reset to idle after showing "Saved"
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if case .saved = saveStatus {
                saveStatus = .idle
            }
        } catch {
            saveStatus = .error(error.localizedDescription)
            self.error = error.localizedDescription
        }

        isSaving = false
    }

    func enrich() async {
        isEnriching = true
        error = nil

        do {
            let result = try await api.enrichBookmark(
                id: bookmark.id,
                url: bookmark.url,
                existingTags: bookmark.tags
            )

            // Update bookmark with enrichment results
            bookmark.title = result.title
            bookmark.summary = result.analysis.summary
            bookmark.tags = result.tagging.tags
            bookmark.contentType = result.contentType
            bookmark.embedding = result.embedding
            bookmark.embeddedAt = result.embeddedAt
            bookmark.processedAt = Date()
            bookmark.updatedAt = Date()

            // Save the enriched bookmark
            await save()
        } catch {
            self.error = error.localizedDescription
        }

        isEnriching = false
    }
}
```

### Step 4.3: AddBookmarkViewModel
Create `ViewModels/AddBookmarkViewModel.swift`:

```swift
import Foundation

@MainActor
class AddBookmarkViewModel: ObservableObject {
    @Published var url = ""
    @Published var isCreating = false
    @Published var error: String?

    private let api = APIClient.shared

    var isValidURL: Bool {
        guard let url = URL(string: url) else { return false }
        return url.scheme == "http" || url.scheme == "https"
    }

    func createBookmark() async -> Bookmark? {
        guard isValidURL else {
            error = "Please enter a valid URL"
            return nil
        }

        isCreating = true
        error = nil

        do {
            let bookmark = try await api.createBookmark(url: url)
            url = ""
            isCreating = false
            return bookmark
        } catch {
            self.error = error.localizedDescription
            isCreating = false
            return nil
        }
    }

    func pasteFromClipboard() {
        if let clipboardString = UIPasteboard.general.string,
           let url = URL(string: clipboardString),
           url.scheme == "http" || url.scheme == "https" {
            self.url = clipboardString
        }
    }
}
```

---

## Phase 5: SwiftUI Views

### Step 5.1: Main App Entry
Create `App/SmartBookmarksApp.swift`:

```swift
import SwiftUI

@main
struct SmartBookmarksApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

Create `App/ContentView.swift`:

```swift
import SwiftUI

struct ContentView: View {
    @StateObject private var listViewModel = BookmarkListViewModel()
    @State private var selectedBookmark: Bookmark?
    @State private var showingAddSheet = false

    var body: some View {
        NavigationSplitView {
            BookmarkListView(
                viewModel: listViewModel,
                selectedBookmark: $selectedBookmark
            )
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: { showingAddSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
        } detail: {
            if let bookmark = selectedBookmark {
                BookmarkDetailView(bookmark: bookmark)
            } else {
                ContentUnavailableView(
                    "No Bookmark Selected",
                    systemImage: "bookmark",
                    description: Text("Select a bookmark from the list")
                )
            }
        }
        .sheet(isPresented: $showingAddSheet) {
            AddBookmarkSheet(
                onCreated: { bookmark in
                    showingAddSheet = false
                    Task { await listViewModel.loadBookmarks() }
                    selectedBookmark = bookmark
                }
            )
        }
        .task {
            await listViewModel.loadBookmarks()
        }
    }
}
```

### Step 5.2: Bookmark List View
Create `Views/BookmarkList/BookmarkListView.swift`:

```swift
import SwiftUI

struct BookmarkListView: View {
    @ObservedObject var viewModel: BookmarkListViewModel
    @Binding var selectedBookmark: Bookmark?

    var body: some View {
        List(selection: $selectedBookmark) {
            ForEach(viewModel.bookmarks) { bookmark in
                BookmarkRowView(bookmark: bookmark)
                    .tag(bookmark)
            }
            .onDelete { offsets in
                Task { await viewModel.deleteBookmark(at: offsets) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Bookmarks")
        .searchable(text: $viewModel.searchQuery, prompt: "Search bookmarks...")
        .onChange(of: viewModel.searchQuery) { _, _ in
            Task { await viewModel.loadBookmarks() }
        }
        .refreshable {
            await viewModel.refresh()
        }
        .overlay {
            if viewModel.isLoading && viewModel.bookmarks.isEmpty {
                ProgressView()
            } else if viewModel.bookmarks.isEmpty {
                ContentUnavailableView(
                    "No Bookmarks",
                    systemImage: "bookmark.slash",
                    description: Text("Add your first bookmark with the + button")
                )
            }
        }
    }
}
```

Create `Views/BookmarkList/BookmarkRowView.swift`:

```swift
import SwiftUI

struct BookmarkRowView: View {
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

                Text(bookmark.createdAt, style: .relative)
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
                                .background(Color.accentColor.opacity(0.1))
                                .foregroundStyle(.accent)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
```

### Step 5.3: Bookmark Detail View
Create `Views/BookmarkDetail/BookmarkDetailView.swift`:

```swift
import SwiftUI

struct BookmarkDetailView: View {
    @StateObject private var viewModel: BookmarkDetailViewModel

    init(bookmark: Bookmark) {
        _viewModel = StateObject(wrappedValue: BookmarkDetailViewModel(bookmark: bookmark))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header with domain and type
                HStack {
                    Label(viewModel.bookmark.domain, systemImage: "globe")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Spacer()

                    ContentTypeBadge(type: viewModel.bookmark.contentType)
                }

                // URL (tappable)
                Link(destination: URL(string: viewModel.bookmark.url)!) {
                    Text(viewModel.bookmark.url)
                        .font(.caption)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Divider()

                // Editable Title
                VStack(alignment: .leading, spacing: 4) {
                    Text("Title")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    TextField("Title", text: $viewModel.bookmark.title, axis: .vertical)
                        .font(.title2.bold())
                        .onChange(of: viewModel.bookmark.title) { _, _ in
                            viewModel.scheduleAutoSave()
                        }
                }

                // Editable Summary
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Summary")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Spacer()

                        EnrichButton(
                            isEnriching: viewModel.isEnriching,
                            action: { Task { await viewModel.enrich() } }
                        )
                    }

                    TextField(
                        "AI-generated summary will appear here...",
                        text: Binding(
                            get: { viewModel.bookmark.summary ?? "" },
                            set: { viewModel.bookmark.summary = $0 }
                        ),
                        axis: .vertical
                    )
                    .lineLimit(3...10)
                    .onChange(of: viewModel.bookmark.summary) { _, _ in
                        viewModel.scheduleAutoSave()
                    }
                }

                // Tags
                VStack(alignment: .leading, spacing: 8) {
                    Text("Tags")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    TagsEditView(tags: $viewModel.bookmark.tags)
                        .onChange(of: viewModel.bookmark.tags) { _, _ in
                            viewModel.scheduleAutoSave()
                        }
                }

                Divider()

                // Metadata
                VStack(alignment: .leading, spacing: 4) {
                    Text("Created \(viewModel.bookmark.createdAt, style: .date)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)

                    if let processedAt = viewModel.bookmark.processedAt {
                        Text("Enriched \(processedAt, style: .relative)")
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
                SaveStatusIndicator(status: viewModel.saveStatus)
            }
        }
        .alert("Error", isPresented: .constant(viewModel.error != nil)) {
            Button("OK") { viewModel.error = nil }
        } message: {
            Text(viewModel.error ?? "")
        }
    }
}
```

### Step 5.4: Add Bookmark Sheet
Create `Views/AddBookmark/AddBookmarkSheet.swift`:

```swift
import SwiftUI

struct AddBookmarkSheet: View {
    @StateObject private var viewModel = AddBookmarkViewModel()
    @Environment(\.dismiss) private var dismiss

    let onCreated: (Bookmark) -> Void

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
                                onCreated(bookmark)
                            }
                        }
                    }
                    .disabled(!viewModel.isValidURL || viewModel.isCreating)
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
```

### Step 5.5: Reusable Components
Create `Views/Components/EnrichButton.swift`:

```swift
import SwiftUI

struct EnrichButton: View {
    let isEnriching: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if isEnriching {
                    ProgressView()
                        .scaleEffect(0.7)
                } else {
                    Image(systemName: "sparkles")
                }
                Text(isEnriching ? "Enriching..." : "Enrich")
                    .font(.caption)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(isEnriching)
    }
}
```

Create `Views/Components/SaveStatusIndicator.swift`:

```swift
import SwiftUI

struct SaveStatusIndicator: View {
    let status: BookmarkDetailViewModel.SaveStatus

    var body: some View {
        HStack(spacing: 4) {
            switch status {
            case .idle:
                EmptyView()
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
            }
        }
        .animation(.default, value: status)
    }
}
```

Create `Views/Components/ContentTypeBadge.swift`:

```swift
import SwiftUI

struct ContentTypeBadge: View {
    let type: ContentType

    var body: some View {
        Label(type.displayName, systemImage: type.icon)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.secondary.opacity(0.1))
            .clipShape(Capsule())
    }
}
```

Create `Views/Components/TagsEditView.swift`:

```swift
import SwiftUI

struct TagsEditView: View {
    @Binding var tags: [String]
    @State private var newTag = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Existing tags
            FlowLayout(spacing: 8) {
                ForEach(tags, id: \.self) { tag in
                    HStack(spacing: 4) {
                        Text(tag)
                        Button {
                            tags.removeAll { $0 == tag }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption2)
                        }
                    }
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.accentColor.opacity(0.1))
                    .foregroundStyle(.accent)
                    .clipShape(Capsule())
                }
            }

            // Add new tag
            HStack {
                TextField("Add tag...", text: $newTag)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                    .onSubmit(addTag)

                Button("Add", action: addTag)
                    .font(.caption)
                    .disabled(newTag.isEmpty)
            }
        }
    }

    private func addTag() {
        let trimmed = newTag.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !tags.contains(trimmed) else { return }
        tags.append(trimmed)
        newTag = ""
    }
}

// Simple flow layout for tags
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x,
                                      y: bounds.minY + result.positions[index].y),
                         proposal: .unspecified)
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
```

---

## Phase 6: Share Extension

### Step 6.1: Add Share Extension Target
In Xcode:
1. File → New → Target → Share Extension
2. Product Name: `SmartBookmarksShare`
3. Enable App Groups capability on both targets
4. Add same App Group identifier: `group.com.yourcompany.smartbookmarks`

### Step 6.2: Configure Share Extension
Update `SmartBookmarksShare/Info.plist`:

```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>NSExtensionActivationRule</key>
        <dict>
            <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
            <integer>1</integer>
        </dict>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
</dict>
```

### Step 6.3: Implement Share View Controller
Create `SmartBookmarksShare/ShareViewController.swift`:

```swift
import UIKit
import Social
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {

    private var sharedURL: URL?

    override func isContentValid() -> Bool {
        return sharedURL != nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        placeholder = "Add a note (optional)..."

        // Extract URL from share context
        extractURL()
    }

    override func didSelectPost() {
        guard let url = sharedURL else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }

        Task {
            await createBookmark(url: url)
            await MainActor.run {
                extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    override func configurationItems() -> [Any]! {
        // Could add configuration items here (e.g., folder selection)
        return []
    }

    private func extractURL() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else { return }

        for attachment in attachments {
            if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                attachment.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, error in
                    if let url = item as? URL {
                        DispatchQueue.main.async {
                            self?.sharedURL = url
                            self?.validateContent()
                        }
                    }
                }
                return
            }
        }
    }

    private func createBookmark(url: URL) async {
        // Use shared API client or direct HTTP call
        guard let apiURL = URL(string: "\(ShareConfig.apiBaseURL)/bookmarks") else { return }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["url": url.absoluteString]
        request.httpBody = try? JSONEncoder().encode(body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode == 201 {
                // Success - could show notification or update badge
            }
        } catch {
            // Handle error - could show alert
            print("Failed to create bookmark: \(error)")
        }
    }
}

// Separate config for Share Extension
enum ShareConfig {
    static var apiBaseURL: String {
        // Share Extension can't use #if DEBUG the same way
        // Use App Group UserDefaults or hardcode production URL
        return "https://api.smartbookmarks.com/api"
    }
}
```

---

## Phase 7: Polish & iOS Features

### Step 7.1: App Icon & Launch Screen
- [ ] Create app icon (1024x1024 source)
- [ ] Generate all icon sizes using asset catalog
- [ ] Design simple launch screen (logo + background)

### Step 7.2: Color Scheme & Typography
Create `Extensions/Color+Extensions.swift`:

```swift
import SwiftUI

extension Color {
    // Match web app color palette
    static let appBackground = Color(white: 1.0)
    static let appTextPrimary = Color.black
    static let appTextSecondary = Color(red: 0.525, green: 0.525, blue: 0.545)
    static let appBorder = Color(red: 0.898, green: 0.898, blue: 0.898)
    static let appAccent = Color(red: 0, green: 0.478, blue: 1.0) // #007AFF
}
```

### Step 7.3: Haptic Feedback
Add haptic feedback for key actions:
- Bookmark created: `.success`
- Bookmark deleted: `.warning`
- Enrichment complete: `.success`
- Error: `.error`

### Step 7.4: Pull-to-Refresh Animation
Already handled by SwiftUI's `.refreshable` modifier

### Step 7.5: Context Menus
Add long-press menus for bookmarks:
- Copy URL
- Share
- Delete
- Open in Safari

### Step 7.6: Keyboard Shortcuts (iPad)
Add keyboard shortcuts for iPad users:
- ⌘N: New bookmark
- ⌘F: Focus search
- Delete: Delete selected bookmark

---

## Phase 8: Offline Support (Optional Enhancement)

### Step 8.1: Local Storage with SwiftData
```swift
import SwiftData

@Model
class CachedBookmark {
    @Attribute(.unique) var id: String
    var url: String
    var title: String
    var domain: String
    var summary: String?
    var contentType: String
    var tags: [String]
    var createdAt: Date
    var updatedAt: Date
    var syncStatus: SyncStatus

    enum SyncStatus: String, Codable {
        case synced
        case pendingUpload
        case pendingDelete
    }
}
```

### Step 8.2: Sync Manager
- Sync on app launch
- Sync when network becomes available
- Queue offline changes for later sync

---

## Phase 9: Testing

### Step 9.1: Unit Tests
- [ ] APIClient tests with mocked URLSession
- [ ] ViewModel tests for state management
- [ ] Model encoding/decoding tests

### Step 9.2: UI Tests
- [ ] Bookmark list loading
- [ ] Create bookmark flow
- [ ] Edit bookmark flow
- [ ] Delete bookmark flow

### Step 9.3: Share Extension Testing
- Test from Safari
- Test from Twitter/X
- Test from other apps

---

## Phase 10: App Store Preparation

### Step 10.1: App Store Connect Setup
- [ ] Create App ID in Apple Developer Portal
- [ ] Create app record in App Store Connect
- [ ] Configure app information (description, keywords, category)

### Step 10.2: Screenshots
Capture screenshots for:
- iPhone 6.7" (iPhone 15 Pro Max)
- iPhone 6.5" (iPhone 14 Plus)
- iPhone 5.5" (iPhone 8 Plus)
- iPad Pro 12.9"

### Step 10.3: Privacy Policy
- [ ] Create privacy policy page
- [ ] Host at accessible URL
- [ ] Add URL to App Store Connect

### Step 10.4: App Review Preparation
- [ ] Demo account credentials (if auth required)
- [ ] Notes for reviewer
- [ ] Ensure backend is accessible from App Store review network

### Step 10.5: TestFlight Beta
- [ ] Upload build to TestFlight
- [ ] Add internal testers
- [ ] Gather feedback
- [ ] Fix issues before public release

---

## Timeline Estimate

| Phase | Description | Effort |
|-------|-------------|--------|
| Phase 1 | Project Foundation | 1 day |
| Phase 2 | Core Data Models | 0.5 day |
| Phase 3 | Networking Layer | 1 day |
| Phase 4 | ViewModels | 1 day |
| Phase 5 | SwiftUI Views | 2-3 days |
| Phase 6 | Share Extension | 1 day |
| Phase 7 | Polish & iOS Features | 1-2 days |
| Phase 8 | Offline Support | 2 days (optional) |
| Phase 9 | Testing | 1-2 days |
| Phase 10 | App Store Prep | 1-2 days |

**Total: ~10-15 days** for a polished MVP

---

## Files to Create Summary

### Core Files (17 files)
1. `ios/SmartBookmarks/App/SmartBookmarksApp.swift`
2. `ios/SmartBookmarks/App/ContentView.swift`
3. `ios/SmartBookmarks/Config/Config.swift`
4. `ios/SmartBookmarks/Models/Bookmark.swift`
5. `ios/SmartBookmarks/Models/EnrichmentResult.swift`
6. `ios/SmartBookmarks/Models/APIResponse.swift`
7. `ios/SmartBookmarks/Services/APIClient.swift`
8. `ios/SmartBookmarks/ViewModels/BookmarkListViewModel.swift`
9. `ios/SmartBookmarks/ViewModels/BookmarkDetailViewModel.swift`
10. `ios/SmartBookmarks/ViewModels/AddBookmarkViewModel.swift`
11. `ios/SmartBookmarks/Views/BookmarkList/BookmarkListView.swift`
12. `ios/SmartBookmarks/Views/BookmarkList/BookmarkRowView.swift`
13. `ios/SmartBookmarks/Views/BookmarkDetail/BookmarkDetailView.swift`
14. `ios/SmartBookmarks/Views/AddBookmark/AddBookmarkSheet.swift`
15. `ios/SmartBookmarks/Views/Components/EnrichButton.swift`
16. `ios/SmartBookmarks/Views/Components/SaveStatusIndicator.swift`
17. `ios/SmartBookmarks/Views/Components/ContentTypeBadge.swift`

### Share Extension (1 file)
18. `ios/SmartBookmarksShare/ShareViewController.swift`

### Extensions (1 file)
19. `ios/SmartBookmarks/Extensions/Color+Extensions.swift`

---

## Next Steps

1. Review and approve this plan
2. Set up Xcode project structure
3. Begin Phase 1 implementation
4. Iterate through phases

---

## API Endpoints Summary (for iOS app)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bookmarks` | GET | List bookmarks with filters |
| `/api/bookmarks` | POST | Create new bookmark |
| `/api/bookmarks/:id` | PATCH | Update bookmark |
| `/api/bookmarks/:id` | DELETE | Delete bookmark |
| `/enrich` | POST | AI enrichment (backend port 3002) |
| `/search` | POST | Hybrid search (backend port 3002) |
