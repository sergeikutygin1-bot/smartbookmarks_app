import SwiftUI

/// A text editor with markdown formatting toolbar
/// Supports headings, bullet lists, and numbered lists
struct MarkdownTextEditor: View {
    @Binding var text: String
    @FocusState private var isFocused: Bool

    let placeholder: String
    let minHeight: CGFloat

    init(
        text: Binding<String>,
        placeholder: String = "Enter text...",
        minHeight: CGFloat = 100
    ) {
        self._text = text
        self.placeholder = placeholder
        self.minHeight = minHeight
    }

    var body: some View {
        VStack(spacing: 0) {
            // Formatting toolbar
            FormattingToolbar(
                onHeading: { level in
                    insertMarkdown(heading: level)
                },
                onBulletList: {
                    insertMarkdown(bulletList: true)
                },
                onNumberedList: {
                    insertMarkdown(numberedList: true)
                }
            )
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))

            // Text editor
            TextEditor(text: $text)
                .focused($isFocused)
                .frame(minHeight: minHeight)
                .padding(8)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(placeholder)
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 16)
                            .allowsHitTesting(false)
                    }
                }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isFocused ? Color.accentColor : Color(.systemGray4), lineWidth: 1)
        )
    }

    // MARK: - Markdown Insertion Helpers

    private func insertMarkdown(heading level: Int) {
        let prefix = String(repeating: "#", count: level) + " "

        // Get current line
        let lines = text.components(separatedBy: .newlines)
        let currentLineIndex = getCurrentLineIndex()

        guard currentLineIndex < lines.count else { return }

        var newLines = lines
        let currentLine = lines[currentLineIndex]

        // If line already has heading, remove it; otherwise add heading
        if currentLine.hasPrefix("#") {
            // Remove existing heading
            let withoutHeading = currentLine.replacingOccurrences(of: "^#+\\s*", with: "", options: .regularExpression)
            newLines[currentLineIndex] = prefix + withoutHeading
        } else {
            newLines[currentLineIndex] = prefix + currentLine
        }

        text = newLines.joined(separator: "\n")
    }

    private func insertMarkdown(bulletList: Bool) {
        insertListItem(prefix: "- ")
    }

    private func insertMarkdown(numberedList: Bool) {
        insertListItem(prefix: "1. ")
    }

    private func insertListItem(prefix: String) {
        let lines = text.components(separatedBy: .newlines)
        let currentLineIndex = getCurrentLineIndex()

        guard currentLineIndex < lines.count else { return }

        var newLines = lines
        let currentLine = lines[currentLineIndex]

        // If line is empty or doesn't have list prefix, add it
        if currentLine.trimmingCharacters(in: .whitespaces).isEmpty {
            newLines[currentLineIndex] = prefix
        } else if !currentLine.hasPrefix("- ") && !currentLine.hasPrefix("1. ") {
            newLines[currentLineIndex] = prefix + currentLine
        }

        text = newLines.joined(separator: "\n")
    }

    private func getCurrentLineIndex() -> Int {
        // Simple approach: count newlines before cursor
        // In a more sophisticated implementation, we'd track cursor position
        let lines = text.components(separatedBy: .newlines)
        return max(0, lines.count - 1)
    }
}

// MARK: - Formatting Toolbar

struct FormattingToolbar: View {
    let onHeading: (Int) -> Void
    let onBulletList: () -> Void
    let onNumberedList: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Headings dropdown
            Menu {
                Button("Heading 1") { onHeading(1) }
                Button("Heading 2") { onHeading(2) }
                Button("Heading 3") { onHeading(3) }
            } label: {
                Label("Headings", systemImage: "textformat.size")
                    .font(.caption)
                    .foregroundStyle(.primary)
            }

            Divider()
                .frame(height: 20)

            // Bullet list
            Button(action: onBulletList) {
                Label("Bullet List", systemImage: "list.bullet")
                    .font(.caption)
                    .foregroundStyle(.primary)
            }

            // Numbered list
            Button(action: onNumberedList) {
                Label("Numbered List", systemImage: "list.number")
                    .font(.caption)
                    .foregroundStyle(.primary)
            }

            Spacer()
        }
        .labelStyle(.iconOnly)
    }
}

// MARK: - Markdown Display View

/// Displays markdown-formatted text with proper styling
struct MarkdownDisplay: View {
    let markdown: String

    var body: some View {
        // Use AttributedString with markdown support (iOS 15+)
        if let attributedString = try? AttributedString(markdown: markdown, options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            Text(attributedString)
                .textSelection(.enabled)
        } else {
            // Fallback to plain text if markdown parsing fails
            Text(markdown)
                .textSelection(.enabled)
        }
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var text = """
        # Heading 1
        ## Heading 2
        ### Heading 3

        Regular paragraph text here.

        - Bullet point 1
        - Bullet point 2
        - Bullet point 3

        1. Numbered item 1
        2. Numbered item 2
        3. Numbered item 3
        """

        var body: some View {
            VStack(spacing: 20) {
                Text("Editor:")
                    .font(.headline)

                MarkdownTextEditor(
                    text: $text,
                    placeholder: "Enter markdown text...",
                    minHeight: 200
                )
                .padding()

                Divider()

                Text("Preview:")
                    .font(.headline)

                ScrollView {
                    MarkdownDisplay(markdown: text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
            }
            .padding()
        }
    }

    return PreviewWrapper()
}
