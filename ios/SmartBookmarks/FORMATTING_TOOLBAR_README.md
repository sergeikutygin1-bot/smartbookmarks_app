# Apple Notes-Style Formatting Toolbar

A comprehensive, fully functional formatting toolbar for the Smart Bookmarks iOS app, closely matching Apple Notes functionality and design.

## Overview

This implementation provides a rich text editing experience with a dark-themed toolbar that appears above the keyboard, featuring text style controls and formatting buttons with active state highlighting.

## Features

### Text Style Controls (Segmented Control)
- **Body** (16pt, regular) - Default text style
- **Title** (28pt, bold) - Large title for main headings (`# `)
- **Heading** (24pt, bold) - Section headings (`## `)
- **Subheading** (20pt, bold) - Subsection headings (`### `)

### Formatting Buttons
- **Bold (B)** - Toggles bold formatting (`**text**`)
- **Italic (I)** - Toggles italic formatting (`*text*`)
- **Underline (U)** - Toggles underline formatting (`<u>text</u>`)
- **Bullet List** - Creates/removes bullet points (`- item`)
- **Numbered List** - Creates/removes numbered lists (`1. item`)

## Architecture

### Components

#### 1. FormattingToolbarView.swift
A UIKit-based toolbar component with:
- Dark theme (matches Apple Notes)
- Segmented control for text styles
- Individual formatting buttons
- Active state management (yellow highlight for selected formatting)
- Smooth animations and visual feedback

**Key Features:**
- Button state tracking (bold, italic, underline)
- Style detection from current text
- Callback-based architecture for action handling
- SwiftUI wrapper (`FormattingToolbarRepresentable`)

#### 2. RichTextEditor.swift (Enhanced)
The main text editor with integrated toolbar:
- UITextView-based rich text editing
- Markdown-to-AttributedString conversion (WYSIWYG)
- Toolbar integration via `inputAccessoryView`
- Real-time formatting detection and button state updates
- Smart text manipulation (word selection, line operations)

**Key Capabilities:**
- Applies formatting to selected text or word at cursor
- Toggles formatting on/off (press button twice to remove)
- Updates toolbar button states based on cursor position
- Maintains markdown syntax while displaying formatted text

### How It Works

#### Formatting Flow
1. User selects text or places cursor
2. User taps formatting button (e.g., Bold)
3. Coordinator applies markdown syntax (`**text**`)
4. Text is re-rendered with WYSIWYG formatting (markdown hidden)
5. Toolbar button highlights to show active state

#### Text Style Flow
1. User places cursor on a line
2. User selects style (e.g., Heading)
3. Coordinator adds markdown prefix (`## `) to line
4. Text re-renders with larger, bold font
5. Segmented control updates to show current style

#### State Management
- Toolbar states update on:
  - Text changes (`textViewDidChange`)
  - Selection changes (`textViewDidChangeSelection`)
  - Formatting actions
- Button highlighting reflects current text formatting
- Segmented control shows style of text at cursor

## File Structure

```
ios/SmartBookmarks/SmartBookmarks/Views/
├── FormattingToolbarView.swift       # Toolbar UI component (UIKit)
├── RichTextEditor.swift              # Rich text editor with toolbar integration
├── FormattingToolbarDemo.swift       # Demo/test view
└── MarkdownTextEditor.swift          # Legacy editor (not used)
```

## Usage

### Basic Implementation

```swift
import SwiftUI

struct ContentView: View {
    @State private var text = "# Hello World\n\nThis is **bold** text."

    var body: some View {
        RichTextEditor(
            text: $text,
            placeholder: "Start typing..."
        )
        .padding()
    }
}
```

### In a Form

```swift
Form {
    Section("Notes") {
        RichTextEditor(
            text: $bookmark.notes,
            placeholder: "Add notes..."
        )
        .frame(minHeight: 200)
    }
}
```

## Markdown Syntax Supported

| Formatting | Markdown | Display |
|------------|----------|---------|
| Title | `# Text` | Large, bold (28pt) |
| Heading | `## Text` | Bold (24pt) |
| Subheading | `### Text` | Bold (20pt) |
| Bold | `**text**` | Bold text |
| Italic | `*text*` | Italic text |
| Underline | `<u>text</u>` | Underlined text |
| Bullet List | `- item` | • item (indented) |
| Numbered List | `1. item` | 1. item (indented) |

