// Landing page lifecycle: build, show, hide, and ST event reactions.
import { extension_settings } from "../../../../extensions.js";
import { extensionName } from "./config.js";
import { ui } from "./state.js";
import { isChatOpen} from "./chatActions.js";
import { renderMyChats } from "./myChats.js";
import { closeAllChatsModal } from "./allChatsModal.js";
import { invalidateChatData } from "./chatData.js";
import { renderCharacterGrid, onGridSearchChange } from "./characterGrid.js";

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
                    <div id="stlp_characters"></div>
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
    el.querySelector("#stlp_search").addEventListener("input", (e) => onGridSearchChange(e.target.value));

    return el;
}

export function showLanding() {
    if (!extension_settings[extensionName]?.enabled) return;
    if (ui.manuallyExited) return;
    if (ui.landingRoot) return;
    console.log(`[${extensionName}] Showing landing page (no chat selected)`);
    ui.landingRoot = buildLanding();
    document.body.appendChild(ui.landingRoot);

    const bg = getStBackground();
    if (bg) {
        ui.landingRoot.style.backgroundImage = bg;
    }

    $("#sheld").hide();

    const chatsContainer = ui.landingRoot.querySelector("#stlp_my_chats");
    renderMyChats(chatsContainer);
    renderCharacterGrid(ui.landingRoot.querySelector("#stlp_characters"));

    document.addEventListener("keydown", onCtrlK);
}

function onCtrlK(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && ui.landingRoot) {
        e.preventDefault();
        // While the modal is open, Ctrl+K targets the modal filter instead
        const target = ui.allChatsModalRoot
            ? ui.allChatsModalRoot.querySelector(".stlp-modal-search")
            : ui.landingRoot.querySelector("#stlp_search");
        target?.focus();
    }
}

export function hideLanding(manual) {
    if (manual) ui.manuallyExited = true;
    closeAllChatsModal();
    document.removeEventListener("keydown", onCtrlK);
    if (!ui.landingRoot) return;
    console.log(`[${extensionName}] Hiding landing page${manual ? " (manual exit)" : ""}`);
    ui.landingRoot.remove();
    ui.landingRoot = null;
    $("#sheld").show();
}

export function updateLanding() {
    if (isChatOpen() || ui.manuallyExited) {
        hideLanding(false);
    } else {
        showLanding();
    }
}

export function onChatChanged() {
    if (isChatOpen()) {
        ui.manuallyExited = false;
    }
    invalidateChatData();
    updateLanding();
}
