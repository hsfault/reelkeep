import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, FileUp } from "lucide-react";

import Page from "../components/Page";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import Button from "../components/Button";
import { deleteCookies, getCookies, getHealth, uploadCookies } from "../lib/api";
import { clearRecent, getRecent } from "../lib/recent";
import { formatDate } from "../lib/format";
import { EASE, fadeUp } from "../lib/motion";
import { clearLogin, isAndroidApp, onLogin, openLogin } from "../lib/android";

const MAX_FILE_BYTES = 200_000;

const GUIDES = [
  {
    title: "On PC · Chrome",
    steps: [
      "Log into instagram.com in Chrome. A secondary account is safer.",
      "Install “Get cookies.txt LOCALLY” from the Chrome Web Store.",
      "On instagram.com, click the extension and choose Export.",
      "Upload the downloaded file here.",
    ],
  },
  {
    title: "On Android · Firefox",
    steps: [
      "Log into instagram.com in Firefox.",
      "Menu → Extensions → find “Get cookies.txt LOCALLY” → Add.",
      "On instagram.com, open the extension from the menu → Export.",
      "Upload the file from your Downloads here.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function SectionLabel({ index, title }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.16em] uppercase">
      <span className="text-accent">{index}</span>
      <span className="mx-2 text-muted">/</span>
      {title}
    </p>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-hairline py-3">
      <span className="shrink-0 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
        {label}
      </span>
      <span className="min-w-0 text-right text-[15px] break-all">{children}</span>
    </div>
  );
}

function Dot({ ok }) {
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${ok ? "bg-ink" : "bg-accent"}`} />;
}

function Collapsible({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between font-mono text-[11px] tracking-[0.14em] uppercase"
      >
        {title}
        <ChevronDown size={18} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CookieDrop({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    if (!file || busy) return;
    setError("");
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large to be a cookies.txt.");
      return;
    }
    setBusy(true);
    try {
      const info = await uploadCookies(await file.text());
      onUploaded(info);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-ink bg-ink/5" : "border-ink/25 hover:border-ink"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <FileUp size={22} strokeWidth={1.8} />
        <span className="font-display text-lg font-semibold tracking-tight">
          {busy ? "Checking cookies…" : "Upload cookies.txt"}
        </span>
        <span className="text-sm text-muted">
          Tap to choose the file<span className="hidden md:inline"> or drop it here</span>
        </span>
      </label>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-3 font-mono text-xs leading-relaxed text-accent"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function CookieGuide() {
  return (
    <>
      <div className="grid gap-8 md:grid-cols-2">
        {GUIDES.map((guide) => (
          <div key={guide.title}>
            <p className="font-display text-lg font-semibold tracking-tight">{guide.title}</p>
            <ol className="mt-3 space-y-3">
              {guide.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="pt-0.5 font-mono text-[11px] text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm leading-relaxed text-muted">
        Treat this file like a password. Reelkeep keeps only the Instagram cookies and stores them
        on this device.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Settings() {
  const navigate = useNavigate();
  const [health, setHealth] = useState(null); // null = loading, false = offline
  const [login, setLogin] = useState(null);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [recentCount, setRecentCount] = useState(() => getRecent().length);

  const refreshLogin = useCallback(() => {
    getCookies()
      .then(setLogin)
      .catch(() => setLogin(false));
  }, []);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(false));
    refreshLogin();
  }, [refreshLogin]);

  // Android tells us when the in-app Instagram login finished
  useEffect(
    () =>
      onLogin(() => {
        refreshLogin();
        setNotice("Logged in. The next fetch will use this account.");
      }),
    [refreshLogin]
  );

  // "Remove login" needs a second tap within 3 seconds
  useEffect(() => {
    if (!confirming) return undefined;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  const onUploaded = (info) => {
    setLogin(info);
    setNotice("Login saved. The next fetch will use this account.");
  };

  const removeLogin = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    try {
      setLogin(await deleteCookies());
      clearLogin(); // Android: also forget the Instagram login page's session
      setNotice("Login removed.");
    } catch (err) {
      setNotice(err.message);
    }
  };

  const connected = Boolean(login?.logged_in && !login?.expired);
  let loginText = "Checking…";
  if (login === false) loginText = "Unknown (engine offline)";
  else if (login && connected) loginText = "Connected";
  else if (login?.expired) loginText = "Expired";
  else if (login) loginText = "Not connected";

  const downloadsText = isAndroidApp ? "Downloads/Reelkeep" : health ? health.downloads : "—";

  return (
    <Page>
      <AppHeader
        left={
          <IconButton label="Back" onClick={() => navigate(-1)}>
            <ChevronLeft size={24} />
          </IconButton>
        }
      />

      <div className="mx-auto w-full max-w-3xl pb-16">
        <motion.h1
          {...fadeUp()}
          className="mt-4 font-display text-[clamp(52px,14vw,112px)] leading-[0.9] font-bold tracking-[-0.05em]"
        >
          Settings<span className="text-accent">.</span>
        </motion.h1>

        {/* 01: Instagram login */}
        <motion.section {...fadeUp(0.05)} className="mt-12 border-t border-ink pt-4">
          <SectionLabel index="01" title="Instagram login" />

          <div className="mt-6 flex items-center gap-3">
            <Dot ok={connected} />
            <p className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{loginText}</p>
          </div>

          <div className="mt-4">
            {login?.account_id && <Row label="Account ID">{login.account_id}</Row>}
            {login?.expires && (
              <Row label={login.expired ? "Expired on" : "Expires"}>{formatDate(login.expires)}</Row>
            )}
          </div>

          {isAndroidApp ? (
            <div className="mt-6">
              <motion.button
                type="button"
                onClick={openLogin}
                whileTap={{ scale: 0.98 }}
                className={`flex min-h-14 w-full items-center justify-center rounded-full text-base font-semibold ${
                  connected ? "border border-ink text-ink" : "bg-accent text-ink"
                }`}
              >
                {connected ? "Switch Instagram account" : "Log in with Instagram"}
              </motion.button>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The normal Instagram login page opens inside Reelkeep. Your login stays on this
                phone; Reelkeep never sees your password.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <CookieDrop onUploaded={onUploaded} />
            </div>
          )}

          <AnimatePresence initial={false}>
            {notice && (
              <motion.p
                key={notice}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 font-mono text-xs tracking-[0.04em]"
              >
                {notice}
              </motion.p>
            )}
          </AnimatePresence>

          {login?.present && (
            <div className="mt-4 flex justify-end">
              <Button variant={confirming ? "accent" : "ghost"} onClick={removeLogin}>
                {confirming ? "Tap again to remove" : "Remove login"}
              </Button>
            </div>
          )}

          <div className="mt-4">
            {isAndroidApp ? (
              <Collapsible title="Advanced · Upload cookies.txt instead">
                <CookieDrop onUploaded={onUploaded} />
                <div className="mt-8">
                  <CookieGuide />
                </div>
              </Collapsible>
            ) : (
              <Collapsible title="How to get cookies.txt">
                <CookieGuide />
              </Collapsible>
            )}
          </div>
        </motion.section>

        {/* 02: Downloads */}
        <motion.section {...fadeUp(0.1)} className="mt-14 border-t border-ink pt-4">
          <SectionLabel index="02" title="Downloads" />
          <div className="mt-4">
            <Row label="ZIPs saved to">{downloadsText}</Row>
          </div>
          <p className="mt-3 text-sm text-muted">
            Every download is saved here automatically, named after the profile and the time.
          </p>
        </motion.section>

        {/* 03: Data */}
        <motion.section {...fadeUp(0.15)} className="mt-14 border-t border-ink pt-4">
          <SectionLabel index="03" title="Data" />
          <div className="mt-4 flex min-h-14 items-center justify-between gap-4 border-b border-hairline py-3">
            <span className="text-[15px]">
              Recent profiles <span className="font-mono text-xs text-muted">({recentCount})</span>
            </span>
            <Button
              variant="secondary"
              disabled={recentCount === 0}
              onClick={() => {
                clearRecent();
                setRecentCount(0);
              }}
            >
              {recentCount === 0 ? "Cleared" : "Clear"}
            </Button>
          </div>
        </motion.section>

        {/* 04: Engine */}
        <motion.section {...fadeUp(0.2)} className="mt-14 border-t border-ink pt-4">
          <SectionLabel index="04" title="Engine" />
          <div className="mt-4">
            <Row label="Status">
              <span className="inline-flex items-center gap-2">
                <Dot ok={Boolean(health)} />
                {health === null ? "Checking…" : health ? "Running" : "Offline"}
              </span>
            </Row>
            <Row label="Version">{health ? health.version : "—"}</Row>
          </div>
        </motion.section>
      </div>
    </Page>
  );
}