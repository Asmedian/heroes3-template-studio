# Heroes III Template Studio 1.3.0 — verification report

**Date:** 27 September 2026. **Environment:** Linux x86-64, Node.js 22.16, Python 3.13, Playwright 1.57.0 and locally provided Chrome for Testing/Headless Shell 143.0.7499.4. Static site tested over local HTTP and under a nested path equivalent to GitHub Pages. All claims in this report refer to the tested working copy; publication and installation on a real Xiaomi device have not been tested.

## Test results

| Test suite | Result | Coverage |
|---|---:|---|
| Node.js unit/static/catalog | **47/47 pass** | All 59 original-file SHA-256/byte roundtrips; schema and converter tests; collision-free initial layout; numeric formatting; player colors, mines and PWA manifest. |
| Browser smoke | **Pass** | Three retained original fixtures: SoD Tesseract (1 map), HotA 1.7 Duel (30) and Jebus Outcast (126); editing, save, conversion, PNG, dark/light, zoom, offline. |
| Chromium responsive UI | **284 pass, 0 fail** | Thirteen viewport sizes; both themes; sidebar, inspector and toolbar access; no unwanted horizontal overflow. |
| Extended browser interactions | **14/14 pass** | Install-prompt simulation, manifest, maskable icons, service-worker scope and offline reload, mouse gestures, undo/redo, SVG→PNG, two-finger zoom and mobile touch editing. |
| Browser tests for all built-ins | **59/59 templates, 238/238 maps, 0 JS errors** | 2,996 rendered zones; 4,285 connection rows; **6,608 mining glyph instances**; English/Russian browser locales; offline cache coverage for all samples. |
| English-language visible-text audit | **0 Cyrillic strings** in inspected English UI states | Initial load, pack/map/zone/connection inspection, Help, Install instructions and validation. |
| Python/JS upstream differential | **4 parsed models + 8 conversions match** | Tesseract SoD, Duel/Jebus HotA 1.7 and generated HotA 1.8; semantic model equality against the provided Python source. |

**Responsive viewport matrix** (CSS pixels): desktop 2560×1440, 1920×1080, 1440×900; laptops 1366×768, 1024×768; tablet portrait 768×1024 and landscape 1024×768; mobile portrait 430×932, 390×844, 375×812, 360×800 and 320×568; mobile landscape 812×375. All 13 were checked in dark and light theme, plus mobile inspector/sidebar states. Chromium viewport emulation is not a physical-phone test.

## Source-data fidelity

The updated built-in catalog is exactly the user-provided **59 SoD files**, not the older three-item demonstration selector. Importing all of them yields 238 maps, 2,996 zones and 4,285 connection rows; four maps have no zones in the original data. All original bytes match the stored SHA-256 checksums, and unmodified export is byte-identical. The 118 SoD→HotA 1.7/1.8 conversion cases are re-parsed for map, zone and connection counts. Legacy-source validation findings do not cause automatic data modifications.

The original three fixtures are retained under `tests/fixtures/` exclusively to cover SoD and HotA with known data. Tesseract: 1/16/32; Duel: 30/270/420 (some preexisting truncated connection rows); Jebus Outcast: 126/962/2,216. The browser test also saves and parses an entire converted HotA 1.8 Jebus file. No supplied real-world HotA 1.8 fixture was available; HotA 1.8 parser/writer and Bulwark downgrade behavior were tested with generated data.

## Requested fixes

1. **Language:** English selected for a new non-Russian browser; first `ru-*` browser visit selects and persists Russian. Manual choice persists thereafter. Both locale flows reload correctly.
2. **Spacing:** Larger collision-avoiding initial layout and margin; initial zoom prioritizes readability. On exceptionally dense maps some zones may start outside the viewport: pan/zoom or press Fit to see all.
3. **Missing resources:** Town and mine counts are rendered as individual entries, with exact underlying values, both in cards and inspectors. The all-catalog browser regression confirmed 6,608 resource glyphs across all 238 maps.
4. **Artwork/colors:** Eight player colors (based on explicit start ownership), neutral wealth-based colors, treasure, guards, town/castle icons and all seven resource symbols. Template glyphs use vector sources from the original desktop editor where available, and native-style fallbacks for context-dependent symbols.
5. **Compact numbers:** `8.5k`, `45k` etc. are display-only; raw data, field edits, CSV/TSV serialization and conversion do not round or shorten originals.
6. **Android install:** Versioned relative PWA manifest, 192/512 standard and maskable PNG icons, Apple touch icon, standalone display, valid start URL and scope. Browser install prompt and appinstalled notification paths tested in Chromium; Xiaomi home-screen icon placement remains controlled by Android/HyperOS.
7. **Built-ins and theme:** 59 catalog entries; no default selection; same count after offline reload. Native select and option colors follow the current theme.
8. **Inspector:** Tabs wrap instead of clipping “Monsters”; checked at desktop/mobile sizes.
9. **Repository:** English README and GitHub About text in `GITHUB_ABOUT.txt`.

## 1.3.0 responsive and workflow regression

- Long map titles truncate with CSS ellipses and reveal a wrapped, viewport-contained tooltip on hover and keyboard focus.
- Default mt_Skirmish layout, label clearance and editor title overlap are covered by browser checks.
- Save and Convert use native `showSaveFilePicker()` on compatible browsers; the unsupported-browser fallback asks before any download. Cancellation does not download.
- The local release rerun completed all 47 Node tests and 284/284 responsive checks. Browser smoke passed. A previous full extended interaction run completed 14/14, and the all-catalog Chromium audit inspected all 59 template packages and 238 maps; the subsequent combined rerun timed out before completion, so these are prior-run results, not claimed as a successful final combined rerun.

## Boundaries

Only Chromium/Chrome for Testing was available. Firefox and Safari/WebKit were not verified. Desktop browser mobile emulation cannot prove that Xiaomi 13/HyperOS automatically creates a launcher shortcut; accepted browser install prompt is **not** treated as proof the OS placed an icon. GitHub Pages publication also requires deploying this repository to the user's GitHub account, which was not done here. Original desktop-editor icon SVGs are included, with application-specific vector fallback for symbols that the upstream application draws dynamically. Rights to distribute the original HotA imagery and 59 supplied templates should be confirmed before public release.

## Reproducing

```bash
npm test
python3 tests/browser_smoke.py
python3 tests/browser_responsive.py
python3 tests/browser_interactions.py
python3 tests/catalog_browser.py
python3 tests/i18n_audit.py
python3 tests/upstream_parity.py --upstream-path /path/to/heroes3-template-util
```

Playwright and Chrome installation instructions are in `README.md`. All uploaded web artwork is embedded in the page for offline diagram and PNG exports; the separate `public/h3-icons/` files provide the original desktop-editor vector sources.
