import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Wooster’s Word Web — tap/click to toggle version
 *
 * Behavior:
 * - Tap/click a cell toggles selection (yellow).
 * - When the selected set exactly covers any valid straight-line path
 *   of a target word (any of 8 directions, forward or reverse),
 *   those cells lock green and are removed from the yellow selection.
 *
 * External controls (from Games.jsx):
 * - window events: ww:reset, ww:hint, ww:reveal-start, ww:reveal-solution, ww:how
 *
 * Data:
 * - Accepts either prop `puzzle={ grid: string[], words: string[] }`
 *   or `puzzle={ grid: string[], answers: string[] }`
 * - If no prop provided, fetches:
 *     1) /.netlify/functions/wordweb?date=YYYY-MM-DD (America/Chicago)
 *     2) /content/games/wordweb/daily/YYYY-MM-DD.json
 *     3) /content/games/wordweb/latest.json
 *   and falls back to DEFAULT_PUZZLE if all fail.
 */

const DEFAULT_PUZZLE = {
  grid: [
    "WOOSTERWEZXQ",
    "QHMVLPYDKRU",
    "ABJEEVESCNO",
    "TRGQXNAHFIU",
    "BLANDINGSQZ",
    "PCWYROTZMEL",
    "UVQRTWHISKY",
    "ONCABGDLPEX",
    "JJAGATHAVBS",
    "MZQIRUTEOPC",
    "LXFDBNCGTHA",
    "SRVYEWKJIMQ",
  ],
  answers: ["WOOSTER", "JEEVES", "BLANDINGS", "WHISKY", "AGATHA"],
};

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

// 8 directions
const DIRS = [
  [-1, 0], [-1, 1], [0, 1], [1, 1],
  [1, 0], [1, -1], [0, -1], [-1, -1],
];

const cellId = (r, c, cols) => r * cols + c;

function normalizeGrid(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const rows = arr.map((s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, ""));
  const n = rows[0]?.length || 0;
  if (!n || rows.some((r) => r.length !== n)) return null;
  return rows;
}
function normalizeWords(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.map((s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
}

function findWordPaths(grid, word) {
  // Returns ALL straight-line paths for `word` in grid (forward only).
  // Call it for both `word` and `reversed` to support reverse matches.
  const R = grid.length;
  const C = grid[0].length;
  const paths = [];

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of DIRS) {
        let rr = r, cc = c;
        let ok = true;
        const ids = [cellId(rr, cc, C)];
        for (let i = 1; i < word.length; i++) {
          rr += dr; cc += dc;
          if (rr < 0 || rr >= R || cc < 0 || cc >= C) { ok = false; break; }
          if (grid[rr][cc] !== word[i]) { ok = false; break; }
          ids.push(cellId(rr, cc, C));
        }
        if (ok) paths.push(ids);
      }
    }
  }
  return paths;
}

