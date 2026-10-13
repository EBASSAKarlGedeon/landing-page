// Extension-wide constants. No imports, no logic.

export const extensionName = "landing-page";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// How many chats to index from the server ("recent" list)
export const RECENT_FETCH_MAX = 200;

export const defaultSettings = {
    enabled: true,
    chatsShown: 8,
    tagFilter: {}, // tagId -> true (excluded tags hide cards AND their chats)
};