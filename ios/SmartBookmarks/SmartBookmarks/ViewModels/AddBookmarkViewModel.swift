import Foundation
import SwiftUI
import Combine

/// ViewModel for adding a new bookmark
/// Handles URL validation, clipboard pasting, and bookmark creation
@MainActor
class AddBookmarkViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var url = ""
    @Published var title = ""
    @Published var isCreating = false
    @Published var error: String?

    // MARK: - Private Properties

    private let api: any BookmarkAPIProtocol

    // MARK: - Initialization

    init(useMockAPI: Bool = true) {
        self.api = useMockAPI ? MockAPIClient.shared : APIClient.shared
    }

    // MARK: - Validation

    /// Check if URL is valid
    var isValidURL: Bool {
        url.isValidURL
    }

    /// Check if form can be submitted
    var canSubmit: Bool {
        isValidURL && !isCreating
    }

    // MARK: - Actions

    /// Paste URL from clipboard
    func pasteFromClipboard() {
        #if os(iOS)
        if let clipboardString = UIPasteboard.general.string {
            processClipboardString(clipboardString)
        }
        #elseif os(macOS)
        if let clipboardString = NSPasteboard.general.string(forType: .string) {
            processClipboardString(clipboardString)
        }
        #endif
    }

    /// Process clipboard string and extract URL
    private func processClipboardString(_ string: String) {
        let trimmed = string.trimmed

        // Check if it's a valid URL
        if trimmed.isValidURL {
            url = trimmed
        }
        // Try to normalize it
        else if let normalized = trimmed.normalizedURL() {
            url = normalized
        }
        // Check if it contains a URL
        else if let extractedURL = extractFirstURL(from: trimmed) {
            url = extractedURL
        }
    }

    /// Extract first URL from text
    private func extractFirstURL(from text: String) -> String? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let matches = detector?.matches(in: text, range: NSRange(text.startIndex..., in: text))

        guard let match = matches?.first,
              let range = Range(match.range, in: text) else {
            return nil
        }

        let urlString = String(text[range])
        return urlString.isValidURL ? urlString : nil
    }

    /// Create bookmark
    func createBookmark() async -> Bookmark? {
        guard isValidURL else {
            error = "Please enter a valid URL"
            return nil
        }

        isCreating = true
        error = nil

        do {
            let normalizedURL = url.normalizedURL() ?? url
            let bookmark = try await api.createBookmark(
                url: normalizedURL,
                title: title.isEmpty ? nil : title
            )

            // Reset form
            url = ""
            title = ""
            isCreating = false

            return bookmark

        } catch {
            self.error = error.localizedDescription
            isCreating = false
            print("Failed to create bookmark: \(error)")
            return nil
        }
    }

    /// Reset form
    func reset() {
        url = ""
        title = ""
        error = nil
    }

    // MARK: - Helpers

    /// Extract domain from current URL
    var extractedDomain: String? {
        url.domain
    }

    /// Auto-fill title from URL if empty
    func autoFillTitle() {
        if title.isEmpty, let domain = extractedDomain {
            title = domain
        }
    }
}
