import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, RefreshCw, Lightbulb, X, Sparkles } from "lucide-react";

/* =========================================================
   Date utilities (America/Chicago) + daily seed
   ========================================================= */
function centralDateStr(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-");
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

/* =========================================================
   Safe default puzzle (hand-packed, real words, 12x12)
   Only used if daily files are missing/malformed.
   ========================================================= */
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
    "AYXLWNBPNSTY",
  ],
  answers: ["WOOSTER", "JEEVES", "BLANDINGS", "WHISKY", "AGATHA"],
};

/* =========================================================
   Validation + normalization + gentle repair
   - Ensures square grid (pad/trim rows)
   - Normalizes answers to [A-Z]+
   - Returns notes about repairs for UX transparency
   ========================================================= */
function isArray(x) { return Array.isArray(x); }
function isString(x) { return typeof x === "string"; }
function normalizeRow(row) { return String(row || "").toUpperCase().replace(/[^A-Z]/g, ""); }
function normalizeAns(a) { return String(a || "").toUpperCase().replace(/[^A-Z]/g, ""); }

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
  const maxLen = Math.max(...grid.map(r => r.length));
  if (!size || size < 2) size = Math.max(grid.length, maxLen);

  const N = size;
  const rand = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

  // Ensure exactly N rows
  if (grid.length !== N) {
    notes.push(`Adjusted row count from ${grid.length} to ${N}.`);
  }
  grid = [...grid];
  while (grid.length < N) grid.push("");
  if (grid.length > N) grid = grid.slice(0, N);

  // Ensure each row length == N
  grid = grid.map((r, i) => {
    let rr = r;
    if (rr.length < N) {
      const pad = N - rr.length;
      notes.push(`Row ${i + 1}: padded ${pad} random letters.`);
      while (rr.length < N) rr += rand();
    } else if (rr.length > N) {
      const cut = rr.length - N;
      notes.push(`Row ${i + 1}: trimmed ${cut} overflow letters.`);
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

/* =========================================================
   Selection mechanics (straight, diagonal, bends)
   - Adjacent moves only (8-neighborhood)
   - Backtracking (step onto previous tile to pop)
   ========================================================= */
function inBounds(x, y, N) { return x >= 0 && y >= 0 && x < N && y < N; }

/* =========================================================
   Hints + persistence
   - Idle hint pulse after 20s
   - One reveal-first-letter per day (highlights a valid start)
   - Persist found answers in localStorage per day
   ========================================================= */
const HINT_IDLE_MS = 20000;
const HINT_REVEAL_LIMIT = 1;

function lsKey(seed) { return `www_daily_${seed}`; }
function loadFound(seed) {
  try {
    const raw = localStorage.getItem(lsKey(seed));
    if (!raw) return { found: [], reveals: 0 };
    const obj = JSON.parse(raw);
    return { found: Array.isArray(obj.found) ? obj.found : [], reveals: Number(obj.reveals || 0) };
  } catch {
    return { found: [], reveals: 0 };
  }
}
function saveFound(seed, foundSet, revealsUsed) {
  const out = { found: Array.from(foundSet), reveals: revealsUsed|0 };
  localStorage.setItem(lsKey(seed), JSON.stringify(out));
}

/* =========================================================
   How-to modal
   ========================================================= */
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
          <li><b>Find the themed entries</b> hidden in the letter grid. Paths may be horizontal, vertical, diagonal — and may <b>bend</b>. Reverse is allowed.</li>
          <li><b>Drag to select</b> (mouse/touch). You can <b>backtrack</b>: sliding back over the previous tile removes it.</li>
          <li>Release to submit; if your path matches an answer (forwards or backwards), it’s marked as found.</li>
          <li>Stuck? Use <b>Hint</b>. You also get <b>one “Reveal first letter”</b> per day, which highlights a valid starting tile for an unsolved word.</li>
          <li><b>Reset</b> clears today’s selections (but not the daily puzzle rotation, which follows America/Chicago).</li>
        </ol>
      </div>
    </div>
  );
}

/* =========================================================
   Component
   ========================================================= */
export default function WoostersWordWeb() {
  const seed = centralDateStr();
  const [loading, setLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(null);
  const [error, setError] = useState("");
  const [repairNotes, setRepairNotes] = useState([]);
  const [found, setFound] = useState(new Set());
  const [path, setPath] = useState([]); // [{x,y}]
  const [isDown, setIsDown] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const [lastMoveTs, setLastMoveTs] = useState(Date.now());
  const idleTimer = useRef(null);
  const [hintCell, setHintCell] = useState(null); // {x,y} highlighted
  const [revealsUsed, setRevealsUsed] = useState(0);

  const containerRef = useRef(null);
  const [cell, setCell] = useState(36);

  const N = puzzle?.size || 0;

  /* ---------------- Load daily puzzle with fallbacks ---------------- */
  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || "/";

    async function fetchJSON(url) {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (!r.ok) return null;
        const text = await r.text();
        try { return JSON.parse(text); } catch { return null; }
      } catch { return null; }
    }

    (async () => {
      setLoading(true);
      setError("");
      setRepairNotes([]);
      setHintCell(null);

      // Restore persisted progress for today
      const persisted = loadFound(seed);
      setRevealsUsed(persisted.reveals);

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
        const safe = validateAndRepair(DEFAULT_PUZZLE).value;
        setPuzzle(safe);
      } else {
        setPuzzle(v.value);
        if (v.value.notes?.length) setRepairNotes(v.value.notes);
      }

      if (!cancelled) setLoading(false);
      // Rehydrate found words to Set, but only those that exist in today’s answers
      setFound(new Set((persisted.found || []).filter(a => v.ok ? v.value.answers.includes(a) : DEFAULT_PUZZLE.answers.includes(a))));
    })();

    return () => { cancelled = true; };
  }, [seed]);

  /* ---------------- Idle hint: gentle theme pulse ---------------- */
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setLastMoveTs(Date.now()), HINT_IDLE_MS);
    return () => idleTimer.current && clearTimeout(idleTimer.current);
  }, [lastMoveTs, puzzle, found]);

  const themePulseKey = useMemo(() => lastMoveTs, [lastMoveTs]);

  /* ---------------- Responsive cell size ---------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !puzzle) return;
    const ro = new ResizeObserver(() => {
      const maxWidth = Math.min(el.clientWidth, 560); // cap grid width
      const estimated = Math.floor(maxWidth / puzzle.size);
      setCell(Math.max(24, Math.min(44, estimated))); // clamp
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [puzzle]);

  /* ---------------- Derived letters matrix ---------------- */
  const letters = useMemo(() => (puzzle ? puzzle.grid.map(r => r.split("")) : []), [puzzle]);

  /* ---------------- Persist progress on change ---------------- */
  useEffect(() => {
    saveFound(seed, found, revealsUsed);
  }, [seed, found, revealsUsed]);

  /* ---------------- Selection handlers ---------------- */
  const startSelect = (x, y) => {
    if (!inBounds(x, y, N)) return;
    setIsDown(true);
    setPath([{ x, y }]);
    setLastMoveTs(Date.now());
    setHintCell(null); // hide any hint highlight when user starts playing
  };

  const extendSelect = (x, y) => {
    if (!isDown || !inBounds(x, y, N)) return;
    setLastMoveTs(Date.now());
    setPath(prev => {
      if (prev.length === 0) return [{ x, y }];
      const last = prev[prev.length - 1];

      // backtrack: stepping onto the previous cell pops the last
      if (prev.length >= 2) {
        const prev2 = prev[prev.length - 2];
        if (prev2.x === x && prev2.y === y) return prev.slice(0, -1);
      }

      // must be adjacent (8-neighborhood)
      const ax = Math.abs(x - last.x);
      const ay = Math.abs(y - last.y);
      if ((ax <= 1 && ay <= 1) && !(ax === 0 && ay === 0)) {
        // avoid revisiting same cell (except backtracking handled above)
        if (prev.some(p => p.x === x && p.y === y)) return prev;
        return [...prev, { x, y }];
      }
      return prev;
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

  /* ---------------- Hint: reveal-first-letter (once/day) ---------------- */
  function findRevealStartFor(answer) {
    // returns {x,y} of a plausible starting tile (first letter with correct neighbor)
    if (!puzzle) return null;
    const A = answer[0], B = answer[1] || null;
    const N = puzzle.size;

    const dirs = [
      [1,0],[0,1],[-1,0],[0,-1],
      [1,1],[1,-1],[-1,1],[-1,-1],
    ];

    for (let y=0; y<N; y++){
      for (let x=0; x<N; x++){
        if (letters[y][x] !== A) continue;
        if (!B) return { x, y };
        // check at least one neighbor with B to ensure it's a valid start
        for (const [dx,dy] of dirs) {
          const nx = x+dx, ny = y+dy;
          if (inBounds(nx,ny,N) && letters[ny][nx] === B) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  const onRevealFirstLetter = () => {
    if (!puzzle) return;
    if (revealsUsed >= HINT_REVEAL_LIMIT) return;

    // pick an unsolved answer
    const remaining = puzzle.answers.filter(a => !found.has(a));
    if (remaining.length === 0) return;

    // deterministic pick for UX consistency
    const target = remaining[0];
    const cell = findRevealStartFor(target);
    if (cell) {
      setHintCell(cell);
      setRevealsUsed(n => n + 1);
      setLastMoveTs(Date.now());
    }
  };

  /* ---------------- Reset ---------------- */
  const resetAll = () => {
    setFound(new Set());
    setPath([]);
    setHintCell(null);
    setLastMoveTs(Date.now());
    setRevealsUsed(0);
  };

  /* ---------------- UI rendering ---------------- */
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

      {/* Error + repair notes */}
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
            className="grid bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${N}, ${cell}px)`,
              gridTemplateRows: `repeat(${N}, ${cell}px)`,
            }}
          >
            {letters.map((row, y) =>
              row.map((ch, x) => {
                const inPath = path.some(p => p.x === x && p.y === y);
                const isHint = hintCell && hintCell.x === x && hintCell.y === y;
                const cls = inPath
                  ? "bg-yellow-200 ring-2 ring-yellow-500"
                  : isHint
                  ? "bg-indigo-100 ring-2 ring-indigo-500 animate-pulse"
                  : "bg-white";

                return (
                  <div
                    key={`${x}-${y}`}
                    role="gridcell"
                    aria-label={`Cell ${x+1},${y+1}`}
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
                      const [xx, yy] = attr.split(",").map(n => parseInt(n, 10));
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

      {/* Progress + found list */}
      <div className="mt-4 text-sm text-gray-700">
        Found: {found.size} / {puzzle?.answers?.length || 0}
      </div>

      {puzzle && (
        <div className="mt-2 flex flex-wrap gap-2">
          {puzzle.answers.map(a => {
            const got = found.has(a);
            return (
              <span
                key={a}
                className={`px-2 py-1 rounded text-xs border ${got ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                title={got ? "Found" : "Unfound"}
              >
                {got ? "✓ " : ""}{a}
              </span>
            );
          })}
        </div>
      )}

      {/* Success banner */}
      {allFound && (
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
