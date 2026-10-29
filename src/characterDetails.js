// Character details popup (Stage 7): centered two-column overlay.
// Left: image, name, creation date, Resume latest chat / Start New Chat.
// Right: lorebook list (JAI-style cards, random theme color per open)
//        + creator's notes rendered as sanitized HTML.
import { getContext } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { ui } from "./state.js";
import { escapeHtml, parseTimestamp } from "./helpers.js";
import { getChatData } from "./chatData.js";
import { openEntry } from "./chatActions.js";
import { getFullAvatarUrl } from "./characterCards.js";
import { scrollToLastMessage } from "./chatActions.js";

// JAI script-card palette. Each lorebook gets a random pick per popup open.
const LOREBOOK_COLORS = [
    "#a78bfa", // purple
    "#3b5bdb", // midnight
    "#74c0fc", // sky
    "#2dd4bf", // teal
    "#2f9e44", // forest
    "#63e6be", // mint
    "#51cf66", // green
    "#ff922b", // orange
    "#e8590c", // sunset
    "#ff6b6b", // red
    "#f783ac", // candy/pink
];

function pickLorebookColor() {
    return LOREBOOK_COLORS[Math.floor(Math.random() * LOREBOOK_COLORS.length)];
}

// Minimal sanitizer for creator's notes: strip dangerous elements and
// event-handler / javascript: attributes, keep the rest of the HTML.
function sanitizeHtml(dirty) {
    const doc = new DOMParser().parseFromString(String(dirty ?? ""), "text/html");
    doc.querySelectorAll("script, style, iframe, object, embed, link, meta, base, form").forEach(el => el.remove());
    doc.querySelectorAll("*").forEach(el => {
        [...el.attributes].forEach(attr => {
            const name = attr.name.toLowerCase();
            const value = String(attr.value).toLowerCase().trim();
            if (name.startsWith("on")) {
                el.removeAttribute(attr.name);
            } else if ((name === "href" || name === "src") &&
                       (value.startsWith("javascript:") || value.startsWith("data:text/html"))) {
                el.removeAttribute(attr.name);
            }
        });
    });
    return doc.body.innerHTML;
}

// Priority: creator_notes -> creatorcomment -> description fallback.
function creatorNotesHtml(character) {
    const raw = character?.creator_notes
        ?? character?.data?.creator_notes
        ?? character?.creatorcomment
        ?? character?.data?.creatorcomment
        ?? "";
    const text = String(raw).trim();
    if (text) {
        // Render as HTML when it looks like HTML, else escaped plain text
        if (/<[a-z][^>]*>/i.test(text)) return sanitizeHtml(text);
        return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
    }
    const desc = String(character?.description ?? character?.data?.description ?? "").trim();
    if (!desc) return `<p class="stlp-details-empty">No creator's notes.</p>`;
    return `<p>${escapeHtml(desc).replace(/\n/g, "<br>")}</p>`;
}

function creationDateLabel(character) {
    const ts = parseTimestamp(character?.date_added ?? character?.data?.date_added ?? 0);
    return ts
        ? new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
        : "Unknown";
}

// ST characters have at most one linked lorebook (data.extensions.world)
// plus possibly an embedded book (data.character_book).
function getCharacterLorebooks(character) {
    const names = new Set();
    const linked = character?.data?.extensions?.world ?? character?.world;
    if (typeof linked === "string" && linked) names.add(linked);
    const book = character?.data?.character_book;
    if (book?.name) names.add(book.name);
    return [...names];
}

async function lorebookEntryCount(name, character) {
    const book = character?.data?.character_book;
    if (book?.name === name && Array.isArray(book.entries)) return book.entries.length;
    const ctx = getContext();
    if (typeof ctx.loadWorldInfo === "function") {
        try {
            const data = await ctx.loadWorldInfo(name);
            const entries = data?.entries;
            if (entries && typeof entries === "object") return Object.keys(entries).length;
        } catch { /* fall through */ }
    }
    return null; // unknown — label degrades gracefully
}

function lorebookCardHtml(name, count) {
    const countLabel = count === null
        ? "World Info"
        : `${count} entr${count === 1 ? "y" : "ies"}`;
    return `
        <div class="stlp-lb-card" style="--stlp-lb-color:${pickLorebookColor()}">
            <div class="stlp-lb-header">
                <h4 class="stlp-lb-title">${escapeHtml(name)}</h4>
                <span class="stlp-lb-badge">Lorebook</span>
            </div>
            <div class="stlp-lb-meta"><span>${countLabel}</span></div>
        </div>
    `;
}

