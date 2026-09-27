import { memo, useMemo, useState } from "react";
import { motion, useSpring } from "framer-motion";
import { Check, Play } from "lucide-react";

import { formatDuration, videoDuration } from "../../lib/format";
import { EASE } from "../../lib/motion";

const TILT = { stiffness: 220, damping: 22, mass: 0.5 };

function VideoCard({ item, index, selected, onToggle, onPreview, delay = 0 }) {
  const [failed, setFailed] = useState(false);
  const rotateX = useSpring(0, TILT);
  const rotateY = useSpring(0, TILT);
  const duration = useMemo(() => formatDuration(videoDuration(item)), [item]);
  const number = String(index + 1).padStart(2, "0");

  // 3D tilt toward the mouse (desktop only; touch stays still for easy scrolling)
  const onPointerMove = (e) => {
    if (e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 10);
    rotateX.set(-py * 10);
  };
  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      <motion.div
        onPointerMove={onPointerMove}
        onPointerLeave={resetTilt}
        style={{ rotateX, rotateY, transformPerspective: 900 }}
        animate={{ scale: selected ? 0.95 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className="relative aspect-[9/16] overflow-hidden rounded-thumb border border-hairline bg-ink/5"
      >
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} video ${index + 1}`}
          className="absolute inset-0 block size-full"
        >
          {item.thumb && !failed ? (
            <img
              src={item.thumb}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center font-serif text-5xl text-ink/25 italic">
              {number}
            </span>
          )}
        </button>

        {/* Selected frame */}
        <span
          className={`pointer-events-none absolute inset-0 rounded-thumb transition-shadow duration-200 ${
            selected ? "shadow-[inset_0_0_0_3px_#ff4f00]" : ""
          }`}
        />

        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-bg px-2 py-0.5 font-mono text-[10px] tracking-[0.12em]">
          {number}
        </span>

        <span
          className={`pointer-events-none absolute top-2 right-2 grid size-7 place-items-center rounded-full border-2 transition-colors duration-200 ${
            selected ? "border-accent bg-accent text-ink" : "border-bg bg-ink/25 text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        {duration && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-bg px-2 py-0.5 font-mono text-[10px] tracking-[0.08em]">
            {duration}
          </span>
        )}

        <button
          type="button"
          onClick={() => onPreview(item)}
          aria-label={`Preview video ${index + 1}`}
          className="absolute right-1.5 bottom-1.5 grid size-11 place-items-center rounded-full border border-hairline bg-bg text-ink transition-transform active:scale-90"
        >
          <Play size={15} fill="currentColor" className="translate-x-px" />
        </button>
      </motion.div>
    </motion.li>
  );
}

export default memo(VideoCard);