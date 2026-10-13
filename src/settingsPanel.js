// The landing page settings panel (opened via the gear button).
// All values persist through extension_settings + saveSettingsDebounced.
import { extension_settings, getContext } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { extensionName, defaultSettings } from "./config.js";
import { ui } from "./state.js";
import { escapeHtml } from "./helpers.js";
import { renderMyChats } from "./myChats.js";
import { renderCharacterGrid } from "./characterGrid.js";

const THEMES = [
    { id: "red", label: "Red (default)", accent: "#ff4d5e", accentHover: "#ff6b78", accentDim: "#b83240", bg: "#16181d" },
    { id: "purple", label: "Purple", accent: "#a78bfa", accentHover: "#c4b5fd", accentDim: "#7c3aed", bg: "#16181d" },
    { id: "teal", label: "Teal", accent: "#14b8a6", accentHover: "#2dd4bf", accentDim: "#0d9488", bg: "#16181d" },
    { id: "orange", label: "Orange", accent: "#fb923c", accentHover: "#fdba74", accentDim: "#ea580c", bg: "#16181d" },
];

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

function currentSettings() {
    return extension_settings[extensionName];
}

function applyTheme() {
    const s = currentSettings();
    const theme = THEMES.find(t => t.id === s.theme) || THEMES[0];
    const root = ui.landingRoot;
    if (!root) return;
    root.style.setProperty("--stlp-accent", s.accentColor || theme.accent);
    root.style.setProperty("--stlp-accent-hover", s.accentHoverColor || theme.accentHover);
    root.style.setProperty("--stlp-accent-dim", s.accentDimColor || theme.accentDim);
    root.style.setProperty("--stlp-bg", s.bgColor || theme.bg);
}

export async function showSettingsPanel() {
    if (!ui.landingRoot || ui.settingsPanelRoot) return;

    const s = currentSettings();
    ui.settingsPanelRoot = document.createElement("div");
    ui.settingsPanelRoot.className = "stlp-modal-overlay";
    ui.settingsPanelRoot.innerHTML = `
        <div class="stlp-settings" role="dialog" aria-modal="true" aria-label="Landing page settings">
            <button class="stlp-icon-btn stlp-settings-close" title="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div class="stlp-settings-body">
                <h3 class="stlp-settings-title">Landing Page Settings</h3>

                <label class="stlp-settings-row">
                    <span class="stlp-settings-label">Theme</span>
                    <select id="stlp_set_theme">
                        ${THEMES.map(t => `<option value="${t.id}"${s.theme === t.id ? " selected" : ""}>${escapeHtml(t.label)}</option>`).join("")}
                    </select>
                </label>

                <label class="stlp-settings-row">
                    <span class="stlp-settings-label">Accent color</span>
                    <input type="color" id="stlp_set_accent" value="${escapeHtml(s.accentColor || THEMES[0].accent)}" />
                </label>

                <label class="stlp-settings-row">
                    <span class="stlp-settings-label">Background color</span>
                    <input type="color" id="stlp_set_bg" value="${escapeHtml(s.bgColor || THEMES[0].bg)}" />
                </label>

                <label class="stlp-settings-row">
                    <span class="stlp-settings-label">Chats shown in My Chats</span>
                    <input type="number" id="stlp_set_chats_shown" min="1" max="50" value="${Number(s.chatsShown) || 8}" />
                </label>

                <label class="stlp-settings-row">
                    <span class="stlp-settings-label">Character card art height (px)</span>
                    <input type="number" id="stlp_set_card_height" min="160" max="480" value="${Number(s.cardHeight) || 260}" />
                </label>

                <label class="stlp-settings-row">
                    <span class="stlp-settings-label">Default sort</span>
                    <select id="stlp_set_sort">
                        <option value="newest"${s.defaultSort !== "oldest" && s.defaultSort !== "name" ? " selected" : ""}>Newest first</option>
                        <option value="oldest"${s.defaultSort === "oldest" ? " selected" : ""}>Oldest first</option>
                        <option value="name"${s.defaultSort === "name" ? " selected" : ""}>Name (A–Z)</option>
                    </select>
                </label>

                <div class="stlp-settings-actions">
                    <button type="button" id="stlp_set_reset">Reset to defaults</button>
                </div>
            </div>
        </div>
    `;
    ui.landingRoot.appendChild(ui.settingsPanelRoot);

    ui.settingsPanelRoot.addEventListener("click", (e) => {
        if (e.settingsPanelRoot === ui.settingsPanelRoot) closeSettingsPanel();
    });
    ui.settingsPanelRoot.querySelector(".stlp-settings-close").addEventListener("click", closeSettingsPanel);
    document.addEventListener("keydown", onSettingsEsc);

    const persist = () => saveSettingsDebounced();

    const themeSelect = ui.settingsPanelRoot.querySelector("#stlp_set_theme");
    const accentInput = ui.settingsPanelRoot.querySelector("#stlp_set_accent");
    const bgInput = ui.settingsPanelRoot.querySelector("#stlp_set_bg");
    const chatsShownInput = ui.settingsPanelRoot.querySelector("#stlp_set_chats_shown");
    const cardHeightInput = ui.settingsPanelRoot.querySelector("#stlp_set_card_height");
    const sortSelect = ui.settingsPanelRoot.querySelector("#stlp_set_sort");
    const resetBtn = ui.settingsPanelRoot.querySelector("#stlp_set_reset");

    themeSelect.addEventListener("change", () => {
        s.theme = themeSelect.value;
        // Picking a theme resets custom colors to that theme's
        s.accentColor = null;
        s.bgColor = null;
        accentInput.value = (THEMES.find(t => t.id === s.theme) || THEMES[0]).accent;
        bgInput.value = (THEMES.find(t => t.id === s.theme) || THEMES[0]).bg;
        applyTheme();
        persist();
    });

    accentInput.addEventListener("input", () => {
        s.accentColor = accentInput.value;
        applyTheme();
        persist();
    });

    bgInput.addEventListener("input", () => {
        s.bgColor = bgInput.value;
        applyTheme();
        persist();
    });

    chatsShownInput.addEventListener("input", () => {
        const n = parseInt(chatsShownInput.value, 10);
        s.chatsShown = Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 8;
        persist();
        renderMyChats(ui.landingRoot.querySelector("#stlp_my_chats"));
    });

    cardHeightInput.addEventListener("input", () => {
        const n = parseInt(cardHeightInput.value, 10);
        s.cardHeight = Number.isFinite(n) ? Math.max(160, Math.min(n, 480)) : 260;
        ui.landingRoot.style.setProperty("--stlp-card-art-height", `${s.cardHeight}px`);
        persist();
    });

    sortSelect.addEventListener("change", () => {
        s.defaultSort = sortSelect.value;
        persist();
    });

    resetBtn.addEventListener("click", () => {
        Object.assign(s, defaultSettings);
        // Re-apply and refresh everything
        applyTheme();
        ui.landingRoot.style.setProperty("--stlp-card-art-height", `${s.cardHeight || 260}px`);
        accentInput.value = s.accentColor || THEMES[0].accent;
        bgInput.value = s.bgColor || THEMES[0].bg;
        chatsShownInput.value = s.chatsShown ?? 8;
        cardHeightInput.value = s.cardHeight ?? 260;
        sortSelect.value = s.defaultSort ?? "newest";
        themeSelect.value = s.theme ?? "red";
        persist();
        renderMyChats(ui.landingRoot.querySelector("#stlp_my_chats"));
        renderCharacterGrid(ui.landingRoot.querySelector("#stlp_characters"));
    });

    applyTheme();
}
