#!/bin/bash

# Smart Bookmarks iOS Setup Helper Script
# This script helps you set up the Xcode project

set -e

echo "🚀 Smart Bookmarks iOS Setup Helper"
echo "===================================="
echo ""

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode is not installed or not in PATH"
    echo ""
    echo "Please install Xcode from the App Store:"
    echo "https://apps.apple.com/us/app/xcode/id497799835"
    exit 1
fi

# Get Xcode version
XCODE_VERSION=$(xcodebuild -version | head -n 1)
echo "✅ Found: $XCODE_VERSION"
echo ""

# Check if running from correct directory
CURRENT_DIR=$(basename "$PWD")
if [ "$CURRENT_DIR" != "ios" ]; then
    echo "⚠️  Warning: You should run this script from the ios/ directory"
    echo "   Current: $PWD"
    echo "   Expected: .../smart_bookmarks_v2/ios"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "📋 Setup Instructions"
echo "--------------------"
echo ""
echo "I'll help you create the Xcode project. Here's what you need to do:"
echo ""
echo "1. Xcode will open shortly"
echo "2. Click 'Create New Project'"
echo "3. Choose: iOS → App"
echo "4. Configure:"
echo "   - Product Name: SmartBookmarks"
echo "   - Interface: SwiftUI"
echo "   - Language: Swift"
echo "   - Storage: None (uncheck Core Data)"
echo "5. Save location: Choose THIS DIRECTORY (ios/)"
echo "6. Delete default ContentView.swift and SmartBookmarksApp.swift"
echo "7. Drag the SmartBookmarks/ folder into the project"
echo ""
echo "📖 Full instructions: See SETUP_GUIDE.md"
echo ""

read -p "Ready to open Xcode? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled. Run this script again when ready."
    exit 0
fi

echo ""
echo "Opening Xcode..."
open -a Xcode

echo ""
echo "✅ Xcode opened!"
echo ""
echo "📖 Follow the instructions in SETUP_GUIDE.md"
echo "   or check the terminal output above"
echo ""

# Check if project already exists
if [ -d "SmartBookmarks.xcodeproj" ]; then
    echo "📁 Found existing project: SmartBookmarks.xcodeproj"
    read -p "Open existing project? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Opening project..."
        open SmartBookmarks.xcodeproj
        echo "✅ Project opened in Xcode"
    fi
else
    echo "💡 Tip: After creating the project, run this script again to open it"
fi

echo ""
echo "🎉 Setup helper completed!"
echo ""
echo "Next steps:"
echo "1. Follow SETUP_GUIDE.md for detailed instructions"
echo "2. Build and run with ⌘R"
echo "3. Test with mock data (no backend needed)"
echo ""
