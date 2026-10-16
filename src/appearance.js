// Appearance engine: theme presets + applying settings to #landing_page_root.
// Everything visual is driven by CSS variables and root classes, so a
// setting change never needs a re-render — just call applyAppearance().
import { extension_settings } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { ui } from "./state.js";

export const THEMES = [
    { id: "red", label: "Crimson", accent: "#ff4d5e", accent2: "#d92c42", bg: "#16181d" },
    { id: "purple", label: "Amethyst", accent: "#a78bfa", accent2: "#7c3aed", bg: "#15131d" },
    { id: "teal", label: "Lagoon", accent: "#2dd4bf", accent2: "#0891b2", bg: "#0e1719" },
    { id: "orange", label: "Sunset", accent: "#fb923c", accent2: "#e11d48", bg: "#1a1412" },
    { id: "sakura", label: "Sakura", accent: "#f9a8d4", accent2: "#c084fc", bg: "#1a1419" },
    { id: "ocean", label: "Ocean", accent: "#60a5fa", accent2: "#4f46e5", bg: "#0f1420" },
    { id: "emerald", label: "Emerald", accent: "#34d399", accent2: "#059669", bg: "#0e1712" },
    { id: "gold", label: "Gilded", accent: "#fbbf24", accent2: "#d97706", bg: "#17140e" },
    { id: "cyber", label: "Cyberpunk", accent: "#f472b6", accent2: "#22d3ee", bg: "#0d0b17" },
    { id: "mono", label: "Monochrome", accent: "#e5e7eb", accent2: "#6b7280", bg: "#111111" },
];

const FONTS = {
    st: "var(--mainFontFamily, sans-serif)",
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    rounded: 'ui-rounded, "SF Pro Rounded", Nunito, "Varela Round", system-ui, sans-serif',
    mono: 'ui-monospace, "JetBrains Mono", "Cascadia Code", Consolas, monospace',
};

const DENSITIES = {
    compact: { gap: 10, pad: 10 },
    comfortable: { gap: 16, pad: 14 },
    spacious: { gap: 24, pad: 18 },
};

// Boolean setting -> class added when the setting is OFF
const HIDE_CLASSES = {
    showHero: "stlp-hide-hero",
    showStats: "stlp-hide-stats",
    showDescription: "stlp-hide-desc",
    showTags: "stlp-hide-tags",
    showTokens: "stlp-hide-tokens",
    showChatCount: "stlp-hide-chatcount",
    ambient: "stlp-no-ambient",
    glow: "stlp-no-glow",
    animations: "stlp-no-anim",
};

export function getTheme(id) {
    return THEMES.find(t => t.id === id) || THEMES[0];
}

// The colors actually in effect (preset, overridden by custom picks)
export function effectiveColors(s) {
    const t = getTheme(s.theme);
    return {
        accent: s.accentColor || t.accent,
        accent2: s.accent2Color || t.accent2,
        bg: s.bgColor || t.bg,
    };
}

function clamp(n, min, max, fallback) {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

function getStBackground() {
    for (const id of ["bg1", "bg2"]) {
        const el = document.getElementById(id);
        if (el) {
            const img = getComputedStyle(el).backgroundImage;
            if (img && img !== "none") return img;
        }
    }
    return null;
}

// Dark text on light accents (Sakura, Gilded, Monochrome…), white otherwise
function onAccentColor(a, b) {
    const lum = hex => {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
        if (!m) return 0.3;
        const n = parseInt(m[1], 16);
        const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    return (lum(a) + lum(b)) / 2 > 0.4 ? "#111318" : "#ffffff";
}

function cssUrl(url) {
    return `url("${String(url).replace(/["\\\n\r]/g, "")}")`;
}

export function applyAppearance(root = ui.landingRoot) {
    if (!root) return;
    const s = extension_settings[extensionName];
    const { accent, accent2, bg } = effectiveColors(s);
    const density = DENSITIES[s.density] || DENSITIES.comfortable;

    const vars = {
        "--stlp-accent": accent,
        "--stlp-accent2": accent2,
        "--stlp-bg": bg,
        "--stlp-on-accent": onAccentColor(accent, accent2),
        "--stlp-overlay": clamp(s.overlayOpacity, 0, 100, 85) / 100,
        "--stlp-blur": `${clamp(s.blur, 0, 40, 12)}px`,
        "--stlp-radius": `${clamp(s.radius, 0, 32, 14)}px`,
        "--stlp-card-art-height": `${clamp(s.cardHeight, 140, 520, 260)}px`,
        "--stlp-card-min": `${clamp(s.cardMinWidth, 150, 400, 230)}px`,
        "--stlp-chat-card-w": `${clamp(s.chatCardWidth, 240, 520, 340)}px`,
        "--stlp-font": FONTS[s.font] || FONTS.st,
        "--stlp-font-scale": clamp(s.fontScale, 75, 140, 100) / 100,
        "--stlp-gap": `${density.gap}px`,
        "--stlp-pad": `${density.pad}px`,
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, String(v));

    // Card style / section order: exactly one class of each family
    root.classList.forEach(c => {
        if (c.startsWith("stlp-style-") || c.startsWith("stlp-bgmode-")) root.classList.remove(c);
    });
    root.classList.add(`stlp-style-${s.cardStyle || "glass"}`);
    root.classList.add(`stlp-bgmode-${s.bgMode || "st"}`);
    root.classList.toggle("stlp-chars-first", s.sectionOrder === "characters-first");
    for (const [key, cls] of Object.entries(HIDE_CLASSES)) {
        root.classList.toggle(cls, s[key] === false);
    }

    // Background image
    let image = "";
    if (s.bgMode === "st") image = getStBackground() || "";
    else if (s.bgMode === "image" && s.bgImageUrl) image = cssUrl(s.bgImageUrl);
    root.style.backgroundImage = image;

    // User CSS lives in its own <style> inside the root
    let styleEl = root.querySelector("#stlp_custom_css");
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "stlp_custom_css";
        root.prepend(styleEl);
    }
    styleEl.textContent = String(s.customCss || "");
}

// ---------- color helpers (for the Randomize button) ----------

export function hslToHex(h, sat, light) {
    const s = sat / 100, l = light / 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = x => Math.round(x * 255).toString(16).padStart(2, "0");
    return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export function randomPalette() {
    const h = Math.floor(Math.random() * 360);
    const shift = [30, 45, 60, 150, 180][Math.floor(Math.random() * 5)];
    return {
        accent: hslToHex(h, 85, 65),
        accent2: hslToHex((h + shift) % 360, 80, 52),
        bg: hslToHex(h, 25, 8),
    };
}
