import React, { useState, useRef, useEffect } from "react";
import WoostersWordWeb from "../components/WoostersWordWeb.jsx";
import JeevesJottings from "../components/JeevesJottings.jsx";
import StatsPanel from "../components/StatsPanel.jsx";

/* Touch/Pan/Zoom guard: block page scroll outside, allow panning inside the puzzle scroller on mobile. */
function PuzzleTouchGuard({ className = "", lockScroll = true, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const scroller = root.querySelector(".puzzle-scroller");

    const originalOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const onTouchMove = (e) => {
      if (scroller && scroller.contains(e.target)) return; // allow inside scroller
      e.preventDefault(); // block page jiggle
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

/* Zoom hook (CSS zoom where available, transform fallback) */
function useZoom() {
  const [level, setLevel] = useState(1);
  const supportsZoom = typeof document !== "undefined" && "zoom" in document.documentElement.style;

  const style = supportsZoom
    ? { zoom: level } // keeps scrollbars meaningful
    : { transform: `scale(${level})`, transformOrigin: "top left" };

  const clamp = (v) => Math.max(0.6, Math.min(2, Number(v) || 1));
  const set = (v) => setLevel(clamp(v));
  const inc = () => setLevel((z) => clamp(Math.round((z + 0.1) * 10) / 10));
  const dec = () => setLevel((z) => clamp(Math.round((z - 0.1) * 10) / 10));
  const reset = () => setLevel(1);

  return { level, style, set, inc, dec, reset };
}

/* Global event fire helper so puzzle can listen (optional) */
function fire(name) {
  window.dispatchEvent(new CustomEvent(name));
}

const GamesLegal = () => (
  <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4">
    <h2 className="text-base sm:text-lg font-bold mb-2">Legal Disclaimer</h2>
    <p className="text-sm text-gray-700 dark:text-gray-300">
      All puzzles and quizzes on this site — including <em>Wooster’s Word Web</em> and <em>Jeeves’ Jottings</em> — are
      constructed from the public-domain works of P. G. Wodehouse, made freely available thanks to{" "}
      <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer" className="underline">Project Gutenberg</a>.
      This section is intended for literary fun and wordplay.
    </p>
  </section>
);

export default function Games() {
  const tabs = ["Wooster’s Word Web", "Jeeves’ Jottings", "Dictionary Stats", "Legal"];
  const [tab, setTab] = useState(tabs[0]);

  // Hide the global footer while on Games to reclaim space
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const prev = footer.style.display;
    footer.style.display = "none";
    return () => { footer.style.display = prev; };
  }, []);

  // Desktop detection (mirror CSS @media min-width:1024px)
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width:1024px)").matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width:1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  // Zoom + AutoFit
  const zoom = useZoom();
  const [autoFit, setAutoFit] = useState(true);
  const [fullyFits, setFullyFits] = useState(false);
  const scrollerRef = useRef(null);
  const contentRef = useRef(null);

  // Compute inner height on mobile to fill viewport under our compact bars
  const [scrollerHeight, setScrollerHeight] = useState(null);
  useEffect(() => {
    const compute = () => {
      if (!scrollerRef.current) return;
      const rectTop = scrollerRef.current.getBoundingClientRect().top;
      const vh = window.innerHeight;
      const reserve = isDesktop ? 200 : 120; // room below for scoreline/whitespace
      const h = Math.max(200, Math.floor(vh - rectTop - reserve));
      setScrollerHeight(h);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [isDesktop, tab]);

  // Auto-fit (mobile only)
  useEffect(() => {
    if (tab !== "Wooster’s Word Web") return;

    let ro1, ro2;
    const handle = () => {
      const scroller = scrollerRef.current;
      const content = contentRef.current;
      if (!scroller || !content) return;

      if (isDesktop) {
        zoom.set(1);
        setFullyFits(true);
        return;
      }

      const rectScaled = content.getBoundingClientRect();
      const unscaledW = rectScaled.width / zoom.level || 1;
      const unscaledH = rectScaled.height / zoom.level || 1;

      const availW = scroller.clientWidth - 8;
      const footerReserve = 96;
      const availH = (scrollerHeight ?? scroller.clientHeight) - 8 - footerReserve;

      if (autoFit) {
        const targetScale = Math.max(0.6, Math.min(1, Math.min(availW / unscaledW, availH / unscaledH)));
        zoom.set(targetScale);
        setFullyFits(unscaledW * targetScale <= availW && unscaledH * targetScale <= (availH + footerReserve));
      } else {
        setFullyFits(unscaledW * zoom.level <= availW && unscaledH * zoom.level <= (availH + footerReserve));
      }
    };

    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (window.ResizeObserver && scroller && content) {
      const roA = new ResizeObserver(handle);
      const roB = new ResizeObserver(handle);
      ro1 = roA; ro2 = roB;
      roA.observe(scroller);
      roB.observe(content);
    }

    window.addEventListener("resize", handle);
    setTimeout(handle, 0);

    return () => {
      window.removeEventListener("resize", handle);
      if (ro1) ro1.disconnect();
      if (ro2) ro2.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, autoFit, isDesktop, zoom.level, scrollerHeight]);

  const today = new Date().toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-3">
      {/* Row 1: Tabs (left) + Zoom controls (right) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${
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
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              className={`px-2 py-1 text-xs rounded border ${
                autoFit ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-700"
              }`}
              onClick={() => setAutoFit((v) => !v)}
              title="Auto Fit"
              aria-pressed={autoFit}
            >
              Auto
            </button>
            <button
              className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700"
              onClick={() => { zoom.reset(); setAutoFit(true); }}
              title="Fit (100%)"
            >
              Fit
            </button>
            <button
              className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700"
              onClick={() => { setAutoFit(false); zoom.dec(); }}
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700"
              onClick={() => { setAutoFit(false); zoom.inc(); }}
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Date (left) + action buttons (right) */}
      {tab === "Wooster’s Word Web" && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-gray-600 dark:text-gray-300">{today}</div>
          <div className="flex items-center gap-1 flex-wrap">
            <button className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700" onClick={() => fire("ww:reset")} title="Reset">Reset</button>
            <button className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700" onClick={() => fire("ww:hint")} title="Hint">Hint</button>
            <button className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700" onClick={() => fire("ww:reveal-start")} title="Reveal starting letters">Reveal Start</button>
            <button className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700" onClick={() => fire("ww:reveal-solution")} title="Reveal full solution">Reveal Solution</button>
            <button className="px-2 py-1 text-xs rounded border bg-white dark:bg-gray-700" onClick={() => fire("ww:how")} title="How to play">How</button>
          </div>
        </div>
      )}

      {/* Content */}
      {tab === "Wooster’s Word Web" && (
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-2 sm:p-3 pb-8">
          {/* Make desktop scroll normally; lock only on mobile */}
          <PuzzleTouchGuard lockScroll={!isDesktop}>
            <div
              ref={scrollerRef}
              className="puzzle-scroller rounded-lg"
              style={{
                // Desktop: no inner scroll; Mobile: only if it doesn't fully fit
                overflow: isDesktop ? "visible" : (fullyFits ? "hidden" : "auto"),
                height: isDesktop ? "auto" : (scrollerHeight ? `${scrollerHeight}px` : undefined),
                maxHeight: isDesktop ? "none" : undefined,
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x pan-y",
                overscrollBehavior: "contain",
                background: "transparent",
              }}
            >
              <div className="p-2 ww-compact">
                {/* Hide duplicate big headers/theme/date inside puzzle (if present) */}
                <style jsx="true">{`
                  .ww-compact :is(h1,h2):first-of-type { display: none !important; }
                  .ww-compact time, .ww-compact .date, .ww-compact [data-date] { display: none !important; }
                  .ww-compact .theme, .ww-compact [data-theme], .ww-compact .ww-theme { display: none !important; }
                `}</style>

                {/* Zoom wrapper */}
                <div className="puzzle-zoom" style={zoom.style}>
                  <div ref={contentRef}>
                    <WoostersWordWeb className="puzzle-pointer-surface" />
                  </div>
                </div>
              </div>
            </div>
          </PuzzleTouchGuard>

          {/* Score / status line directly under the puzzle */}
          <div id="ww-score-slot" className="mt-3 text-sm text-gray-700 dark:text-gray-200">
            {/* Your game logic can set text here if it doesn't already render its own score. */}
          </div>
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
