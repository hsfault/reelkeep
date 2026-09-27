// window.ReelkeepAndroid exists only inside the Android app
const bridge = typeof window !== "undefined" ? window.ReelkeepAndroid : undefined;

export const isAndroidApp = Boolean(bridge);

// Android answers async calls through window.__reelkeepResolve(id, result)
const pending = new Map();
let counter = 0;

if (isAndroidApp) {
  window.__reelkeepResolve = (id, result) => {
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(result);
    }
  };
}

export function openLogin() {
  bridge?.openLogin();
}

export function clearLogin() {
  bridge?.clearLogin();
}

export function trackJob(jobId) {
  bridge?.trackJob(jobId);
}

export function publishZip(job) {
  if (!bridge) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = `cb${++counter}`;
    pending.set(id, resolve);
    bridge.publishZip(id, job.id, job.saved_to, job.filename);
  });
}

export function openZip(uri) {
  bridge?.openZip(uri);
}

export function shareZip(uri) {
  bridge?.shareZip(uri);
}

// Fired by Android after a successful in-app Instagram login
export function onLogin(handler) {
  window.addEventListener("reelkeep:login", handler);
  return () => window.removeEventListener("reelkeep:login", handler);
}