import { useCallback, useEffect, useState } from "react";
import { cancelZip, getZip, startZip } from "../lib/api";
import { isAndroidApp, publishZip, trackJob } from "../lib/android";

const POLL_MS = 600;
const FALLBACK_VIDEO_BYTES = 6 * 1024 * 1024; // guess until the first video finishes

// Smooth 0..1 progress: finished videos + an estimate of the current one
function computeProgress(job) {
  if (!job) return 0;
  if (job.status === "done") return 1;
  if (!job.total) return 0;
  const mark = job._mark || { done: 0, bytes: 0 };
  const avg = mark.done > 0 ? mark.bytes / mark.done : FALLBACK_VIDEO_BYTES;
  const partial = Math.min(0.92, Math.max(0, (job.bytes - mark.bytes) / avg));
  return Math.min(0.99, (job.done + partial) / job.total);
}

export default function useZipJob() {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  // Android only: { state: "saving" | "saved" | "failed", uri, location, error }
  const [publish, setPublish] = useState(null);

  // Poll while the job runs
  useEffect(() => {
    if (!job || job.status !== "running") return undefined;
    const id = setTimeout(async () => {
      try {
        const next = await getZip(job.id);
        const mark = next.done !== job.done ? { done: next.done, bytes: next.bytes } : job._mark;
        setJob({ ...next, _mark: mark });
      } catch (err) {
        setError(err);
      }
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [job]);

  // Android: move the finished ZIP into Downloads/Reelkeep
  useEffect(() => {
    if (!isAndroidApp || job?.status !== "done" || publish) return;
    setPublish({ state: "saving" });
    publishZip(job).then((result) => {
      if (result?.ok) {
        setPublish({ state: "saved", uri: result.uri, location: result.location });
      } else {
        setPublish({ state: "failed", error: result?.error || "Couldn't save to Downloads." });
      }
    });
  }, [job, publish]);

  const start = useCallback(async (username, items) => {
    setError(null);
    setPublish(null);
    setStarting(true);
    try {
      const created = await startZip(username, items);
      setJob(created);
      trackJob(created.id); // Android: background notification + keeps the app alive
    } catch (err) {
      setJob(null);
      setError(err);
    } finally {
      setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (job?.status !== "running") return;
    try {
      setJob(await cancelZip(job.id));
    } catch {
      // job already finished
    }
  }, [job]);

  const reset = useCallback(() => {
    setJob(null);
    setError(null);
    setPublish(null);
  }, []);

  let status = "idle";
  if (error) status = "error";
  else if (starting) status = "starting";
  else if (job?.status === "running") status = "working";
  else if (job?.status === "done") status = "done";
  else if (job?.status === "error") status = "error";

  return {
    job,
    status,
    progress: computeProgress(job),
    errorMessage: error?.message || job?.error || "",
    publish,
    start,
    cancel,
    reset,
  };
}