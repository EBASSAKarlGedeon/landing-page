// Import from SillyTavern core
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// Extension name MUST match folder name
const extensionName = "landing-page";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    chatsShown: 8,
    lastActive: {} // chatKey -> timestamp (local activity stamps, TMC-style)
};

let landingRoot = null;
let manuallyExited = false;
let chatListCache = new Map();
let chatDataPromise = null;
let refinedTsCache = new Map(); // chatKey -> last-message send_date (session cache)

// ---------- Settings ----------

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    extension_settings[extensionName].lastActive = extension_settings[extensionName].lastActive || {};
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

// ---------- Chat list data ----------

function normalizeTimestamp(ts) {
    const n = Number(ts);
    return n < 1e12 ? n * 1000 : n;
}

function chatKey(scope, fileName) {
    return `${scope}::${String(fileName ?? "").replace(/\.jsonl?$/i, "")}`;
}

async function fetchChatListForCharacter(avatar) {
    const response = await fetch("/api/characters/chats", {
        method: "POST",
        headers: getContext().getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar, withMetadata: true })
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`characters/chats ${response.status} for ${avatar}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

// Global mtime index (same source as ST's native Recent Chats tab)
async function fetchRecentChatIndex() {
    try {
        const response = await fetch("/api/chats/recent", {
            method: "POST",
            headers: getContext().getRequestHeaders(),
            body: JSON.stringify({ max: 500 })
        });
        if (!response.ok) {
            console.warn(`[${extensionName}] /api/chats/recent returned ${response.status} — using fallbacks`);
            return null;
        }
        const data = await response.json();
        if (!Array.isArray(data)) return null;
        const map = new Map();
        for (const item of data) {
            const avatar = item.pngFile ?? item.avatar ?? null;
            const group = item.groupId ?? item.group ?? null;
            // Normalize full paths down to the bare file name so keys match
            const fileName = String(item.filePath ?? item.file_name ?? "").split(/[\\/]/).pop();
            if (!fileName) continue;
            const scope = group ? `group:${group}` : `char:${avatar}`;
            const ts = Number(item.mtime ?? item.last_modify ?? 0);
            map.set(chatKey(scope, fileName), ts > 0 ? normalizeTimestamp(ts) : 0);
        }
        console.log(`[${extensionName}] Recent index: ${map.size} entries. Raw sample:`, data[0] ?? null);
        return map;
    } catch (err) {
        console.warn(`[${extensionName}] /api/chats/recent unavailable:`, err.message);
        return null;
    }
}

// Fetch ONE chat file and read the send_date of its last real message.
// This is the truest "last chatted" clock. Verified endpoint contract from
// the Timelines extension: body { ch_name, file_name (no .jsonl), avatar_url },
// response[0] is metadata. Returns 0 if unavailable.
async function fetchChatLastActivity(avatar, characterName, fileName) {
    try {
        const response = await fetch("/api/chats/get", {
            method: "POST",
            headers: getContext().getRequestHeaders(),
            cache: "no-cache",
            body: JSON.stringify({
                ch_name: characterName,
                file_name: String(fileName).replace(/\.jsonl$/, ""),
                avatar_url: avatar,
            }),
        });
        if (!response.ok) return 0;
        const messages = await response.json();
        if (!Array.isArray(messages) || messages.length < 2) return 0;
        // Walk from the end; skip [0] (metadata) and system messages
        for (let i = messages.length - 1; i >= 1; i--) {
            const m = messages[i];
            if (!m || m.is_system) continue;
            const d = m.send_date;
            if (d === undefined || d === null || d === "") continue;
            const n = Number(d);
            if (Number.isFinite(n) && n > 0) return normalizeTimestamp(n);
            const ctx = getContext();
            if (typeof ctx.timestampToMoment === "function") {
                const mom = ctx.timestampToMoment(d);
                if (mom && mom.isValid()) return mom.valueOf();
            }
            const parsed = Date.parse(d);
            if (!Number.isNaN(parsed)) return parsed;
        }
        return 0;
    } catch {
        return 0;
    }
}

// Simple concurrency limiter
async function mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]).catch(() => null);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

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

function filenameTimestamp(chat) {
    const m = String(chat.file_name ?? "").match(/(\d{4})-(\d{2})-(\d{2})@(\d{2})h(\d{2})m/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]).getTime();
    return 0;
}

// Stamp "I was here" when a chat is opened (persisted, TMC-style)
function stampLocalActivity() {
    const ctx = getContext();
    if (!ctx.chatId) return;
    const avatar = ctx.characters?.[ctx.characterId]?.avatar;
    if (!avatar) return;
    const key = chatKey(`char:${avatar}`, ctx.chatId);
    const now = Date.now();
    const settings = extension_settings[extensionName];
    settings.lastActive[key] = now;
    const keys = Object.keys(settings.lastActive);
    if (keys.length > 600) {
        keys.sort((a, b) => settings.lastActive[a] - settings.lastActive[b]);
        for (let i = 0; i < keys.length - 500; i++) delete settings.lastActive[keys[i]];
    }
    saveSettingsDebounced();
    refinedTsCache.set(key, now);
}

async function loadAllChatData() {
    const characters = await waitForCharacters();
    console.log(`[${extensionName}] Fetching chat lists for ${characters.length} characters...`);

    const lists = await mapLimited(characters, 4, (c) => fetchChatListForCharacter(c.avatar));
    const recentIndex = await fetchRecentChatIndex();
    const stamps = extension_settings[extensionName].lastActive || {};

    chatListCache = new Map();
    const allChats = [];

    characters.forEach((c, i) => {
        const chats = Array.isArray(lists[i]) ? lists[i] : [];
        chatListCache.set(c.avatar, chats);
        for (const chat of chats) {
            const key = chatKey(`char:${c.avatar}`, chat.file_name);
            // max(local stamp, refined send_date, recent-index mtime)
            let ts = Math.max(
                refinedTsCache.get(key) || 0,
                stamps[key] || 0,
                recentIndex?.get(key) || 0,
            );
            if (!ts && chat.last_modify && Number(chat.last_modify) > 0) ts = normalizeTimestamp(chat.last_modify);
            if (!ts) ts = filenameTimestamp(chat);
            allChats.push({ character: c, characterIndex: i, chat, ts: Number(ts) || 0, key });
        }
    });

    allChats.sort((a, b) => b.ts - a.ts);
    console.log(`[${extensionName}] Found ${allChats.length} chats. Top 3:`,
        allChats.slice(0, 3).map(e => ({
            name: e.character.name,
            date: e.ts ? new Date(e.ts).toLocaleString() : "no timestamp",
        })));
    return allChats;
}

function invalidateChatData() {
    chatListCache = new Map();
    chatDataPromise = null;
    // refinedTsCache intentionally survives — per-file data stays valid
}

// ---------- Helpers ----------

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function timeAgo(ts) {
    const then = Number(ts);
    if (!Number.isFinite(then) || then <= 0) return "—";
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? "" : "s"} ago`;
}

