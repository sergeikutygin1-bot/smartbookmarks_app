# Smart Bookmarks Browser Extension

Chrome/Edge extension for saving bookmarks to Smart Bookmarks with one click.

## Project Structure

```
extension/
├── package.json              # Dependencies and build scripts
├── tsconfig.json            # TypeScript configuration
├── webpack.config.js        # Build configuration
├── manifest.json            # Extension manifest (V3)
├── src/
│   ├── types/
│   │   └── index.ts        # Shared TypeScript types
│   ├── background/
│   │   └── background.ts   # Background service worker
│   ├── popup/
│   │   ├── popup.tsx       # Main popup UI component
│   │   ├── popup.html      # Popup HTML template
│   │   └── index.tsx       # Popup entry point
│   └── utils/
│       └── api.ts          # API client for backend
└── dist/                   # Build output (created by webpack)
```

## Development

### Install Dependencies

```bash
npm install
```

### Build Extension

```bash
# Production build
npm run build

# Development build with watch mode
npm run dev
```

### Load Extension in Browser

1. Build the extension: `npm run build`
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist/` directory

### Clean Build Artifacts

```bash
npm run clean
```

## Configuration

### Backend API URL

The extension is configured to connect to the backend at `http://localhost:3002`.

To change this, update:
- `src/utils/api.ts` - `API_BASE_URL` constant
- `manifest.json` - `host_permissions` array

### Permissions

The extension requires:
- `activeTab` - Access current tab URL when user clicks extension icon
- `storage` - Store authentication tokens in chrome.storage

## Features (To Be Implemented)

- [ ] User authentication (login/logout)
- [ ] Save current tab as bookmark
- [ ] Custom notes for bookmarks
- [ ] View recent bookmarks
- [ ] Quick search bookmarks

## Technical Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Webpack 5** - Build system
- **Chrome Extension Manifest V3** - Latest extension API

## Notes

- Icons are not included in this initial setup. Add PNG icons (16x16, 48x48, 128x128) to enable the extension icon.
- The extension uses service workers (Manifest V3) instead of background pages.
- All network requests must be to domains listed in `host_permissions`.
