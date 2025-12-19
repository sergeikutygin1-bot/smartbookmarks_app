import SwiftUI
import UIKit

/// A true WYSIWYG rich text editor (like Apple Notes)
/// Displays formatted text without any markdown symbols visible during editing
/// Stores and exchanges data as markdown, but displays as rich attributed text
struct RichTextEditor: UIViewRepresentable {
    @Binding var text: String
    let placeholder: String

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.font = .systemFont(ofSize: 16)
        textView.backgroundColor = .clear
        textView.textColor = .label
        textView.isScrollEnabled = true
        textView.isEditable = true
        textView.isUserInteractionEnabled = true
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        // Create and attach formatting toolbar
        let toolbar = FormattingToolbarView(frame: CGRect(x: 0, y: 0, width: UIScreen.main.bounds.width, height: 100))

        // Set up toolbar callbacks
        toolbar.onStyleSelected = { [weak textView] style in
            guard let textView = textView else { return }
            context.coordinator.applyTextStyle(style, to: textView)
        }

        toolbar.onBoldTapped = { [weak textView] in
            guard let textView = textView else { return }
            context.coordinator.toggleFormatting(.bold, in: textView)
        }

        toolbar.onItalicTapped = { [weak textView] in
            guard let textView = textView else { return }
            context.coordinator.toggleFormatting(.italic, in: textView)
        }

        toolbar.onUnderlineTapped = { [weak textView] in
            guard let textView = textView else { return }
            context.coordinator.toggleFormatting(.underline, in: textView)
        }

        toolbar.onBulletListTapped = { [weak textView] in
            guard let textView = textView else { return }
            context.coordinator.toggleList(.bullet, in: textView)
        }

        toolbar.onNumberedListTapped = { [weak textView] in
            guard let textView = textView else { return }
            context.coordinator.toggleList(.numbered, in: textView)
        }

        toolbar.onDoneTapped = { [weak textView] in
            textView?.resignFirstResponder()
        }

        textView.inputAccessoryView = toolbar
        context.coordinator.toolbar = toolbar