## Visual Design

### Color Palette
- **Toolbar Background**: Dark gray (`UIColor(white: 0.15, alpha: 1.0)`)
- **Button Background**: Dark gray (`UIColor(white: 0.2, alpha: 1.0)`)
- **Button Text**: White (inactive), Black (active)
- **Active Highlight**: Yellow (`UIColor.systemYellow`)
- **Segmented Control**: Dark with yellow active segment

### Typography
- **Toolbar Buttons**: System font, 18pt
- **Segmented Control**: System font, 13pt (medium weight)

### Spacing & Layout
- Toolbar Height: 100pt
- Button Size: 40pt height
- Button Spacing: 12pt
- Corner Radius: 8pt
- Padding: 16pt (horizontal), 12pt (vertical)

## Behavioral Details

### Smart Selection
- If no text is selected when formatting is applied:
  - Editor selects the word at cursor
  - Applies formatting to that word
  - Maintains cursor position

### Toggle Behavior
- Pressing formatting button twice removes formatting
- Example: `**bold**` → `bold` → `**bold**`

### Line Operations
- Text styles and lists operate on entire lines
- Cursor can be anywhere on the line
- Multiple list items can be created by pressing Enter

### State Synchronization
- Toolbar buttons reflect current text formatting
- Segmented control shows style of text at cursor
- States update in real-time as cursor moves

## Testing

### Run the Demo
1. Open `FormattingToolbarDemo.swift` in Xcode
2. Run in simulator or device
3. Tap in the editor to see toolbar above keyboard
4. Test all formatting options
5. Observe raw markdown in bottom panel

### Preview in Xcode
- Open `FormattingToolbarView.swift`
- Use Canvas Preview to see toolbar component
- Test button interactions in preview

## Implementation Highlights

### 1. Markdown Hiding
The editor hides markdown syntax visually while keeping it in the actual text:
- Hash marks (`#`) shown tiny and gray
- Asterisks (`**`, `*`) rendered invisible
- HTML tags (`<u>`, `</u>`) hidden
- User sees formatted text, not markdown

### 2. Real-time Formatting
Text is re-rendered after every change:
- User types → markdown updated → text re-rendered
- Cursor position preserved during re-rendering
- Smooth, lag-free editing experience

### 3. Context-Aware Buttons
Buttons show active state based on cursor position:
- Move cursor to bold text → B button highlights
- Move to heading → Heading segment selects
- Multiple formats → all relevant buttons highlight

### 4. Keyboard Integration
Toolbar attached via `inputAccessoryView`:
- Appears automatically with keyboard
- Moves with keyboard animations
- Dismisses with keyboard
- Native iOS feel

## Known Limitations

1. **Multiple Lines**: Formatting applies to single line or selection (no multi-line toggle)
2. **Complex Markdown**: Only supports basic markdown (no tables, code blocks, images)
3. **Underline Syntax**: Uses HTML `<u>` tags (not standard markdown)
4. **Undo/Redo**: Standard iOS undo/redo works but may not be perfect with complex edits

## Future Enhancements

- [ ] Strikethrough support
- [ ] Text color/highlighting
- [ ] Code blocks with syntax highlighting
- [ ] Link insertion UI
- [ ] Image/attachment support
- [ ] Table creation
- [ ] Indent/outdent for nested lists
- [ ] Multi-line formatting operations
- [ ] Custom keyboard shortcuts
- [ ] Accessibility improvements (VoiceOver support)

## Performance Considerations

- Regex-based markdown parsing is optimized for short-to-medium documents
- Re-rendering on every keystroke is acceptable for notes (< 10,000 characters)
- For very long documents, consider:
  - Debouncing re-renders
  - Incremental parsing
  - Virtual scrolling

## Accessibility

Current accessibility features:
- All buttons are tappable with minimum 40pt height
- High contrast dark theme
- Clear visual feedback on button press
- System font scaling support

Recommended additions:
- VoiceOver labels for all buttons
- Accessibility hints for formatting actions
- Dynamic Type support for toolbar
- Voice Control compatibility

## Credits

Implementation inspired by:
- Apple Notes app (iOS)
- UITextView with NSAttributedString
- Markdown-based note-taking apps

## License

Part of the Smart Bookmarks project.
