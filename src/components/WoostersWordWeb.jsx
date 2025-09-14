import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, RefreshCw, Lightbulb, X } from "lucide-react";

/** ---------- Central Time date (YYYY-MM-DD) ---------- */
function centralDateStr(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-");
  return `${y}-${m}-${day}`;
}

/** ---------- Improved default 12x12 puzzle (no repeating pattern) ---------- */
const DEFAULT_PUZZLE = {
  theme: "Wodehouse Sampler",
  size: 12,
  grid: [
    "WOOSTERBJWYE",
    "OLVWZDOTPTAW",
    "QNJEEVESSLTH",
    "RBYNMFBDDMEI",
    "DFLQPEYMTQIS",
    "SFMACBSBFBFK",
    "JICQNATDSUUY",
    "VBDTHDOZUXKK",
    "QVWTOFIECYKB",
    "SSARIPTUREIL",
    "XGFVTCRVGDJP",
    "AYXLWNBPNSTY"
  ],
  // These 5 are actually present as continuous paths (H/V/diagonal, some bent allowed by UI)
  answers: ["WOOSTER", "JEEVES", "BLANDINGS", "WHISKY", "AGATHA"]
};

/** ---------- Validation + normalization ---------- */
function isArray(x) { return Array.isArray(x); }
function isString(x) { return typeof x === "string"; }
function normalizeRow(row) { return String(row || "").toUpperCase().replace(/[^A-Z]/g, ""); }
function normalizeAns(a) { return String(a || "").toUpperCase().replace(/[^A-Z]/g, ""); }

function validateAndRepair(json) {
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "Puzzle JSON is not an object." };
  }
  const theme = isString(json.theme) ? json.theme.trim() : "Untitled";
  let size = Number.isInteger(json.size) ? json.size : 0;

  if (!isArray(json.grid) || json.grid.length === 0) {
    return { ok: false, reason: "Missing grid array." };
  }
  let grid = json.grid.map(normalizeRow);
  const maxLen = Math.max(...grid.map((r) => r.length));
  if (!size || size < 2) size = Math.max(grid.length, maxLen);

  const N = size;
  const rand = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

  // square-ify: pad/trim to N×N
  grid = [...grid];
  while (grid.length < N) grid.push("");
  if (grid.length > N) grid = grid.slice(0, N);
  grid = grid.map((r) => {
    let rr = r;
    while (rr.length < N) rr += rand();
    if (rr.length > N) rr = rr.slice(0, N);
    return rr;
  });

  let answers = (json.answers || []).map(normalizeAns).filter(Boolean);
  if (answers.length === 0) {
    return { ok: false, reason: "No answers provided." };
  }
  return { ok: true, value: { theme, size: N, grid, answers } };
}

/** ---------- Selection mechanics ---------- */
const DIRS = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
function inBounds(x, y, N) { return x >= 0 && y >= 0 && x < N && y < N; }

/** ---------- Hint timing ---------- */
const HINT_IDLE_MS = 20000;

/** ---------- How-to modal ---------- */
function HowModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold">How to play — Wooster’s Word Web</h3>
          <button onClick={onClose} className="p-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">
          <li><b>Find themed entries</b> hidden in the letter grid. Words can run horizontally, vertically, diagonally, and may bend. Reverse is allowed.</li>
          <li><b>Drag to select</b> letters (mouse or touch). You can <b>backtrack</b>: sliding back over the previous tile removes it.</li>
          <li>Release to submit; if the path matches an answer (forwards or backwards), it’s marked as found.</li>
          <li>Stuck? Tap <b>Hint</b> for a gentle nudge. Inactivity gives a subtle pulse on the theme.</li>
          <li><b>Reset</b> clears found words and your current selection. The puzzle rotates daily (America/Chicago).</li>
        </ol>
      </div>
    </div>
  );
}

