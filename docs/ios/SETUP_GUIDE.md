# Smart Bookmarks iOS - Complete Setup Guide

This guide will walk you through setting up the Xcode project step-by-step.

## Prerequisites

- macOS 14.0 or later
- Xcode 15.0 or later
- Apple Developer account (for device testing)

## Step-by-Step Setup

### Step 1: Open Xcode

1. Launch **Xcode** from your Applications folder
2. If prompted, install additional components

### Step 2: Create New Xcode Project

1. In Xcode's welcome window, click **"Create New Project"**
   - Or go to **File → New → Project...** (⇧⌘N)

2. **Choose Template:**
   - Select **iOS** tab at the top
   - Choose **App** template
   - Click **Next**

### Step 3: Configure Project Settings

Fill in the following details:

| Field | Value |
|-------|-------|
| **Product Name** | `SmartBookmarks` |
| **Team** | Select your Apple Developer team |
| **Organization Identifier** | `com.vibecoding` (or your own) |
| **Bundle Identifier** | `com.vibecoding.smartbookmarks` (auto-filled) |
| **Interface** | **SwiftUI** |
| **Language** | **Swift** |
| **Storage** | None (uncheck "Use Core Data") |
| **Include Tests** | ✓ (optional but recommended) |

Click **Next**

### Step 4: Choose Location

**IMPORTANT:** Save the project in the correct location:

1. Navigate to: `/Users/sergeykutygin/Desktop/vibecoding/smart_bookmarks_v2/ios`
2. Click **Create**

Your project structure should now look like:
```
ios/
├── SmartBookmarks/          # Source files we created
├── SmartBookmarks.xcodeproj # Xcode project (just created)
└── README.md
```

### Step 5: Clean Up Default Files

Xcode created some default files we don't need:

1. In the **Project Navigator** (left sidebar), find these files:
   - `ContentView.swift` (in the default location)
   - `SmartBookmarksApp.swift` (in the default location)

2. **Delete them:**
   - Right-click → **Delete**
   - Choose **"Move to Trash"** (not just "Remove Reference")

### Step 6: Add Our Source Files

Now we'll add all the Swift files we created:

1. **Open Finder** and navigate to:
   ```
   /Users/sergeykutygin/Desktop/vibecoding/smart_bookmarks_v2/ios/SmartBookmarks
   ```

2. **Drag the entire `SmartBookmarks` folder** into Xcode's Project Navigator
   - Drag it onto the **SmartBookmarks** project (blue icon at the top)

3. **Configure Import Settings:**
   When the dialog appears, set:
   - ☐ **Copy items if needed** → UNCHECK (files are already in the right place)
   - ● **Create groups** → SELECT THIS
   - ✓ **Add to targets: SmartBookmarks** → CHECK THIS

4. Click **Finish**

### Step 7: Verify File Structure

Your Project Navigator should now show:

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
│   └── APIClient.swift
├── ViewModels/
│   ├── BookmarkListViewModel.swift
│   ├── BookmarkDetailViewModel.swift
│   └── AddBookmarkViewModel.swift
├── Extensions/
│   ├── Date+Extensions.swift
│   ├── Color+Extensions.swift
│   └── String+Extensions.swift
└── Preview Content/
    └── Preview Assets.xcassets
```

### Step 8: Configure Build Settings

1. Click on the **SmartBookmarks** project (blue icon) in the Navigator
2. Select the **SmartBookmarks** target
3. Go to **General** tab

**Set Deployment Info:**
- **Minimum Deployments:** iOS **17.0**
- **iPhone Orientation:** Portrait (primary)
- **iPad Orientation:** All checked

**Identity:**
- **Display Name:** Smart Bookmarks
- **Bundle Identifier:** com.vibecoding.smartbookmarks

### Step 9: Add App Groups Capability

For future Share Extension support:

1. Still in the **SmartBookmarks** target
2. Go to **Signing & Capabilities** tab
3. Click **+ Capability** button
4. Search for and add **App Groups**
5. Click the **+** button under App Groups
6. Enter: `group.com.vibecoding.smartbookmarks`
7. Check the checkbox next to it

### Step 10: Configure Signing

1. Still in **Signing & Capabilities** tab
2. Under **Signing**:
   - ✓ **Automatically manage signing**
   - **Team:** Select your Apple Developer team

### Step 11: Build the Project

1. Select a simulator from the scheme selector:
   - Click the device menu next to the Play button
   - Choose **iPhone 15 Pro** (or any recent iPhone)

2. **Build and Run:**
   - Press **⌘R** or click the Play button
   - Wait for the build to complete

### Step 12: First Launch! 🎉

The app should launch in the simulator and show:
- 4 sample bookmarks in the list
- Working search
- Add bookmark button
- Full UI with mock data

## Troubleshooting

### Build Failed: "No such module 'Foundation'"

**Fix:** Clean the build folder
- **Product → Clean Build Folder** (⇧⌘K)
- Build again (⌘B)

### Build Failed: "Cannot find type 'BookmarkAPIProtocol'"

**Fix:** Make sure all files are added to the target
1. Select each `.swift` file
2. Check **File Inspector** (right sidebar)
3. Verify **Target Membership** has ✓ next to SmartBookmarks

### Simulator Not Showing

**Fix:** Reset simulator
- **Window → Devices and Simulators**
- Select your simulator
- Click the action menu → **Erase All Content and Settings**

### Files Show as Missing (Red)

**Fix:** Re-add files
1. Right-click on the missing file → **Delete** → **Remove Reference**
2. Re-drag the file from Finder into Xcode

## Testing the App

### Test Bookmark List
1. You should see 4 sample bookmarks
2. Try searching for "paul" or "youtube"
3. Pull down to refresh

### Test Add Bookmark
1. Click the **+** button
2. Paste a URL: `https://example.com/test`
3. Click **Add**
4. New bookmark appears at the top

### Test Enrichment
1. Click on a bookmark to open detail view
2. Click the **"Enrich"** button with sparkles ✨
3. Watch the progress:
   - "Queuing..." → "Extracting..." → "Analyzing..." → "Tagging..." → "Embedding..." → "Enriched"
4. Takes ~6.5 seconds (simulated)
5. Fields auto-populate with mock data

### Test Auto-Save
1. Edit the title or summary
2. Wait 500ms
3. See "Saving..." then "Saved" in toolbar

## Next Steps

### For Physical Device Testing

1. Connect your iPhone/iPad via USB
2. Select it from the device menu
3. Trust the certificate when prompted
4. **Update Config.swift:**
   - Find your Mac's IP: **System Settings → Network → Wi-Fi → Details → TCP/IP**
   - Change `localhost` to your IP:
     ```swift
     return "http://192.168.1.XXX:3000/api"  // Your Mac's IP
     ```

### Connect to Real Backend

When ready to use the real backend:

1. Open `BookmarkListViewModel.swift`
2. Change: `init(useMockAPI: true)` → `init(useMockAPI: false)`
3. Do the same for `BookmarkDetailViewModel.swift` and `AddBookmarkViewModel.swift`
4. Ensure backend is running on ports 3000 and 3002

## Resources

- **Xcode Help:** Help → Xcode Help
- **SwiftUI Tutorials:** https://developer.apple.com/tutorials/swiftui
- **iOS Design Guidelines:** https://developer.apple.com/design/human-interface-guidelines/ios

---

**Need Help?** Check the troubleshooting section or refer to `README.md` for more details.
