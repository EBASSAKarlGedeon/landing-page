// The Extensions-drawer settings UI (checkbox in #extensions_settings2).
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { extensionName, defaultSettings } from "./config.js";
import { hideLanding, updateLanding } from "./landing.js";

export async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    extension_settings[extensionName].tagFilter = extension_settings[extensionName].tagFilter || {};
    const s = extension_settings[extensionName];
    for (const key of Object.keys(defaultSettings)) {
        if (s[key] === undefined) s[key] = defaultSettings[key];
    }
    $("#landing_page_enabled").prop("checked", extension_settings[extensionName].enabled);
}

export function onEnabledChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Setting saved:`, value);
    if (!value) {
        hideLanding(false);
    } else {
        updateLanding();
    }
}
