import React, { useState, useRef, useEffect } from "react";
import WoostersWordWeb from "../components/WoostersWordWeb.jsx";
import JeevesJottings from "../components/JeevesJottings.jsx";
import StatsPanel from "../components/StatsPanel.jsx";

/* ----------------------------------------------------
   Touch/Pan/Zoom wrapper for the puzzle
---------------------------------------------------- */
function PuzzleTouchGuard({ className = "", lockScroll = true, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const originalOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const scroller = root.querySelector(".puzzle-scroller");

    const onTouchMove = (e) => {
      if (scroller && scroller.contains(e.target)) return; // allow panning inside scroller
      e.preventDefault(); // block page scroll outside
    };
    const onTouchStart = (e) => {
      if (scroller && scroller.contains(e.target)) return;
      e.preventDefault();
    };

    let lastTouchEnd = 0;
    const onTouchEnd = (e) => {
      if (!root.contains(e.target)) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault(); // suppress dbl-tap zoom
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
    <div ref={ref} className={`puzzle-touch-guard ${className}`} draggable={false}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------
   Zoom hook (CSS zoom preferred, transform fallback)
---------------------------------------------------- */
function useZoom() {
  const [level, setLevel] = useState(1); // 1 = 100%
  const supportsZoom = typeof document !== "undefined" && "zoom" in document.documentElement.style;

  const style = supportsZoom
    ? { zoom: level } // changes layout size (keeps scrollbars meaningful)
    : { transform: `scale(${level})`, transformOrigin: "top left" }; // fallback

  const clamp = (v) => Math.max(0.6, Math.min(2, Number(v) || 1));
  const set = (v) => setLevel(clamp(v));
  const inc = () => setLevel((z) => clamp(Math.round((z + 0.1) * 10) / 10));
  const dec = () => setLevel((z) => clamp(Math.round((z - 0.1) * 10) / 10));
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

  const zoom = useZoom();

  // Refs used for auto-fit
  const scrollerRef = useRef(null);
  const contentRef = useRef(null);

  // Auto Fit state
  const [autoFit, setAutoFit] = useState(true);
  const [fullyFits, setFullyFits] = useState(false); // if true, we can hide scroller overflow

  // Desktop detection (match CSS breakpoint)
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width:1024px)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width:1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    onChange();
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  // Auto-fit algorithm: measure unscaled content size and available scroller size,
  // pick a scale so the whole board fits with a small footer reserve on mobile.
  useEffect(() => {
    if (tab !== "Wooster’s Word Web") return;

    let ro1, ro2;
    const handle = () => {
      const scroller = scrollerRef.current;
      const content = contentRef.current;
      if (!scroller || !content) return;

      // On desktop: show at 100%, no inner scroll (CSS handles overflow visible)
      if (isDesktop) {
        zoom.set(1);
        setFullyFits(true);
        return;
      }

      if (!autoFit) {
        // When auto-fit is off, still record if it currently fits
        const rectScaled = content.getBoundingClientRect();
        const w = rectScaled.width / zoom.level;
        const h = rectScaled.height / zoom.level;
        const availW = scroller.clientWidth - 8; // a bit of padding
        const footerReserve = 96; // px reserved for messages/score
        const availH = scroller.clientHeight - 8 - footerReserve;
        const target = Math.min(1, Math.min(availW / w, availH / h));
        const fits = w * zoom.level <= availW && h * zoom.level <= (availH + footerReserve);
        setFullyFits(fits || target >= zoom.level);
        return;
      }

      // Measure unscaled size by dividing out current zoom
      const rectScaled = content.getBoundingClientRect();
      const unscaledW = rectScaled.width / zoom.level || 1;
      const unscaledH = rectScaled.height / zoom.level || 1;

      const availW = scroller.clientWidth - 8; // padding guard
      const footerReserve = 96; // keep space below for messages/score on phones
      const availH = scroller.clientHeight - 8 - footerReserve;

      const targetScale = Math.max(0.6, Math.min(1, Math.min(availW / unscaledW, availH / unscaledH)));
      zoom.set(targetScale);

      const fitsNow = unscaledW * targetScale <= availW && unscaledH * targetScale <= (availH + footerReserve);
      setFullyFits(fitsNow);
    };

    // Observe both scroller size and content size
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (window.ResizeObserver && scroller && content) {
      ro1 = new ResizeObserver(handle);
      ro2 = new ResizeObserver(handle);
      ro1.observe(scroller);
      ro2.observe(content);
    }

    // Also respond to window resize/orientation
    window.addEventListener("resize", handle);
    // Run once after mount/changes
    setTimeout(handle, 0);

    return () => {
      window.removeEventListener("resize", handle);
      if (ro1) ro1.disconnect();
      if (ro2) ro2.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, autoFit, isDesktop, zoom.level]);

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

            {/* Controls: Auto Fit + manual zoom */}
            <div className="flex items-center gap-1">
              <button
                className={`px-2 py-1 text-sm rounded border ${
                  autoFit ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-700"
                }`}
                onClick={() => setAutoFit((v) => !v)}
                title="Auto Fit"
                aria-pressed={autoFit}
              >
                Auto
              </button>
              <button
                className="px-2 py-1 text-sm rounded border bg-white dark:bg-gray-700"
                onClick={() => {
                  zoom.reset();
                  setAutoFit(true); // reset to auto
                }}
                title="Fit (100% base)"
              >
                Fit
              </button>
              <button
                className="px-2 py-1 text-sm rounded border bg-white dark:bg-gray-700"
                onClick={() => {
                  setAutoFit(false);
                  zoom.dec();
                }}
                title="Zoom out"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                className="px-2 py-1 text-sm rounded border bg-white dark:bg-gray-700"
                onClick={() => {
                  setAutoFit(false);
                  zoom.inc();
                }}
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>

          {/* Guard: blocks page scroll; scroller handles panning if needed */}
          <PuzzleTouchGuard>
            <div
              ref={scrollerRef}
              className="puzzle-scroller rounded-lg"
              style={{
                // On desktop, CSS media query already makes overflow visible.
                // On mobile, if it fully fits, hide internal scroll so drags don't fight scrollbars.
                overflow: isDesktop ? undefined : fullyFits ? "hidden" : "auto",
                maxHeight: isDesktop ? undefined : "85vh",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x pan-y",
                overscrollBehavior: "contain",
                background: "transparent",
              }}
            >
              <div className="p-2">
                <div className="puzzle-zoom" style={zoom.style}>
                  {/* Content we measure for auto-fit */}
                  <div ref={contentRef}>
                    <WoostersWordWeb className="puzzle-pointer-surface" />
                  </div>
                </div>
              </div>
            </div>
          </PuzzleTouchGuard>

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {isDesktop
              ? "Desktop: full board shown; messages appear below."
              : fullyFits
              ? "Mobile: board fits; drag to select letters freely."
              : "Mobile: pan inside the grid to see all letters; use Auto/+/− for size."}
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
