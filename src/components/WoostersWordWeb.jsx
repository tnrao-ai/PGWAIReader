import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, RefreshCw, Lightbulb } from "lucide-react";

/** ---- Date (America/Chicago) ---- */
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

/** ---- Types & runtime validation ---- */
const DEFAULT_PUZZLE = {
  theme: "Wodehouse Sampler",
  size: 10,
  grid: [
    "W O O S T E R S X",
    "A U N T D A H L I A",
    "B L A N D I N G S",
    "E M S W O R T H Z",
    "G U S S I E N O T",
    "F I N K N O T T L",
    "E S C R I P T U R",
    "E W H I S K Y Y Q",
    "A G A T H A H I N",
    "J E E V E S M A P"
  ].map(r => r.replace(/\s+/g, "")),
  answers: [
    "W O O S T E R",
    "A U N T  D A H L I A",
    "B L A N D I N G S",
    "E M S W O R T H",
    "G U S S I E  F I N K-N O T T L E",
    "S C R I P T U R E",
    "W H I S K Y",
    "A G A T H A",
    "J E E V E S"
  ].map(s => s.replace(/\s+/g, "")),
};

function isString(x) { return typeof x === "string"; }
function isArray(x) { return Array.isArray(x); }

function normalizeGridRow(row) {
  // Only A-Z letters in each row
  const s = String(row || "").toUpperCase().replace(/[^A-Z]/g, "");
  return s;
}
function normalizeAnswer(a) {
  return String(a || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, ""); // allow letters only for matching path
}

function validatePuzzle(json) {
  if (!json || typeof json !== "object") return { ok: false, reason: "Not an object" };
  const theme = isString(json.theme) ? json.theme.trim() : "Untitled";
  const size = Number.isInteger(json.size) ? json.size : (isArray(json.grid) ? json.grid.length : 0);
  if (!isArray(json.grid) || json.grid.length < 4) return { ok: false, reason: "grid missing/too small" };
  const grid = json.grid.map(normalizeGridRow);
  const N = grid.length;
  if (grid.some(r => r.length !== N)) return { ok: false, reason: "grid not square" };
  const answers = (json.answers || []).map(normalizeAnswer).filter(Boolean);
  if (answers.length === 0) return { ok: false, reason: "no answers" };
  return { ok: true, value: { theme, size: N, grid, answers } };
}

/** ---- Selection helpers (supports straight + diagonals + backtrack) ---- */
const DIRS = [
  [1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]
];
function inBounds(x,y,N){ return x>=0 && y>=0 && x<N && y<N; }

/** ---- Hints timing ---- */
const HINT_IDLE_MS = 20000;

