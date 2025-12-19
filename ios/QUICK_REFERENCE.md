# Formatting Toolbar Quick Reference

## File Locations

All files are in `/ios/SmartBookmarks/SmartBookmarks/Views/`

### Core Implementation
- **FormattingToolbarView.swift** - Toolbar UI component (285 lines)
- **RichTextEditor.swift** - Rich text editor with toolbar (531 lines)
- **FormattingToolbarDemo.swift** - Demo/test view (178 lines)

### Documentation
- **FORMATTING_TOOLBAR_README.md** - Complete documentation
- **ARCHITECTURE_DIAGRAM.md** - Architecture diagrams
- **IMPLEMENTATION_SUMMARY.md** - Summary of changes
- **QUICK_REFERENCE.md** - This file

## Key Code Snippets

### 1. Using the Editor

```swift
import SwiftUI

struct MyView: View {
    @State private var text = "# Hello World"
    
    var body: some View {
        RichTextEditor(
            text: $text,
            placeholder: "Enter text..."
        )
        .frame(minHeight: 200)
    }
}
```

### 2. Accessing Toolbar Properties

```swift
// Text styles
FormattingToolbarView.TextStyle.title      // 28pt bold, "# "
FormattingToolbarView.TextStyle.heading    // 24pt bold, "## "
FormattingToolbarView.TextStyle.subheading // 20pt bold, "### "
FormattingToolbarView.TextStyle.body       // 16pt regular

// Style properties
style.fontSize      // CGFloat (28, 24, 20, 16)
style.isBold        // Bool
style.markdownPrefix // String ("# ", "## ", "### ", "")
```

### 3. Markdown Syntax Supported

```swift
// Headings
"# Title"       // 28pt bold
"## Heading"    // 24pt bold
"### Subheading" // 20pt bold

// Formatting
"**bold text**"        // Bold
"*italic text*"        // Italic
"<u>underlined</u>"    // Underline

// Lists
"- Bullet item"        // Bullet list
"1. Numbered item"     // Numbered list
```

### 4. Custom Toolbar Setup

```swift
let toolbar = FormattingToolbarView()

toolbar.onStyleSelected = { style in
    print("Style: \(style.displayName)")
}

toolbar.onBoldTapped = {
    print("Bold tapped")
}

toolbar.updateButtonStates(
    isBold: true,
    isItalic: false,
    isUnderline: false,
    style: .heading
)
```

### 5. Markdown Conversion

```swift
// Convert markdown to attributed string
let attributed = RichTextEditor.markdownToAttributedString(
    "## Heading\n\nThis is **bold**."
)

// Convert attributed string back to markdown
let markdown = RichTextEditor.attributedStringToMarkdown(attributed)
```

## Common Use Cases

### 1. Replace TextEditor

**Before:**
```swift
TextEditor(text: $bookmark.notes)
    .frame(height: 200)
```

**After:**
```swift
RichTextEditor(text: $bookmark.notes, placeholder: "Add notes...")
    .frame(height: 200)
```

### 2. In a Form

```swift
Form {
    Section("Description") {
        RichTextEditor(
            text: $viewModel.description,
            placeholder: "Enter description..."
        )
        .frame(minHeight: 150)
    }
}
```

### 3. Full Screen Editor

```swift
struct EditorView: View {
    @State private var text = ""
    
    var body: some View {
        NavigationView {
            RichTextEditor(text: $text, placeholder: "Start typing...")
                .navigationTitle("Notes")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}
```

## Toolbar Customization

### Colors (in FormattingToolbarView.swift)

```swift
// Background colors
backgroundColor = UIColor(white: 0.15, alpha: 1.0)  // Main toolbar
buttonBackground = UIColor(white: 0.2, alpha: 1.0)  // Buttons

// Active state
selectedColor = UIColor.systemYellow  // Active button highlight

// Text colors
normalTextColor = UIColor.white  // Inactive buttons
activeTextColor = UIColor.black  // Active buttons
```

### Dimensions

```swift
// Toolbar
height: 100pt
padding: 16pt (horizontal), 12pt (vertical)

// Segmented control
height: 32pt

// Buttons
height: 40pt
spacing: 12pt
cornerRadius: 8pt
```

## Debugging Tips

### 1. View Raw Markdown

Add this to see the markdown while editing:

```swift
VStack {
    RichTextEditor(text: $text, placeholder: "...")
    
    Text(text)
        .font(.caption)
        .foregroundStyle(.secondary)
}
```

### 2. Check Toolbar State

Print button states in coordinator:

```swift
private func updateToolbarStates(for textView: UITextView) {
    // ... existing code ...
    
    print("Bold: \(isBold), Italic: \(isItalic), Style: \(style)")
    
    toolbar?.updateButtonStates(...)
}
```

### 3. Debug Formatting Actions

Add logging to formatting methods:

```swift
func toggleFormatting(_ type: FormattingType, in textView: UITextView) {
    print("Toggle \(type) - Range: \(textView.selectedRange)")
    // ... rest of code ...
}
```

## Performance Optimization

### For Long Documents

If you notice lag with very long documents:

1. **Debounce re-renders:**

```swift
private var updateTimer: Timer?

func textViewDidChange(_ textView: UITextView) {
    updateTimer?.invalidate()
    updateTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in
        // Update markdown
    }
}
```

2. **Limit maximum length:**

```swift
func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    let newLength = textView.text.count + text.count - range.length
    return newLength <= 10000  // Limit to 10k chars
}
```

## Testing Checklist

- [ ] Toolbar appears above keyboard when editing
- [ ] Text styles work (Title, Heading, Subheading, Body)
- [ ] Bold formatting works (toggle on/off)
- [ ] Italic formatting works (toggle on/off)
- [ ] Underline formatting works (toggle on/off)
- [ ] Bullet lists work
- [ ] Numbered lists work
- [ ] Button states update when cursor moves
- [ ] Segmented control reflects current style
- [ ] Markdown symbols are hidden in display
- [ ] Text remains formatted after save/reload
- [ ] Works on iPhone and iPad
- [ ] Works in light and dark mode

## Troubleshooting

### Toolbar doesn't appear
- Check that `inputAccessoryView` is set on UITextView
- Verify keyboard is showing (tap in text field)

### Formatting not applying
- Check that text is selected or cursor is in text
- Verify markdown syntax is correct
- Check regex patterns in markdown conversion

### Button states not updating
- Verify `textViewDidChangeSelection` is called
- Check that toolbar reference is not nil
- Ensure attributes are read correctly

### Text not saving
- Verify `@Binding` is connected correctly
- Check that parent view updates on text changes
- Ensure markdown conversion preserves text

## Next Features to Add

- Strikethrough support
- Text color picker
- Highlight background color
- Link insertion UI
- Code block formatting
- Table support
- Indent/outdent for lists
- Multi-line operations
- Custom keyboard shortcuts

## Contact & Support

For issues or questions:
1. Check FORMATTING_TOOLBAR_README.md for detailed docs
2. Review ARCHITECTURE_DIAGRAM.md for implementation details
3. Run FormattingToolbarDemo for a working example
4. Check Xcode console for error messages
