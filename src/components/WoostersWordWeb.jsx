import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, RefreshCw, Lightbulb, X, Sparkles } from "lucide-react";

/* ========= Date utils (America/Chicago) ========= */
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

/* ========= Safe default puzzle (12×12, non-overlapping answers) ========= */
const DEFAULT_PUZZLE = {
  theme: "Wodehouse Sampler",
  size: 12,
  // Words placed as single continuous paths, with no overlapping letters.
  // Rows 0..11, Cols 0..11
  grid: [
    // 0: WOOSTER at (0,0)→(6,0)
    "WOOSTERWEZX",
    // 1: filler
    "QHMVLPYDKRU",
    // 2: JEEVES at (2,2)→(7,2)
    "ABJEEVESCNO",
    // 3: filler
    "TRGQXNAHFIU",
    // 4: BLANDINGS at (0,4)→(8,4)
    "BLANDINGSQZ",
    // 5: filler
    "PCWYROTZMEL",
    // 6: WHISKY at (5,6)→(10,6)
    "UVQRTWHISKY",
    // 7: filler
    "ONCABGDLPEX",
    // 8: AGATHA at (2,8)→(7,8)
    "JJAGATHAVBS",
    // 9..11: filler
    "MZQIRUTEOPC",
    "LXFDBNCGTHA",
    "SRVYEWKJIMQ",
  ],
  answers: ["WOOSTER", "JEEVES", "BLANDINGS", "WHISKY", "AGATHA"],
};

/* ========= Validation + normalization + gentle repair ========= */
const isArray = (x) => Array.isArray(x);
const isString = (x) => typeof x === "string";
const normalizeRow = (row) => String(row || "").toUpperCase().replace(/[^A-Z]/g, "");
const normalizeAns = (a) => String(a || "").toUpperCase().replace(/[^A-Z]/g, "");

function validateAndRepair(json) {
  const notes = [];
  if (!json || typeof json !== "object") {
    return { ok: false, reason: "Puzzle JSON is not an object." };
  }
  const theme = isString(json.theme) ? json.theme.trim() : "Untitled";
  let grid = isArray(json.grid) ? json.grid.map(normalizeRow) : null;
  if (!grid || grid.length === 0) {
    return { ok: false, reason: "Missing or empty grid array." };
  }

  let size = Number.isInteger(json.size) ? json.size : 0;
  const maxLen = Math.max(...grid.map((r) => r.length));
  if (!size || size < 2) size = Math.max(grid.length, maxLen);
  const N = size;

  const rand = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

  // Exactly N rows
  if (grid.length !== N) { /* internal note only; no UI print */ }
  grid = [...grid];
  while (grid.length < N) grid.push("");
  if (grid.length > N) grid = grid.slice(0, N);

  // Each row length == N
  grid = grid.map((r) => {
    let rr = r;
    if (rr.length < N) {
      while (rr.length < N) rr += rand();
    } else if (rr.length > N) {
      rr = rr.slice(0, N);
    }
    return rr;
  });

  const answers = (json.answers || []).map(normalizeAns).filter(Boolean);
  if (answers.length === 0) {
    return { ok: false, reason: "No answers provided." };
  }

  return { ok: true, value: { theme, size: N, grid, answers, notes } };
}

/* ========= Selection mechanics ========= */
function inBounds(x, y, N) {
  return x >= 0 && y >= 0 && x < N && y < N;
}

/* ========= Hints + persistence ========= */
const HINT_IDLE_MS = 20000;
const HINT_REVEAL_LIMIT = 1;

