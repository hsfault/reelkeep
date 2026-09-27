export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new ApiError(
      "server_offline",
      "Can't reach Reelkeep. Make sure the server is running.",
      0
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body; handled below
  }

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      err?.code || "http_error",
      err?.message || `Request failed (${res.status}).`,
      res.status
    );
  }
  return data;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// Identical requests that are already running share one promise.
// This stops React StrictMode (dev) from hitting Instagram twice.
const inflight = new Map();

export function fetchBatch(username, offset = 0) {
  const key = `${username}:${offset}`;
  if (inflight.has(key)) return inflight.get(key);

  const promise = request(
    `/api/fetch?url=${encodeURIComponent(username)}&offset=${offset}`
  ).finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export function getHealth() {
  return request("/api/health");
}

// ---- ZIP jobs ----

export function startZip(username, items) {
  return request("/api/zip", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      username,
      items: items.map(({ id, video_url, shortcode, date }) => ({ id, video_url, shortcode, date })),
    }),
  });
}

export function getZip(jobId) {
  return request(`/api/zip/${jobId}`);
}

export function cancelZip(jobId) {
  return request(`/api/zip/${jobId}`, { method: "DELETE" });
}

// ---- Instagram login (cookies) ----

export function getCookies() {
  return request("/api/cookies");
}

export function uploadCookies(content) {
  return request("/api/cookies", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ content }),
  });
}

export function deleteCookies() {
  return request("/api/cookies", { method: "DELETE" });
}