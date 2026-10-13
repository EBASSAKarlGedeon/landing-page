// The "My Chats" section: horizontal carousel of the N most recent chats.
// Privacy rule: chats whose character carries an excluded tag are hidden.
import { extension_settings } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { getChatData } from "./chatData.js";
import { renderChatCard } from "./chatCards.js";
import { showAllChatsModal } from "./allChatsModal.js";
import { isEntryExcluded } from "./tagFilter.js";

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

    // Privacy rule: excluded tags hide their chats too.
    const visible = allChats.filter(e => !isEntryExcluded(e));

    if (visible.length === 0) {
        container.innerHTML = allChats.length > 0
            ? `<div class="stlp-placeholder">All chats are hidden by the tag filter.</div>`
            : `<div class="stlp-placeholder">No chats yet — start one from the Characters section below.</div>`;
        return;
    }

    container.innerHTML = "";
    const shown = visible.slice(0, limit);
    for (const entry of shown) {
        container.appendChild(renderChatCard(entry));
    }
    if (visible.length > limit) {
        const more = document.createElement("button");
        more.className = "stlp-chat-more";
        more.type = "button";
        more.textContent = `View all (${visible.length})`;
        more.addEventListener("click", () => showAllChatsModal());
        container.appendChild(more);
    }
}
