// The "My Chats" section: horizontal carousel of the N most recent chats.
import { extension_settings } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { getChatData } from "./chatData.js";
import { renderChatCard } from "./chatCards.js";
import { showAllChatsModal } from "./allChatsModal.js";

export async function renderMyChats(container) {
    const settings = extension_settings[extensionName];
    const limit = settings.chatsShown ?? 8;

    container.innerHTML = `<div class="stlp-placeholder">Loading chats…</div>`;

    let allChats;
    try {
        allChats = await getChatData();
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