export default function WoostersWordWeb({ className = "", puzzle }) {
  const seed = centralDateStr();

  // Main data
  const [grid, setGrid] = useState(() => {
    if (puzzle?.grid) return normalizeGrid(puzzle.grid);
    return null;
  });
  const [words, setWords] = useState(() => {
    const list = puzzle?.words || puzzle?.answers;
    if (list) return normalizeWords(list);
    return null;
  });

  const [loading, setLoading] = useState(!puzzle);
  const [error, setError] = useState("");

  // Selection & progress
  const [selected, setSelected] = useState(() => new Set());     // yellow
  const [foundCells, setFoundCells] = useState(() => new Set()); // green
  const [foundWords, setFoundWords] = useState(() => new Set()); // word strings
  const [hintCells, setHintCells] = useState(() => new Set());   // temporary flashes

  // Fetch if no prop
  useEffect(() => {
    if (puzzle) return;

    let alive = true;
    const fetchJSON = async (url) => {
      try {
        const r = await fetch(url, { cache: "no-cache" });
        const t = await r.text();
        let j = null;
        try { j = JSON.parse(t); } catch {}
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return j;
      } catch (e) {
        return null;
      }
    };

    (async () => {
      setLoading(true);
      setError("");

      const base = import.meta.env.BASE_URL || "/";
      const daily = `${base}content/games/wordweb/daily/${seed}.json?v=${seed}`;
      const latest = `${base}content/games/wordweb/latest.json?v=${seed}`;

      let data =
        (await fetchJSON(`/.netlify/functions/wordweb?date=${seed}`)) ||
        (await fetchJSON(daily)) ||
        (await fetchJSON(latest)) ||
        DEFAULT_PUZZLE;

      if (!alive) return;

      const g = normalizeGrid(data?.grid);
      const list = data?.words || data?.answers;
      const w = normalizeWords(list || []);
      if (!g || !w) {
        setError("Malformed puzzle data");
        const gg = normalizeGrid(DEFAULT_PUZZLE.grid);
        const ww = normalizeWords(DEFAULT_PUZZLE.answers);
        setGrid(gg);
        setWords(ww);
      } else {
        setGrid(g);
        setWords(w);
      }
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [puzzle, seed]);

  const rows = grid?.length || 0;
  const cols = rows ? grid[0].length : 0;

  // Precompute all word paths (forward + reverse)
  const wordPaths = useMemo(() => {
    if (!grid || !words) return new Map();
    const map = new Map();
    for (const w of words) {
      const fwd = findWordPaths(grid, w);
      const rev = findWordPaths(grid, w.split("").reverse().join(""));
      // Merge; no need to dedupe aggressively
      map.set(w, [...fwd, ...rev]);
    }
    return map;
  }, [grid, words]);

  // ---- External controls (via window events) ----
  useEffect(() => {
    const onReset = () => {
      setSelected(new Set());
      setFoundCells(new Set());
      setFoundWords(new Set());
      setHintCells(new Set());
    };
    const onHint = () => {
      // Flash the starting cell of the first unfound word's first path
      const target = words?.find((w) => !foundWords.has(w));
      if (!target) return;
      const paths = wordPaths.get(target) || [];
      if (!paths.length) return;
      flashHint([paths[0][0]]);
    };
    const onRevealStart = () => {
      if (!words) return;
      const ids = [];
      for (const w of words) {
        if (foundWords.has(w)) continue;
        const p = wordPaths.get(w);
        if (p?.length) ids.push(p[0][0]);
      }
      if (ids.length) flashHint(ids);
    };
    const onRevealSolution = () => {
      if (!words) return;
      const newFoundCells = new Set(foundCells);
      const newFoundWords = new Set(foundWords);
      for (const w of words) {
        if (newFoundWords.has(w)) continue;
        const paths = wordPaths.get(w) || [];
        if (!paths.length) continue;
        for (const id of paths[0]) newFoundCells.add(id);
        newFoundWords.add(w);
      }
      setFoundCells(newFoundCells);
      setFoundWords(newFoundWords);
      setSelected(new Set());
    };
    const onHow = () => {
      alert(
        "Tap letters to select (yellow). When your selection completes any hidden word along a straight line, those letters lock in green. Tap again to deselect yellow letters. Use Reset to clear."
      );
    };

    window.addEventListener("ww:reset", onReset);
    window.addEventListener("ww:hint", onHint);
    window.addEventListener("ww:reveal-start", onRevealStart);
    window.addEventListener("ww:reveal-solution", onRevealSolution);
    window.addEventListener("ww:how", onHow);
    return () => {
      window.removeEventListener("ww:reset", onReset);
      window.removeEventListener("ww:hint", onHint);
      window.removeEventListener("ww:reveal-start", onRevealStart);
      window.removeEventListener("ww:reveal-solution", onRevealSolution);
      window.removeEventListener("ww:how", onHow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, foundCells, foundWords, wordPaths]);

  const flashTimer = useRef(null);
  const flashHint = (ids) => {
    setHintCells(new Set(ids));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setHintCells(new Set()), 1200);
  };

  // Toggle a cell (ignore if already found)
  const toggleCell = (r, c) => {
    if (!grid) return;
    const id = cellId(r, c, cols);
    if (foundCells.has(id)) return;

    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);

    maybeLockWords(next);
  };

  // If a whole word path is covered by current selection -> lock it (green)
  const maybeLockWords = (sel) => {
    if (!words) return;
    let changed = false;
    const newFoundCells = new Set(foundCells);
    const newFoundWords = new Set(foundWords);

    for (const w of words) {
      if (newFoundWords.has(w)) continue;
      const paths = wordPaths.get(w) || [];
      for (const path of paths) {
        if (path.every((id) => sel.has(id))) {
          // lock these cells green and remove from yellow selection
          for (const id of path) {
            newFoundCells.add(id);
            sel.delete(id);
          }
          newFoundWords.add(w);
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      setFoundCells(newFoundCells);
      setFoundWords(newFoundWords);
      setSelected(new Set(sel));
    }
  };

  const remaining = words ? words.length - foundWords.size : 0;
  const allDone = remaining === 0 && words && words.length > 0;

  if (loading) {
    return <div className={`text-sm text-gray-600 ${className}`}>Loading puzzle…</div>;
  }
  if (error || !grid || !words) {
    return <div className={`text-sm text-red-600 ${className}`}>Failed to load puzzle. {error}</div>;
  }

  // Render
  return (
    <div className={`w-full ${className}`}>
      <div
        role="grid"
        aria-label="Word search grid"
        className="grid select-none"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: "2px",
          maxWidth: "min(92vw, 720px)",
          marginInline: "auto",
        }}
      >
        {grid.map((row, r) =>
          Array.from(row).map((ch, c) => {
            const id = cellId(r, c, cols);
            const isFound = foundCells.has(id);
            const isSel = selected.has(id);
            const isHint = hintCells.has(id);

            const bg = isFound
              ? "rgba(16,185,129,0.22)"  // green-ish
              : isSel
              ? "#fde68a"                 // yellow
              : isHint
              ? "rgba(59,130,246,0.18)"  // subtle blue
              : "white";

            return (
              <button
                key={id}
                role="gridcell"
                aria-pressed={isSel || isFound}
                onClick={() => toggleCell(r, c)}
                className={`flex items-center justify-center border rounded text-base sm:text-lg md:text-xl font-semibold ${isFound ? "ww-correct" : ""}`}
                style={{
                  aspectRatio: "1 / 1",
                  background: bg,
                  borderColor: "#e5e7eb",
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {ch}
              </button>
            );
          })
        )}
      </div>

      {/* Score / status */}
      <div className="mt-3 text-center text-sm md:text-base text-gray-800 dark:text-gray-100">
        {allDone ? (
          <strong>Splendid! All words found.</strong>
        ) : (
          <>Words found: <strong>{(foundWords && foundWords.size) || 0}</strong> / <strong>{words.length}</strong></>
        )}
      </div>
    </div>
  );
}
