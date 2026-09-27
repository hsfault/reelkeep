import { useEffect } from "react";
import { motion } from "framer-motion";
import { EASE } from "../lib/motion";

export default function Page({ children, className = "" }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={`mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pt-[max(env(safe-area-inset-top),8px)] pb-[max(env(safe-area-inset-bottom),24px)] md:max-w-3xl lg:max-w-5xl ${className}`}
    >
      {children}
    </motion.main>
  );
}