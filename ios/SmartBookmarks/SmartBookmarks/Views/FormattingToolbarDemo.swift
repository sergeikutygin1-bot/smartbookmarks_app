import SwiftUI

/// Demo view showcasing the RichTextEditor with formatting toolbar
struct FormattingToolbarDemo: View {
    @State private var richText = """
    # Welcome to Rich Text Editor

    This editor supports **Apple Notes-style formatting** with a comprehensive toolbar!

    ## Features

    ### Text Styles
    You can apply different text styles:
    - Title (28pt, bold)
    - Heading (24pt, bold)
    - Subheading (20pt, bold)
    - Body (16pt, regular)

    ### Formatting Options
    Try these formatting options:
    - **Bold text** - Use the B button
    - *Italic text* - Use the I button
    - <u>Underlined text</u> - Use the U button

    ### Lists
    Create bullet lists:
    - First item
    - Second item
    - Third item

    Or numbered lists:
    1. Step one
    2. Step two
    3. Step three

    ## How to Use

    1. **Select text** to apply formatting
    2. **Tap a style button** (Title, Heading, Subheading, Body) to change text size
    3. **Tap formatting buttons** (B, I, U) to toggle formatting
    4. **Tap list buttons** to create lists
    5. Press button again to remove formatting

    The toolbar appears above the keyboard when editing!
    """

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Instructions
                instructionsSection

                Divider()

                // Rich Text Editor
                RichTextEditor(
                    text: $richText,
                    placeholder: "Start typing to see the formatting toolbar..."
                )
                .background(Color(.systemBackground))

                Divider()

                // Raw Markdown View (for debugging)
                rawMarkdownSection
            }
            .navigationTitle("Formatting Toolbar Demo")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var instructionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Apple Notes-Style Formatting Toolbar")
                .font(.headline)
                .foregroundColor(.primary)

            Text("Tap in the editor to see the toolbar above the keyboard")
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack(spacing: 16) {
                FeatureBadge(icon: "textformat.size", label: "4 Styles")
                FeatureBadge(icon: "bold", label: "Bold")
                FeatureBadge(icon: "italic", label: "Italic")
                FeatureBadge(icon: "underline", label: "Underline")
                FeatureBadge(icon: "list.bullet", label: "Lists")
            }
        }
        .padding()
        .background(Color(.systemGray6))
    }

    private var rawMarkdownSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Raw Markdown")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.secondary)

                    Spacer()

                    Button(action: {
                        UIPasteboard.general.string = richText
                    }) {
                        Label("Copy", systemImage: "doc.on.doc")
                            .font(.caption)
                    }
                }

                Text(richText)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.secondary)
                    .textSelection(.enabled)
            }
            .padding()
        }
        .frame(maxHeight: 150)
        .background(Color(.systemGray6))
    }
}

struct FeatureBadge: View {
    let icon: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.blue)

            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Preview

#Preview {
    FormattingToolbarDemo()
}

// MARK: - Standalone Toolbar Test

#Preview("Toolbar Component") {
    VStack {
        Text("Formatting Toolbar Preview")
            .font(.headline)
            .padding()

        FormattingToolbarRepresentable(
            onStyleSelected: { style in
                print("Style selected: \(style.displayName)")
            },
            onBoldTapped: {
                print("Bold tapped")
            },
            onItalicTapped: {
                print("Italic tapped")
            },
            onUnderlineTapped: {
                print("Underline tapped")
            },
            onBulletListTapped: {
                print("Bullet list tapped")
            },
            onNumberedListTapped: {
                print("Numbered list tapped")
            }
        )
        .frame(height: 100)
        .padding()

        Spacer()
    }
}
