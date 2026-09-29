# Heroes III Template Studio

**Installable visual random-map template editor and format converter for Heroes of Might and Magic III: Shadow of Death and Horn of the Abyss.**

## Features

- Import, inspect, edit, save and convert **SoD `.txt`**, **HotA 1.7.x `.h3t`** and **HotA 1.8.x `.h3t`** templates. Original files are processed locally; untouched save preserves original bytes. On compatible browsers, Save opens the native Save as picker; unsupported browsers show a confirmation before downloading.
- Multi-map packs with a searchable map list, zone/connection creation, duplication and deletion, a full field inspector, undo/redo, validation and loss diagnostics for conversions.
- Pan, wheel/toolbar zoom, touch/pinch zoom, dragging individual zones, Alt+drag or two clicks to create a link, collision-avoiding initial layout, spread/compact actions, and fit-to-screen. Save/load multi-map layouts compatible with upstream sidecars; HotA also supports `image_settings` positions.
- **Exact eight requested player-zone colors**, neutral zones in white, silver gradient or golden gradient for high-richness treasure zones. The diagram uses the eight supplied optimized pixel-art PNGs (treasure chest and seven resources) embedded for offline SVG/PNG export, plus supplied Fort and Village SVGs recolored by owner on roofs, flags and gates; neutral buildings remain uncolored. Original values for mine/town counts and densities are preserved. HotA 1.8-exclusive settings remain format-specific in the editor.
- Display numbers compactly (e.g. `8500 → 8.5k`) without modifying stored values; exact originals remain available in field editors, titles and downloaded templates.
- No template selected on first load. Choose among **all 59 templates** from `Templates` in the sidebar or open/crate your own files.

## Built-in templates and file format distinctions

`Templates` contains **59 standart template files**, totaling **238 maps, 2,996 zones and 4,285 connection rows**. Four maps contain zero zones in the original files; the editor does not synthesize missing data. Import your own SoD, HotA 1.7/1.8 `.h3t` files using **Open** or file drag/drop.

| Format | Field structure | Example distinctive content |
|---|---|---|
| SoD `.txt` | 85-column schema | Classic 9 town types; saved diagram positions are exported to a separate `.h3tc-layout.json` sidecar. |
| HotA 1.7 `.h3t` | 138-column schema | Includes Cove and Factory, extra pack/zone properties and embedded diagram positions. |
| HotA 1.8 `.h3t` | 140-column schema | Adds Bulwark and version-specific fields; unsafe downgrades produce data-loss diagnostics. |

**Important:** Template format, conversion and exact saved data are separate from the diagram's illustrative symbols. The browser diagram represents model fields; it does not simulate generated maps or game runtime behavior. Some legacy source templates have validation issues (such as dangling references or missing zones); these are reported, never silently rewritten.

## Installing on Android

Open the **published HTTPS site** using the latest Chrome, wait for its first load, and tap **Install**. Confirm the system's install prompt. An accepted prompt means that installation was *requested*, not necessarily that the OS has already placed a home-screen icon. The site displays “installed” only after the browser fires `appinstalled`.

If there is no icon, check the **app drawer / all apps** for “H3 Templates”, and drag it to the home screen. On some OS versions Chrome's permission to create launcher shortcuts must be enabled under **Settings → Apps → Manage apps → Chrome → Other permissions → Home screen shortcuts** (menu names may differ). You can also try **Chrome ⋮ → Add to Home screen**. Android's launcher determines when/where icons appear; a website cannot force it to add a shortcut.

On iOS, use Safari **Share → Add to Home Screen**. On desktop Chrome/Edge, use the browser's Install app control. In-app install instructions explain the supported routes when the install prompt is unavailable.

## Attribution and distribution

The upstream software implementation is MIT-licensed (see [LICENSE](LICENSE)).