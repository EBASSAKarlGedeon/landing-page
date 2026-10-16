// The hero header: greeting, quick stats, and a "jump back in" button
// for the most recent chat.
import { extension_settings, getContext } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { getChatData, waitForCharacters } from "./chatData.js";
import { openEntry } from "./chatActions.js";
import { isEntryExcluded, isCharacterExcluded } from "./tagFilter.js";
import { escapeHtml } from "./helpers.js";

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Up late";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
}

function titleText() {
    const custom = String(extension_settings[extensionName].heroTitle || "").trim();
    if (custom) return custom;
    const user = getContext().name1;
    return user ? `${greeting()}, ${user}` : greeting();
}

function stat(icon, value, label) {
    return `
        <div class="stlp-stat">
            <span class="stlp-stat-icon">${icon}</span>
            <span class="stlp-stat-value">${value}</span>
            <span class="stlp-stat-label">${label}</span>
        </div>`;
}

const ICONS = {
    users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
};

export async function renderHero(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="stlp-hero-text">
            <h1 class="stlp-hero-title">${escapeHtml(titleText())}</h1>
            <p class="stlp-hero-sub">Pick up where you left off, or meet someone new.</p>
        </div>
        <div class="stlp-hero-side">
            <div class="stlp-stats"></div>
            <div class="stlp-hero-cta"></div>
        </div>
    `;

    try {
        const [characters, allChats] = await Promise.all([
            waitForCharacters(),
            getChatData().catch(() => []),
        ]);
        const chars = characters.filter(c => !isCharacterExcluded(c));
        const chats = allChats.filter(e => !isEntryExcluded(e));
        const favs = chars.filter(c => c.fav).length;

        container.querySelector(".stlp-stats").innerHTML =
            stat(ICONS.users, chars.length, "characters") +
            stat(ICONS.chat, chats.length, "chats") +
            stat(ICONS.heart, favs, "favorites");

        const latest = chats[0];
        if (latest) {
            const name = latest.character?.name || latest.group?.name || "chat";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "stlp-btn-primary stlp-hero-continue";
            btn.innerHTML = `${ICONS.play}<span>Continue with <b>${escapeHtml(name)}</b></span>`;
            btn.addEventListener("click", () => openEntry(latest));
            container.querySelector(".stlp-hero-cta").appendChild(btn);
        }
    } catch (err) {
        console.warn(`[${extensionName}] Hero stats failed:`, err);
    }
}

// Cheap title-only refresh (used while typing a custom title)
export function refreshHeroTitle(container) {
    const el = container?.querySelector(".stlp-hero-title");
    if (el) el.textContent = titleText();
}
