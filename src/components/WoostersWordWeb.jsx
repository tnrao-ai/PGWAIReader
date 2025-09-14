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

/** ---------- Safe defaults (valid 10x10) ---------- */
const DEFAULT_PUZZLE = {
  theme: "Wodehouse Sampler",
  size: 10,
  grid: [
    "WOOSTERXLY",
    "AUNTDAHLIA",
    "BLANDINGSX",
    "EMSWORTHZZ",
    "GUSSIEFINK",
    "NOTTLESCRP",
    "TUREWHISKY",
    "AGATHAJEEV",
    "ESPGWCLUBS",
    "HOLLyHOCKS"
  ].map(r => r.toUpperCase().replace(/[^A-Z]/g, "")),
  // Targets must appear forward or reverse in the grid
  answers: [
    "WOOSTER",
    "AUNTDAHLIA",
    "BLANDINGS",
    "EMSWORTH",
    "GUSSIEFINKNOTTLE".replace(/[^A-Z]/g, ""), // packed version
    "SCRIPTURE",
    "WHISKY",
    "AGATHA",
    "JEEVES",
    "HOLLYHOCKS"
  ].map(s => s.toUpperCase().replace(/[^A-Z]/g, "")),
};

/** ---------- Validation + normalization ---------- */
function isArray(x) { return Array.isArray(x); }
function isString(x) { return typeof x === "string"; }

function normalizeRow(row) {
  // keep [A-Z] only
  return String(row || "").toUpperCase().replace(/[^A-Z]/g, "");
}
function normalizeAns(a) {
  return String(a || "").toUpperCase().replace(/[^A-Z]/g, "");
}

function validateAndRepair(json) {
  const notes = [];
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "Puzzle JSON is not an object." };
  }
  const theme = isString(json.theme) ? json.theme.trim() : "Untitled";
  let size = Number.isInteger(json.size) ? json.size : 0;

  if (!isArray(json.grid) || json.grid.length === 0) {
    return { ok: false, reason: "Missing grid array." };
  }
  let grid = json.grid.map(normalizeRow);
  const maxLen = Math.max(...grid.map(r => r.length));
  if (!size || size < 2) size = Math.max(grid.length, maxLen);

  // square-ify: pad or trim each row to size; pad missing rows with random
  const N = size;
  const rand = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  if (grid.length !== N) {
    notes.push(`Adjusted row count from ${grid.length} to ${N}.`);
  }
  // ensure exactly N rows
  grid = [...grid];
  while (grid.length < N) grid.push("");
  if (grid.length > N) grid = grid.slice(0, N);
  // ensure each row length == N
  grid = grid.map((r, i) => {
    let rr = (r || "");
    if (rr.length < N) {
      notes.push(`Row ${i + 1}: padded ${N - rr.length} letters.`);
      while (rr.length < N) rr += rand();
    } else if (rr.length > N) {
      notes.push(`Row ${i + 1}: trimmed ${rr.length - N} letters.`);
      rr = rr.slice(0, N);
    }
    return rr;
  });

  let answers = (json.answers || []).map(normalizeAns).filter(Boolean);
  if (answers.length === 0) {
    return { ok: false, reason: "No answers provided." };
  }

  return { ok: true, value: { theme, size: N, grid, answers, notes } };
}

/** ---------- Selection mechanics ---------- */
const DIRS = [
  [1,0],[0,1],[-1,0],[0,-1],
  [1,1],[1,-1],[-1,1],[-1,-1]
];
function inBounds(x,y,N){ return x>=0 && y>=0 && x<N && y<N; }

/** ---------- Hint timing ---------- */
const HINT_IDLE_MS = 20000;

