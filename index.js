// Import from SillyTavern core
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// Extension name MUST match folder name
const extensionName = "landing-page";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const RECENT_FETCH_MAX = 200; // how many chats to index from the server

const defaultSettings = {
    enabled: true,
    chatsShown: 8,
    lastActive: {} // chatKey -> timestamp (local "I opened this" stamps)
};

let landingRoot = null;
let allChatsModalRoot = null;
let manuallyExited = false;
let chatDataPromise = null;
let scriptModulePromise = null;   // cached dynamic import of script.js
let groupModulePromise = null;    // cached dynamic import of group-chats.js

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

// ---------- Helpers ----------

function normalizeTimestamp(ts) {
    const n = Number(ts);
    return n < 1e12 ? n * 1000 : n;
}

// Accepts ISO strings ("2026-10-11T22:20:01.201Z"), epoch ms, or epoch s
function parseTimestamp(value) {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return normalizeTimestamp(n);
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function chatKey(scope, fileName) {
    return `${scope}::${String(fileName ?? "").replace(/\.jsonl?$/i, "")}`;
}

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
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

function prettyChatName(fileName) {
    return String(fileName ?? "").replace(/\.jsonl?$/i, "");
}

function descriptionSnippet(character) {
    const raw = String(character?.description || character?.creator_notes || "")
        .replace(/[*#`>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return raw || "No description available.";
}

// Plain-text snippet of the last message (for group cards)
function messageSnippet(text) {
    const raw = String(text ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/[*#`>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return raw ? raw.slice(0, 220) + (raw.length > 220 ? "…" : "") : "No messages yet.";
}

// ---------- Chat data (single request: /api/chats/recent) ----------

async function fetchRecentChats() {
    try {
        const response = await fetch("/api/chats/recent", {
            method: "POST",
            headers: getContext().getRequestHeaders(),
            cache: "no-cache",
            body: JSON.stringify({ max: RECENT_FETCH_MAX })
        });
        if (!response.ok) {
            console.warn(`[${extensionName}] /api/chats/recent returned ${response.status}`);
            return [];
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.warn(`[${extensionName}] /api/chats/recent unavailable:`, err.message);
        return [];
    }
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

async function loadAllChatData() {
    const characters = await waitForCharacters();
    const groups = getContext().groups || [];
    const recent = await fetchRecentChats();
    const stamps = extension_settings[extensionName].lastActive || {};

    const allChats = [];
    for (const item of recent) {
        const chatName = prettyChatName(item.file_name ?? item.file_id ?? "");
        if (!chatName) continue;

        const isGroup = !!item.group;
        const character = isGroup ? null : characters.find(c => c.avatar === item.avatar);
        const group = isGroup ? groups.find(g => g.id === item.group) : null;
        if (isGroup && !group) continue;      // orphaned group chat
        if (!isGroup && !character) continue; // orphaned character chat

        const key = chatKey(isGroup ? `group:${item.group}` : `char:${item.avatar}`, chatName);
        // Native ST sorts by last_mes (last message send_date); local stamps override on mere open
        const ts = Math.max(stamps[key] || 0, parseTimestamp(item.last_mes));

        allChats.push({
            character,
            group,
            characterIndex: character ? characters.indexOf(character) : -1,
            avatar: isGroup ? null : item.avatar,
            groupId: isGroup ? item.group : null,
            chat: {
                file_name: chatName,
                chat_items: item.chat_items ?? 0,
                mes: item.mes ?? "",
            },
            ts: Number(ts) || 0,
            key,
        });
    }

    allChats.sort((a, b) => b.ts - a.ts);
    console.log(`[${extensionName}] ${allChats.length} chats loaded. Top 3:`,
        allChats.slice(0, 3).map(e => ({
            name: e.character?.name || e.group?.name,
            date: e.ts ? new Date(e.ts).toLocaleString() : "no timestamp",
        })));
    return allChats;
}

function invalidateChatData() {
    chatDataPromise = null;
}

// ---------- Opening chats (verified sequence from ST's own welcome screen) ----------

function getScriptModule() {
    if (!scriptModulePromise) scriptModulePromise = import("../../../../script.js");
    return scriptModulePromise;
}

function getGroupModule() {
    if (!groupModulePromise) groupModulePromise = import("../../../group-chats.js");
    return groupModulePromise;
}

async function openCharacterChatFile(avatar, chatName) {
    const ctx = getContext();
    const scriptModule = await getScriptModule();
    const characterId = ctx.characters.findIndex(c => c.avatar === avatar);
    if (characterId === -1) throw new Error(`Character not found for avatar: ${avatar}`);

    await ctx.selectCharacterById(characterId);
    if (typeof scriptModule.setActiveCharacter === "function") {
        scriptModule.setActiveCharacter(avatar);
    }
    ctx.saveSettingsDebounced();
    if (ctx.getCurrentChatId() === chatName) {
        console.debug(`[${extensionName}] Chat ${chatName} is already open.`);
        return;
    }
    await ctx.openCharacterChat(chatName);
}

async function openGroupChatFile(groupId, chatName) {
    const ctx = getContext();
    const scriptModule = await getScriptModule();
    const groupModule = await getGroupModule();
    if (typeof groupModule.openGroupById !== "function") {
        throw new Error("openGroupById is not available in this ST version");
    }

    await groupModule.openGroupById(groupId);
    if (typeof scriptModule.setActiveGroup === "function") {
        scriptModule.setActiveGroup(groupId);
    }
    ctx.saveSettingsDebounced();
    if (ctx.getCurrentChatId() === chatName) return;
    await ctx.openGroupChat(groupId, chatName);
}

async function openEntry(entry) {
    const label = entry.character?.name || entry.group?.name || "chat";
    console.log(`[${extensionName}] Opening: ${label} / ${entry.chat.file_name}`);
    try {
        if (entry.groupId) {
            await openGroupChatFile(entry.groupId, entry.chat.file_name);
        } else {
            await openCharacterChatFile(entry.avatar, entry.chat.file_name);
        }
    } catch (err) {
        console.error(`[${extensionName}] Failed to open chat:`, err);
        toastr.error(`Could not open chat: ${err.message}`, "Landing Page");
    }
}

// Stamp "I was here" when a chat is opened (persisted, pruned)
function stampLocalActivity() {
    const ctx = getContext();
    if (!ctx.chatId) return;
    let key;
    if (ctx.groupId) {
        key = chatKey(`group:${ctx.groupId}`, ctx.chatId);
    } else {
        const avatar = ctx.characters?.[ctx.characterId]?.avatar;
        if (!avatar) return;
        key = chatKey(`char:${avatar}`, ctx.chatId);
    }
    const now = Date.now();
    const settings = extension_settings[extensionName];
    settings.lastActive[key] = now;
    const keys = Object.keys(settings.lastActive);
    if (keys.length > 600) {
        keys.sort((a, b) => settings.lastActive[a] - settings.lastActive[b]);
        for (let i = 0; i < keys.length - 500; i++) delete settings.lastActive[keys[i]];
    }
    saveSettingsDebounced();
}

// ---------- My Chats rendering ----------

function renderChatCard(entry) {
    const { character, group, chat, ts } = entry;
    const ctx = getContext();
    const name = character?.name || group?.name || "Unknown";
    const msgCount = chat.chat_items ?? 0;
    const isGroup = !!group;

    const avatarInner = isGroup
        ? `<div class="stlp-chat-avatar-fallback">${escapeHtml((name || "?").trim().charAt(0).toUpperCase())}</div>`
        : `<img class="stlp-chat-avatar" src="${ctx.getThumbnailUrl("avatar", character.avatar)}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'" />`;

    const desc = isGroup ? messageSnippet(chat.mes) : descriptionSnippet(character);

    const card = document.createElement("div");
    card.className = "stlp-chat-card";
    card.title = chat.file_name;
    card.innerHTML = `
        <div class="stlp-chat-header">
            <div class="stlp-chat-name">${escapeHtml(name)}</div>
            ${isGroup ? '<span class="stlp-chat-group-badge">Group</span>' : ""}
        </div>
        <div class="stlp-chat-content-row">
            <div class="stlp-chat-avatar-wrap">${avatarInner}</div>
            <div class="stlp-chat-desc-wrap">
                <div class="stlp-chat-desc">${escapeHtml(desc)}</div>
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
    card.addEventListener("click", () => openEntry(entry));
    return card;
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
        const more = document.createElement("button");
        more.className = "stlp-chat-more";
        more.type = "button";
        more.textContent = `View all (${allChats.length})`;
        more.addEventListener("click", () => showAllChatsModal());
        container.appendChild(more);
    }
}

// ---------- "View all" modal ----------

function closeAllChatsModal() {
    document.removeEventListener("keydown", onAllChatsModalEsc);
    if (allChatsModalRoot) {
        allChatsModalRoot.remove();
        allChatsModalRoot = null;
    }
}

function onAllChatsModalEsc(e) {
    if (e.key === "Escape") {
        e.preventDefault();
        closeAllChatsModal();
    }
}

function entryMatchesQuery(entry, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const name = entry.character?.name || entry.group?.name || "";
    return String(name).toLowerCase().includes(q) ||
           String(entry.chat.file_name).toLowerCase().includes(q);
}

function showAllChatsModal() {
    if (!landingRoot || allChatsModalRoot) return;

    allChatsModalRoot = document.createElement("div");
    allChatsModalRoot.className = "stlp-modal-overlay";
    allChatsModalRoot.innerHTML = `
        <div class="stlp-modal" role="dialog" aria-modal="true" aria-label="All chats">
            <div class="stlp-modal-header">
                <div class="stlp-modal-title-group">
                    <h3 class="stlp-modal-title">All Chats</h3>
                    <span class="stlp-modal-count"></span>
                </div>
                <div class="stlp-modal-tools">
                    <div class="stlp-modal-search-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input class="stlp-modal-search" type="text" placeholder="Filter by character or chat name..." autocomplete="off" />
                    </div>
                    <button class="stlp-icon-btn stlp-modal-close" title="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="stlp-modal-body"></div>
        </div>
    `;
    landingRoot.appendChild(allChatsModalRoot);

    const searchInput = allChatsModalRoot.querySelector(".stlp-modal-search");
    const countLabel = allChatsModalRoot.querySelector(".stlp-modal-count");
    const body = allChatsModalRoot.querySelector(".stlp-modal-body");

    allChatsModalRoot.addEventListener("click", (e) => {
        if (e.target === allChatsModalRoot) closeAllChatsModal();
    });
    allChatsModalRoot.querySelector(".stlp-modal-close").addEventListener("click", closeAllChatsModal);
    document.addEventListener("keydown", onAllChatsModalEsc);

    const renderList = (entries, total) => {
        body.innerHTML = "";
        if (entries.length === 0) {
            body.innerHTML = `<div class="stlp-placeholder">No chats match your search.</div>`;
        } else {
            for (const entry of entries) {
                body.appendChild(renderChatCard(entry));
            }
        }
        countLabel.textContent = entries.length === total
            ? `${total} chat${total === 1 ? "" : "s"}`
            : `${entries.length} of ${total} chats`;
    };

    (async () => {
        try {
            const allChats = chatDataPromise
                ? await chatDataPromise
                : (chatDataPromise = loadAllChatData());
            renderList(allChats, allChats.length);
            searchInput.addEventListener("input", () => {
                const q = searchInput.value.trim();
                renderList(allChats.filter(e => entryMatchesQuery(e, q)), allChats.length);
            });
        } catch (err) {
            console.error(`[${extensionName}] Modal chat data load failed:`, err);
            body.innerHTML = `<div class="stlp-placeholder">Failed to load chats — check console (F12).</div>`;
        }
    })();

    searchInput.focus();
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
        // While the modal is open, Ctrl+K targets the modal filter instead
        const target = allChatsModalRoot
            ? allChatsModalRoot.querySelector(".stlp-modal-search")
            : landingRoot.querySelector("#stlp_search");
        target?.focus();
    }
}

function hideLanding(manual) {
    if (manual) manuallyExited = true;
    closeAllChatsModal();
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
        stampLocalActivity();
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
