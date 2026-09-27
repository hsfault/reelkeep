import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import DeckFallback from "./DeckFallback";

const Deck3D = lazy(() => import("./Deck3D"));

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class WebGLBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Mouse position on desktop, finger drag or phone tilt on mobile -> -1..1
function usePointerInput() {
  const input = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const onMove = (e) => {
      input.current.x = clamp((e.clientX / window.innerWidth) * 2 - 1);
      input.current.y = clamp((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onTilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      input.current.x = clamp(e.gamma / 25);
      input.current.y = clamp((e.beta - 45) / 25);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", onTilt, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);

  return input;
}

// Only render while the deck is on screen and the tab is visible
function useActive(ref) {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let inView = true;
    const update = () => setActive(inView && document.visibilityState === "visible");

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", update);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [ref]);

  return active;
}

export default function HeroDeck({ thumbs = [], exiting = false, className = "" }) {
  const reduced = useReducedMotion();
  const [webgl] = useState(hasWebGL);
  const containerRef = useRef(null);
  const inputRef = usePointerInput();
  const active = useActive(containerRef);

  const fallback = <DeckFallback thumbs={thumbs} exiting={exiting} />;
  const use3D = webgl && !reduced;

  return (
    <div ref={containerRef} className={`relative ${className}`} aria-hidden="true">
      {use3D ? (
        <WebGLBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <Deck3D thumbs={thumbs} exiting={exiting} inputRef={inputRef} active={active} />
          </Suspense>
        </WebGLBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}