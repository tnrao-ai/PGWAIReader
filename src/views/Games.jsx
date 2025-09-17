import React, { useState, useRef, useEffect } from "react";
import WoostersWordWeb from "../components/WoostersWordWeb.jsx";
import JeevesJottings from "../components/JeevesJottings.jsx";
import StatsPanel from "../components/StatsPanel.jsx";

/* ----------------------------------------------------
   Touch/Pan/Zoom wrapper for the puzzle

   Goals:
   - Prevent PAGE scroll/zoom while puzzle tab is active
   - Allow TWO-AXIS SCROLL *inside* the puzzle container
   - Keep single-finger drags for selection working
   - Provide light zoom controls for readability

   Structure:
   [ PuzzleTouchGuard (locks body scroll, blocks outside gestures) ]
     [ .puzzle-scroller (overflow:auto; pan in both axes; 75vh) ]
       [ .puzzle-zoom (CSS zoom/scale) ]
         [ WoostersWordWeb ]
---------------------------------------------------- */
function PuzzleTouchGuard({ className = "", lockScroll = true, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Lock body scroll while the guard is mounted (prevents page jiggle)
    const originalOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    // iOS specifics:
    // - We want to allow scrolling INSIDE the puzzle scroller,
    //   but prevent touch gestures from bubbling to the page.
    const scroller = root.querySelector(".puzzle-scroller");

    const onTouchMove = (e) => {
      // If the touch originates inside the scroller, allow it (so user can pan).
      if (scroller && scroller.contains(e.target)) {
        // Let the browser handle the scroll normally.
        return;
      }
      // Otherwise, prevent the page from moving.
      e.preventDefault();
    };

    const onTouchStart = (e) => {
      // Same rule as move: allow touches that begin inside the scroller.
      if (scroller && scroller.contains(e.target)) return;
      e.preventDefault();
    };

    // Double-tap zoom suppression outside scroller
    let lastTouchEnd = 0;
    const onTouchEnd = (e) => {
      if (!scroller || !root.contains(e.target)) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    };

    root.addEventListener("touchstart", onTouchStart, { passive: false });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      if (lockScroll) document.body.style.overflow = originalOverflow;
    };
  }, [lockScroll]);

  return (
    <div
      ref={ref}
      className={`puzzle-touch-guard ${className}`}
      draggable={false}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------
   Minimal zoom controller
   - Uses CSS zoom when available (works on WebKit/Blink),
     and falls back to transform: scale for others.
   - Keeps the scroller's scrollbars meaningful by
     resizing via 'zoom' first.
---------------------------------------------------- */
function useZoom() {
  const [level, setLevel] = useState(1); // 1 = 100%
  const supportsZoom = typeof document !== "undefined" && "zoom" in document.documentElement.style;

  const style = supportsZoom
    ? { zoom: level } // affects layout size (good for scroll)
    : { transform: `scale(${level})`, transformOrigin: "top left" }; // fallback

  const set = (v) => setLevel(Math.max(0.6, Math.min(2, Number(v) || 1)));
  const inc = () => setLevel((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10));
  const dec = () => setLevel((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10));
  const reset = () => setLevel(1);

  return { level, style, set, inc, dec, reset, supportsZoom };
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

  // Zoom controller (used only by the puzzle tab)
  const zoom = useZoom();

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

            {/* Compact zoom control (shown on all screens; most helpful on phones) */}
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-1 text-sm rounded border bg-white dark:bg-gray-700"
                onClick={zoom.reset}
                title="Fit (100%)"
              >
                Fit
              </button>
              <button
                className="px-2 py-1 text-sm rounded border bg-white dark:bg-gray-700"
                onClick={zoom.dec}
                title="Zoom out"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                className="px-2 py-1 text-sm rounded border bg-white dark:bg-gray-700"
                onClick={zoom.inc}
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>

          {/* Guard: prevents page scrolling; scroller allows panning INSIDE */}
          <PuzzleTouchGuard>
            <div
              className="puzzle-scroller rounded-lg"
              style={{
                maxHeight: "75vh",
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x pan-y", // allow 2-axis panning inside
                overscrollBehavior: "contain",
                background: "transparent",
              }}
            >
              <div className="p-2">
                {/* Zoom wrapper: changes layout size (via CSS zoom) or scales as fallback */}
                <div className="puzzle-zoom" style={zoom.style}>
                  {/* 
                    If your component accepts className, this adds pointer-friendly hints.
                    If not, no problem—zoom & scroller still apply.
                  */}
                  <WoostersWordWeb className="puzzle-pointer-surface" />
                </div>
              </div>
            </div>
          </PuzzleTouchGuard>

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Tip: pan inside the grid to see all letters; use +/− for size.
          </p>
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
