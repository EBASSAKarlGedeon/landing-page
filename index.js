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

// ---------- Landing page ----------

function buildLanding() {
    const el = document.createElement("div");
    el.id = "landing_page_root";
    el.innerHTML = `
        <div class="stlp-shell">
            <h1 class="stlp-title">Landing Page</h1>
            <p class="stlp-sub">Stage 3 — shell test. Chat lists and the character grid come later.</p>
            <button id="landing_page_exit" class="stlp-btn">Exit to SillyTavern</button>
        </div>
    `;
    el.querySelector("#landing_page_exit").addEventListener("click", () => {
        console.log(`[${extensionName}] Manual exit`);
        hideLanding(true);
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
    $("#sheld").hide();
}

function hideLanding(manual) {
    if (manual) manuallyExited = true;
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
