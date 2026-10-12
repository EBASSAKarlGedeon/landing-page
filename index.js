import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "filtered-welcome-chats";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = { enabled: true };

function getSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    return extension_settings[extensionName];
}

function loadSettings() {
    getSettings();
    $("#fwc_enabled").prop("checked", extension_settings[extensionName].enabled);
}

function onCheckboxChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Setting saved:`, value);
    applyFilter(); // apply immediately when toggled
}

/**
 * Checks if a character is excluded by the current tag filter.
 * Tag filtering adds the `not_fit` class to character blocks.
 */
function isCharacterFiltered(avatar) {
    if (!avatar) return false;
    const block = document.querySelector(
        `#rm_print_characters_block .character_select[avatar="${CSS.escape(avatar)}"]`,
    );
    return block ? block.classList.contains("not_fit") : false;
}

/**
 * Checks if a group is excluded by the current tag filter.
 */
function isGroupFiltered(groupId) {
    if (!groupId) return false;
    const block = document.querySelector(
        `#rm_print_characters_block .group_select[grid="${CSS.escape(groupId)}"]`,
    );
    return block ? block.classList.contains("not_fit") : false;
}

/**
 * Hides welcome-screen recent chats whose character/group is filtered out by tags.
 * @returns {number} Count of rows currently hidden
 */
function applyFilter() {
    const settings = getSettings();
    const rows = document.querySelectorAll("#chat .recentChat");
    let hidden = 0;

    rows.forEach((row) => {
        const avatar = row.getAttribute("data-avatar");
        const group = row.getAttribute("data-group");
        const filtered = avatar ? isCharacterFiltered(avatar) : isGroupFiltered(group);

        if (settings.enabled && filtered) {
            row.classList.add("fwc-hidden");
            hidden++;
        } else {
            row.classList.remove("fwc-hidden");
        }
    });

    console.debug(`[${extensionName}] Filter applied. Hidden rows: ${hidden}`);
    return hidden;
}

// Debounced re-apply (observers can fire in bursts)
let applyTimer = null;
function scheduleApplyFilter() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyFilter, 100);
}

function onButtonClick() {
    const hidden = applyFilter();
    toastr.info(
        extension_settings[extensionName].enabled
            ? `Hidden ${hidden} filtered chat${hidden === 1 ? "" : "s"}`
            : "Extension is disabled",
        "Filtered Welcome Chats",
    );
}

function setupObservers() {
    // Re-apply when the welcome panel re-renders (new rows are created without our class)
    const chatEl = document.getElementById("chat");
    if (chatEl) {
        new MutationObserver(scheduleApplyFilter).observe(chatEl, { childList: true, subtree: true });
    }

    // Re-apply when tag filtering toggles `not_fit` on character/group blocks
    const charBlock = document.getElementById("rm_print_characters_block");
    if (charBlock) {
        new MutationObserver(scheduleApplyFilter).observe(charBlock, {
            attributes: true,
            attributeFilter: ["class"],
            subtree: true,
        });
    }
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        $("#fwc_enabled").on("input", onCheckboxChange);
        $("#fwc_apply_button").on("click", onButtonClick);

        loadSettings();
        setupObservers();

        // Also re-apply on app ready / chat changes (belt and suspenders)
        eventSource.on(event_types.APP_READY, () => setTimeout(applyFilter, 500));
        eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(applyFilter, 300));

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
