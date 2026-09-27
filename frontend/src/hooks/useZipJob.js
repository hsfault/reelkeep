import { useCallback, useEffect, useState } from "react";
import { cancelZip, getZip, startZip } from "../lib/api";

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

  const start = useCallback(async (username, items) => {
    setError(null);
    setStarting(true);
    try {
      setJob(await startZip(username, items));
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
    start,
    cancel,
    reset,
  };
}