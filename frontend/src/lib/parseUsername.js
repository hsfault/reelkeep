const RESERVED = new Set([
  "p", "reel", "reels", "stories", "explore", "accounts",
  "tv", "direct", "about", "legal", "developer",
]);
const USERNAME_RE = /^[a-z0-9._]{1,30}$/;
const INVALID = "That doesn't look like an Instagram profile link.";

// Mirrors the backend's parse_username so mistakes show instantly.
export function parseUsername(raw) {
  let text = (raw || "").trim().replace(/^@/, "");
  if (!text) return { error: "Paste an Instagram profile link or username." };

  if (/instagram\.com/i.test(text)) {
    const path = text.split(/instagram\.com/i)[1].split(/[?#]/)[0];
    const parts = path.split("/").filter(Boolean);
    if (!parts.length || RESERVED.has(parts[0].toLowerCase())) return { error: INVALID };
    text = parts[0];
  }

  text = text.toLowerCase();
  if (!USERNAME_RE.test(text)) return { error: INVALID };
  return { username: text };
}