/** ---------- How-to modal ---------- */
function HowModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-5" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold">How to play — Wooster’s Word Web</h3>
          <button onClick={onClose} className="p-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">
          <li><b>Find 7 themed entries</b> hidden in the letter grid. Words can run <i>horizontally, vertically, or diagonally</i>. Reverse is allowed.</li>
          <li><b>Drag to select</b> letters (mouse or touch). You can <b>backtrack</b>: sliding back over the previous tile removes it.</li>
          <li>Release to submit; if the path matches an answer (forwards or backwards), it’s marked as found.</li>
          <li>Stuck? Tap <b>Hint</b> for a gentle nudge. Long inactivity will give a subtle pulse on the theme area.</li>
          <li><b>Reset</b> clears found words and current selection. Today’s puzzle rotates daily (America/Chicago).</li>
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
  const [repairNotes, setRepairNotes] = useState([]);
  const [found, setFound] = useState(new Set());
  const [path, setPath] = useState([]);
  const [isDown, setIsDown] = useState(false);
  const [lastMoveTs, setLastMoveTs] = useState(Date.now());
  const idleTimer = useRef(null);
  const [howOpen, setHowOpen] = useState(false);

  const N = puzzle?.size || 0;

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || "/";

    async function fetchJSON(url) {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) return null;
        const t = await r.text();
        try { return JSON.parse(t); } catch { return null; }
      } catch { return null; }
    }

    (async () => {
      setLoading(true);
      setError("");
      setRepairNotes([]);

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
        if (v.value.notes?.length) setRepairNotes(v.value.notes);
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

  const themePulse = useMemo(() => ({ key: lastMoveTs }), [lastMoveTs]);
  const letters = useMemo(() => (puzzle ? puzzle.grid.map(r => r.split("")) : []), [puzzle]);

  /** selection */
  const startSelect = (x,y) => {
    if (!inBounds(x,y,N)) return;
    setIsDown(true);
    setPath([{x,y}]);
    setLastMoveTs(Date.now());
  };
  const extendSelect = (x,y) => {
    if (!isDown || !inBounds(x,y,N)) return;
    setLastMoveTs(Date.now());
    setPath(prev => {
      if (prev.length === 0) return [{x,y}];
      const last = prev[prev.length-1];
      // backtrack one
      if (prev.length >= 2) {
        const prev2 = prev[prev.length-2];
        if (prev2.x === x && prev2.y === y) return prev.slice(0, -1);
      }
      const dx = x - last.x, dy = y - last.y;
      if (!DIRS.some(([ax,ay]) => ax===dx && ay===dy)) return prev;
      if (prev.find(p => p.x===x && p.y===y)) return prev;
      return [...prev, {x,y}];
    });
  };
  const endSelect = () => {
    if (!isDown || !puzzle) { setIsDown(false); return; }
    setIsDown(false);

    if (path.length >= 2) {
      const word = path.map(p => letters[p.y][p.x]).join("");
      const norm = word.toUpperCase().replace(/[^A-Z]/g, "");
      const rev = norm.split("").reverse().join("");
      const hit = puzzle.answers.find(a => a === norm || a === rev);
      if (hit) {
        setFound(prev => new Set([...prev, hit]));
      }
    }
    setPath([]);
  };

  const resetAll = () => {
    setFound(new Set());
    setPath([]);
    setLastMoveTs(Date.now());
  };

  const allFound = puzzle && found.size >= (puzzle.answers?.length || 0);

  /** ---------- Render ---------- */
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

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 select-none">
      {/* Header / controls */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-serif font-bold">Wooster’s Word Web</h1>
          <p className="text-sm text-gray-600">Date: {seed} (America/Chicago)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            title="Reset"
          >
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={()=>setLastMoveTs(Date.now())}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-amber-100 hover:bg-amber-200"
            title="Hint nudge"
          >
            <Lightbulb className="w-4 h-4" /> Hint
          </button>
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            title="How to play"
            onClick={() => setHowOpen(true)}
          >
            <HelpCircle className="w-4 h-4" /> How
          </button>
        </div>
      </div>

      {/* Errors / repair notes */}
      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-3 p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm"
          >
            Could not load today’s puzzle: {error}. Using a safe default so you can play.
          </motion.div>
        )}
      </AnimatePresence>
      {!!repairNotes.length && (
        <div className="mb-3 p-2 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
          Adjustments applied: {repairNotes.join(" ")}
        </div>
      )}

      {/* Theme */}
      <motion.div
        key={themePulse.key}
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 1 }}
        className="mb-4 p-3 rounded border border-blue-200 bg-blue-50 text-blue-900"
      >
        <div className="text-sm">Theme</div>
        <div className="font-semibold">{puzzle?.theme || "—"}</div>
      </motion.div>

      {/* Grid */}
      {puzzle && (
        <div
          className="inline-block"
          onMouseLeave={endSelect}
          onMouseUp={endSelect}
          role="grid"
          aria-label="Word web grid"
        >
          <div
            className="grid bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${N}, 2.25rem)`,
              gridTemplateRows: `repeat(${N}, 2.25rem)`,
            }}
            onTouchEnd={endSelect}
          >
            {letters.map((row, y) =>
              row.map((ch, x) => {
                const inPath = path.some(p => p.x === x && p.y === y);
                const selectedStyle = inPath ? "bg-yellow-200 ring-2 ring-yellow-500" : "bg-white";
                return (
                  <div
                    key={`${x}-${y}`}
                    role="gridcell"
                    data-cell={`${x},${y}`}
                    className={`w-9 h-9 flex items-center justify-center border border-gray-100 font-semibold cursor-pointer select-none ${selectedStyle}`}
                    onMouseDown={() => startSelect(x,y)}
                    onMouseEnter={() => extendSelect(x,y)}
                    onTouchStart={(e) => { e.preventDefault(); startSelect(x,y); }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      const el = document.elementFromPoint(t.clientX, t.clientY);
                      if (!el) return;
                      const attr = el.getAttribute("data-cell");
                      if (!attr) return;
                      const [xx,yy] = attr.split(",").map(n => parseInt(n,10));
                      if (Number.isInteger(xx) && Number.isInteger(yy)) extendSelect(xx,yy);
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
      <div className="mt-4 text-sm text-gray-700">
        Found: {found.size} / {puzzle?.answers?.length || 0}
      </div>

      {puzzle && found.size >= (puzzle.answers?.length || 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-800"
        >
          Splendid! You’ve netted the whole web.
        </motion.div>
      )}

      {/* How-to modal */}
      <HowModal open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  );
}
