import { useState } from "react";
import { motion } from "framer-motion";

import { timeAgo } from "../lib/format";
import { EASE } from "../lib/motion";

function Tile({ profile, index, onOpen }) {
  const [failed, setFailed] = useState(false);
  const cover = profile.thumbs?.[0] || profile.avatar;
  const number = String(index + 1).padStart(2, "0");

  return (
    <button
      type="button"
      onClick={() => onOpen(profile.username)}
      className="group block w-full text-left"
    >
      <span className="relative block aspect-[9/16] overflow-hidden rounded-thumb border border-hairline bg-ink/5">
        {cover && !failed ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="grid size-full place-items-center font-serif text-6xl text-ink/30 italic">
            {profile.username.charAt(0)}
          </span>
        )}
        <span className="absolute top-2 left-2 rounded-full bg-bg px-2 py-0.5 font-mono text-[10px] tracking-[0.12em]">
          {number}
        </span>
      </span>
      <span className="mt-2.5 block truncate text-[15px] font-medium">@{profile.username}</span>
      <span className="block truncate font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
        {timeAgo(profile.lastFetched)}
      </span>
    </button>
  );
}

export default function RecentList({ items, onOpen }) {
  if (!items.length) return null;

  return (
    <ul className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0">
      {items.map((profile, index) => (
        <motion.li
          key={profile.username}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.45, ease: EASE, delay: index * 0.05 }}
          className="w-[42%] shrink-0 snap-start sm:w-[30%] md:w-auto"
        >
          <Tile profile={profile} index={index} onOpen={onOpen} />
        </motion.li>
      ))}
    </ul>
  );
}