const lsKey = (seed) => `www_daily_${seed}`;
function loadFound(seed) {
  try {
    const raw = localStorage.getItem(lsKey(seed));
    if (!raw) return { found: [], reveals: 0, foundPaths: {} };
    const obj = JSON.parse(raw);
    return {
      found: Array.isArray(obj.found) ? obj.found : [],
      reveals: Number(obj.reveals || 0),
      foundPaths: obj.foundPaths || {},
    };
  } catch {
    return { found: [], reveals: 0, foundPaths: {} };
  }
}
function saveFound(seed, foundSet, revealsUsed, foundPaths) {
  const out = {
    found: Array.from(foundSet),
    reveals: revealsUsed | 0,
    foundPaths,
  };
  localStorage.setItem(lsKey(seed), JSON.stringify(out));
}

/* ========= How-to modal ========= */
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
          <li><b>Find the themed entries</b> hidden in the letter grid. Paths can go horizontally, vertically, diagonally, and may <b>bend</b>. Reverse is allowed.</li>
          <li><b>Drag to select</b> letters (mouse or touch). You can <b>backtrack</b>: sliding back over the previous tile removes it.</li>
          <li>Release to submit; if your path matches an answer (forwards or backwards), it is marked as found and stays highlighted.</li>
          <li>Stuck? Use <b>Hint</b>. You also get <b>one “Reveal start”</b> per day that highlights a valid first letter for an unsolved word.</li>
          <li><b>Reset</b> clears today’s progress. New puzzle each day (America/Chicago).</li>
        </ol>
      </div>
    </div>
  );
}

