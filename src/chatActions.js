// Opening chats (verified sequence from ST's own welcome screen),
// the "was here" activity stamp, and the is-chat-open check.
import { extension_settings, getContext } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { extensionName } from "./config.js";
import { chatKey } from "./helpers.js";

let scriptModulePromise = null;   // cached dynamic import of script.js
let groupModulePromise = null;    // cached dynamic import of group-chats.js

function getScriptModule() {
    if (!scriptModulePromise) scriptModulePromise = import("../../../../../script.js");
    return scriptModulePromise;
}

function getGroupModule() {
    if (!groupModulePromise) groupModulePromise = import("../../../../group-chats.js");
    return groupModulePromise;
}

export function isChatOpen() {
    const ctx = getContext();
    const charOk = ctx.characterId !== -1 && ctx.characterId !== null && ctx.characterId !== undefined;
    const groupOk = ctx.groupId !== null && ctx.groupId !== undefined;
    return charOk || groupOk;
}

async function openCharacterChatFile(avatar, chatName) {
    const ctx = getContext();
    const scriptModule = await getScriptModule();
    const characterId = ctx.characters.findIndex(c => c.avatar === avatar);
    if (characterId === -1) throw new Error(`Character not found for avatar: ${avatar}`);

    await ctx.selectCharacterById(characterId);
    if (typeof scriptModule.setActiveCharacter === "function") {
        scriptModule.setActiveCharacter(avatar);
    }
    ctx.saveSettingsDebounced();
    if (ctx.getCurrentChatId() === chatName) {
        console.debug(`[${extensionName}] Chat ${chatName} is already open.`);
        return;
    }
    await ctx.openCharacterChat(chatName);
}

async function openGroupChatFile(groupId, chatName) {
    const ctx = getContext();
    const scriptModule = await getScriptModule();
    const groupModule = await getGroupModule();
    if (typeof groupModule.openGroupById !== "function") {
        throw new Error("openGroupById is not available in this ST version");
    }

    await groupModule.openGroupById(groupId);
    if (typeof scriptModule.setActiveGroup === "function") {
        scriptModule.setActiveGroup(groupId);
    }
    ctx.saveSettingsDebounced();
    if (ctx.getCurrentChatId() === chatName) return;
    await ctx.openGroupChat(groupId, chatName);
}

export async function openEntry(entry) {
    const label = entry.character?.name || entry.group?.name || "chat";
    console.log(`[${extensionName}] Opening: ${label} / ${entry.chat.file_name}`);
    try {
        if (entry.groupId) {
            await openGroupChatFile(entry.groupId, entry.chat.file_name);
        } else {
            await openCharacterChatFile(entry.avatar, entry.chat.file_name);
        }
    } catch (err) {
        console.error(`[${extensionName}] Failed to open chat:`, err);
        toastr.error(`Could not open chat: ${err.message}`, "Landing Page");
    }
}
