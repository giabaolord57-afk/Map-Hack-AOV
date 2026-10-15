NgxbaoIos AOV Web Map - deployment-ready static package

Entry page: index.html
Assets: assets/map.css, assets/map.js, assets/icons/*

Path fixes made for deployment at a site root:
- Changed /hn-aov/webmap/assets/... references to relative ./assets/...
- Renamed extensionless HTML entrypoint to index.html
- Changed popup URL to ./?room=...
- Added empty assets/hero-catalog.json and a fallback portrait SVG
- Removed Cloudflare-specific injected scripts/beacon

IMPORTANT: The live map requires a compatible WebSocket backend. By default the frontend connects to:
  wss://YOUR-DOMAIN/ws/{ROOM}
You can override the WebSocket base URL using the page query parameter `?wsBase=wss://YOUR-BACKEND/ws`.
A static GitHub Pages/Vercel deployment does not provide this backend automatically.
The map UI can load, but live room data will not connect until you have permission
and configure a compatible WebSocket server/protocol. Hero portraits/catalog were not
included in the supplied ZIP, so names and portraits may be generic/missing.

File-name/path checks:
- index.html references ./assets/map.css and ./assets/map.js
- map.js loads icons from ./assets/icons/ and hero catalog from ./assets/hero-catalog.json
- Hero portraits are expected at ./assets/heroes/{heroId}.png; those files are not included.