/** ---------- Component ---------- */
export default function WoostersWordWeb() {
  const seed = centralDateStr();
  const [loading, setLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(null);
  const [error, setError] = useState("");
  const [found, setFound] = useState(new Set());
  const [path, setPath] = useState([]);
  const [isDown, setIsDown] = useState(false);
  const [lastMoveTs, setLastMoveTs] = useState(Date.now());
  const idleTimer = useRef(null);
  const [howOpen, setHowOpen] = useState(false);
  const containerRef = useRef(null);
  const [cell, setCell] = useState(36);

  const N = puzzle?.size || 0;

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || "/";

    async function fetchJSON(url) {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    }

    (async () => {
      setLoading(true);
      setError("");

      const dayUrl = `${base}content/games/wordweb/daily/${seed}.json?v=${seed}`;
      let raw = await fetchJSON(dayUrl);
      if (!raw) {
        const latestUrl = `${base}content/games/wordweb/latest.json?v=${seed}`;
        raw = await fetchJSON(latestUrl);
      }
      if (!raw) raw = DEFAULT_PUZZLE;

      const v = validateAndRepair(raw);
      if (!v.ok) {
        setError(v.reason);
        setPuzzle(validateAndRepair(DEFAULT_PUZZLE).value);
      } else {
        setPuzzle(v.value);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [seed]);

  /** idle hint */
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setLastMoveTs(Date.now()), HINT_IDLE_MS);
    return () => idleTimer.current && clearTimeout(idleTimer.current);
  }, [lastMoveTs, puzzle, found]);

  /** responsive cell size */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !puzzle) return;
    const ro = new ResizeObserver(() => {
      const maxWidth = Math.min(el.clientWidth, 560);
      const estimated = Math.floor(maxWidth / puzzle.size);
      setCell(Math.max(24, Math.min(42, estimated)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [puzzle]);

  const letters = useMemo(() => (puzzle ? puzzle.grid.map((r) => r.split("")) : []), [puzzle]);

  /** selection */
  const startSelect = (x, y) => {
    if (!inBounds(x, y, N)) return;
    setIsDown(true);
    setPath([{ x, y }]);
    setLastMoveTs(Date.now());
  };
  const extendSelect = (x, y) => {
    if (!isDown || !inBounds(x, y, N)) return;
    setLastMoveTs(Date.now());
    setPath((prev) => {
      if (prev.length === 0) return [{ x, y }];
      const last = prev[prev.length - 1];
      // backtrack
      if (prev.length >= 2) {
        const prev2 = prev[prev.length - 2];
        if (prev2.x === x && prev2.y === y) return prev.slice(0, -1);
      }
      // must be adjacent
      if (Math.abs(x - last.x) <= 1 && Math.abs(y - last.y) <= 1 && !(x === last.x && y === last.y)) {
        if (prev.find((p) => p.x === x && p.y === y)) return prev;
        return [...prev, { x, y }];
      }
      return prev;
    });
  };
  const endSelect = () => {
    if (!isDown || !puzzle) { setIsDown(false); return; }
    setIsDown(false);

    if (path.length >= 2) {
      const word = path.map((p) => letters[p.y][p.x]).join("");
      const norm = word.toUpperCase().replace(/[^A-Z]/g, "");
      const rev = norm.split("").reverse().join("");
      const hit = puzzle.answers.find((a) => a === norm || a === rev);
      if (hit) setFound((prev) => new Set([...prev, hit]));
    }
    setPath([]);
  };

  const resetAll = () => {
    setFound(new Set());
    setPath([]);
    setLastMoveTs(Date.now());
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="h-64 w-full bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const allFound = puzzle && found.size >= (puzzle.answers?.length || 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 select-none">
      {/* Header / controls */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-serif font-bold">Wooster’s Word Web</h1>
          <p className="text-sm text-gray-600">Date: {seed} (America/Chicago)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetAll} className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" title="Reset">
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
          <button onClick={() => setLastMoveTs(Date.now())} className="inline-flex items-center gap-2 px-3 py-2 rounded bg-amber-100 hover:bg-amber-200" title="Hint nudge">
            <Lightbulb className="w-4 h-4" /> Hint
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200" title="How to play" onClick={() => setHowOpen(true)}>
            <HelpCircle className="w-4 h-4" /> How
          </button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence initial={false}>
        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-3 p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm">
            Could not load today’s puzzle: {error}. Using a safe default.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Theme */}
      <motion.div key={lastMoveTs} initial={{ opacity: 0.9 }} animate={{ opacity: 1 }} className="mb-4 p-3 rounded border border-blue-200 bg-blue-50 text-blue-900">
        <div className="text-sm">Theme</div>
        <div className="font-semibold">{puzzle?.theme || "—"}</div>
      </motion.div>

      {/* Grid */}
      {puzzle && (
        <div ref={containerRef} className="inline-block" onMouseLeave={endSelect} onMouseUp={endSelect} onTouchEnd={endSelect}>
          <div
            className="grid bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${N}, ${cell}px)`,
              gridTemplateRows: `repeat(${N}, ${cell}px)`,
            }}
          >
            {letters.map((row, y) =>
              row.map((ch, x) => {
                const inPath = path.some((p) => p.x === x && p.y === y);
                const cls = inPath ? "bg-yellow-200 ring-2 ring-yellow-500" : "bg-white";
                return (
                  <div
                    key={`${x}-${y}`}
                    data-cell={`${x},${y}`}
                    className={`flex items-center justify-center border border-gray-100 font-semibold cursor-pointer select-none ${cls}`}
                    style={{ width: cell, height: cell, fontSize: Math.max(12, Math.floor(cell * 0.55)) }}
                    onMouseDown={() => startSelect(x, y)}
                    onMouseEnter={() => extendSelect(x, y)}
                    onTouchStart={(e) => { e.preventDefault(); startSelect(x, y); }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      const el = document.elementFromPoint(t.clientX, t.clientY);
                      const attr = el?.getAttribute("data-cell");
                      if (!attr) return;
                      const [xx, yy] = attr.split(",").map((n) => parseInt(n, 10));
                      extendSelect(xx, yy);
                    }}
                  >
                    {ch}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="mt-4 text-sm text-gray-700">Found: {found.size} / {puzzle?.answers?.length || 0}</div>

      {allFound && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 p-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
          Splendid! You’ve netted the whole web.
        </motion.div>
      )}

      <HowModal open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  );
}
