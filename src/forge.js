// Cross-extension bridge: opens the Lorebook Forge Studio.
// Soft dependency — if the lorebook-forge extension isn't installed,
// the landing page degrades gracefully (button hides itself).
import { extensionName } from "./config.js";

const FORGE_STUDIO_URL = "/scripts/extensions/third-party/lorebook-forge/src/studio.js";

let forgePromise = null;

// Loads (once) and caches the Studio module. Rejects if not installed.
export function probeForge() {
    if (!forgePromise) {
        forgePromise = import(FORGE_STUDIO_URL)
            .then(mod => {
                if (typeof mod.openStudio !== "function") throw new Error("openStudio not exported");
                return mod;
            })
            .catch(err => {
                forgePromise = null; // allow retry on next landing show
                console.debug(`[${extensionName}] Lorebook Forge not available:`, err?.message);
                throw err;
            });
    }
    return forgePromise;
}

export async function openForgeStudio() {
    try {
        const mod = await probeForge();
        mod.openStudio();
    } catch {
        toastr.info("Lorebook Forge extension is not installed.", "Landing Page");
    }
}