export default function WoostersWordWeb() {
  const seed = centralDateStr();
  const [loading, setLoading] = useState(true);
  const [puzzle, setPuzzle] = useState(null);
  const [error, setError] = useState("");
  const [found, setFound] = useState(new Set()); // normalized answers
  const [path, setPath] = useState([]);          // [{x,y}]
  const [isDown, setIsDown] = useState(false);
  const [lastMoveTs, setLastMoveTs] = useState(Date.now());
  const idleTimer = useRef(null);

  const N = puzzle?.size || 0;

  /** Load today’s JSON with fallbacks */
  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || "/";

    async function tryFetch(url) {
      const resp = await fetch(url, { cache: "no-cache" }).catch(() => null);
      if (!resp || !resp.ok) return null;
      const text = await resp.text();
      // Avoid passing bad strings to JSON.parse without guard
      try { return JSON.parse(text); }
      catch { return null; }
    }

    (async () => {
      setLoading(true);
      setError("");

      // 1) Day-specific
      const dayUrl = `${base}content/games/wordweb/daily/${seed}.json?v=${seed}`;
      let data = await tryFetch(dayUrl);

      // 2) Fallback to latest.json
      if (!data) {
        const latestUrl = `${base}content/games/wordweb/latest.json?v=${seed}`;
        data = await tryFetch(latestUrl);
      }

      // 3) Fallback to in-code default
      if (!data) data = DEFAULT_PUZZLE;

      const validated = validatePuzzle(data);
      if (!validated.ok) {
        setError(`Could not load puzzle: ${validated.reason}`);
        setPuzzle(DEFAULT_PUZZLE);
      } else {
        setPuzzle(validated.value);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [seed]);

  /** Idle hint timer */
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      // trigger a subtle hint by nudging the theme line (CSS pulse via state flip)
      setLastMoveTs(Date.now()); // just to redraw/pulse
    }, HINT_IDLE_MS);
    return () => idleTimer.current && clearTimeout(idleTimer.current);
  }, [lastMoveTs, puzzle, found]);

  const themePulse = useMemo(() => ({ key: lastMoveTs }), [lastMoveTs]);

  /** Build letter grid */
  const letters = useMemo(() => {
    if (!puzzle) return [];
    return puzzle.grid.map(r => r.split(""));
  }, [puzzle]);

  /** Mouse/touch interactions */
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
      // backtrack one?
      if (prev.length >= 2) {
        const prev2 = prev[prev.length-2];
        if (prev2.x === x && prev2.y === y) {
          return prev.slice(0, -1); // pop last
        }
      }

      // must be neighbor in 8 directions
      const dx = x - last.x, dy = y - last.y;
      if (!DIRS.some(([ax,ay]) => ax===dx && ay===dy)) return prev;
      // avoid duplicates unless backtracking
      if (prev.find(p => p.x===x && p.y===y)) return prev;
      return [...prev, {x,y}];
    });
  };
  const endSelect = () => {
    if (!isDown || !puzzle) { setIsDown(false); return; }
    setIsDown(false);

    if (path.length >= 2) {
      const word = path.map(p => letters[p.y][p.x]).join(""); // X increases to right; Y down
      const norm = word.toUpperCase().replace(/[^A-Z]/g, "");
      // If matches any target (forward or reversed), mark found
      const rev = norm.split("").reverse().join("");
      const target = puzzle.answers.find(a => a === norm || a === rev);
      if (target) {
        setFound(prev => new Set([...prev, target]));
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

  /** Render */
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
            onClick={() => setLastMoveTs(Date.now())}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-amber-100 hover:bg-amber-200"
            title="Hint nudge"
          >
            <Lightbulb className="w-4 h-4" /> Hint
          </button>
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            title="How to play"
            onClick={() => alert("Drag to connect letters. Straight or diagonal. Backtrack to unselect the last tile. Find all themed words!")}
          >
            <HelpCircle className="w-4 h-4" /> How
          </button>
        </div>
      </div>

      {/* Theme / errors */}
      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-3 p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        key={themePulse.key}
        initial={{ opacity: 0.85 }}
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
                // helpful role/handlers
                return (
                  <div
                    key={`${x}-${y}`}
                    role="gridcell"
                    className={`w-9 h-9 flex items-center justify-center border border-gray-100 font-semibold cursor-pointer select-none ${selectedStyle}`}
                    onMouseDown={() => startSelect(x,y)}
                    onMouseEnter={() => extendSelect(x,y)}
                    onTouchStart={(e) => { e.preventDefault(); startSelect(x,y); }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      const el = document.elementFromPoint(t.clientX, t.clientY);
                      if (!el) return;
                      const attr = el.getAttribute("data-cell");
                      if (attr) {
                        const [xx,yy] = attr.split(",").map(n => parseInt(n,10));
                        extendSelect(xx,yy);
                      }
                    }}
                    data-cell={`${x},${y}`}
                  >
                    {ch}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Found summary */}
      <div className="mt-4 text-sm text-gray-700">
        Found: {found.size} / {puzzle?.answers?.length || 0}
      </div>

      {allFound && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-800"
        >
          Splendid! You’ve netted the whole web.
        </motion.div>
      )}
    </div>
  );
}
