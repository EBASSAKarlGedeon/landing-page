// Import from SillyTavern core
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// Extension name MUST match folder name
const extensionName = "landing-page";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true
};

let landingRoot = null;
let manuallyExited = false;

// ---------- Settings ----------

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    $("#landing_page_enabled").prop("checked", extension_settings[extensionName].enabled);
}

function onEnabledChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Setting saved:`, value);
    if (!value) {
        hideLanding(false);
    } else {
        updateLanding();
    }
}

// ---------- Chat state ----------

function isChatOpen() {
    const ctx = getContext();
    const charOk = ctx.characterId !== -1 && ctx.characterId !== null && ctx.characterId !== undefined;
    const groupOk = ctx.groupId !== null && ctx.groupId !== undefined;
    return charOk || groupOk;
}

// ---------- ST background ----------

function getStBackground() {
    // ST renders its background on #bg1/#bg2 (crossfade layers).
    // Read the computed background-image from whichever is active.
    for (const id of ["bg1", "bg2"]) {
        const el = document.getElementById(id);
        if (el) {
            const img = getComputedStyle(el).backgroundImage;
            if (img && img !== "none") return img;
        }
    }
    return null;
}

// ---------- Landing page ----------

function buildLanding() {
    const el = document.createElement("div");
    el.id = "landing_page_root";
    el.innerHTML = `
        <div class="stlp-bg-overlay"></div>
        <div class="stlp-page">
            <header class="stlp-topbar">
                <div class="stlp-search-wrap">
                    <svg class="stlp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input id="stlp_search" type="text" placeholder="Search characters... (Ctrl+K)" autocomplete="off" />
                </div>
                <div class="stlp-topbar-actions">
                    <button id="stlp_settings_btn" class="stlp-icon-btn" title="Settings">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                    <button id="stlp_exit_btn" class="stlp-icon-btn stlp-exit" title="Exit to SillyTavern">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </header>
            <main class="stlp-content">
                <section class="stlp-section">
                    <h2 class="stlp-section-title">My Chats</h2>
                    <div class="stlp-placeholder">Chat list arrives in Stage 5.</div>
                </section>
                <section class="stlp-section">
                    <h2 class="stlp-section-title">Characters</h2>
                    <div class="stlp-placeholder">Character grid arrives in Stage 6.</div>
                </section>
            </main>
        </div>
    `;

    // Wire top bar
    el.querySelector("#stlp_exit_btn").addEventListener("click", () => {
        console.log(`[${extensionName}] Manual exit`);
        hideLanding(true);
    });
    el.querySelector("#stlp_settings_btn").addEventListener("click", () => {
        toastr.info("Landing page settings will open here in a later stage.", "Landing Page");
    });

    // Ctrl+K focuses search
    el.querySelector("#stlp_search").addEventListener("keydown", (e) => {
        if (e.key === "Escape") e.target.blur();
    });

    return el;
}

function showLanding() {
    if (!extension_settings[extensionName]?.enabled) return;
    if (manuallyExited) return;
    if (landingRoot) return;
    console.log(`[${extensionName}] Showing landing page (no chat selected)`);
    landingRoot = buildLanding();
    document.body.appendChild(landingRoot);

    // Apply ST's background if we can find it
    const bg = getStBackground();
    if (bg) {
        landingRoot.style.backgroundImage = bg;
        landingRoot.classList.add("stlp-has-bg");
        console.log(`[${extensionName}] Using SillyTavern background`);
    } else {
        console.log(`[${extensionName}] ST background not found, using solid color`);
    }

    $("#sheld").hide();

    // Global Ctrl+K while landing is visible
    document.addEventListener("keydown", onCtrlK);
}

function onCtrlK(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && landingRoot) {
        e.preventDefault();
        landingRoot.querySelector("#stlp_search")?.focus();
    }
}

function hideLanding(manual) {
    if (manual) manuallyExited = true;
    document.removeEventListener("keydown", onCtrlK);
    if (!landingRoot) return;
    console.log(`[${extensionName}] Hiding landing page${manual ? " (manual exit)" : ""}`);
    landingRoot.remove();
    landingRoot = null;
    $("#sheld").show();
}

function updateLanding() {
    if (isChatOpen() || manuallyExited) {
        hideLanding(false);
    } else {
        showLanding();
    }
}

function onChatChanged() {
    if (isChatOpen()) {
        manuallyExited = false; // a chat was opened — re-arm landing for next time
    }
    updateLanding();
}

// Extension initialization
jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        $("#landing_page_enabled").on("input", onEnabledChange);
        loadSettings();

        // Core lifecycle: show landing when no chat, restore when a chat opens
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

        // Initial check (in case CHAT_CHANGED fired before we loaded)
        if (event_types.APP_READY) {
            eventSource.on(event_types.APP_READY, () => setTimeout(updateLanding, 100));
        }
        setTimeout(updateLanding, 1000);

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
