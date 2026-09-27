import { createPortal } from "react-dom";
import { motion } from "framer-motion";

import DownloadButton from "./DownloadButton";
import { formatBytes } from "../../lib/format";
import { EASE } from "../../lib/motion";

function StatusLine({ zip, selectedCount, totalCount, onCancel }) {
  const base = "font-mono text-[11px] tracking-[0.14em] uppercase";

  if (zip.status === "working" || zip.status === "starting") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className={`${base} truncate`}>
          <span className="text-accent">Packing</span> {zip.job?.done ?? 0}/{zip.job?.total ?? "…"}
          <span className="text-muted"> · {formatBytes(zip.job?.bytes)}</span>
        </p>
        <button
          type="button"
          onClick={onCancel}
          className={`${base} min-h-11 shrink-0 px-2 text-muted underline-offset-4 hover:text-ink hover:underline`}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (zip.status === "done") {
    const failed = zip.job?.failed?.length || 0;
    return (
      <p className={`${base} flex min-h-11 items-center gap-2`}>
        <span className="text-accent">Saved</span>
        <span className="truncate text-muted normal-case tracking-normal">{zip.job?.saved_to}</span>
        {failed > 0 && <span className="shrink-0 text-accent">· {failed} skipped</span>}
      </p>
    );
  }

  if (zip.status === "error") {
    return (
      <p className={`${base} flex min-h-11 items-center text-accent normal-case tracking-normal`}>
        {zip.errorMessage || "Download failed."}
      </p>
    );
  }

  return (
    <p className={`${base} flex min-h-11 items-center text-muted`}>
      <span className="text-ink">{selectedCount}</span>&nbsp;selected · {totalCount} loaded
    </p>
  );
}

export default function ActionBar({ zip, selectedCount, totalCount, allSelected, onToggleAll, onDownload }) {
  const busy = zip.status === "working" || zip.status === "starting";

  let label;
  if (zip.status === "starting") label = "Preparing";
  else if (zip.status === "working") label = `${Math.round(zip.progress * 100)}%`;
  else if (zip.status === "done") label = "Saved";
  else if (zip.status === "error") label = "Try again";
  else label = selectedCount ? `Download ${selectedCount}` : `Download all ${totalCount}`;

  return createPortal(
    <motion.div
      initial={{ y: 140 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-bg pb-[max(env(safe-area-inset-bottom),12px)]"
    >
      <div className="mx-auto w-full max-w-xl px-5 pt-1 md:max-w-3xl lg:max-w-5xl">
        <StatusLine
          zip={zip}
          selectedCount={selectedCount}
          totalCount={totalCount}
          onCancel={zip.cancel}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleAll}
            disabled={busy || totalCount === 0}
            className="min-h-14 shrink-0 rounded-full border border-ink px-4 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors hover:bg-ink hover:text-bg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
          >
            {allSelected ? "Clear" : "Select all"}
          </button>
          <DownloadButton
            className="flex-1"
            status={zip.status}
            progress={zip.progress}
            label={label}
            onClick={onDownload}
            disabled={busy || totalCount === 0}
          />
        </div>
      </div>
    </motion.div>,
    document.body
  );
}