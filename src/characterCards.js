// Renders ONE character card for the grid (JAI style) + the favorite toggle.
// Grid art uses the FULL-QUALITY avatar PNG (/characters/<avatar>) instead
// of the /thumbnail endpoint, which locks images to a tiny 96x144 crop.
import { getContext } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { escapeHtml, descriptionSnippet } from "./helpers.js";
import { getAllTags, getCharacterTagIds } from "./tagFilter.js";

// Full-quality character image. Character cards are PNGs served
// straight from the /characters/ directory.
export function getFullAvatarUrl(avatar) {
    return `/characters/${encodeURIComponent(avatar)}`;
}

// Pre-decode via Image().decode() so the browser's decoded-image cache
// holds the bitmap when the real <img> lands in DOM. URL matches the
// card path exactly so the cache key lines up. Capped to avoid
// hammering the browser with dozens of simultaneous full-size decodes.
const inFlightPreloads = new Set();

export function preloadCharacterAvatars(characters) {
    const CAP = 12;
    for (const character of characters) {
        if (inFlightPreloads.size >= CAP) break;
        if (!character?.avatar || inFlightPreloads.has(character.avatar)) continue;
        inFlightPreloads.add(character.avatar);
        const img = new Image();
        img.src = getFullAvatarUrl(character.avatar);
        img.decode()
            .catch(() => {}) // 404s etc. just fall back to onerror in the card
            .finally(() => inFlightPreloads.delete(character.avatar));
    }
}

// Syncs with ST's native favorites (power_user.favorites) so the
// hearts agree in both UIs, then asks ST to redraw its character list.
export async function toggleFavorite(character) {
    const ctx = getContext();
    const favorites = ctx.powerUserSettings?.favorites;
    if (!Array.isArray(favorites)) {
        toastr.warning("Favorites storage not available in this ST version.", "Landing Page");
        return;
    }
    const i = favorites.indexOf(character.avatar);
    if (character.fav) {
        if (i !== -1) favorites.splice(i, 1);
        character.fav = false;
    } else {
        if (i === -1) favorites.push(character.avatar);
        character.fav = true;
    }
    ctx.saveSettingsDebounced();
    try {
        const scriptModule = await import("../../../../../script.js");
        if (typeof scriptModule.printCharactersDebounced === "function") {
            scriptModule.printCharactersDebounced();
        }
    } catch { /* non-fatal: native list refresh */ }
}

function tagChipsHtml(character) {
    const tagsById = new Map(getAllTags().map(t => [t.id, t]));
    const chips = getCharacterTagIds(character)
        .map(id => tagsById.get(id))
        .filter(Boolean)
        .slice(0, 4);
    if (!chips.length) return "";
    return chips.map(t => `
        <span class="stlp-char-tag"${t.color ? ` style="--stlp-tag-color:${escapeHtml(t.color)}"` : ""}>${escapeHtml(t.name)}</span>
    `).join("");
}

export function renderCharacterCard(character, chatCount, handlers) {
    const card = document.createElement("div");
    card.className = "stlp-char-card";
    card.title = character.name;
    card.innerHTML = `
        <div class="stlp-char-art">
            <img src="${getFullAvatarUrl(character.avatar)}" alt="" loading="lazy"
                 onerror="this.style.visibility='hidden'" />
            <div class="stlp-char-art-fade"></div>
            <span class="stlp-char-ribbon">${chatCount} chat${chatCount === 1 ? "" : "s"}</span>
            <button class="stlp-char-fav${character.fav ? " active" : ""}" title="${character.fav ? "Remove from favorites" : "Add to favorites"}">
                <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
            <div class="stlp-char-name">${escapeHtml(character.name)}</div>
        </div>
        <div class="stlp-char-body">
            <div class="stlp-char-desc">${escapeHtml(descriptionSnippet(character))}</div>
            <div class="stlp-char-meta">
                <div class="stlp-char-tags">${tagChipsHtml(character)}</div>
                <span class="stlp-char-tokens">…</span>
            </div>
        </div>
    `;

    card.querySelector(".stlp-char-fav").addEventListener("click", (e) => {
        e.stopPropagation();
        handlers.onFavoriteToggle(character);
    });
    card.addEventListener("click", () => handlers.onOpen(character));

    // Token count of the description — local tokenizer, fire and forget
    const ctx = getContext();
    const tokensLabel = card.querySelector(".stlp-char-tokens");
    if (typeof ctx.getTokenCountAsync === "function") {
        ctx.getTokenCountAsync(String(character.description || ""))
            .then(n => { if (Number.isFinite(n)) tokensLabel.textContent = `${n} tokens`; })
            .catch(() => tokensLabel.remove());
    } else {
        tokensLabel.remove();
    }
    return card;
}