/* ========= Component ========= */
export default function WoostersWordWeb() {
  const seed = centralDateStr();
  const [loading, setLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(null);
  const [error, setError] = useState("");
  const [repairNotes, setRepairNotes] = useState([]); // kept for state hygiene; not rendered

  // live selection path
  const [path, setPath] = useState([]); // [{x,y}]
  const [isDown, setIsDown] = useState(false);

  // found words
  const [found, setFound] = useState(new Set()); // normalized answers
  const [foundPaths, setFoundPaths] = useState({}); // answer -> [{x,y},...]

  // hints / modals
  const [lastMoveTs, setLastMoveTs] = useState(Date.now());
  const [hintCell, setHintCell] = useState(null); // {x,y}
  const [revealsUsed, setRevealsUsed] = useState(0);
  const [howOpen, setHowOpen] = useState(false);

  // responsive sizing
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const [cell, setCell] = useState(36);

  const N = puzzle?.size || 0;

  /* ----- load daily w/ fallbacks + rehydrate persistence ----- */
  useEffect(() => {
    let cancelled = false;

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
      setHintCell(null);

      // restore persistence
      const persisted = loadFound(seed);
      setRevealsUsed(persisted.reveals);

      // 1) Try Netlify function first (live generation)
      let raw = await fetchJSON(`/.netlify/functions/wordweb?date=${seed}`);

      // 2) Fallback to static files if function not available
      if (!raw) {
        const base = import.meta.env.BASE_URL || "/";
        const dayUrl = `${base}content/games/wordweb/daily/${seed}.json?v=${seed}`;
        raw = await fetchJSON(dayUrl) || await fetchJSON(`${base}content/games/wordweb/latest.json?v=${seed}`);
      }

      if (!raw) raw = DEFAULT_PUZZLE;

      const v = validateAndRepair(raw);
      if (!v.ok) {
        setError(v.reason);
        const safe = validateAndRepair(DEFAULT_PUZZLE).value;
        setPuzzle(safe);
        // rehydrate found restricted to safe answers
        setFound(new Set((persisted.found || []).filter(a => safe.answers.includes(a))));
        setFoundPaths(filterFoundPaths(persisted.foundPaths || {}, safe.answers));
      } else {
        setPuzzle(v.value);
        if (v.value.notes?.length) setRepairNotes(v.value.notes); // we keep state, but do not render
        setFound(new Set((persisted.found || []).filter(a => v.value.answers.includes(a))));
        setFoundPaths(filterFoundPaths(persisted.foundPaths || {}, v.value.answers));
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [seed]);

  function filterFoundPaths(pathsObj, validAnswers) {
    const out = {};
    for (const k of Object.keys(pathsObj || {})) {
      if (validAnswers.includes(k) && Array.isArray(pathsObj[k])) out[k] = pathsObj[k];
    }
    return out;
  }

  /* ----- idle hint pulse ----- */
  useEffect(() => {
    const to = setTimeout(() => setLastMoveTs(Date.now()), HINT_IDLE_MS);
    return () => clearTimeout(to);
  }, [lastMoveTs, puzzle, found]);

  const themePulseKey = useMemo(() => lastMoveTs, [lastMoveTs]);

  /* ----- responsive cell size ----- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !puzzle) return;
    const ro = new ResizeObserver(() => {
      const maxWidth = Math.min(el.clientWidth, 560);
      const estimated = Math.floor(maxWidth / puzzle.size);
      setCell(Math.max(24, Math.min(44, estimated)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [puzzle]);

  /* ----- letters matrix + persistence save ----- */
  const letters = useMemo(
    () => (puzzle ? puzzle.grid.map((r) => r.split("")) : []),
    [puzzle]
  );
  useEffect(() => {
    saveFound(seed, found, revealsUsed, foundPaths);
  }, [seed, found, revealsUsed, foundPaths]);

  /* ----- selection helpers ----- */
  const startSelect = (x, y) => {
    if (!inBounds(x, y, N)) return;
    setIsDown(true);
    setPath([{ x, y }]);
    setLastMoveTs(Date.now());
    setHintCell(null);
  };

  const extendSelect = (x, y) => {
    if (!isDown || !inBounds(x, y, N)) return;
    setLastMoveTs(Date.now());
    setPath((prev) => {
      if (prev.length === 0) return [{ x, y }];

      const a = prev.length >= 2 ? prev[prev.length - 2] : null;
      const b = prev[prev.length - 1];
      const c = { x, y };

      // If staying on the same cell, ignore
      if (b.x === c.x && b.y === c.y) return prev;

      // ---- Smart backtrack to ANY earlier node ----
      const idx = prev.findIndex((p) => p.x === c.x && p.y === c.y);
      if (idx !== -1) {
        return prev.slice(0, idx + 1);
      }

      // must be 8-neighbor adjacent from last node b
      const ax = Math.abs(c.x - b.x);
      const ay = Math.abs(c.y - b.y);
      const isAdjacent = (ax <= 1 && ay <= 1) && !(ax === 0 && ay === 0);
      if (!isAdjacent) return prev;

      // Corner-snap to intended diagonal
      if (a) {
        const diagFromA = Math.abs(c.x - a.x) === 1 && Math.abs(c.y - a.y) === 1;
        const bIsOrthOfA =
          (b.x === a.x && Math.abs(b.y - a.y) === 1) ||
          (b.y === a.y && Math.abs(b.x - a.x) === 1);
        if (diagFromA && bIsOrthOfA) {
          return [...prev.slice(0, -1), c];
        }
      }

      return [...prev, c];
    });
  };

  // Desktop smoothing: while dragging, also follow the mouse globally over the grid
  const onGridMouseMove = (e) => {
    if (!isDown) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const attr = el?.getAttribute?.("data-cell");
    if (!attr) return;
    const [xx, yy] = attr.split(",").map((n) => parseInt(n, 10));
    if (Number.isInteger(xx) && Number.isInteger(yy)) extendSelect(xx, yy);
  };

  const endSelect = () => {
    if (!isDown || !puzzle) {
      setIsDown(false);
      return;
    }
    setIsDown(false);

    if (path.length >= 2) {
      const word = path.map((p) => letters[p.y][p.x]).join("");
      const norm = word.toUpperCase().replace(/[^A-Z]/g, "");
      const rev = norm.split("").reverse().join("");
      const hit = puzzle.answers.find((a) => a === norm || a === rev);
      if (hit && !found.has(hit)) {
        setFound((prev) => new Set([...prev, hit]));
        setFoundPaths((prev) => ({ ...prev, [hit]: path.slice() })); // persist exact cells
      }
    }
    setPath([]);
  };

  /* ----- reveal-first-letter (once/day) ----- */
  const findRevealStartFor = (answer) => {
    if (!puzzle) return null;
    const A = answer[0], B = answer[1] || null;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (letters[y][x] !== A) continue;
        if (!B) return { x, y };
        // check neighbors include B
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (inBounds(nx, ny, N) && letters[ny][nx] === B) return { x, y };
          }
        }
      }
    }
    return null;
  };

  const onRevealFirstLetter = () => {
    if (!puzzle) return;
    if (revealsUsed >= HINT_REVEAL_LIMIT) return;
    const remaining = puzzle.answers.filter((a) => !found.has(a));
    if (remaining.length === 0) return;
    const target = remaining[0];
    const cell = findRevealStartFor(target);
    if (cell) {
      setHintCell(cell);
      setRevealsUsed((n) => n + 1);
      setLastMoveTs(Date.now());
    }
  };

  /* ----- reset ----- */
  const resetAll = () => {
    setFound(new Set());
    setFoundPaths({});
    setPath([]);
    setHintCell(null);
    setLastMoveTs(Date.now());
    setRevealsUsed(0);
  };

  /* ----- UI ----- */
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
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            title="Reset progress"
          >
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={() => setLastMoveTs(Date.now())}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-amber-100 hover:bg-amber-200"
            title="Hint nudge"
          >
            <Lightbulb className="w-4 h-4" /> Hint
          </button>
          <button
            onClick={onRevealFirstLetter}
            disabled={revealsUsed >= HINT_REVEAL_LIMIT || (puzzle && found.size === puzzle.answers.length)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded ${revealsUsed < HINT_REVEAL_LIMIT ? "bg-indigo-100 hover:bg-indigo-200" : "bg-gray-100 opacity-60 cursor-not-allowed"}`}
            title={revealsUsed < HINT_REVEAL_LIMIT ? "Reveal a valid starting letter (once per day)" : "Reveal used up for today"}
          >
            <Sparkles className="w-4 h-4" /> Reveal start
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

      {/* Error (repair notes removed from UI) */}
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

      {/* Theme (gentle pulse on idle) */}
      <motion.div
        key={themePulseKey}
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
          ref={containerRef}
          className="inline-block"
          onMouseLeave={endSelect}
          onMouseUp={endSelect}
          onTouchEnd={endSelect}
          role="grid"
          aria-label="Word web grid"
        >
          <div
            ref={gridRef}
            className="grid bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${N}, ${cell}px)`,
              gridTemplateRows: `repeat(${N}, ${cell}px)`,
            }}
            onMouseMove={onGridMouseMove}
          >
            {letters.map((row, y) =>
              row.map((ch, x) => {
                const inPath = path.some((p) => p.x === x && p.y === y);
                const inFound = Object.values(foundPaths).some((cells) =>
                  cells?.some?.((c) => c.x === x && c.y === y)
                );
                const isHint = hintCell && hintCell.x === x && hintCell.y === y;

                let cls = "bg-white";
                if (inFound) cls = "bg-emerald-200 ring-2 ring-emerald-500";
                else if (inPath) cls = "bg-yellow-200 ring-2 ring-yellow-500";
                else if (isHint) cls = "bg-indigo-100 ring-2 ring-indigo-500 animate-pulse";

                return (
                  <div
                    key={`${x}-${y}`}
                    role="gridcell"
                    aria-label={`Cell ${x + 1},${y + 1}`}
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
                      if (Number.isInteger(xx) && Number.isInteger(yy)) extendSelect(xx, yy);
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

      {/* Progress (count only; no answer list shown) */}
      <div className="mt-4 text-sm text-gray-700">
        Found: {found.size} / {puzzle?.answers?.length || 0}
      </div>

      {/* Success banner */}
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
