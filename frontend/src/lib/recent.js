const KEY = "reelkeep:recent";
const MAX = 5;

export function getRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRecent({ username, fullName = "", avatar = "", thumbs = [] }) {
  try {
    const list = getRecent().filter((p) => p.username !== username);
    list.unshift({
      username,
      fullName,
      avatar,
      thumbs: thumbs.slice(0, 7),
      lastFetched: Date.now(),
    });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage full or blocked; recent list is optional
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}