        // Initial attributed text from markdown
        if !text.isEmpty {
            textView.attributedText = MarkdownConverter.markdownToAttributedString(text)
        }

        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        // Only update if text changed externally (not from user typing)
        if !context.coordinator.isEditing {
            let newAttributedText = MarkdownConverter.markdownToAttributedString(text)
            if uiView.attributedText.string != newAttributedText.string {
                uiView.attributedText = newAttributedText
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UITextViewDelegate {
        var parent: RichTextEditor
        var isEditing = false
        weak var toolbar: FormattingToolbarView?

        init(_ parent: RichTextEditor) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            isEditing = true

            // Convert attributed text to markdown for storage
            let markdown = MarkdownConverter.attributedStringToMarkdown(textView.attributedText)
            parent.text = markdown

            isEditing = false
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            isEditing = true
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            isEditing = false
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            updateToolbarStates(for: textView)
        }

        // MARK: - Toolbar State Updates

        private func updateToolbarStates(for textView: UITextView) {
            let selectedRange = textView.selectedRange
            guard selectedRange.location != NSNotFound,
                  selectedRange.location < textView.textStorage.length else {
                toolbar?.updateButtonStates(isBold: false, isItalic: false, isUnderline: false, style: .body)
                return
            }

            let location = selectedRange.location > 0 ? selectedRange.location - 1 : 0
            let attributes = textView.textStorage.attributes(at: location, effectiveRange: nil)

            // Check bold
            let isBold: Bool
            if let font = attributes[.font] as? UIFont {
                isBold = font.fontDescriptor.symbolicTraits.contains(.traitBold)
            } else {
                isBold = false
            }

            // Check italic
            let isItalic: Bool
            if let font = attributes[.font] as? UIFont {
                isItalic = font.fontDescriptor.symbolicTraits.contains(.traitItalic)
            } else {
                isItalic = false
            }

            // Check underline
            let isUnderline = attributes[.underlineStyle] != nil

            // Determine text style from font size
            let style: FormattingToolbarView.TextStyle
            if let font = attributes[.font] as? UIFont {
                let size = font.pointSize
                if size >= 28 {
                    style = .title
                } else if size >= 24 {
                    style = .heading
                } else if size >= 20 {
                    style = .subheading
                } else {
                    style = .body
                }
            } else {
                style = .body
            }

            toolbar?.updateButtonStates(isBold: isBold, isItalic: isItalic, isUnderline: isUnderline, style: style)
        }

        // MARK: - Formatting Actions

        enum FormattingType {
            case bold, italic, underline
        }

        enum ListType {
            case bullet, numbered
        }

        func applyTextStyle(_ style: FormattingToolbarView.TextStyle, to textView: UITextView) {
            let selectedRange = textView.selectedRange

            // Find the current line
            let lineRange = (textView.text as NSString).lineRange(for: selectedRange)

            // Get current attributes at the start of the line
            let currentAttributes = textView.textStorage.attributes(at: lineRange.location, effectiveRange: nil)

            // Create new font with desired size and weight
            let newFont: UIFont
            if style.isBold {
                newFont = UIFont.boldSystemFont(ofSize: style.fontSize)
            } else {
                newFont = UIFont.systemFont(ofSize: style.fontSize)
            }

            // Apply the font to the entire line
            textView.textStorage.addAttribute(.font, value: newFont, range: lineRange)

            // Trigger change notification
            textViewDidChange(textView)
            updateToolbarStates(for: textView)
        }

        func toggleFormatting(_ type: FormattingType, in textView: UITextView) {
            let selectedRange = textView.selectedRange

            // If no selection, select word at cursor
            var rangeToFormat = selectedRange
            if selectedRange.length == 0 {
                rangeToFormat = findWordRange(at: selectedRange.location, in: textView.textStorage.string)
            }

            guard rangeToFormat.length > 0, rangeToFormat.location + rangeToFormat.length <= textView.textStorage.length else { return }

            // Get current attributes
            let currentAttributes = textView.textStorage.attributes(at: rangeToFormat.location, effectiveRange: nil)
            let currentFont = currentAttributes[.font] as? UIFont ?? UIFont.systemFont(ofSize: 16)

            switch type {
            case .bold:
                let isBold = currentFont.fontDescriptor.symbolicTraits.contains(.traitBold)
                let isItalic = currentFont.fontDescriptor.symbolicTraits.contains(.traitItalic)

                let newFont: UIFont
                if isBold {
                    // Remove bold
                    newFont = isItalic ? UIFont.italicSystemFont(ofSize: currentFont.pointSize) : UIFont.systemFont(ofSize: currentFont.pointSize)
                } else {
                    // Add bold
                    newFont = isItalic ? fontWithTraits(.traitBold, .traitItalic, size: currentFont.pointSize) : UIFont.boldSystemFont(ofSize: currentFont.pointSize)
                }

                textView.textStorage.addAttribute(.font, value: newFont, range: rangeToFormat)

            case .italic:
                let isBold = currentFont.fontDescriptor.symbolicTraits.contains(.traitBold)
                let isItalic = currentFont.fontDescriptor.symbolicTraits.contains(.traitItalic)

                let newFont: UIFont
                if isItalic {
                    // Remove italic
                    newFont = isBold ? UIFont.boldSystemFont(ofSize: currentFont.pointSize) : UIFont.systemFont(ofSize: currentFont.pointSize)
                } else {
                    // Add italic
                    newFont = isBold ? fontWithTraits(.traitBold, .traitItalic, size: currentFont.pointSize) : UIFont.italicSystemFont(ofSize: currentFont.pointSize)
                }

                textView.textStorage.addAttribute(.font, value: newFont, range: rangeToFormat)

            case .underline:
                let isUnderlined = currentAttributes[.underlineStyle] != nil

                if isUnderlined {
                    // Remove underline
                    textView.textStorage.removeAttribute(.underlineStyle, range: rangeToFormat)
                } else {
                    // Add underline
                    textView.textStorage.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: rangeToFormat)
                }
            }

            // Restore selection
            textView.selectedRange = rangeToFormat

            // Trigger change notification
            textViewDidChange(textView)
            updateToolbarStates(for: textView)
        }

        func toggleList(_ type: ListType, in textView: UITextView) {
            let selectedRange = textView.selectedRange

            // Find the current line
            let lineRange = (textView.text as NSString).lineRange(for: selectedRange)
            let lineText = (textView.text as NSString).substring(with: lineRange)

            // Check if line already has a list marker
            let hasBullet = lineText.hasPrefix("• ")
            let hasNumberedList = lineText.range(of: "^\\d+\\.\\s", options: .regularExpression) != nil

            let newText: String
            let cursorOffset: Int

            if (type == .bullet && hasBullet) || (type == .numbered && hasNumberedList) {
                // Remove list marker
                if hasBullet {
                    newText = String(lineText.dropFirst(2))
                    cursorOffset = -2
                } else {
                    // Remove numbered list marker (e.g., "1. ")
                    newText = lineText.replacingOccurrences(of: "^\\d+\\.\\s", with: "", options: .regularExpression)
                    cursorOffset = lineText.count - newText.count
                }
            } else {
                // Add list marker
                let cleanText = lineText
                    .replacingOccurrences(of: "^• ", with: "", options: .regularExpression)
                    .replacingOccurrences(of: "^\\d+\\.\\s", with: "", options: .regularExpression)

                if type == .bullet {
                    newText = "• " + cleanText
                    cursorOffset = 2
                } else {
                    newText = "1. " + cleanText
                    cursorOffset = 3
                }
            }

            // Replace the text
            textView.textStorage.replaceCharacters(in: lineRange, with: newText)

            // Apply paragraph style for proper list indentation
            let newLineRange = NSRange(location: lineRange.location, length: newText.count)
            if newText.hasPrefix("• ") {
                // Calculate exact width of bullet symbol for precise alignment
                let bulletString = "• "
                let bulletAttributes: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 16),
                    .foregroundColor: UIColor.label
                ]
                let bulletSize = (bulletString as NSString).size(withAttributes: bulletAttributes)

                let paragraphStyle = NSMutableParagraphStyle()
                paragraphStyle.firstLineHeadIndent = 0
                paragraphStyle.headIndent = bulletSize.width  // Align wrapped lines with text content
                paragraphStyle.paragraphSpacing = 4
                paragraphStyle.lineSpacing = 0  // No extra spacing between lines in same item
                textView.textStorage.addAttribute(.paragraphStyle, value: paragraphStyle, range: newLineRange)
            } else if newText.range(of: "^\\d+\\.\\s", options: .regularExpression) != nil {
                // Extract the number prefix to calculate its width
                if let regex = try? NSRegularExpression(pattern: "^(\\d+\\.\\s)"),
                   let match = regex.firstMatch(in: newText, range: NSRange(location: 0, length: newText.utf16.count)) {
                    let numberString = (newText as NSString).substring(with: match.range)
                    let numberAttributes: [NSAttributedString.Key: Any] = [
                        .font: UIFont.systemFont(ofSize: 16),
                        .foregroundColor: UIColor.label
                    ]
                    let numberSize = (numberString as NSString).size(withAttributes: numberAttributes)

                    let paragraphStyle = NSMutableParagraphStyle()
                    paragraphStyle.firstLineHeadIndent = 0
                    paragraphStyle.headIndent = numberSize.width  // Align wrapped lines with text content
                    paragraphStyle.paragraphSpacing = 4
                    paragraphStyle.lineSpacing = 0  // No extra spacing between lines in same item
                    textView.textStorage.addAttribute(.paragraphStyle, value: paragraphStyle, range: newLineRange)
                }
            } else {
                // Remove paragraph style if list marker was removed
                textView.textStorage.removeAttribute(.paragraphStyle, range: newLineRange)
            }

