import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

import { parseUsername } from "../lib/parseUsername";
import { fadeUp } from "../lib/motion";

export default function LinkInputCard({ onSubmit, busy = false }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const inputRef = useRef(null);

  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    const result = parseUsername(value);
    if (result.error) {
      setError(result.error);
      inputRef.current?.focus();
      return;
    }
    setError("");
    onSubmit(result.username);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text.trim());
        setError("");
      }
    } catch {
      setPasteBlocked(true);
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    setValue("");
    setError("");
    inputRef.current?.focus();
  };

  return (
    <motion.form {...fadeUp(0.1)} onSubmit={submit} noValidate className="w-full">
      <label
        htmlFor="profile-link"
        className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase"
      >
        Profile link or username
      </label>

      <div
        className={`mt-3 flex items-center gap-3 border-b-2 pb-2 transition-colors ${
          error ? "border-accent" : "border-ink"
        }`}
      >
        <input
          id="profile-link"
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          placeholder="@username"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "profile-link-error" : undefined}
          className="min-w-0 flex-1 bg-transparent py-2 font-display text-[26px] font-semibold tracking-tight outline-none placeholder:text-ink/25 md:text-[32px]"
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-hairline transition-transform active:scale-90"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={paste}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-ink px-4 font-mono text-[11px] tracking-[0.14em] uppercase transition-[background-color,color,transform] hover:bg-ink hover:text-bg active:scale-95"
          >
            Paste
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id="profile-link-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-3 font-mono text-xs tracking-[0.04em] text-accent"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {pasteBlocked && !error && (
        <p className="pt-3 text-sm text-muted">
          Clipboard access is blocked here. Long-press the field to paste.
        </p>
      )}

      <motion.button
        type="submit"
        disabled={busy}
        whileTap={busy ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="group mt-7 flex min-h-14 w-full items-center justify-between rounded-full bg-accent py-2 pr-2 pl-6 text-base font-semibold text-ink disabled:opacity-60"
      >
        <span>{busy ? "Opening…" : "Fetch videos"}</span>
        <span className="grid size-10 place-items-center rounded-full bg-ink text-bg transition-transform duration-300 group-hover:translate-x-0.5">
          <ArrowRight size={18} />
        </span>
      </motion.button>
    </motion.form>
  );
}