function prettyChatName(fileName) {
    return String(fileName ?? "").replace(/\.jsonl?$/i, "");
}

function descriptionSnippet(character) {
    const raw = String(character.description || character.creator_notes || "")
        .replace(/[*#`>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return raw || "No description available.";
}

// ---------- My Chats rendering ----------

function renderChatCard(entry) {
    const { character, characterIndex, chat, ts } = entry;
    const avatarUrl = getContext().getThumbnailUrl("avatar", character.avatar);
    const msgCount = chat.chat_items ?? 0;

    const card = document.createElement("div");
    card.className = "stlp-chat-card";
    card.title = prettyChatName(chat.file_name);
    card.innerHTML = `
        <div class="stlp-chat-header">
            <div class="stlp-chat-name">${escapeHtml(character.name)}</div>
        </div>
        <div class="stlp-chat-content-row">
            <div class="stlp-chat-avatar-wrap">
                <img class="stlp-chat-avatar" src="${avatarUrl}" alt="" loading="lazy"
                     onerror="this.style.visibility='hidden'" />
            </div>
            <div class="stlp-chat-desc-wrap">
                <div class="stlp-chat-desc">${escapeHtml(descriptionSnippet(character))}</div>
                <div class="stlp-chat-desc-fade"></div>
            </div>
        </div>
        <div class="stlp-chat-footer">
            <div class="stlp-chat-stats">
                <span class="stlp-chat-stat">
                    <svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                    <span class="stlp-chat-time">${timeAgo(ts)}</span>
                </span>
                <span class="stlp-chat-stat">
                    <svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"/></svg>
                    <span>${msgCount} message${msgCount === 1 ? "" : "s"}</span>
                </span>
            </div>
            <button class="stlp-chat-continue">Continue</button>
        </div>
    `;
    card.addEventListener("click", () => openChatFile(characterIndex, character.name, chat.file_name));
    return card;
}

async function openChatFile(characterIndex, characterName, chatFileName) {
    console.log(`[${extensionName}] Opening chat: ${characterName} / ${chatFileName}`);
    try {
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

// After cards render, fetch the true last-message time for just the
// displayed ones (concurrency-limited, non-blocking) and update the labels.
async function refineShownChatTimes(container, shown) {
    const spans = [...container.querySelectorAll(".stlp-chat-time")];
    const updates = await mapLimited(shown, 3, async (entry) => {
        if (refinedTsCache.has(entry.key)) return null;
        const ts = await fetchChatLastActivity(entry.character.avatar, entry.character.name, entry.chat.file_name);
        refinedTsCache.set(entry.key, ts);
        return ts ? { i: shown.indexOf(entry), ts } : null;
    });
    for (const u of updates) {
        if (u && spans[u.i]) spans[u.i].textContent = timeAgo(u.ts);
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

    refineShownChatTimes(container, shown); // fire and forget
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
        stampLocalActivity(); // "I was here" — next landing view sorts this chat to the top
    }
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