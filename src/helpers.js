// Pure functions: timestamps, text sanitizing, keys. No imports, no side effects.

function normalizeTimestamp(ts) {
    const n = Number(ts);
    return n < 1e12 ? n * 1000 : n;
}

// Accepts ISO strings ("2026-10-11T22:20:01.201Z"), epoch ms, or epoch s
export function parseTimestamp(value) {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return normalizeTimestamp(n);
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? 0 : parsed;
}

export function chatKey(scope, fileName) {
    return `${scope}::${String(fileName ?? "").replace(/\.jsonl?$/i, "")}`;
}

export function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function timeAgo(ts) {
    const then = Number(ts);
    if (!Number.isFinite(then) || then <= 0) return "—";
    const diff = Date.now() - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function prettyChatName(fileName) {
    return String(fileName ?? "").replace(/\.jsonl?$/i, "");
}

export function descriptionSnippet(character) {
    const raw = String(character?.description || character?.creator_notes || "")
        .replace(/[*#`>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return raw || "No description available.";
}

// Plain-text snippet of the last message (for group cards)
export function messageSnippet(text) {
    const raw = String(text ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/[*#`>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return raw ? raw.slice(0, 220) + (raw.length > 220 ? "…" : "") : "No messages yet.";
}
