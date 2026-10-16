// The landing page settings panel (opened via the gear button).
// Tabbed: Theme · Background · Layout · Cards · Advanced.
// Every control is declarative (data-setting / data-kind) and handled by
// one delegated listener; visuals update live through applyAppearance().
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { extensionName, defaultSettings, appearanceDefaults } from "./config.js";
import { ui } from "./state.js";
import { escapeHtml } from "./helpers.js";
import { renderMyChats } from "./myChats.js";
import { renderCharacterGrid } from "./characterGrid.js";
import { THEMES, applyAppearance, effectiveColors, randomPalette } from "./appearance.js";
import { renderHero, refreshHeroTitle } from "./hero.js";
import { applyStBarState } from "./landing.js";

const TABS = [
    { id: "theme", label: "Theme" },
    { id: "background", label: "Background" },
    { id: "layout", label: "Layout" },
    { id: "cards", label: "Cards" },
    { id: "advanced", label: "Advanced" },
];

let activeTab = "theme"; // remembered while ST is open

function currentSettings() {
    return extension_settings[extensionName];
}

export function closeSettingsPanel() {
    document.removeEventListener("keydown", onSettingsEsc);
    if (ui.settingsPanelRoot) {
        ui.settingsPanelRoot.remove();
        ui.settingsPanelRoot = null;
    }
}

function onSettingsEsc(e) {
    if (e.key === "Escape") {
        e.preventDefault();
        closeSettingsPanel();
    }
}

// ---------- control builders ----------

function row(label, control, hint = "") {
    // Only switch rows are <label>s (whole row toggles). A <label> around a
    // segmented control would forward clicks to its first button.
    const tag = control.includes("stlp-switch") ? "label" : "div";
    return `
        <${tag} class="stlp-settings-row">
            <span class="stlp-settings-label">${label}${hint ? `<small>${hint}</small>` : ""}</span>
            ${control}
        </${tag}>`;
}

