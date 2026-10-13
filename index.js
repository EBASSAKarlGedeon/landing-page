jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        $("#landing_page_enabled").on("input", onEnabledChange);
        loadSettings();

        // Global shortcut: Ctrl+L toggles the landing page (both directions)
        document.addEventListener("keydown", onCtrlL);

        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        // Character list loads after we do — refresh when it's ready
        if (event_types.CHARACTER_PAGE_LOADED) {
            eventSource.on(event_types.CHARACTER_PAGE_LOADED, () => {
                invalidateChatData();
                updateLanding();
            });
        }
        if (event_types.APP_READY) {
            eventSource.on(event_types.APP_READY, () => setTimeout(updateLanding, 100));
        }
        setTimeout(updateLanding, 1000);

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
