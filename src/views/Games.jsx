import React, { useState, useRef, useEffect } from "react";
import WoostersWordWeb from "../components/WoostersWordWeb.jsx";
import JeevesJottings from "../components/JeevesJottings.jsx";
import StatsPanel from "../components/StatsPanel.jsx";

/* ----------------------------------------------------
   Touch guard wrapper
   - Blocks page pan/zoom while interacting with puzzle
   - Prevents rubber-band overscroll in iOS/Android
   - Leaves normal page scrolling outside the guard
   - Works with drag gestures (touch/pointer)
---------------------------------------------------- */
function PuzzleTouchGuard({ lockScroll = false, className = "", style = {}, children, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // iOS Safari requires non-passive listeners to allow preventDefault()
    const cancelTouch = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (el.contains(e.target)) e.preventDefault();
    };

    // Suppress double-tap zoom inside the puzzle
    let lastTouchEnd = 0;
    const onTouchEnd = (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300 && el.contains(e.target)) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    el.addEventListener("touchstart", cancelTouch, { passive: false });
    el.addEventListener("touchmove", cancelTouch, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    const originalOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    return () => {
      el.removeEventListener("touchstart", cancelTouch);
      el.removeEventListener("touchmove", cancelTouch);
      el.removeEventListener("touchend", onTouchEnd);
      if (lockScroll) document.body.style.overflow = originalOverflow;
    };
  }, [lockScroll]);

  return (
    <div
      ref={ref}
      className={`puzzle-touch-guard ${className}`}
      style={style}
      draggable={false}
      {...rest}
    >
      {children}
    </div>
  );
}

const GamesLegal = () => (
  <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
    <h2 className="text-lg font-bold mb-3">Legal Disclaimer</h2>
    <p className="text-sm text-gray-700 dark:text-gray-300">
      All puzzles and quizzes on this site — including <em>Wooster’s Word Web</em> and <em>Jeeves’ Jottings</em> — are
      constructed from the public-domain works of P. G. Wodehouse, made freely available thanks to{" "}
      <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer" className="underline">Project Gutenberg</a>.
      This section is intended for literary fun and wordplay, and is not affiliated with nor derived from any commercial
      puzzle providers.
    </p>
  </section>
);

export default function Games() {
  const tabs = ["Wooster’s Word Web", "Jeeves’ Jottings", "Dictionary Stats", "Legal"];
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg border ${
              tab === t
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            }`}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Wooster’s Word Web" && (
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg sm:text-xl font-semibold">Wooster’s Word Web</h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Drag across letters to form words. No page jiggle on mobile ✨
            </p>
          </div>

          {/* The guard below keeps the puzzle stable on touch devices */}
          <PuzzleTouchGuard className="puzzle-touch-guard-fixed">
            {/* 
              If WoostersWordWeb supports className, we pass an interactive hint class.
              If it doesn't, no problem—the guard still stabilizes the region.
            */}
            <WoostersWordWeb className="puzzle-pointer-surface" />
          </PuzzleTouchGuard>
        </section>
      )}

      {tab === "Jeeves’ Jottings" && (
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-3">Jeeves’ Jottings</h2>
          <JeevesJottings />
        </section>
      )}

      {tab === "Dictionary Stats" && (
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-3">Dictionary Stats</h2>
          <StatsPanel />
        </section>
      )}

      {tab === "Legal" && <GamesLegal />}
    </div>
  );
}
