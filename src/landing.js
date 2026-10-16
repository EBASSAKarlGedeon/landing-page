// Landing page lifecycle: build, show, hide, and ST event reactions.
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { extensionName } from "./config.js";
import { ui } from "./state.js";
import { isChatOpen} from "./chatActions.js";
import { renderMyChats } from "./myChats.js";
import { closeAllChatsModal } from "./allChatsModal.js";
import { invalidateChatData } from "./chatData.js";
import { renderCharacterGrid, onGridSearchChange } from "./characterGrid.js";
import { closeCharacterDetails } from "./characterDetails.js";
import { closeSettingsPanel } from "./settingsPanel.js";
import { showSettingsPanel } from "./settingsPanel.js";
import { openForgeStudio, probeForge } from "./forge.js";
import { applyAppearance } from "./appearance.js";
import { renderHero } from "./hero.js";

// ---------- ST top bar toggle ----------

// The bar's real rendered height (handles zoom/themes). #top-bar is the
// fixed wrapper in current ST; fall back to #top-settings-holder.
function measureStBarHeight() {
    const bar = document.getElementById("top-bar") || document.getElementById("top-settings-holder");
    return bar && bar.offsetHeight > 0 ? bar.offsetHeight : 45;
}

// Applies the persisted showStBar state: shows #sheld so the bar renders,
// then pushes the landing down by the bar's height (or restores fullscreen).
export function applyStBarState() {
    if (!ui.landingRoot) return;
    const show = extension_settings[extensionName].showStBar === true;
    const btn = ui.landingRoot.querySelector("#stlp_stbar_btn");
    if (show) {
        $("#sheld").show();
        ui.landingRoot.classList.add("stlp-pinned");   // ← add
        ui.landingRoot.style.top = `${measureStBarHeight()}px`;
        btn?.classList.add("active");
        btn?.setAttribute("title", "Hide SillyTavern bar");
    } else {
        $("#sheld").hide();
        ui.landingRoot.classList.remove("stlp-pinned"); // ← add
        ui.landingRoot.style.top = "";
        btn?.classList.remove("active");
        btn?.setAttribute("title", "Show SillyTavern bar");
    }
}

export function toggleStBar() {
    const s = extension_settings[extensionName];
    s.showStBar = s.showStBar !== true; // undefined/false -> true, true -> false
    saveSettingsDebounced();
    applyStBarState();
}

function buildLanding() {
    const el = document.createElement("div");
    el.id = "landing_page_root";
    el.innerHTML = `
        <div class="stlp-bg-overlay"></div>
        <div class="stlp-ambient" aria-hidden="true">
            <span class="stlp-orb stlp-orb-1"></span>
            <span class="stlp-orb stlp-orb-2"></span>
            <span class="stlp-orb stlp-orb-3"></span>
        </div>
        <div class="stlp-page">
            <header class="stlp-topbar">
                <div class="stlp-brand" title="Landing Page">
                    <span class="stlp-brand-mark"></span>
                </div>
                <div class="stlp-search-wrap">
                    <svg class="stlp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input id="stlp_search" type="text" placeholder="Search characters... (Ctrl+K)" autocomplete="off" />
                </div>
                <div class="stlp-topbar-actions">
                    <button id="stlp_stbar_btn" class="stlp-icon-btn stlp-stbar-btn" title="Show SillyTavern bar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <button id="stlp_forge_btn" class="stlp-icon-btn" title="Lorebook Forge Studio">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    </button>
                    <button id="stlp_settings_btn" class="stlp-icon-btn" title="Settings">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button id="stlp_exit_btn" class="stlp-icon-btn stlp-exit" title="Exit to SillyTavern">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </header>
            <main class="stlp-content">
                <section id="stlp_hero" class="stlp-section stlp-hero"></section>
                <section class="stlp-section stlp-section-chats">
                    <h2 class="stlp-section-title">
                        <span class="stlp-section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
                        My Chats
                    </h2>
                    <div id="stlp_my_chats" class="stlp-chat-list"></div>
                </section>
                <section class="stlp-section stlp-section-chars">
                    <h2 class="stlp-section-title">
                        <span class="stlp-section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                        Characters
                    </h2>
                    <div id="stlp_characters"></div>
                </section>
            </main>
        </div>
    `;

    el.querySelector("#stlp_stbar_btn").addEventListener("click", toggleStBar);
    el.querySelector("#stlp_exit_btn").addEventListener("click", () => {
        console.log(`[${extensionName}] Manual exit`);
        hideLanding(true);
    });
    el.querySelector("#stlp_settings_btn").addEventListener("click", () => showSettingsPanel());
    el.querySelector("#stlp_forge_btn").addEventListener("click", openForgeStudio);
    // Soft dependency: hide the button if Lorebook Forge isn't installed
    probeForge().catch(() => el.querySelector("#stlp_forge_btn")?.remove());
    el.querySelector("#stlp_search").addEventListener("keydown", (e) => {
        if (e.key === "Escape") e.target.blur();
    });
    el.querySelector("#stlp_search").addEventListener("input", (e) => onGridSearchChange(e.target.value));

    return el;
}

export function showLanding() {
    if (!extension_settings[extensionName]?.enabled) return;
    if (ui.manuallyExited) return;
    if (ui.landingRoot) return;
    console.log(`[${extensionName}] Showing landing page (no chat selected)`);
    ui.landingRoot = buildLanding();
    document.body.appendChild(ui.landingRoot);

    applyAppearance(ui.landingRoot); // theme vars, background, custom CSS
    applyStBarState(); // hides or shows #sheld + offsets per saved setting

    renderHero(ui.landingRoot.querySelector("#stlp_hero"));
    const chatsContainer = ui.landingRoot.querySelector("#stlp_my_chats");
    renderMyChats(chatsContainer);
    renderCharacterGrid(ui.landingRoot.querySelector("#stlp_characters"));

    document.addEventListener("keydown", onCtrlK);
}

function onCtrlK(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && ui.landingRoot) {
        e.preventDefault();
        // While the modal is open, Ctrl+K targets the modal filter instead
        const target = ui.allChatsModalRoot
            ? ui.allChatsModalRoot.querySelector(".stlp-modal-search")
            : ui.landingRoot.querySelector("#stlp_search");
        target?.focus();
    }
}

// Ctrl+L: toggle the landing page from anywhere.
// Registered permanently at init (see index.js) so it works both ways.
export function onCtrlL(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "l") return;
    e.preventDefault();
    if (ui.landingRoot) {
        hideLanding(true);
    } else if (!isChatOpen()) {
        // Re-show even after a manual exit — the shortcut IS the manual control
        ui.manuallyExited = false;
        showLanding();
    }
}

export function hideLanding(manual) {
    if (manual) ui.manuallyExited = true;
    closeAllChatsModal();
    closeCharacterDetails();
    closeSettingsPanel();
    document.removeEventListener("keydown", onCtrlK);
    if (!ui.landingRoot) return;
    console.log(`[${extensionName}] Hiding landing page${manual ? " (manual exit)" : ""}`);
    ui.landingRoot.remove();
    ui.landingRoot = null;
    $("#sheld").show();
}

export function updateLanding() {
    if (isChatOpen() || ui.manuallyExited) {
        hideLanding(false);
    } else {
        showLanding();
    }
}

export function onChatChanged() {
    if (isChatOpen()) {
        ui.manuallyExited = false;
    }
    invalidateChatData();
    updateLanding();
}
