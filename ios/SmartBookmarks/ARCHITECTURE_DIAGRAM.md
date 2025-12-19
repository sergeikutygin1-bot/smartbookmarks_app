# Formatting Toolbar Architecture

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                     SwiftUI View                        │
│              (ContentView, BookmarkDetail)              │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ @Binding var text: String
                        ▼
┌─────────────────────────────────────────────────────────┐
│              RichTextEditor (UIViewRepresentable)       │
│  • Wraps UITextView                                     │
│  • Converts markdown ↔ attributed string                │
│  • Manages toolbar lifecycle                            │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────────────┐
│  UITextView  │ │ Coordinator │ │ FormattingToolbar    │
│              │ │             │ │                      │
│ • Input      │ │ • Delegates │ │ • inputAccessoryView │
│ • Display    │ │ • Actions   │ │ • Appears above KB   │
│ • Selection  │ │ • States    │ │                      │
└──────────────┘ └─────────────┘ └──────────────────────┘
```

## Data Flow

### User Types Text

```
User types "hello"
     │
     ▼
UITextView.text = "hello"
     │
     ▼
textViewDidChange() called
     │
     ▼
Coordinator updates parent.text
     │
     ▼
@Binding text updates
     │
     ▼
SwiftUI view refreshes
```

### User Applies Formatting

```
User selects "hello" → taps Bold
     │
     ▼
FormattingToolbar.onBoldTapped() fires
     │
     ▼
Coordinator.toggleFormatting(.bold) called
     │
     ▼
Text range found: NSRange(0, 5)
     │
     ▼
Check if already bold → NO
     │
     ▼
Wrap with markdown: "**hello**"
     │
     ▼
Replace text in UITextView
     │
     ▼
Convert to attributed string
     │
     ▼
Apply bold font + hide asterisks
     │
     ▼
Update toolbar button states
     │
     ▼
Bold button highlights yellow
```

## Markdown Processing Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    Raw Markdown Text                     │
│     "## Heading\n\nThis is **bold** and *italic*."      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│          markdownToAttributedString(_:)                 │
│                                                          │
│  1. Create NSMutableAttributedString from text          │
│  2. Apply base font (16pt system)                       │
│  3. Run regex patterns:                                 │
│     • applyHeadings()  → ^#{1,6}\s+(.+)$               │
│     • applyBold()      → \*\*(.+?)\*\*                 │
│     • applyItalic()    → \*(.+?)\*                     │
│     • applyUnderline() → <u>(.+?)</u>                  │
│     • applyLists()     → ^[-*]\s+|^\d+\.\s+            │
│  4. Hide markdown symbols (tiny font + clear color)     │
│  5. Apply formatting (bold font, italic font, etc.)     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              NSAttributedString (Formatted)             │
│                                                          │
│  Heading                    ← 24pt bold, ## hidden      │
│                                                          │
│  This is bold and italic.   ← formatting applied        │
│                               markdown hidden           │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
                 UITextView displays
```

## Toolbar State Management

```
┌─────────────────────────────────────────────────────────┐
│              Cursor Position Changes                     │
│         (textViewDidChangeSelection)                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│           updateToolbarStates(for:)                     │
│                                                          │
│  1. Get selectedRange from UITextView                   │
│  2. Get attributes at cursor position                   │
│  3. Check font traits:                                  │
│     • .traitBold → isBold = true                        │
│     • .traitItalic → isItalic = true                    │
│  4. Check text attributes:                              │
│     • .underlineStyle → isUnderline = true              │
│  5. Check font size:                                    │
│     • 28pt → style = .title                             │
│     • 24pt → style = .heading                           │
│     • 20pt → style = .subheading                        │
│     • 16pt → style = .body                              │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│   toolbar.updateButtonStates(isBold:isItalic:...)      │
│                                                          │
│  • Bold button → yellow if isBold, gray if not          │
│  • Italic button → yellow if isItalic, gray if not      │
│  • Underline button → yellow if isUnderline, gray if not│
│  • Segmented control → select current style segment     │
└─────────────────────────────────────────────────────────┘
```

## Action Handlers

### Text Style Action

```
User taps "Heading" in segmented control
     │
     ▼
onStyleSelected(.heading) fires
     │
     ▼
applyTextStyle(.heading, to: textView)
     │
     ▼
Find current line range
     │
     ▼
Remove existing heading markers (regex: ^#{1,6}\s*)
     │
     ▼
Add new prefix: "## " + cleanText
     │
     ▼
Replace line in UITextView.text
     │
     ▼
Convert to attributed string
     │
     ▼
Display with 24pt bold font
```

### List Action

```
User taps bullet list button
     │
     ▼
onBulletListTapped() fires
     │
     ▼
toggleList(.bullet, in: textView)
     │
     ▼
Find current line range
     │
     ▼
Check if line starts with "- "
     │
     ├─ YES → Remove list prefix
     │
     └─ NO → Add "- " prefix
     │
     ▼
Replace line in UITextView.text
     │
     ▼
Convert to attributed string
     │
     ▼
Display with bullet and indentation
```

## Component Responsibilities

### FormattingToolbarView (UIKit)
- **UI Rendering**: Dark theme, buttons, segmented control
- **Event Handling**: Tap gestures, button presses
- **Visual Feedback**: Button highlighting, animations
- **State Representation**: Shows current formatting states

### RichTextEditor.Coordinator
- **Delegation**: UITextViewDelegate methods
- **Action Routing**: Routes toolbar actions to text operations
- **State Detection**: Analyzes cursor position and formatting
- **State Synchronization**: Updates toolbar based on text

### RichTextEditor (UIViewRepresentable)
- **UIKit Bridge**: Wraps UITextView for SwiftUI
- **Data Binding**: Syncs text with SwiftUI state
- **Markdown Conversion**: Bidirectional markdown ↔ attributed
- **Lifecycle Management**: Creates/updates UITextView

## Threading & Performance

All operations run on the main thread:
- UITextView updates (main thread required)
- Toolbar state changes (UI updates)
- Regex parsing (fast enough for notes)
- Attributed string creation (synchronous)

For longer documents, consider:
- Debouncing re-renders (500ms delay)
- Incremental parsing (only changed portions)
- Background parsing with main thread updates

## Memory Management

- **Weak References**: Toolbar callbacks use `[weak textView]`
- **Automatic Cleanup**: UIKit handles view lifecycle
- **No Retain Cycles**: Coordinator owned by UIViewRepresentable
- **Efficient Storage**: Attributed string cached in UITextView

## Error Handling

- **Regex Failures**: Silent fallback (no formatting applied)
- **Range Errors**: Guard clauses prevent crashes
- **Invalid Markdown**: Displays as plain text
- **State Sync Issues**: Toolbar shows conservative states
