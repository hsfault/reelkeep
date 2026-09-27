import { motion } from "framer-motion";
import { CircleAlert } from "lucide-react";

import Button from "./Button";
import { fadeUp } from "../lib/motion";

const TITLES = {
  login_required: "Login needed",
  checkpoint: "Verify your account",
  session_rejected: "Session rejected",
  rate_limited: "Instagram slowed us down",
  private: "Private profile",
  not_found: "Profile not found",
  invalid_link: "Invalid link",
  server_offline: "Server offline",
};

const NEEDS_SETTINGS = new Set(["login_required", "checkpoint", "session_rejected"]);
const NO_RETRY = new Set(["private", "not_found", "invalid_link"]);

export default function ErrorCard({ error, onRetry, onSettings, onBack }) {
  const code = error?.code;
  const needsSettings = NEEDS_SETTINGS.has(code);
  const canRetry = !NO_RETRY.has(code);

  return (
    <motion.div {...fadeUp()} className="rounded-card bg-surface p-6 text-center shadow-soft">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
        <CircleAlert size={22} />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold tracking-tight">
        {TITLES[code] || "Something went wrong"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">
        {error?.message || "Please try again."}
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {needsSettings && <Button onClick={onSettings}>Open settings</Button>}
        {canRetry && (
          <Button variant={needsSettings ? "secondary" : "primary"} onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          New search
        </Button>
      </div>
    </motion.div>
  );
}