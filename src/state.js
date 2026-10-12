// Shared mutable refs. Kept tiny on purpose — modules must never
// keep their own copy of these, or they drift out of sync.

export const ui = {
    /** @type {HTMLElement | null} The #landing_page_root element while visible. */
    landingRoot: null,
    /** @type {HTMLElement | null} The "View all" modal overlay while open. */
    allChatsModalRoot: null,
    /** True after the user clicked Exit — suppresses auto-show until a chat opens. */
    manuallyExited: false,
};