            // Restore cursor position
            let newCursorPosition = min(selectedRange.location + cursorOffset, textView.text.count)
            textView.selectedRange = NSRange(location: max(0, newCursorPosition), length: 0)

            // Trigger change notification
            textViewDidChange(textView)
            updateToolbarStates(for: textView)
        }

        // MARK: - Helper Methods

        private func fontWithTraits(_ traits: UIFontDescriptor.SymbolicTraits..., size: CGFloat) -> UIFont {
            var combinedTraits = UIFontDescriptor.SymbolicTraits()
            for trait in traits {
                combinedTraits.insert(trait)
            }

            let descriptor = UIFont.systemFont(ofSize: size).fontDescriptor.withSymbolicTraits(combinedTraits)
            return UIFont(descriptor: descriptor ?? UIFont.systemFont(ofSize: size).fontDescriptor, size: size)
        }

        private func findWordRange(at location: Int, in text: String) -> NSRange {
            let nsText = text as NSString
            var start = location
            var end = location

            // Find word boundaries
            let wordCharacters = CharacterSet.alphanumerics

            while start > 0 {
                let char = nsText.substring(with: NSRange(location: start - 1, length: 1))
                if char.rangeOfCharacter(from: wordCharacters) == nil {
                    break
                }
                start -= 1
            }

            while end < nsText.length {
                let char = nsText.substring(with: NSRange(location: end, length: 1))
                if char.rangeOfCharacter(from: wordCharacters) == nil {
                    break
                }
                end += 1
            }

            return NSRange(location: start, length: end - start)
        }
    }
}

