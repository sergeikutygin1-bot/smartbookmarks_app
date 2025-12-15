# Smart Bookmarks iOS App

Native iOS app for Smart Bookmarks built with Swift and SwiftUI.

## Setup Instructions

### 1. Create Xcode Project

Since Xcode projects are best created through Xcode's GUI, follow these steps:

1. Open Xcode
2. Click "Create New Project"
3. Select **iOS → App**
4. Configure the project:
   - **Product Name**: `SmartBookmarks`
   - **Team**: Select your development team
   - **Organization Identifier**: `com.vibecoding` (or your own)
   - **Bundle Identifier**: `com.vibecoding.smartbookmarks`
   - **Interface**: SwiftUI
   - **Language**: Swift
   - **Storage**: None (we don't need Core Data)
   - **Include Tests**: Yes (optional)
5. **Save location**: Choose the `/ios` directory in this repository

### 2. Add Source Files to Xcode

After creating the project:

1. In Xcode, **delete** the default `SmartBookmarksApp.swift` and `ContentView.swift` files
2. Drag the **entire `SmartBookmarks` folder** from Finder into your Xcode project navigator
3. When prompted, select:
   - ✅ "Copy items if needed" (uncheck this - files are already in the right place)
   - ✅ "Create groups"
   - ✅ Add to target: SmartBookmarks

Your project structure should now match:
```
SmartBookmarks/
├── App/
│   ├── SmartBookmarksApp.swift
│   └── ContentView.swift
├── Config/
│   └── Config.swift
├── Models/
│   ├── Bookmark.swift
│   ├── ContentType.swift
│   ├── EnrichmentJob.swift
│   ├── EnrichmentResult.swift
│   └── APIResponse.swift
├── Services/
│   ├── MockAPIClient.swift
│   └── APIClient.swift (coming soon)
├── ViewModels/
│   └── (coming soon)
├── Views/
│   └── (coming soon)
├── Extensions/
│   └── (coming soon)
└── Resources/
```

### 3. Configure Project Settings

#### Minimum iOS Version
1. Select your project in the navigator
2. Under **Deployment Info**
3. Set **Minimum Deployments** to **iOS 17.0**

#### App Groups (for Share Extension later)
1. Select the **SmartBookmarks** target
2. Go to **Signing & Capabilities**
3. Click **+ Capability**
4. Add **App Groups**
5. Click **+** and add: `group.com.vibecoding.smartbookmarks`

### 4. Update Backend URLs for Device Testing

If testing on a physical device (not simulator), update `Config.swift`:

```swift
// Find your Mac's local IP:
// System Settings → Network → Wi-Fi → Details → TCP/IP

static var apiBaseURL: String {
    #if DEBUG
    return "http://192.168.1.XXX:3000/api"  // ← Change this
    #else
    return "https://api.smartbookmarks.com/api"
    #endif
}
```

### 5. Build and Run

#### Using Mock Data (No Backend Needed)
The app currently uses `MockAPIClient` which simulates backend responses. You can develop the entire UI without running the backend.

#### Connecting to Real Backend
Once the backend is running on ports 3000 and 3002:
1. Replace `MockAPIClient` with `APIClient` in the ViewModels
2. Ensure your Mac's firewall allows incoming connections
3. Update `Config.swift` with your Mac's IP address (for device testing)

## Development Status

### ✅ Completed
- [x] Directory structure
- [x] Core models (Bookmark, ContentType, EnrichmentResult, etc.)
- [x] Configuration with backend URLs
- [x] Mock API Client with simulated enrichment

### 🚧 In Progress
- [ ] Real API Client with job polling
- [ ] ViewModels (BookmarkList, BookmarkDetail, AddBookmark)
- [ ] SwiftUI Views (List, Detail, Components)
- [ ] Extensions (Date, Color, String)

### 📋 To Do
- [ ] Share Extension
- [ ] Haptic feedback
- [ ] Context menus
- [ ] iPad optimization
- [ ] Offline support (Phase 2)

## Architecture

- **Pattern**: MVVM (Model-View-ViewModel)
- **Concurrency**: Swift async/await with actors
- **UI**: SwiftUI with Apple Notes-inspired minimal design
- **Networking**: Native URLSession (no third-party dependencies)
- **State Management**: @StateObject and @Published for reactive UI

## Key Features

1. **Auto-Save**: Edits save automatically after 500ms debounce
2. **AI Enrichment**: Job-based enrichment with progress tracking
3. **Search**: Real-time filtering (semantic search when backend connected)
4. **Inline Editing**: Click any field to edit directly (no separate edit mode)

## Testing

### Simulator
```bash
# Build and run
⌘ + R in Xcode
```

### Physical Device
1. Connect iPhone/iPad via USB
2. Select device from scheme selector
3. Trust developer certificate when prompted
4. Update `Config.swift` with your Mac's local IP

## Troubleshooting

### "No devices found"
- Ensure Xcode Command Line Tools are installed: `xcode-select --install`
- Restart Xcode

### "Cannot connect to backend"
- Check backend is running: `curl http://localhost:3000/health`
- Check firewall settings allow connections
- Use Mac's local IP, not localhost, for device testing

### "Build failed"
- Clean build folder: **Product → Clean Build Folder** (⇧⌘K)
- Restart Xcode
- Check all Swift files are added to the target

## Next Steps

1. ✅ Create Xcode project (follow instructions above)
2. ⏳ I'll continue building ViewModels and Views
3. ⏳ Test with mock data
4. ⏳ Connect to real backend when ready

---

**Questions?** Refer to `docs/iOS_Development_Plan.MD` for the full implementation plan.
