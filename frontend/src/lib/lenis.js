let instance = null;

export function setLenis(lenis) {
  instance = lenis;
}

// Freeze page scrolling while a sheet is open
export function lockScroll() {
  instance?.stop();
  document.documentElement.style.overflow = "hidden";
}

export function unlockScroll() {
  instance?.start();
  document.documentElement.style.overflow = "";
}