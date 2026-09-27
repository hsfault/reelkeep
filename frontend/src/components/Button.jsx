import { motion } from "framer-motion";

const variants = {
  primary: "bg-ink text-bg disabled:bg-ink/40",
  accent: "bg-accent text-ink disabled:opacity-50",
  secondary: "border border-ink bg-transparent text-ink hover:bg-ink hover:text-bg",
  ghost: "text-ink hover:bg-ink/5",
};

export default function Button({ variant = "primary", className = "", disabled, children, ...props }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}