// MARK: - Markdown Converter

/// Handles conversion between Markdown text and NSAttributedString
/// This allows storage as markdown while displaying as rich text
struct MarkdownConverter {

    /// Converts markdown text to attributed string for display (WYSIWYG)
    static func markdownToAttributedString(_ markdown: String) -> NSAttributedString {
        let attributedString = NSMutableAttributedString()

        // Split into lines for processing
        let lines = markdown.components(separatedBy: .newlines)

        for (index, line) in lines.enumerated() {
            let processedLine = processLine(line)
            attributedString.append(processedLine)

            // Add newline after each line except the last
            if index < lines.count - 1 {
                attributedString.append(NSAttributedString(string: "\n"))
            }
        }

        return attributedString
    }

    /// Converts attributed string back to markdown for storage
    static func attributedStringToMarkdown(_ attributedString: NSAttributedString) -> String {
        var markdown = ""
        let fullRange = NSRange(location: 0, length: attributedString.length)

        attributedString.enumerateAttributes(in: fullRange) { attributes, range, _ in
            let substring = (attributedString.string as NSString).substring(with: range)

            // Check for heading level based on font size
            var text = substring
            if let font = attributes[.font] as? UIFont {
                let size = font.pointSize
                let isBold = font.fontDescriptor.symbolicTraits.contains(.traitBold)
                let isItalic = font.fontDescriptor.symbolicTraits.contains(.traitItalic)

                // Add heading markers based on size
                if size >= 28 && isBold {
                    text = "# " + text
                } else if size >= 24 && isBold {
                    text = "## " + text
                } else if size >= 20 && isBold {
                    text = "### " + text
                } else {
                    // Apply inline formatting
                    if isBold && isItalic {
                        text = "***\(text)***"
                    } else if isBold {
                        text = "**\(text)**"
                    } else if isItalic {
                        text = "*\(text)*"
                    }
                }
            }

            // Check for underline
            if attributes[.underlineStyle] != nil {
                text = "<u>\(text)</u>"
            }

            markdown += text
        }

        return markdown
    }

    // MARK: - Private Helpers

    private static func processLine(_ line: String) -> NSAttributedString {
        // Check for heading
        if let headingResult = parseHeading(line) {
            return headingResult
        }

        // Check for list
        if let listResult = parseList(line) {
            return listResult
        }

        // Process inline formatting (bold, italic, underline)
        return processInlineFormatting(line)
    }

