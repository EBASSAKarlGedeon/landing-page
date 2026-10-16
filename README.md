# Landing Page

A JanitorAI-inspired landing page for SillyTavern: your recent chats, your character library and a welcome header on one fullscreen page. It now comes with a full theming system.

## Installation

1. Open SillyTavern
2. Extensions → Install Extension
3. Paste the GitHub URL
4. Refresh the page

Or copy this folder to `public/scripts/extensions/third-party/landing-page/`.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+L` | Toggle the landing page |
| `Ctrl+K` | Focus the character search (or the filter inside "View all") |
| `Esc` | Close the open popup |

---

## What's new in v0.2 — UI overhaul

v0.1 looked bland and was hard to customize. Its red color was hardcoded throughout the stylesheet, so the color settings barely changed anything. The theme was also only applied after you opened the settings panel. v0.2 rebuilds the visuals around a token-based theme engine, and every option applies live.

### Visual refresh

- **Welcome header ("hero")**: a time-based greeting with your persona name ("Good evening, …"). It shows live stats (characters, chats, favorites) and a **"Continue with …"** button that reopens your most recent chat. The stats respect the tag filter.
- **Ambient background**: three slowly drifting, blurred glow orbs in your accent colors.
- **"Aurora" background mode**: an animated gradient built from your two accent colors.
- **Gradient accents**: primary buttons, active pills, tabs and switches use an accent → secondary-accent gradient.
- **Chat cards**: a gradient strip on the top edge, an accent ring around the avatar on hover, and colored stat icons.
- **Character cards**: the image zooms on hover, an accent tint rises from the bottom, and a soft accent glow appears. Tag chips take the tag's own color, and the favorite heart glows.
- **Section titles**: an icon badge plus a gradient divider line.
- **Brand mark** in the top bar.
- **Entrance animations**: cards fade in one after another, and popups pop in. Animations are turned off automatically when the OS "reduce motion" setting is on.
- **Readable on any accent**: text on accent-colored buttons switches between dark and light automatically, so light themes like Sakura, Gilded and Monochrome stay legible.
- **Themed scrollbars** (Firefox and Chromium) and a better mobile layout.

### Appearance panel (⚙ gear button)

The settings panel was rebuilt as a tabbed panel. Changes apply instantly and are saved automatically.

**Theme**
- 10 presets with visual swatches: Crimson, Amethyst, Lagoon, Sunset, Sakura, Ocean, Emerald, Gilded, Cyberpunk, Monochrome
- Custom **accent**, **secondary accent** and **base background** colors
- 🎲 **Randomize**: generates a matching palette
- **Font**: SillyTavern font, System sans, Serif, Rounded, Monospace
- **Text size**: 80–130 %

**Background**
- Source: **SillyTavern background**, **Aurora** gradient, **Solid** color, or any **image URL**
- Darken overlay (0–100 %)
- Ambient glow orbs on/off
- Glass blur strength

**Layout**
- Show/hide the welcome header and its stats
- Custom header title (leave it empty to keep the greeting)
- Section order: chats first / characters first
- Density: Compact / Cozy / Airy
- Number of chats in "My Chats"
- Default character sort

**Cards**
- Card style: **Glass**, **Solid**, **Outline**, **Neon**
- Corner radius (0–32 px)
- Hover glow on/off, animations on/off
- Character card width, character art height, chat card width
- Show/hide on character cards: description, tags, token count, chat-count badge

**Advanced**
- **Custom CSS**, applied live (prefix your rules with `#landing_page_root`)
- **Export / import themes** as JSON, to share your look
- **Reset appearance** (keeps your tag filter and other settings) or **reset everything**

### Under the hood

- **`src/appearance.js`** (new): theme presets plus `applyAppearance()`. It turns the settings into CSS variables and root classes, so visual changes never need a re-render.
- **`src/hero.js`** (new): the welcome header.
- **`src/config.js`**: new `appearanceDefaults`, merged into `defaultSettings`. Existing installs pick up the new keys automatically, and the old theme IDs (`red`, `purple`, `teal`, `orange`) still work.
- **`style.css`**: rewritten. Every color comes from a few base tokens (`--stlp-accent`, `--stlp-accent2`, `--stlp-bg`), and the other colors are computed from them with `color-mix()`. Sizes use `em`, so the text-size setting scales the whole page.
- **`src/settingsPanel.js`**: rewritten as a declarative, tabbed panel.
- **Bug fixes**
  - Clicking outside the settings panel now closes it.
  - The theme is now applied as soon as the landing page appears, not only after you open the settings.
  - Resetting no longer shares the tag-filter object with the defaults.

### CSS variables for custom CSS

| Variable | Meaning |
| --- | --- |
| `--stlp-accent`, `--stlp-accent2` | Accent colors |
| `--stlp-bg` | Base background |
| `--stlp-grad` | Accent gradient |
| `--stlp-text`, `--stlp-text-muted` | Text colors |
| `--stlp-radius`, `--stlp-gap`, `--stlp-pad` | Shape and spacing |
| `--stlp-card-bg`, `--stlp-card-border`, `--stlp-card-shadow` | Card surface |
| `--stlp-blur`, `--stlp-overlay` | Glass blur, background darkening |

Example:

```css
#landing_page_root .stlp-char-card { border-width: 2px; }
#landing_page_root { --stlp-radius: 4px; }
```
