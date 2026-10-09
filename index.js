// Import from SillyTavern core
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// Extension name MUST match folder name
const extensionName = "landing-page";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    chatsShown: 8
};

let landingRoot = null;
let manuallyExited = false;
let chatListCache = new Map(); // avatar -> [{file_name, last_modify, file_size, chat_items}]
let chatDataPromise = null;

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
    for (const id of ["bg1", "bg2"]) {
        const el = document.getElementById(id);
        if (el) {
            const img = getComputedStyle(el).backgroundImage;
            if (img && img !== "none") return img;
        }
    }
    return null;
}

// ---------- Chat list data (Stage 5) ----------

function normalizeTimestamp(ts) {
    // Handle both seconds and milliseconds from the endpoint
    const n = Number(ts);
    return n < 1e12 ? n * 1000 : n;
}

async function fetchChatListForCharacter(avatar) {
    const response = await fetch("/api/chats/getchatlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ch_name: avatar })
    });
    if (!response.ok) throw new Error(`getchatlist ${response.status} for ${avatar}`);
    return response.json();
}

// Simple concurrency limiter so we don't fire hundreds of requests at once
async function mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]).catch((err) => {
                console.warn(`[${extensionName}] chat list failed:`, err.message);
                return [];
            });
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// Characters array isn't populated until ST emits character_page_loaded.
// Poll briefly instead of guessing at timing.
async function waitForCharacters(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const chars = getContext().characters;
        if (Array.isArray(chars) && chars.length > 0) return chars;
        await new Promise(r => setTimeout(r, 250));
    }
    console.warn(`[${extensionName}] Timed out waiting for characters list`);
    return getContext().characters || [];
}

async function loadAllChatData() {
    const characters = await waitForCharacters();
    console.log(`[${extensionName}] Fetching chat lists for ${characters.length} characters...`);

    const lists = await mapLimited(characters, 4, (c) => fetchChatListForCharacter(c.avatar));

    chatListCache = new Map();
    const allChats = [];
    characters.forEach((c, i) => {
        const chats = Array.isArray(lists[i]) ? lists[i] : [];
        chatListCache.set(c.avatar, chats);
        for (const chat of chats) {
            allChats.push({
                character: c,
                characterIndex: i,
                chat
            });
        }
    });

    // Sort most recent -> oldest
    allChats.sort((a, b) => normalizeTimestamp(b.chat.last_modify) - normalizeTimestamp(a.chat.last_modify));
    console.log(`[${extensionName}] Found ${allChats.length} total chats`);
    return allChats;
}

function invalidateChatData() {
    chatListCache = new Map();
    chatDataPromise = null;
}

// ---------- Helpers ----------

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function timeAgo(ts) {
    const then = normalizeTimestamp(ts);
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

function prettyChatName(fileName) {
    return String(fileName ?? "").replace(/\.jsonl?$/i, "");
}

// ---------- My Chats rendering (Stage 5) ----------

function renderChatCard(entry) {
    const { character, characterIndex, chat } = entry;
    const avatarUrl = `/thumbnail?type=character&file=${encodeURIComponent(character.avatar)}`;
    const msgCount = chat.chat_items ?? 0;
    const card = document.createElement("div");
    card.className = "stlp-chat-card";
    card.innerHTML = `
        <div class="stlp-chat-avatar-wrap">
            <img class="stlp-chat-avatar" src="${avatarUrl}" alt="" loading="lazy"
                 onerror="this.style.visibility='hidden'" />
        </div>
        <div class="stlp-chat-body">
            <div class="stlp-chat-name">${escapeHtml(character.name)}</div>
            <div class="stlp-chat-file">${escapeHtml(prettyChatName(chat.file_name))}</div>
            <div class="stlp-chat-meta">
                <span>${timeAgo(chat.last_modify)}</span>
                <span class="stlp-chat-meta-dot">•</span>
                <span>${msgCount} message${msgCount === 1 ? "" : "s"}</span>
            </div>
        </div>
        <button class="stlp-chat-continue">Continue</button>
    `;
    card.addEventListener("click", () => openChatFile(characterIndex, character.name, chat.file_name));
    return card;
}

async function openChatFile(characterIndex, characterName, chatFileName) {
    console.log(`[${extensionName}] Opening chat: ${characterName} / ${chatFileName}`);
    try {
        // Dynamic import so a missing export degrades gracefully instead of
        // breaking the whole extension at load time
        const scriptModule = await import("../../../../script.js");
        if (typeof scriptModule.selectCharacterById !== "function") {
            throw new Error("selectCharacterById is not exported in this ST version");
        }
        await scriptModule.selectCharacterById(characterIndex, characterName, chatFileName);
    } catch (err) {
        console.error(`[${extensionName}] Failed to open chat:`, err);
        toastr.error(`Could not open chat: ${err.message}`, "Landing Page");
    }
}

async function renderMyChats(container) {
    const settings = extension_settings[extensionName];
    const limit = settings.chatsShown ?? 8;

    container.innerHTML = `<div class="stlp-placeholder">Loading chats…</div>`;

    let allChats;
    try {
        if (!chatDataPromise) {
            chatDataPromise = loadAllChatData();
        }
        allChats = await chatDataPromise;
    } catch (err) {
        console.error(`[${extensionName}] Chat data load failed:`, err);
        container.innerHTML = `<div class="stlp-placeholder">Failed to load chats — check console (F12).</div>`;
        return;
    }

    if (allChats.length === 0) {
        container.innerHTML = `<div class="stlp-placeholder">No chats yet — start one from the Characters section below (coming in Stage 6).</div>`;
        return;
    }

    container.innerHTML = "";
    const shown = allChats.slice(0, limit);
    for (const entry of shown) {
        container.appendChild(renderChatCard(entry));
    }
    if (allChats.length > limit) {
        const more = document.createElement("div");
        more.className = "stlp-chat-more";
        more.textContent = `View all (${allChats.length}) — arrives in a later stage`;
        container.appendChild(more);
    }
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
                    <div id="stlp_my_chats" class="stlp-chat-list"></div>
                </section>
                <section class="stlp-section">
                    <h2 class="stlp-section-title">Characters</h2>
                    <div class="stlp-placeholder">Character grid arrives in Stage 6.</div>
                </section>
            </main>
        </div>
    `;

    el.querySelector("#stlp_exit_btn").addEventListener("click", () => {
        console.log(`[${extensionName}] Manual exit`);
        hideLanding(true);
    });
    el.querySelector("#stlp_settings_btn").addEventListener("click", () => {
        toastr.info("Landing page settings will open here in a later stage.", "Landing Page");
    });
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

    const bg = getStBackground();
    if (bg) {
        landingRoot.style.backgroundImage = bg;
    }

    $("#sheld").hide();

    // Render My Chats
    const chatsContainer = landingRoot.querySelector("#stlp_my_chats");
    renderMyChats(chatsContainer);

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
        manuallyExited = false;
    }
    // Chat data may have changed — invalidate cache so next landing view is fresh
    invalidateChatData();
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

        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        // Character list loads after we do — refresh when it's ready
        if (event_types.CHARACTER_PAGE_LOADED) {
            eventSource.on(event_types.CHARACTER_PAGE_LOADED, () => {
                invalidateChatData();
                updateLanding();
            });
        }
        if (event_types.APP_READY) {
            eventSource.on(event_types.APP_READY, () => setTimeout(updateLanding, 100));
        }
        setTimeout(updateLanding, 1000);

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
