import { motion } from "framer-motion";
import { EASE } from "../../lib/motion";

const LAYOUT = [-2, -1, 0, 1, 2];

export default function DeckFallback({ thumbs = [], exiting = false }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="relative aspect-[9/16] h-[68%]">
        {LAYOUT.map((k, i) => (
          <motion.div
            key={k}
            className="absolute inset-0 overflow-hidden rounded-[14px] border border-hairline bg-bg p-1.5"
            style={{ zIndex: 10 - Math.abs(k) }}
            initial={{ x: 0, y: "8%", rotate: 0, opacity: 0 }}
            animate={
              exiting
                ? { y: "-140%", opacity: 0, rotate: k * 6 }
                : {
                    x: `${k * 30}%`,
                    y: `${Math.abs(k) * 3}%`,
                    rotate: k * 5,
                    scale: 1 - Math.abs(k) * 0.06,
                    opacity: 1,
                  }
            }
            transition={{
              duration: exiting ? 0.5 : 0.8,
              ease: EASE,
              delay: exiting ? Math.abs(k) * 0.04 : 0.1 + Math.abs(k) * 0.05,
            }}
          >
            <div className="relative size-full overflow-hidden rounded-[10px] border border-hairline">
              <span className="absolute top-2 left-2 font-mono text-[10px] tracking-[0.12em] text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              {thumbs[i] && (
                <img
                  src={thumbs[i]}
                  alt=""
                  className="relative size-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}