// The "Characters" section: JAI-style grid with a filter bar.
// Filters: All / Favorites pills, sort dropdown, search (the top-bar
// Ctrl+K box feeds this), and dynamic tag chips from ST's tag system.
// Privacy rule: an excluded tag hides those cards AND their chats.
import { extension_settings, getContext } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { extensionName } from "./config.js";
import { ui } from "./state.js";
import { getChatData, waitForCharacters } from "./chatData.js";
import { renderCharacterCard, toggleFavorite } from "./characterCards.js";
import { getAllTags, isTagExcluded, toggleTagExclusion, isCharacterExcluded } from "./tagFilter.js";
import { renderMyChats } from "./myChats.js";
import { openEntry } from "./chatActions.js";
import { escapeHtml, parseTimestamp } from "./helpers.js";

const PAGE_SIZE = 24;

const SORTS = [
    { id: "newest", label: "Newest first" },
    { id: "oldest", label: "Oldest first" },
    { id: "name", label: "Name (A–Z)" },
];

// Ephemeral UI state. Tag exclusions persist in extension settings.
const gridState = {
    search: "",
    sort: "newest",
    favoritesOnly: false,
    shown: PAGE_SIZE,
};

// Loaded once per landing show; reused while filtering.
let gridData = { characters: [], counts: new Map(), latest: new Map() };

function charDate(character) {
    return parseTimestamp(character?.date_added ?? character?.data?.date_added ?? 0);
}

function visibleCharacters() {
    let list = gridData.characters.filter(c => !isCharacterExcluded(c));
    if (gridState.favoritesOnly) list = list.filter(c => c.fav);
    const q = gridState.search.trim().toLowerCase();
    if (q) list = list.filter(c => String(c.name ?? "").toLowerCase().includes(q));

    switch (gridState.sort) {
        case "oldest": list.sort((a, b) => charDate(a) - charDate(b)); break;
        case "name": list.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""))); break;
        default: list.sort((a, b) => charDate(b) - charDate(a));
    }
    return list;
}

function filterBarHtml() {
    const chips = getAllTags().map(tag => `
        <button type="button" class="stlp-char-tag-chip${isTagExcluded(tag.id) ? " excluded" : ""}"
                data-tag-id="${escapeHtml(tag.id)}"
                title="Click to exclude / include — excluded tags hide those characters and their chats">
            ${tag.color ? `<span class="stlp-tag-dot" style="--stlp-tag-color:${escapeHtml(tag.color)}"></span>` : ""}
            <span>${escapeHtml(tag.name)}</span>
        </button>
    `).join("");

    return `
        <div class="stlp-char-filterbar">
            <div class="stlp-char-pills">
                <button type="button" class="stlp-char-pill${gridState.favoritesOnly ? "" : " active"}" data-pill="all">All</button>
                <button type="button" class="stlp-char-pill${gridState.favoritesOnly ? " active" : ""}" data-pill="favorites">Favorites</button>
            </div>
            <select class="stlp-char-sort" title="Sort characters">
                ${SORTS.map(s => `<option value="${s.id}"${gridState.sort === s.id ? " selected" : ""}>${s.label}</option>`).join("")}
            </select>
            <span class="stlp-char-count"></span>
        </div>
        <div class="stlp-char-tagbar">${chips || `<span class="stlp-char-tagbar-empty">No tags yet — create them in SillyTavern's tag manager.</span>`}</div>
        <div class="stlp-char-grid"></div>
    `;
}

function renderGrid(container) {
    if (!container) return;
    const list = visibleCharacters();

    container.innerHTML = filterBarHtml();
    const gridEl = container.querySelector(".stlp-char-grid");
    container.querySelector(".stlp-char-count").textContent =
        `${list.length} character${list.length === 1 ? "" : "s"}`;

    const shown = list.slice(0, gridState.shown);
    for (const character of shown) {
        gridEl.appendChild(renderCharacterCard(character, gridData.counts.get(character.avatar) || 0, {
            onFavoriteToggle: async (c) => {
                await toggleFavorite(c);
                renderGrid(container); // refresh hearts + favorites pill
            },
            onOpen: (c) => {
                // Until Stage 7's details popup: open the latest chat.
                const entry = gridData.latest.get(c.avatar);
                if (entry) {
                    openEntry(entry);
                } else {
                    toastr.info(`${c.name} has no chats yet — the details popup arrives in Stage 7.`, "Landing Page");
                }
            },
        }));
    }

    if (list.length === 0) {
        gridEl.innerHTML = `<div class="stlp-placeholder">No characters match your filters.</div>`;
    } else if (list.length > shown.length) {
        const more = document.createElement("button");
        more.className = "stlp-load-more";
        more.type = "button";
        more.textContent = `Load more (${list.length - shown.length} left)`;
        more.addEventListener("click", () => {
            gridState.shown += PAGE_SIZE;
            renderGrid(container);
        });
        gridEl.appendChild(more);
    }

    container.querySelectorAll(".stlp-char-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            gridState.favoritesOnly = pill.dataset.pill === "favorites";
            renderGrid(container);
        });
    });
    container.querySelector(".stlp-char-sort").addEventListener("change", (e) => {
        gridState.sort = e.target.value;
        renderGrid(container);
    });
    container.querySelectorAll(".stlp-char-tag-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const excluded = toggleTagExclusion(chip.dataset.tagId);
            saveSettingsDebounced();
            console.log(`[${extensionName}] Tag ${excluded ? "excluded" : "included"}:`,
                chip.querySelector("span:last-child")?.textContent ?? chip.dataset.tagId);
            renderGrid(container);
            // Privacy rule: My Chats must obey the tag filter too
            renderMyChats(ui.landingRoot?.querySelector("#stlp_my_chats"));
        });
    });
}

export async function renderCharacterGrid(container) {
    if (!container) return;
    container.innerHTML = `<div class="stlp-placeholder">Loading characters…</div>`;
    try {
        const [characters, allChats] = await Promise.all([
            waitForCharacters(),
            getChatData().catch(() => []),
        ]);

        const counts = new Map();
        const latest = new Map();
        for (const entry of allChats) {
            if (!entry.character) continue; // group chats
            const avatar = entry.character.avatar;
            counts.set(avatar, (counts.get(avatar) || 0) + 1);
            if (!latest.has(avatar)) latest.set(avatar, entry); // already sorted desc
        }
        gridData = { characters, counts, latest };

        gridState.shown = PAGE_SIZE;
        gridState.search = ""; // the top-bar box is rebuilt empty on each show
        renderGrid(container);
    } catch (err) {
        console.error(`[${extensionName}] Character grid load failed:`, err);
        container.innerHTML = `<div class="stlp-placeholder">Failed to load characters — check console (F12).</div>`;
    }
}

// The top-bar search box (Ctrl+K) feeds the grid.
export function onGridSearchChange(value) {
    gridState.search = String(value ?? "");
    gridState.shown = PAGE_SIZE;
    if (ui.landingRoot) {
        renderGrid(ui.landingRoot.querySelector("#stlp_characters"));
    }
}
