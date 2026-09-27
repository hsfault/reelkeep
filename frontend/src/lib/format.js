export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / 1_048_576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// Instagram hides the length inside the video link's "efg" parameter
export function videoDuration(item) {
  if (typeof item?.duration === "number") return item.duration;
  try {
    const efg = new URL(item.video_url).searchParams.get("efg");
    if (!efg) return null;
    const json = JSON.parse(atob(efg.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.duration_s === "number" ? json.duration_s : null;
  } catch {
    return null;
  }
}

export function formatDuration(seconds) {
  if (seconds == null) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}