// The "View all" modal: every chat in a grid, with a live filter.
import { extensionName } from "./config.js";
import { ui } from "./state.js";
import { getChatData } from "./chatData.js";
import { renderChatCard } from "./chatCards.js";
import { isEntryExcluded } from "./tagFilter.js";

export function closeAllChatsModal() {
    document.removeEventListener("keydown", onAllChatsModalEsc);
    if (ui.allChatsModalRoot) {
        ui.allChatsModalRoot.remove();
        ui.allChatsModalRoot = null;
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

export function showAllChatsModal() {
    if (!ui.landingRoot || ui.allChatsModalRoot) return;

    ui.allChatsModalRoot = document.createElement("div");
    ui.allChatsModalRoot.className = "stlp-modal-overlay";
    ui.allChatsModalRoot.innerHTML = `
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
    ui.landingRoot.appendChild(ui.allChatsModalRoot);

    const searchInput = ui.allChatsModalRoot.querySelector(".stlp-modal-search");
    const countLabel = ui.allChatsModalRoot.querySelector(".stlp-modal-count");
    const body = ui.allChatsModalRoot.querySelector(".stlp-modal-body");

    ui.allChatsModalRoot.addEventListener("click", (e) => {
        if (e.target === ui.allChatsModalRoot) closeAllChatsModal();
    });
    ui.allChatsModalRoot.querySelector(".stlp-modal-close").addEventListener("click", closeAllChatsModal);
    document.addEventListener("keydown", onAllChatsModalEsc);

    const renderList = (entries, total) => {
        if (!Array.isArray(entries) || entries.length === 0) {
            body.innerHTML = `<div class="stlp-placeholder">No chats match your search.</div>`;
        } else {
            body.innerHTML = "";
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
            const allChats = (await getChatData()).filter(e => !isEntryExcluded(e));
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
