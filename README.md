# Heroes III Template Studio

**Offline, installable visual random-map template editor and format converter for Heroes of Might and Magic III: Shadow of Death and Horn of the Abyss.**

This is an independent, browser-based implementation built from [sokie/heroes3-template-util](https://github.com/sokie/heroes3-template-util) (upstream Python/PySide6 v0.3.0, commit `e0143ce06d5cb8d616d5facd4e05569437878a07`). It runs as a static site on GitHub Pages without a server, account, npm build or external API. App version: **1.4.2**.

**Suggested GitHub repository description (kept here, not in a separate file):**
> Offline PWA for editing, visualizing, and converting Heroes III random-map templates (SoD, HotA 1.7/1.8), with English/Russian UI.

**Suggested topics:** `heroes3`, `hota`, `random-map`, `template-editor`, `pwa`, `github-pages`, `heroes-of-might-and-magic`.

## Features

- Import, inspect, edit, save and convert **SoD `.txt`**, **HotA 1.7.x `.h3t`** and **HotA 1.8.x `.h3t`** templates. Original files are processed locally; untouched save preserves original bytes. On compatible browsers, Save opens the native Save as picker; unsupported browsers show a confirmation before downloading.
- Multi-map packs with a searchable map list, zone/connection creation, duplication and deletion, a full field inspector, undo/redo, validation and loss diagnostics for conversions.
- Pan, wheel/toolbar zoom, touch/pinch zoom, dragging individual zones, Alt+drag or two clicks to create a link, collision-avoiding initial layout, spread/compact actions, and fit-to-screen. Save/load multi-map layouts compatible with upstream sidecars; HotA also supports `image_settings` positions.
- **Exact eight requested player-zone colors**, neutral zones in white, silver gradient or golden gradient for high-richness treasure zones. The diagram uses the eight supplied optimized pixel-art PNGs (treasure chest and seven resources) embedded for offline SVG/PNG export, plus supplied Fort and Village SVGs recolored by owner on roofs, flags and gates; neutral buildings remain uncolored. Original values for mine/town counts and densities are preserved. HotA 1.8-exclusive settings remain format-specific in the editor.
- Display numbers compactly (e.g. `8500 → 8.5k`, `8501 → 8.501k`) without modifying stored values; exact originals remain available in field editors, titles and downloaded templates.
- English UI by default, Russian on the **first visit** when the browser's primary language is Russian; explicit language choice persists in `localStorage`. Independent dark/light theme persistence and dark-native dropdowns.
- A collapsed, scrollable canvas legend automatically lists **only symbols present in the selected map**: current owner colors, neutral richness, crossings, chest scores, towns, mines, guards, roads and other connection types. Card art and text have been enlarged to stay readable when zoomed in.
- Installable PWA: relative manifest `id`, scope and start URL (GitHub Pages subpaths supported), distinct 192/512 PNG and maskable icons, Android/Apple icons, versioned service worker, **offline precaching of all 59 built-in templates**, and in-app install guidance.
- A permanent **Map properties** inspector tab remains available next to **Zone** or **Connection** when selected; mobile outside-tap dismisses the menu, toolbar wraps at narrow desktop widths, and the mobile title is **H3 TS**. Non-template file drops show localized, readable errors without disclosing binary header data.
- No template selected on first load. Choose among **all 59 templates** from `Templates.zip` in the sidebar or open your own files. The previous three sample templates are retained only as test fixtures, not in the built-in selector.

## Release-note and repository cleanup

The release ZIP includes two consolidated, **local-only** files: `PROJECT_CHANGES.md` and `PROJECT_TESTS.md`. Both are excluded by `.gitignore`; they do not need to appear in the public GitHub repository. The old standalone `CHANGELOG.md`, `CI_FIX_RU.md`, `CI_TEST_REPORT.md`, `GITHUB_ABOUT.txt`, `PATCH_NOTES_RU.md` and `TEST_REPORT.md` have been removed. Generated screenshots, browser artifacts, logs, Python cache files and dependencies must not be committed. The project's actual source, tests, 59 templates and user-provided artwork remain tracked.

When updating an **existing** repository, delete the six obsolete documentation files from your working tree before running `git add -A`. Git will then record their removal. Additions to `.gitignore` do not untrack files that were committed previously; if the two new local reports were previously tracked, use `git rm --cached PROJECT_CHANGES.md PROJECT_TESTS.md` before committing.

In Chrome/Edge, the site's Install button invokes the install prompt when it is available **without blocking Chrome's native install banner**. Browsers may also offer installation directly in their menu. Chrome's mobile installability and home-screen shortcut placement remain separate platform decisions.

## Publish on GitHub Pages

1. Create a repository and place **the contents of this project directory** in the root of its `main` branch, including the hidden `.github` directory.
2. Go to **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push to `main`, or run **Actions → Test and deploy H3 Template Studio → Run workflow**. Pages deployment runs only after unit and Chromium checks pass.
4. Visit `https://USERNAME.github.io/REPOSITORY/`. All site assets and PWA paths work under a project subdirectory. Run the site over HTTPS for PWA installation; loading `index.html` directly with `file://` will not work.
5. In GitHub's **About** sidebar, paste the suggested description above and add the suggested topics. The website's own meta description is already in English.

### Important: preserve original template bytes when committing

The 59 bundled template files and three regression fixtures contain original CRLF and sometimes mixed line endings. Git may silently convert them to LF on `git add` unless `.gitattributes` is present. This breaks the catalog SHA-256 check and untouched-template round trips; do **not** change the expected SHA-256 values or disable that test.

For a **new repository**, extract the complete release archive, including `.gitattributes`, *before* running `git add .`. For a repository that already committed the previous 1.2.0 release, delete the obsolete `samples/` directory, replace `templates/` and `tests/fixtures/` with the original copies in this release archive; copy `.gitattributes`, and restage all three paths before pushing:

```bash
git add .gitattributes
git rm -r --cached --ignore-unmatch samples templates tests/fixtures
# Remove obsolete samples/ from your local directory before re-adding all paths.
git add -A
npm test
git commit -m "Fix byte-exact templates in Git checkout"
git push
```

`git rm --cached` only removes the old normalized versions from Git's *index*; it does not delete your local files. **The files in your working directory must actually be the original bytes from the archive**; adding `.gitattributes` alone cannot repair files that were previously converted to LF. To repair files that Git previously normalized, restore original template bytes from the release archive before recommitting. Validate with `npm test` and a clean clone using `core.autocrlf=true`.

The workflow publishes `index.html`, `styles.css`, `src/`, `public/`, `templates/`, `manifest.webmanifest` and `sw.js`. Test fixtures and reference documentation are not deployed by Pages, although they **will be public in the GitHub repository** if you create a public repository.

## Local preview and tests

```bash
python3 -m http.server 8000
# Open http://localhost:8000
npm test
```

Browser tests use Python 3, Playwright 1.57.0 and Chromium:

```bash
python3 -m pip install playwright==1.57.0 pillow
python3 -m playwright install chromium
python3 tests/browser_smoke.py
python3 tests/browser_responsive.py
python3 tests/browser_interactions.py
python3 tests/browser_v14.py
python3 tests/catalog_browser.py
python3 tests/i18n_audit.py
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` and, where needed, `PLAYWRIGHT_FULL_CHROMIUM_EXECUTABLE` to use local Chrome binaries. The browser tests serve the project from a local HTTP URL. The project has no npm dependencies; `npm test` requires Node.js 20+ and its built-in test runner. For independent comparison with the Python upstream parser:

```bash
python3 tests/upstream_parity.py --upstream-path /path/to/heroes3-template-util
```

The release ZIP includes local-only `PROJECT_CHANGES.md` and `PROJECT_TESTS.md` (ignored by Git). [UPSTREAM_UPDATE.md](UPSTREAM_UPDATE.md) describes how to incorporate future upstream releases safely.

## Built-in templates and file format distinctions

The supplied `Templates.zip` contains **59 SoD template files**, totaling **238 maps, 2,996 zones and 4,285 connection rows**. Four maps contain zero zones in the original files; the editor does not synthesize missing data. All 59 files are SHA-256 checked against `templates/catalog.json` during testing and retained byte-for-byte for untouched downloads. Import your own HotA 1.7/1.8 `.h3t` files using **Open** or file drag/drop.

| Format | Field structure | Example distinctive content |
|---|---|---|
| SoD `.txt` | 85-column schema | Classic 9 town types; saved diagram positions are exported to a separate `.h3tc-layout.json` sidecar. |
| HotA 1.7 `.h3t` | 138-column schema | Includes Cove and Factory, extra pack/zone properties and embedded diagram positions. |
| HotA 1.8 `.h3t` | 140-column schema | Adds Bulwark and version-specific fields; unsafe downgrades produce data-loss diagnostics. |

**Important:** Template format, conversion and exact saved data are separate from the diagram's illustrative symbols. The browser diagram represents model fields; it does not simulate generated maps or game runtime behavior. Some legacy source templates have validation issues (such as dangling references or missing zones); these are reported, never silently rewritten.

## Installing on Android / Xiaomi 13

Open the **published HTTPS site** using the latest Chrome, wait for its first load, and tap **Install**. Confirm the system's install prompt. An accepted prompt means that installation was *requested*, not necessarily that the OS has already placed a home-screen icon. The site displays “installed” only after the browser fires `appinstalled`.

If there is no icon on a Xiaomi launcher, check the **app drawer / all apps** for “H3 Templates”, and drag it to the home screen. On some MIUI/HyperOS versions Chrome's permission to create launcher shortcuts must be enabled under **Settings → Apps → Manage apps → Chrome → Other permissions → Home screen shortcuts** (menu names may differ). You can also try **Chrome ⋮ → Add to Home screen**. Android's launcher determines when/where icons appear; a website cannot force it to add a shortcut. App installation itself cannot be fully verified using desktop Chromium's mobile emulation; confirm these steps on the physical phone.

On iOS, use Safari **Share → Add to Home Screen**. On desktop Chrome/Edge, use the browser's Install app control. In-app install instructions explain the supported routes when the install prompt is unavailable.

## Developer file map

| Path | Purpose |
|---|---|
| `src/core.js`, `src/schema-data.js`, `src/schema.json` | Parsers, format schemas, serialization, conversion and validation. |
| `src/layout.js`, `src/sidecar.js` | Collision-free graph layout and upstream-compatible positions. |
| `src/visuals.js`, `public/template-icons/` | Exact display-number abbreviations, player palette, supplied optimized pixel-art icons and recolored owner-specific SVG buildings. |
| `src/i18n.js`, `src/app.js`, `index.html`, `styles.css` | English/Russian UI, application state, interactions and themes. |
| `templates/catalog.json`, `templates/*.txt` | 59 included SoD templates. |
| `manifest.webmanifest`, `sw.js`, `public/icons/` | Installability and versioned offline cache. |
| `tests/` | Unit, Python/JS differential, catalog, visual/browser and responsive regressions. |
| `.github/workflows/deploy.yml` | Automatic tests and Pages deployment on `main`. |

## Attribution and distribution

The upstream software implementation is MIT-licensed (see [LICENSE](LICENSE)). The eight raster icons and Fort/Village SVGs in `public/template-icons/` were supplied separately by the user; their redistribution rights are **not established by the upstream MIT license**. The built-in templates are likewise user-supplied community materials. Before publishing a public repository or site, verify you have the necessary rights to redistribute the game artwork and template collections. This application is not affiliated with Ubisoft or the HotA Crew.


### 1.4.2 visual and performance corrections

Zone type labels are no longer rendered on cards. Neutral zones use white, silver-gradient, or gold-gradient backgrounds based on their score. Swords on bright cards remain dark in either theme. High-frequency canvas pan events are coalesced to one compositor-backed transform per animation frame, with SVG card shadows temporarily disabled during a pan. Run `python3 tests/browser_pan_regression.py` for browser-specific coverage. This check is also part of GitHub Actions; the full responsive suite tests 13 PC/tablet/mobile resolutions in both themes.
