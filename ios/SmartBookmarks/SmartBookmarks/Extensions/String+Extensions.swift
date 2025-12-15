import Foundation

extension String {
    /// Remove leading and trailing whitespace
    var trimmed: String {
        self.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Check if string is a valid URL
    var isValidURL: Bool {
        guard let url = URL(string: self) else { return false }
        return url.scheme == "http" || url.scheme == "https"
    }

    /// Extract domain from URL string
    var domain: String? {
        guard let url = URL(string: self) else { return nil }
        return url.host
    }

    /// Truncate string to specified length with ellipsis
    func truncated(to length: Int, addingEllipsis: Bool = true) -> String {
        if self.count <= length {
            return self
        }

        let truncated = String(self.prefix(length))
        return addingEllipsis ? truncated + "..." : truncated
    }

    /// Check if string contains another string (case-insensitive)
    func containsIgnoringCase(_ other: String) -> Bool {
        self.localizedCaseInsensitiveContains(other)
    }

    /// Convert string to title case
    var titleCased: String {
        self.capitalized
    }

    /// Remove HTML tags from string
    var strippingHTML: String {
        self.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    }

    /// Count words in string
    var wordCount: Int {
        let components = self.components(separatedBy: .whitespacesAndNewlines)
        return components.filter { !$0.isEmpty }.count
    }

    /// Estimate reading time in minutes
    var readingTimeMinutes: Int {
        let wordsPerMinute = 200
        return max(1, wordCount / wordsPerMinute)
    }
}

// MARK: - URL Validation

extension String {
    /// Validate and normalize URL string
    func normalizedURL() -> String? {
        var urlString = self.trimmed

        // Add scheme if missing
        if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
            urlString = "https://" + urlString
        }

        // Validate
        guard URL(string: urlString) != nil else {
            return nil
        }

        return urlString
    }
}
