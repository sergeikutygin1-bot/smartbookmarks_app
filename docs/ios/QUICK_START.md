# iOS Quick Start Checklist

Follow these steps to get your iOS app running in under 10 minutes!

## ✅ Checklist

### 1️⃣ Run Setup Script
```bash
cd ios
./setup.sh
```

This will:
- ✅ Check if Xcode is installed
- ✅ Open Xcode for you
- ✅ Show you what to do next

### 2️⃣ In Xcode: Create Project

When Xcode opens:

- [ ] Click **"Create New Project"**
- [ ] Select **iOS → App**
- [ ] Click **Next**

### 3️⃣ Configure Project

Fill in these values:

```
Product Name:          SmartBookmarks
Team:                  (Select your team)
Organization ID:       com.vibecoding
Interface:             SwiftUI  ←  IMPORTANT
Language:              Swift
Storage:               UNCHECK "Use Core Data"
```

- [ ] Click **Next**
- [ ] **Save location:** Navigate to the `ios/` folder
- [ ] Click **Create**

### 4️⃣ Delete Default Files

In Xcode's left sidebar:

- [ ] Find `ContentView.swift` (the one Xcode created)
- [ ] Right-click → **Delete** → **Move to Trash**
- [ ] Find `SmartBookmarksApp.swift` (the one Xcode created)
- [ ] Right-click → **Delete** → **Move to Trash**

### 5️⃣ Add Our Source Files

- [ ] Open **Finder** → Navigate to `ios/SmartBookmarks` folder
- [ ] **Drag** the entire `SmartBookmarks` folder into Xcode
- [ ] Drop it on the **SmartBookmarks** project (blue icon at top)
- [ ] In the dialog that appears:
  - [ ] **UNCHECK** "Copy items if needed"
  - [ ] **SELECT** "Create groups"
  - [ ] **CHECK** "Add to targets: SmartBookmarks"
- [ ] Click **Finish**

### 6️⃣ Configure iOS Version

- [ ] Click **SmartBookmarks** project (blue icon)
- [ ] Select **SmartBookmarks** target
- [ ] Go to **General** tab
- [ ] Under **Minimum Deployments:** Set to **iOS 17.0**

### 7️⃣ Add App Groups

- [ ] Go to **Signing & Capabilities** tab
- [ ] Click **+ Capability**
- [ ] Add **App Groups**
- [ ] Click **+** button
- [ ] Enter: `group.com.vibecoding.smartbookmarks`
- [ ] Check the checkbox

### 8️⃣ Build & Run! 🚀

- [ ] Select **iPhone 15 Pro** from the device menu (next to Play button)
- [ ] Press **⌘R** or click the ▶️ Play button
- [ ] Wait for build to complete

### 9️⃣ Test the App

You should see:
- ✅ 4 sample bookmarks
- ✅ Search bar at top
- ✅ **+** button to add bookmarks

Try:
- [ ] Click on a bookmark → See detail view
- [ ] Click **"Enrich"** button → Watch progress
- [ ] Edit the title → See "Saving..." then "Saved"
- [ ] Add a new bookmark with the **+** button

## 🎉 You're Done!

Your app is now running with **mock data** - no backend needed!

## 📱 What to Try Next

### Add a Bookmark
1. Click **+** button
2. Paste URL: `https://example.com/my-test`
3. Click **Add**
4. Bookmark appears at top of list

### Test Enrichment
1. Click on any bookmark
2. Click the **"Enrich"** button (sparkles icon ✨)
3. Watch the progress bar change:
   - Queuing → Extracting → Analyzing → Tagging → Embedding
4. After ~6.5 seconds, fields auto-populate
5. Changes auto-save

### Test Auto-Save
1. Edit the title or summary
2. Wait half a second
3. See "Saving..." → "Saved" in toolbar

### Search
1. Type in search bar: "youtube"
2. List filters in real-time

## 🐛 Something Not Working?

### Build Errors?
```bash
# Clean build folder
⇧⌘K (Shift + Command + K)

# Then build again
⌘B (Command + B)
```

### Files Missing (Red)?
1. Right-click → **Delete** → **Remove Reference**
2. Re-drag the file from Finder

### Simulator Not Showing?
- **Window → Devices and Simulators**
- Select simulator → **Erase All Content and Settings**

## 📚 More Help

- **Detailed Guide:** See `SETUP_GUIDE.md`
- **Full Documentation:** See `README.md`
- **Development Plan:** See `docs/iOS_Development_Plan.MD`

---

**Questions?** Check the troubleshooting section in `SETUP_GUIDE.md`