export function closeCharacterDetails() {
    document.removeEventListener("keydown", onDetailsEsc);
    if (ui.characterDetailsRoot) {
        ui.characterDetailsRoot.remove();
        ui.characterDetailsRoot = null;
    }
}

function onDetailsEsc(e) {
    if (e.key === "Escape") {
        e.preventDefault();
        closeCharacterDetails();
    }
}

export async function showCharacterDetails(character) {
    if (!ui.landingRoot || ui.characterDetailsRoot) return;

    ui.characterDetailsRoot = document.createElement("div");
    ui.characterDetailsRoot.className = "stlp-modal-overlay";
    ui.characterDetailsRoot.innerHTML = `
        <div class="stlp-details" role="dialog" aria-modal="true" aria-label="Character details">
            <button class="stlp-icon-btn stlp-details-close" title="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div class="stlp-details-left">
                <div class="stlp-details-art">
                    <img src="${getFullAvatarUrl(character.avatar)}" alt="${escapeHtml(character.name)}"
                         onerror="this.style.visibility='hidden'" />
                </div>
                <h3 class="stlp-details-name">${escapeHtml(character.name)}</h3>
                <div class="stlp-details-date">Created: ${creationDateLabel(character)}</div>
                <div class="stlp-details-actions">
                    <button class="stlp-details-resume" style="display:none;">Resume latest chat</button>
                    <button class="stlp-details-newchat">Start New Chat</button>
                </div>
            </div>
            <div class="stlp-details-right">
                <section class="stlp-details-section">
                    <h4 class="stlp-details-section-title">Lorebooks</h4>
                    <div class="stlp-lb-list"></div>
                </section>
                <section class="stlp-details-section">
                    <h4 class="stlp-details-section-title">Creator's Notes</h4>
                    <div class="stlp-details-notes">${creatorNotesHtml(character)}</div>
                </section>
            </div>
        </div>
    `;
    ui.landingRoot.appendChild(ui.characterDetailsRoot);

    ui.characterDetailsRoot.addEventListener("click", (e) => {
        if (e.target === ui.characterDetailsRoot) closeCharacterDetails();
    });
    ui.characterDetailsRoot.querySelector(".stlp-details-close").addEventListener("click", closeCharacterDetails);
    document.addEventListener("keydown", onDetailsEsc);

    // Lorebook list (random colors re-rolled on every open, per your spec)
    const lbList = ui.characterDetailsRoot.querySelector(".stlp-lb-list");
    const lorebooks = getCharacterLorebooks(character);
    if (lorebooks.length === 0) {
        lbList.innerHTML = `<div class="stlp-details-empty">No lorebooks linked to this character.</div>`;
    } else {
        for (const name of lorebooks) {
            const count = await lorebookEntryCount(name, character);
            lbList.insertAdjacentHTML("beforeend", lorebookCardHtml(name, count));
        }
    }

    // Resume latest chat — only appears when the character has chats
    const resumeBtn = ui.characterDetailsRoot.querySelector(".stlp-details-resume");
    try {
        const allChats = await getChatData().catch(() => []);
        const latest = allChats.find(e => e.character?.avatar === character.avatar) || null;
        if (latest) {
            resumeBtn.style.display = "";
            resumeBtn.addEventListener("click", () => openEntry(latest));
        }
    } catch { /* resume stays hidden */ }

    // Start New Chat. ST auto-creates the first chat when selecting a character
    // with no chats, so doNewChat is only needed when chats already exist.
    ui.characterDetailsRoot.querySelector(".stlp-details-newchat").addEventListener("click", async () => {
        try {
            const ctx = getContext();
            const scriptModule = await import("../../../../../script.js");
            const characterId = ctx.characters.findIndex(c => c.avatar === character.avatar);
            if (characterId === -1) throw new Error("Character not found");
            const hadChats = (await getChatData().catch(() => []))
                .some(e => e.character?.avatar === character.avatar);
            await ctx.selectCharacterById(characterId);
            if (hadChats) {
                if (typeof scriptModule.doNewChat !== "function") {
                    throw new Error("doNewChat is not exported in this ST version");
                }
                await scriptModule.doNewChat({ deleteCurrentChat: false });
            }
            scrollToLastMessage();
        } catch (err) {
            console.error(`[${extensionName}] Failed to start new chat:`, err);
            toastr.error(`Could not start a new chat: ${err.message}`, "Landing Page");
        }
    });
}