    private static func parseHeading(_ line: String) -> NSAttributedString? {
        let pattern = "^(#{1,6})\\s+(.+)$"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: line.utf16.count)),
              match.numberOfRanges >= 3 else {
            return nil
        }

        let hashRange = match.range(at: 1)
        let contentRange = match.range(at: 2)

        let hashCount = (line as NSString).substring(with: hashRange).count
        let content = (line as NSString).substring(with: contentRange)

        // Determine font size based on heading level
        let fontSize: CGFloat
        switch hashCount {
        case 1: fontSize = 28  // # H1
        case 2: fontSize = 24  // ## H2
        case 3: fontSize = 20  // ### H3
        default: fontSize = 18
        }

        let font = UIFont.boldSystemFont(ofSize: fontSize)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.label
        ]

        // Return only the content, not the # markers
        return NSAttributedString(string: content, attributes: attributes)
    }

    private static func parseList(_ line: String) -> NSAttributedString? {
        // Check for bullet list
        if line.hasPrefix("• ") {
            let content = String(line.dropFirst(2))
            let bulletString = "• "

            // Calculate exact width of bullet symbol for precise alignment
            let bulletAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 16),
                .foregroundColor: UIColor.label
            ]
            let bulletSize = (bulletString as NSString).size(withAttributes: bulletAttributes)

            let attributedString = NSMutableAttributedString(string: bulletString, attributes: bulletAttributes)
            attributedString.append(processInlineFormatting(content))

            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.firstLineHeadIndent = 0
            paragraphStyle.headIndent = bulletSize.width  // Align wrapped lines with text content
            paragraphStyle.paragraphSpacing = 4
            paragraphStyle.lineSpacing = 0  // No extra spacing between lines in same item

            let fullRange = NSRange(location: 0, length: attributedString.length)
            attributedString.addAttribute(.paragraphStyle, value: paragraphStyle, range: fullRange)

            return attributedString
        }

        // Check for numbered list
        let numberedPattern = "^(\\d+\\.)\\s+(.+)$"
        if let regex = try? NSRegularExpression(pattern: numberedPattern),
           let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: line.utf16.count)),
           match.numberOfRanges >= 3 {

            let numberRange = match.range(at: 1)
            let contentRange = match.range(at: 2)

            let number = (line as NSString).substring(with: numberRange)
            let content = (line as NSString).substring(with: contentRange)

            let numberString = "\(number) "

            // Calculate exact width of number prefix for precise alignment
            let numberAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 16),
                .foregroundColor: UIColor.label
            ]
            let numberSize = (numberString as NSString).size(withAttributes: numberAttributes)

            let attributedString = NSMutableAttributedString(string: numberString, attributes: numberAttributes)
            attributedString.append(processInlineFormatting(content))

            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.firstLineHeadIndent = 0
            paragraphStyle.headIndent = numberSize.width  // Align wrapped lines with text content
            paragraphStyle.paragraphSpacing = 4
            paragraphStyle.lineSpacing = 0  // No extra spacing between lines in same item

            let fullRange = NSRange(location: 0, length: attributedString.length)
            attributedString.addAttribute(.paragraphStyle, value: paragraphStyle, range: fullRange)

            return attributedString
        }

        // Check for markdown-style lists (- or *)
        if line.hasPrefix("- ") || line.hasPrefix("* ") {
            let content = String(line.dropFirst(2))
            let bulletString = "• "

            // Calculate exact width of bullet symbol for precise alignment
            let bulletAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 16),
                .foregroundColor: UIColor.label
            ]
            let bulletSize = (bulletString as NSString).size(withAttributes: bulletAttributes)

            let attributedString = NSMutableAttributedString(string: bulletString, attributes: bulletAttributes)
            attributedString.append(processInlineFormatting(content))

            let paragraphStyle = NSMutableParagraphStyle()
            paragraphStyle.firstLineHeadIndent = 0
            paragraphStyle.headIndent = bulletSize.width  // Align wrapped lines with text content
            paragraphStyle.paragraphSpacing = 4
            paragraphStyle.lineSpacing = 0  // No extra spacing between lines in same item

            let fullRange = NSRange(location: 0, length: attributedString.length)
            attributedString.addAttribute(.paragraphStyle, value: paragraphStyle, range: fullRange)

            return attributedString
        }

        return nil
    }

    private static func processInlineFormatting(_ text: String) -> NSAttributedString {
        let attributedString = NSMutableAttributedString(string: text)
        let baseFont = UIFont.systemFont(ofSize: 16)
        let fullRange = NSRange(location: 0, length: attributedString.length)
        attributedString.addAttribute(.font, value: baseFont, range: fullRange)
        attributedString.addAttribute(.foregroundColor, value: UIColor.label, range: fullRange)

        // Process bold+italic first (***text***)
        processBoldItalic(in: attributedString)

        // Process bold (**text**)
        processBold(in: attributedString)

        // Process italic (*text*)
        processItalic(in: attributedString)

        // Process underline (<u>text</u>)
        processUnderline(in: attributedString)

        return attributedString
    }

    private static func processBoldItalic(in attributedString: NSMutableAttributedString) {
        let pattern = "\\*\\*\\*(.+?)\\*\\*\\*"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }

        var offset = 0
        let originalString = attributedString.string
        let matches = regex.matches(in: originalString, range: NSRange(location: 0, length: originalString.utf16.count))

        for match in matches {
            guard match.numberOfRanges >= 2 else { continue }

            let fullRange = NSRange(location: match.range.location - offset, length: match.range.length)
            let contentRange = match.range(at: 1)
            let content = (originalString as NSString).substring(with: contentRange)

            // Replace with just the content
            attributedString.replaceCharacters(in: fullRange, with: content)

            // Apply bold+italic font
            let newRange = NSRange(location: fullRange.location, length: content.count)
            let font = fontWithTraits([.traitBold, .traitItalic], size: 16)
            attributedString.addAttribute(.font, value: font, range: newRange)

            offset += (fullRange.length - content.count)
        }
    }

    private static func processBold(in attributedString: NSMutableAttributedString) {
        let pattern = "\\*\\*(.+?)\\*\\*"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }

        var offset = 0
        let originalString = attributedString.string
        let matches = regex.matches(in: originalString, range: NSRange(location: 0, length: originalString.utf16.count))

        for match in matches {
            guard match.numberOfRanges >= 2 else { continue }

            let fullRange = NSRange(location: match.range.location - offset, length: match.range.length)
            let contentRange = match.range(at: 1)
            let content = (originalString as NSString).substring(with: contentRange)

            // Replace with just the content
            attributedString.replaceCharacters(in: fullRange, with: content)

            // Apply bold font
            let newRange = NSRange(location: fullRange.location, length: content.count)
            let currentFont = attributedString.attribute(.font, at: newRange.location, effectiveRange: nil) as? UIFont ?? UIFont.systemFont(ofSize: 16)
            let boldFont = UIFont.boldSystemFont(ofSize: currentFont.pointSize)
            attributedString.addAttribute(.font, value: boldFont, range: newRange)

            offset += (fullRange.length - content.count)
        }
    }

    private static func processItalic(in attributedString: NSMutableAttributedString) {
        let pattern = "(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }

        var offset = 0
        let originalString = attributedString.string
        let matches = regex.matches(in: originalString, range: NSRange(location: 0, length: originalString.utf16.count))

        for match in matches {
            guard match.numberOfRanges >= 2 else { continue }

            let fullRange = NSRange(location: match.range.location - offset, length: match.range.length)
            let contentRange = match.range(at: 1)
            let content = (originalString as NSString).substring(with: contentRange)

            // Replace with just the content
            attributedString.replaceCharacters(in: fullRange, with: content)

            // Apply italic font
            let newRange = NSRange(location: fullRange.location, length: content.count)
            let currentFont = attributedString.attribute(.font, at: newRange.location, effectiveRange: nil) as? UIFont ?? UIFont.systemFont(ofSize: 16)
            let italicFont = UIFont.italicSystemFont(ofSize: currentFont.pointSize)
            attributedString.addAttribute(.font, value: italicFont, range: newRange)

            offset += (fullRange.length - content.count)
        }
    }

    private static func processUnderline(in attributedString: NSMutableAttributedString) {
        let pattern = "<u>(.+?)</u>"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }

        var offset = 0
        let originalString = attributedString.string
        let matches = regex.matches(in: originalString, range: NSRange(location: 0, length: originalString.utf16.count))

        for match in matches {
            guard match.numberOfRanges >= 2 else { continue }

            let fullRange = NSRange(location: match.range.location - offset, length: match.range.length)
            let contentRange = match.range(at: 1)
            let content = (originalString as NSString).substring(with: contentRange)

            // Replace with just the content
            attributedString.replaceCharacters(in: fullRange, with: content)

            // Apply underline style
            let newRange = NSRange(location: fullRange.location, length: content.count)
            attributedString.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: newRange)

            offset += (fullRange.length - content.count)
        }
    }

    private static func fontWithTraits(_ traits: [UIFontDescriptor.SymbolicTraits], size: CGFloat) -> UIFont {
        var combinedTraits = UIFontDescriptor.SymbolicTraits()
        for trait in traits {
            combinedTraits.insert(trait)
        }

        let descriptor = UIFont.systemFont(ofSize: size).fontDescriptor.withSymbolicTraits(combinedTraits)
        return UIFont(descriptor: descriptor ?? UIFont.systemFont(ofSize: size).fontDescriptor, size: size)
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var text = """
        ## Overview

        This article investigates the **surface diffusion** and **entrapment efficiency** of **O2** in **amorphous solid water (ASW)**.

        ### Key Points

        - First bullet point with *italic text*
        - Second point with **bold text**
        - Third point with <u>underlined text</u>
        """

        var body: some View {
            VStack(spacing: 20) {
                Text("Rich Text Editor:")
                    .font(.headline)

                RichTextEditor(text: $text, placeholder: "Enter text...")
                    .frame(height: 300)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Divider()

                Text("Stored as Markdown:")
                    .font(.headline)

                Text(text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
        }
    }

    return PreviewWrapper()
}
