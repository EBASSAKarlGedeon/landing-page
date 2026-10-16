// Extension-wide constants. No imports, no logic.

export const extensionName = "landing-page";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// How many chats to index from the server ("recent" list)
export const RECENT_FETCH_MAX = 200;

// Everything the Appearance panel controls. Exported/imported as a "theme".
export const appearanceDefaults = {
    // Colors
    theme: "red",
    accentColor: null,   // null = use the preset's
    accent2Color: null,  // second gradient stop
    bgColor: null,
    // Background
    bgMode: "st",        // st | gradient | solid | image
    bgImageUrl: "",
    overlayOpacity: 85,  // 0–100 darkening over the background
    ambient: true,       // animated glow orbs
    // Surfaces
    cardStyle: "glass",  // glass | solid | outline | neon
    blur: 12,            // glass blur (px)
    radius: 14,          // corner radius (px)
    glow: true,          // accent glow on hover
    animations: true,
    // Typography
    font: "st",          // st | system | serif | rounded | mono
    fontScale: 100,      // %
    // Layout
    density: "comfortable", // compact | comfortable | spacious
    sectionOrder: "chats-first", // chats-first | characters-first
    cardHeight: 260,
    cardMinWidth: 230,
    chatCardWidth: 340,
    // Header
    showHero: true,
    heroTitle: "",       // empty = time-based greeting
    showStats: true,
    // Card details
    showDescription: true,
    showTags: true,
    showTokens: true,
    showChatCount: true,
    // Advanced
    customCss: "",
};

export const defaultSettings = {
    enabled: true,
    chatsShown: 8,
    tagFilter: {}, // tagId -> true (excluded tags hide cards AND their chats)
    defaultSort: "newest",
    showStBar: false, // ST top bar pinned above the landing page
    ...appearanceDefaults,
};
