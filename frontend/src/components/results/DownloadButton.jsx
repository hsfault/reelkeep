import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowDown, Check, RotateCcw } from "lucide-react";

const INK = "#111111";
const BONE = "#efede8";
const ORANGE = "#ff4f00";

const STROKE = 1.5;
const BALL_R = 5.5;
const WAVE_L = 36;
const WAVE_A = 3.5;
const WAVE_WIDTH = 1200;

// Pill outline starting at top-center, running clockwise.
// Inset by half the stroke so the ball rides exactly on the border line.
function pillPath(w, h) {
  const i = STROKE / 2;
  const W = w - STROKE;
  const H = h - STROKE;
  const R = H / 2;
  const cx = i + W / 2;
  return [
    `M ${cx} ${i}`,
    `H ${i + W - R}`,
    `A ${R} ${R} 0 0 1 ${i + W - R} ${i + H}`,
    `H ${i + R}`,
    `A ${R} ${R} 0 0 1 ${i + R} ${i}`,
    "Z",
  ].join(" ");
}

// Flat liquid surface: a repeating wave strip (no gradients)
function makeWave() {
  const count = Math.ceil(WAVE_WIDTH / WAVE_L) + 2;
  let d = `M 0 ${WAVE_A}`;
  for (let n = 0; n < count; n++) {
    d += ` q ${WAVE_L / 4} ${-WAVE_A * 2} ${WAVE_L / 2} 0 q ${WAVE_L / 4} ${WAVE_A * 2} ${WAVE_L / 2} 0`;
  }
  return `${d} V ${WAVE_A * 2 + 2} H 0 Z`;
}
const WAVE_D = makeWave();

export default function DownloadButton({
  status = "idle", // idle | starting | working | done | error
  progress = 0,
  label,
  onClick,
  disabled = false,
  className = "",
}) {
  const reduced = useReducedMotion();
  const wrapRef = useRef(null);
  const pathRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dropped, setDropped] = useState(false);

  const active = status === "starting" || status === "working" || status === "done";

  // Measure the button so the orbit path matches it exactly
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Smoothed progress drives both the ball and the liquid
  const p = useSpring(0, { stiffness: 55, damping: 18, restDelta: 0.0005 });
  useEffect(() => {
    if (!active) p.set(0);
    else if (dropped || reduced) p.set(status === "done" ? 1 : progress);
  }, [p, active, dropped, reduced, status, progress]);

  const liquidY = useTransform(p, (v) => `${(1 - v) * 100}%`);

  // Ball position on the border
  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const dropY = useMotionValue(-44);
  const ballScale = useMotionValue(0);
  const ballY = useTransform(() => by.get() + dropY.get());

  const place = useCallback(
    (v) => {
      const path = pathRef.current;
      if (!path) return;
      const len = path.getTotalLength();
      if (!len) return;
      const point = path.getPointAtLength(Math.min(0.9999, Math.max(0, v)) * len);
      bx.set(point.x);
      by.set(point.y);
    },
    [bx, by]
  );
  useMotionValueEvent(p, "change", place);
  useLayoutEffect(() => {
    place(p.get());
  }, [place, p, size.w, size.h]);

  // The drop: ball falls onto the top edge and bounces, then the lap starts
  useEffect(() => {
    if (!active) {
      setDropped(false);
      ballScale.set(0);
      dropY.set(-44);
      return undefined;
    }
    if (dropped) return undefined;
    if (reduced) {
      setDropped(true);
      return undefined;
    }
    ballScale.set(1);
    dropY.set(-44);
    const controls = animate(dropY, 0, {
      type: "spring",
      stiffness: 480,
      damping: 13,
      mass: 0.7,
      restDelta: 0.5,
      onComplete: () => setDropped(true),
    });
    return () => controls.stop();
  }, [active, dropped, reduced, dropY, ballScale]);

  // Lap finished: the ball sinks into the full button
  useEffect(() => {
    if (status !== "done" || reduced) return undefined;
    let sunk = false;
    const unsubscribe = p.on("change", (v) => {
      if (!sunk && v > 0.985) {
        sunk = true;
        animate(ballScale, 0, { duration: 0.28, ease: "easeIn" });
      }
    });
    return unsubscribe;
  }, [status, p, ballScale, reduced]);

  const idle = !active;
  const icon =
    status === "done" ? (
      <Check size={18} strokeWidth={2.6} />
    ) : status === "error" ? (
      <RotateCcw size={17} />
    ) : idle ? (
      <ArrowDown size={18} />
    ) : null;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        initial={false}
        animate={{ backgroundColor: idle ? INK : BONE, color: idle ? BONE : INK }}
        transition={{ duration: 0.3 }}
        className="relative flex min-h-14 w-full items-center justify-center overflow-hidden rounded-full px-6 text-base font-semibold disabled:cursor-default"
      >
        {/* Liquid */}
        <motion.div aria-hidden="true" className="absolute inset-0" style={{ y: liquidY }}>
          <motion.svg
            className="absolute left-0 -top-[7px]"
            width={WAVE_WIDTH}
            height={WAVE_A * 2 + 2}
            animate={active && !reduced ? { x: [0, -WAVE_L] } : { x: 0 }}
            transition={
              active && !reduced
                ? { duration: 1.1, ease: "linear", repeat: Infinity }
                : { duration: 0 }
            }
          >
            <path d={WAVE_D} fill={ORANGE} />
          </motion.svg>
          <div className="absolute inset-0 bg-accent" />
        </motion.div>

        <span className="relative z-10 flex items-center gap-2" aria-live="polite">
          {icon}
          {label}
        </span>
      </motion.button>

      {/* Border + orbiting ball (outside the button so the ball is never clipped) */}
      {size.w > 0 && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={size.w}
          height={size.h}
        >
          <motion.path
            ref={pathRef}
            d={pillPath(size.w, size.h)}
            fill="none"
            stroke={INK}
            strokeWidth={STROKE}
            initial={false}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: 0.25 }}
          />
          <motion.circle
            r={BALL_R}
            fill={ORANGE}
            stroke={INK}
            strokeWidth={1.5}
            style={{ x: bx, y: ballY, scale: ballScale }}
          />
        </svg>
      )}
    </div>
  );
}