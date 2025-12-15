import SwiftUI

extension Color {
    // MARK: - Apple Notes-Inspired Palette

    /// Primary background color (pure white)
    static let appBackground = Color.white

    /// Primary text color (pure black)
    static let appTextPrimary = Color.black

    /// Secondary text color (gray)
    static let appTextSecondary = Color(red: 0.525, green: 0.525, blue: 0.545)

    /// Tertiary text color (lighter gray)
    static let appTextTertiary = Color(red: 0.706, green: 0.706, blue: 0.706)

    /// Subtle border color
    static let appBorder = Color(red: 0.898, green: 0.898, blue: 0.898)

    /// iOS system blue (for accents)
    static let appAccent = Color(red: 0, green: 0.478, blue: 1.0) // #007AFF

    /// Success green
    static let appSuccess = Color(red: 0.204, green: 0.780, blue: 0.349) // #34C759

    /// Warning/destructive red
    static let appDestructive = Color(red: 1.0, green: 0.231, blue: 0.188) // #FF3B30

    /// Warning orange
    static let appWarning = Color(red: 1.0, green: 0.584, blue: 0.0) // #FF9500

    // MARK: - Content Type Colors

    /// Color for article bookmarks
    static let typeArticle = Color.blue

    /// Color for video bookmarks
    static let typeVideo = Color.purple

    /// Color for tweet bookmarks
    static let typeTweet = Color.cyan

    /// Color for PDF bookmarks
    static let typePDF = Color.orange

    /// Color for other/unknown bookmarks
    static let typeOther = Color.gray

    // MARK: - Semantic Colors

    /// Background for selected/highlighted items
    static let selectedBackground = Color(red: 0.957, green: 0.957, blue: 0.957)

    /// Background for hover states
    static let hoverBackground = Color(red: 0.980, green: 0.980, blue: 0.980)

    // MARK: - Helpers

    /// Initialize Color from hex string
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)

        let r, g, b, a: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (r, g, b, a) = ((int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17, 255)
        case 6: // RGB (24-bit)
            (r, g, b, a) = (int >> 16, int >> 8 & 0xFF, int & 0xFF, 255)
        case 8: // ARGB (32-bit)
            (r, g, b, a) = (int >> 24 & 0xFF, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (r, g, b, a) = (0, 0, 0, 255)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
