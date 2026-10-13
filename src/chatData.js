// Chat list data: one request to /api/chats/recent, plus the cache.
// This module is the ONLY place that owns chatDataPromise.
// Everyone else goes through getChatData() — that's what prevents
// the "await-ternary returned a Promise" class of bug for good.
import { extension_settings, getContext } from "../../../../extensions.js";
import { extensionName, RECENT_FETCH_MAX } from "./config.js";
import { prettyChatName, chatKey, parseTimestamp } from "./helpers.js";

let chatDataPromise = null;

export function getChatData() {
    if (!chatDataPromise) {
        chatDataPromise = loadAllChatData();
    }
    return chatDataPromise;
}

export function invalidateChatData() {
    chatDataPromise = null;
}

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

// Characters array isn't populated until ST emits character_page_loaded.
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
        // Exactly like native Recent Chats: sort by last message time only.
        // Opening a chat does NOT reorder; sending a message does.
        const ts = parseTimestamp(item.last_mes);

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
