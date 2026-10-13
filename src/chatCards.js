// Renders ONE chat card. Shared by the My Chats carousel and the View-all modal.
import { getContext } from "../../../../extensions.js";
import { openEntry } from "./chatActions.js";
import { escapeHtml, timeAgo, messageSnippet } from "./helpers.js";

export function renderChatCard(entry) {
    const { character, group, chat, ts } = entry;
    const ctx = getContext();
    const name = character?.name || group?.name || "Unknown";
    const msgCount = chat.chat_items ?? 0;
    const isGroup = !!group;

    const avatarInner = isGroup
        ? `<div class="stlp-chat-avatar-fallback">${escapeHtml((name || "?").trim().charAt(0).toUpperCase())}</div>`
        : `<img class="stlp-chat-avatar" src="${ctx.getThumbnailUrl("avatar", character.avatar)}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'" />`;

    const desc = messageSnippet(chat.mes);

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
