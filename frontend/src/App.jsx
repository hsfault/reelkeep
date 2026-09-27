import { AnimatePresence, MotionConfig } from "framer-motion";
import { Route, Routes, useLocation } from "react-router-dom";

import useLenis from "./hooks/useLenis";
import Home from "./pages/Home";
import Results from "./pages/Results";
import Settings from "./pages/Settings";

export default function App() {
  useLenis();
  const location = useLocation();

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/u/:username" element={<Results />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </AnimatePresence>
    </MotionConfig>
  );
}