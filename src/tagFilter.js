// Tag filter: which tags exist, which are excluded, and what the
// exclusions hide. Privacy rule: an excluded tag hides those
// character cards AND their chats — the tag filter wins everywhere.
import { extension_settings, getContext } from "../../../../extensions.js";
import { extensionName } from "./config.js";

function excludedTags() {
    const settings = extension_settings[extensionName];
    settings.tagFilter = settings.tagFilter || {};
    return settings.tagFilter; // { [tagId]: true }
}

export function isTagExcluded(tagId) {
    return !!excludedTags()[tagId];
}

// Returns the NEW excluded state. Caller persists via saveSettingsDebounced.
export function toggleTagExclusion(tagId) {
    const map = excludedTags();
    if (map[tagId]) delete map[tagId];
    else map[tagId] = true;
    return isTagExcluded(tagId);
}

export function getAllTags() {
    const tags = getContext().tags;
    return Array.isArray(tags) ? tags : [];
}

export function getCharacterTagIds(character) {
    const tagMap = getContext().tagMap;
    const avatar = character?.avatar;
    if (!tagMap || !avatar) return [];
    const ids = tagMap[avatar];
    return Array.isArray(ids) ? ids : [];
}

function characterHasExcludedTag(character) {
    return getCharacterTagIds(character).some(isTagExcluded);
}

export function isCharacterExcluded(character) {
    return characterHasExcludedTag(character);
}

// A chat entry is hidden when its character carries an excluded tag,
// or (for group chats) when ANY member character does.
export function isEntryExcluded(entry) {
    if (entry.character && characterHasExcludedTag(entry.character)) return true;
    const members = Array.isArray(entry.group?.members) ? entry.group.members : [];
    if (members.length === 0) return false;
    const characters = getContext().characters || [];
    return members.some(avatar => {
        const member = characters.find(c => c.avatar === avatar);
        return member ? characterHasExcludedTag(member) : false;
    });
}
