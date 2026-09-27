import { motion } from "framer-motion";
import Avatar from "./Avatar";
import { fadeUp } from "../lib/motion";

export function ProfileHeaderSkeleton() {
  return (
    <div className="flex items-end gap-4 border-b border-ink pb-5">
      <span className="skeleton size-16 shrink-0 rounded-full" />
      <span className="flex-1 space-y-2.5">
        <span className="skeleton block h-3 w-16 rounded-full" />
        <span className="skeleton block h-7 w-52 max-w-full rounded-full" />
        <span className="skeleton block h-3 w-32 rounded-full" />
      </span>
    </div>
  );
}

export default function ProfileHeader({ profile, count, hasMore }) {
  return (
    <motion.div {...fadeUp()} className="flex items-end gap-4 border-b border-ink pb-5">
      <Avatar src={profile.avatar} name={profile.username} size={64} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">Archive</p>
        <h2 className="mt-1 truncate font-display text-[28px] leading-none font-bold tracking-[-0.03em] md:text-4xl">
          {profile.full_name || `@${profile.username}`}
        </h2>
        <p className="mt-2 truncate font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          @{profile.username}
          {typeof count === "number" && (
            <>
              {" · "}
              <span className="text-ink">{count}</span> loaded
              {hasMore === false && " · complete"}
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}