export const EASE = [0.22, 1, 0.36, 1];

export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE, delay },
});