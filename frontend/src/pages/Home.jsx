import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Settings } from "lucide-react";

import Page from "../components/Page";
import AppHeader, { Wordmark } from "../components/AppHeader";
import IconButton from "../components/IconButton";
import LinkInputCard from "../components/LinkInputCard";
import RecentList from "../components/RecentList";
import HeroDeck from "../components/deck/HeroDeck";
import { getRecent } from "../lib/recent";
import { EASE, fadeUp } from "../lib/motion";

const SPECS = [
  ["Batch", "50 videos"],
  ["Format", "MP4 · 720p"],
  ["Output", "One ZIP"],
  ["Watermark", "None"],
];

// Take thumbnails round-robin across recent profiles so the deck is varied
function pickThumbs(recent, count = 7) {
  const out = [];
  for (let i = 0; i < count && out.length < count; i++) {
    for (const profile of recent) {
      const thumb = profile.thumbs?.[i];
      if (thumb) out.push(thumb);
      if (out.length === count) break;
    }
  }
  return out;
}

function SectionLabel({ index, title, aside }) {
  return (
    <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] tracking-[0.16em] uppercase">
      <span>
        <span className="text-accent">{index}</span>
        <span className="mx-2 text-muted">/</span>
        {title}
      </span>
      {aside && <span className="text-muted">{aside}</span>}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [recent] = useState(getRecent);
  const [exiting, setExiting] = useState(null);
  const thumbs = useMemo(() => pickThumbs(recent), [recent]);

  // Let the deck fly off before switching pages
  useEffect(() => {
    if (!exiting) return undefined;
    const id = setTimeout(() => navigate(`/u/${exiting}`), reduced ? 0 : 620);
    return () => clearTimeout(id);
  }, [exiting, navigate, reduced]);

  const openProfile = (username) => {
    if (!exiting) setExiting(username);
  };

  return (
    <Page>
      <AppHeader
        left={<Wordmark />}
        right={
          <IconButton to="/settings" label="Settings">
            <Settings size={20} strokeWidth={1.8} />
          </IconButton>
        }
      />

      {/* Hero: giant type with the 3D deck sitting on top of it */}
      <section className="relative min-h-[560px] pt-6 sm:min-h-[620px] md:pt-10 lg:min-h-[640px]">
        <motion.p
          {...fadeUp(0)}
          className="relative z-20 font-mono text-[11px] tracking-[0.18em] text-muted uppercase"
        >
          Instagram video archive
        </motion.p>

        <motion.h1
          {...fadeUp(0.05)}
          className="relative z-0 mt-4 font-display text-[clamp(64px,19vw,172px)] leading-[0.86] font-bold tracking-[-0.05em]"
        >
          Keep
          <br />
          every
          <br />
          <span className="font-serif font-normal tracking-[-0.03em] italic">reel</span>
          <span className="text-accent">.</span>
        </motion.h1>

        <div className="pointer-events-none absolute inset-x-[-12%] bottom-0 z-10 h-[64%] sm:inset-x-0 lg:inset-x-auto lg:top-[4%] lg:right-[-6%] lg:bottom-auto lg:h-[96%] lg:w-[60%]">
          <HeroDeck thumbs={thumbs} exiting={Boolean(exiting)} className="size-full" />
        </div>
      </section>

      {/* 01: input */}
      <section className="mt-8 border-t border-ink pt-4 md:mt-12">
        <SectionLabel index="01" title="Paste a profile" />
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <motion.p
            {...fadeUp(0.05)}
            className="max-w-md font-display text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] md:text-[26px]"
          >
            Drop any public profile. Reelkeep pulls its videos fifty at a time, you pick what you
            want, and they land in your Downloads as{" "}
            <span className="font-serif font-normal italic">one tidy ZIP</span>.
          </motion.p>
          <LinkInputCard onSubmit={openProfile} busy={Boolean(exiting)} />
        </div>
      </section>

      {/* Spec sheet */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mt-16 grid grid-cols-2 border-t border-l border-hairline md:grid-cols-4"
      >
        {SPECS.map(([label, value]) => (
          <div key={label} className="border-r border-b border-hairline p-4 md:p-5">
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{label}</p>
            <p className="mt-2 font-display text-xl font-semibold tracking-tight md:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </motion.section>

      {/* 02: recent contact sheet */}
      {recent.length > 0 && (
        <section className="mt-16 border-t border-ink pt-4">
          <SectionLabel
            index="02"
            title="Recent archive"
            aside={`${recent.length} ${recent.length === 1 ? "profile" : "profiles"}`}
          />
          <RecentList items={recent} onOpen={openProfile} />
        </section>
      )}

      <footer className="mt-20 flex flex-col gap-2 border-t border-hairline pt-4 font-mono text-[11px] tracking-[0.14em] text-muted uppercase sm:flex-row sm:justify-between">
        <span>Reelkeep · Personal archive tool</span>
        <span>Only keep videos you have the right to use</span>
      </footer>
    </Page>
  );
}