function select(key, options) {
    const v = currentSettings()[key];
    return `<select data-setting="${key}" data-kind="string">
        ${options.map(([id, label]) => `<option value="${id}"${v === id ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
    </select>`;
}

function range(key, min, max, step = 1, unit = "") {
    const v = Number(currentSettings()[key]);
    return `<span class="stlp-range">
        <input type="range" data-setting="${key}" data-kind="number" min="${min}" max="${max}" step="${step}" value="${v}" />
        <output data-for="${key}" data-unit="${unit}">${v}${unit}</output>
    </span>`;
}

function toggle(key) {
    const on = currentSettings()[key] !== false;
    return `<span class="stlp-switch">
        <input type="checkbox" data-setting="${key}" data-kind="bool"${on ? " checked" : ""} />
        <span class="stlp-switch-track"><span class="stlp-switch-thumb"></span></span>
    </span>`;
}

function color(key, value) {
    return `<input type="color" data-setting="${key}" data-kind="color" value="${escapeHtml(value)}" />`;
}

// Segmented control: a row of radio-like buttons
function segmented(key, options) {
    const v = currentSettings()[key];
    return `<div class="stlp-segmented" data-segmented="${key}">
        ${options.map(([id, label]) => `<button type="button" data-value="${id}"${v === id ? ' class="active"' : ""}>${escapeHtml(label)}</button>`).join("")}
    </div>`;
}

function swatchesHtml() {
    const s = currentSettings();
    const custom = s.accentColor || s.accent2Color || s.bgColor;
    return THEMES.map(t => `
        <button type="button" class="stlp-swatch${!custom && s.theme === t.id ? " active" : ""}" data-theme="${t.id}" title="${escapeHtml(t.label)}"
                style="--sw-a:${t.accent};--sw-b:${t.accent2};--sw-bg:${t.bg}">
            <span class="stlp-swatch-preview"><span></span></span>
            <span class="stlp-swatch-label">${escapeHtml(t.label)}</span>
        </button>`).join("");
}

// ---------- tab contents ----------

function tabHtml(id) {
    const s = currentSettings();
    const c = effectiveColors(s);
    switch (id) {
        case "theme": return `
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Presets</div>
                <div class="stlp-swatches">${swatchesHtml()}</div>
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Custom colors
                    <button type="button" class="stlp-chip-btn" data-action="randomize">🎲 Randomize</button>
                </div>
                ${row("Accent", color("accentColor", c.accent))}
                ${row("Secondary accent", color("accent2Color", c.accent2), "Second stop of gradients &amp; glows")}
                ${row("Base background", color("bgColor", c.bg))}
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Typography</div>
                ${row("Font", select("font", [["st", "SillyTavern font"], ["system", "System sans"], ["serif", "Serif"], ["rounded", "Rounded"], ["mono", "Monospace"]]))}
                ${row("Text size", range("fontScale", 80, 130, 5, "%"))}
            </div>`;
        case "background": return `
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Source</div>
                ${segmented("bgMode", [["st", "ST background"], ["gradient", "Aurora"], ["solid", "Solid"], ["image", "Image URL"]])}
                <div class="stlp-settings-row stlp-bg-url-row"${s.bgMode === "image" ? "" : ' hidden'}>
                    <input type="text" class="stlp-text-input" data-setting="bgImageUrl" data-kind="string"
                           placeholder="https://… or /backgrounds/name.jpg" value="${escapeHtml(s.bgImageUrl || "")}" />
                </div>
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Effects</div>
                ${row("Darken overlay", range("overlayOpacity", 0, 100, 1, "%"), "Lower = more of the image shows through")}
                ${row("Ambient glow orbs", toggle("ambient"), "Slowly drifting accent-colored light")}
                ${row("Glass blur", range("blur", 0, 40, 1, "px"))}
            </div>`;
        case "layout": return `
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Header</div>
                ${row("Show welcome header", toggle("showHero"))}
                ${row("Show stats", toggle("showStats"))}
                <div class="stlp-settings-row">
                    <input type="text" class="stlp-text-input" data-setting="heroTitle" data-kind="string"
                           placeholder="Custom title (empty = “Good evening, …”)" value="${escapeHtml(s.heroTitle || "")}" />
                </div>
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Structure</div>
                ${row("Section order", segmented("sectionOrder", [["chats-first", "Chats first"], ["characters-first", "Characters first"]]))}
                ${row("Density", segmented("density", [["compact", "Compact"], ["comfortable", "Cozy"], ["spacious", "Airy"]]))}
                ${row("Chats shown in My Chats", range("chatsShown", 1, 50, 1))}
                ${row("Default sort", select("defaultSort", [["newest", "Newest first"], ["oldest", "Oldest first"], ["name", "Name (A–Z)"]]))}
            </div>`;
        case "cards": return `
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Style</div>
                ${segmented("cardStyle", [["glass", "Glass"], ["solid", "Solid"], ["outline", "Outline"], ["neon", "Neon"]])}
                ${row("Corner radius", range("radius", 0, 32, 1, "px"))}
                ${row("Hover glow", toggle("glow"))}
                ${row("Animations", toggle("animations"))}
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Size</div>
                ${row("Character card width", range("cardMinWidth", 150, 400, 10, "px"))}
                ${row("Character art height", range("cardHeight", 140, 520, 10, "px"))}
                ${row("Chat card width", range("chatCardWidth", 240, 520, 10, "px"))}
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Show on character cards</div>
                ${row("Description", toggle("showDescription"))}
                ${row("Tags", toggle("showTags"))}
                ${row("Token count", toggle("showTokens"))}
                ${row("Chat count badge", toggle("showChatCount"))}
            </div>`;
        case "advanced": return `
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Custom CSS</div>
                <textarea class="stlp-textarea stlp-code" data-setting="customCss" data-kind="string" spellcheck="false"
                          placeholder="#landing_page_root .stlp-char-card { border-width: 2px; }">${escapeHtml(s.customCss || "")}</textarea>
                <small class="stlp-settings-hint">Applied live, scoped to nothing — prefix rules with <code>#landing_page_root</code>.
                Variables: <code>--stlp-accent</code>, <code>--stlp-accent2</code>, <code>--stlp-bg</code>, <code>--stlp-radius</code>…</small>
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Share a theme</div>
                <textarea class="stlp-textarea stlp-code stlp-theme-json" spellcheck="false" placeholder="Paste a theme JSON here, then Import"></textarea>
                <div class="stlp-settings-actions">
                    <button type="button" class="stlp-chip-btn" data-action="export">Export (copy)</button>
                    <button type="button" class="stlp-chip-btn" data-action="import">Import</button>
                </div>
            </div>
            <div class="stlp-settings-group">
                <div class="stlp-settings-group-title">Reset</div>
                <div class="stlp-settings-actions">
                    <button type="button" class="stlp-chip-btn" data-action="reset-look">Reset appearance</button>
                    <button type="button" class="stlp-chip-btn stlp-danger" data-action="reset-all">Reset everything</button>
                </div>
            </div>`;
    }
    return "";
}

// ---------- side effects per setting ----------

// Settings that need more than applyAppearance()
function afterChange(key) {
    const root = ui.landingRoot;
    if (!root) return;
    if (key === "chatsShown") renderMyChats(root.querySelector("#stlp_my_chats"));
    if (key === "heroTitle") refreshHeroTitle(root.querySelector("#stlp_hero"));
}

function rerenderAll() {
    const root = ui.landingRoot;
    if (!root) return;
    applyAppearance(root);
    renderHero(root.querySelector("#stlp_hero"));
    renderMyChats(root.querySelector("#stlp_my_chats"));
    renderCharacterGrid(root.querySelector("#stlp_characters"));
}

// ---------- panel ----------

export async function showSettingsPanel() {
    if (!ui.landingRoot || ui.settingsPanelRoot) return;

    const s = currentSettings();
    ui.settingsPanelRoot = document.createElement("div");
    ui.settingsPanelRoot.className = "stlp-modal-overlay stlp-settings-overlay";
    ui.settingsPanelRoot.innerHTML = `
        <div class="stlp-settings" role="dialog" aria-modal="true" aria-label="Landing page settings">
            <div class="stlp-settings-head">
                <div>
                    <h3 class="stlp-settings-title">Appearance</h3>
                    <span class="stlp-settings-subtitle">Changes apply live and are saved automatically</span>
                </div>
                <button class="stlp-icon-btn stlp-settings-close" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <nav class="stlp-tabs" role="tablist">
                ${TABS.map(t => `<button type="button" role="tab" data-tab="${t.id}"${t.id === activeTab ? ' class="active"' : ""}>${t.label}</button>`).join("")}
            </nav>
            <div class="stlp-settings-body"></div>
        </div>
    `;
    ui.landingRoot.appendChild(ui.settingsPanelRoot);

    const panel = ui.settingsPanelRoot;
    const body = panel.querySelector(".stlp-settings-body");
    const renderTab = () => {
        body.innerHTML = tabHtml(activeTab);
        panel.querySelectorAll(".stlp-tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));
    };
    renderTab();

    panel.addEventListener("click", (e) => {
        if (e.target === panel) closeSettingsPanel();
    });
    panel.querySelector(".stlp-settings-close").addEventListener("click", closeSettingsPanel);
    document.addEventListener("keydown", onSettingsEsc);

    panel.querySelector(".stlp-tabs").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tab]");
        if (!btn) return;
        activeTab = btn.dataset.tab;
        renderTab();
    });

    const commit = (key) => {
        applyAppearance();
        afterChange(key);
        saveSettingsDebounced();
    };

    // Inputs: one listener for every data-setting control
    body.addEventListener("input", (e) => {
        const el = e.target.closest("[data-setting]");
        if (!el) return;
        const key = el.dataset.setting;
        switch (el.dataset.kind) {
            case "number": {
                const n = Number(el.value);
                s[key] = Number.isFinite(n) ? n : defaultSettings[key];
                const out = body.querySelector(`output[data-for="${key}"]`);
                if (out) out.textContent = `${el.value}${out.dataset.unit || ""}`;
                break;
            }
            case "bool": s[key] = el.checked; break;
            case "color":
                s[key] = el.value;
                body.querySelectorAll(".stlp-swatch.active").forEach(sw => sw.classList.remove("active"));
                break;
            default: s[key] = el.value;
        }
        commit(key);
    });
    body.addEventListener("click", async (e) => {
        // Theme preset swatch
        const sw = e.target.closest("[data-theme]");
        if (sw) {
            s.theme = sw.dataset.theme;
            s.accentColor = s.accent2Color = s.bgColor = null;
            commit("theme");
            renderTab();
            return;
        }
        // Segmented control
        const seg = e.target.closest("[data-segmented] button");
        if (seg) {
            const key = seg.parentElement.dataset.segmented;
            s[key] = seg.dataset.value;
            seg.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === seg));
            if (key === "bgMode") {
                body.querySelector(".stlp-bg-url-row")?.toggleAttribute("hidden", s.bgMode !== "image");
            }
            commit(key);
            return;
        }
        const action = e.target.closest("[data-action]")?.dataset.action;
        if (!action) return;
        const jsonBox = body.querySelector(".stlp-theme-json");
        switch (action) {
            case "randomize": {
                const p = randomPalette();
                s.accentColor = p.accent;
                s.accent2Color = p.accent2;
                s.bgColor = p.bg;
                commit("theme");
                renderTab();
                break;
            }
            case "export": {
                const theme = {};
                for (const k of Object.keys(appearanceDefaults)) theme[k] = s[k];
                const json = JSON.stringify(theme, null, 2);
                jsonBox.value = json;
                try {
                    await navigator.clipboard.writeText(json);
                    toastr.success("Theme copied to clipboard.", "Landing Page");
                } catch {
                    jsonBox.select();
                    toastr.info("Copy the JSON from the box.", "Landing Page");
                }
                break;
            }
            case "import": {
                try {
                    const data = JSON.parse(jsonBox.value);
                    if (!data || typeof data !== "object") throw new Error("not an object");
                    let applied = 0;
                    for (const k of Object.keys(appearanceDefaults)) {
                        if (k in data) { s[k] = data[k]; applied++; }
                    }
                    if (!applied) throw new Error("no known keys");
                    saveSettingsDebounced();
                    rerenderAll();
                    toastr.success(`Theme imported (${applied} settings).`, "Landing Page");
                } catch (err) {
                    toastr.error(`Invalid theme JSON: ${err.message}`, "Landing Page");
                }
                break;
            }
            case "reset-look":
                Object.assign(s, structuredClone(appearanceDefaults));
                saveSettingsDebounced();
                rerenderAll();
                renderTab();
                break;
            case "reset-all":
                Object.assign(s, structuredClone(defaultSettings));
                saveSettingsDebounced();
                applyStBarState();
                rerenderAll();
                renderTab();
                break;
        }
    });
}
