import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Check, ExternalLink, X } from "lucide-react";

import Button from "../Button";
import IconButton from "../IconButton";
import { lockScroll, unlockScroll } from "../../lib/lenis";
import { formatDate } from "../../lib/format";

export default function PreviewSheet({ item, index, selected, onToggle, onClose }) {
  const dragControls = useDragControls();

  useEffect(() => {
    if (!item) return undefined;
    lockScroll();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          key="preview"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-ink/55" onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Video preview"
            data-lenis-prevent
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-[24px] border-t border-ink bg-bg px-5 pb-[max(env(safe-area-inset-bottom),16px)]"
          >
            {/* Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            >
              <span className="h-1 w-10 rounded-full bg-ink/25" />
            </div>

            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-[0.16em] uppercase">
                <span className="text-accent">No. {String(index + 1).padStart(2, "0")}</span>
                <span className="mx-2 text-muted">/</span>
                <span className="text-muted">{formatDate(item.date)}</span>
              </p>
              <IconButton label="Close preview" onClick={onClose}>
                <X size={20} />
              </IconButton>
            </div>

            <div className="mt-2 flex min-h-0 flex-1 justify-center">
              <video
                key={item.id}
                src={item.video_url}
                poster={item.thumb}
                controls
                autoPlay
                playsInline
                className="max-h-[60dvh] w-auto max-w-full rounded-thumb border border-hairline bg-ink"
                style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : "9 / 16" }}
              />
            </div>

            {item.caption && (
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{item.caption}</p>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant={selected ? "secondary" : "primary"}
                onClick={onToggle}
                className="min-h-12 flex-1"
              >
                {selected && <Check size={16} strokeWidth={3} />}
                {selected ? "Selected" : "Select video"}
              </Button>
              {item.permalink && (
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on Instagram"
                  className="grid min-h-12 w-12 shrink-0 place-items-center rounded-full border border-ink transition-colors hover:bg-ink hover:text-bg"
                >
                  <ExternalLink size={18} />
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}