import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Wooster’s Word Web (tap-to-toggle version)
 *
 * Props (optional):
 * - className?: string
 * - puzzle?: { grid: string[]; words: string[] }   // grid: array of row strings (equal length), words: target words
 * - dataUrl?: string                               // fallback JSON path if no puzzle prop (default: /content/games/wordweb/today.json)
 *
 * Expected JSON shape for dataUrl:
 * {
 *   "grid": ["ABCDEFGHIJKL", "MNOPQRSTUVWX", ... 12 rows total],
 *   "words": ["JEEVES", "WOOSTER", ...]
 * }
 */

const DEFAULT_DATA_URL = "/content/games/wordweb/today.json";

// 8 directions: N, NE, E, SE, S, SW, W, NW
const DIRS = [
  [-1, 0], [-1, 1], [0, 1], [1, 1],
  [1, 0], [1, -1], [0, -1], [-1, -1],
];

// Utility to make a stable cell id
const cellId = (r, c, cols) => r * cols + c;

export default function WoostersWordWeb({ className = "", puzzle, dataUrl = DEFAULT_DATA_URL }) {
  const [grid, setGrid] = useState(() => (puzzle?.grid ? normalizeGrid(puzzle.grid) : null));
  const [words, setWords] = useState(() => (puzzle?.words ? normalizeWords(puzzle.words) : null));
  const [loading, setLoading] = useState(!puzzle);
  const [error, setError] = useState("");

  // Selection & progress state
  const [selected, setSelected] = useState(() => new Set());        // Set<number>
  const [foundCells, setFoundCells] = useState(() => new Set());    // Set<number>
  const [foundWords, setFoundWords] = useState(() => new Set());    // Set<string>

  // Temporary hint highlights (ids) for reveal-start / hint
  const [hintCells, setHintCells] = useState(() => new Set());

  // Fetch puzzle if prop not provided
  useEffect(() => {
    if (puzzle) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const resp = await fetch(dataUrl, { cache: "no-cache" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const g = normalizeGrid(data?.grid);
        const w = normalizeWords(data?.words);
        if (!g || !w) throw new Error("Malformed puzzle data");
        if (!alive) return;
        setGrid(g);
        setWords(w);
      } catch (e) {
        setError(e?.message || "Failed to load puzzle");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [puzzle, dataUrl]);

  // Dimensions
  const rows = grid?.length || 0;
  const cols = rows ? grid[0].length : 0;

  // Precompute all possible paths (list of arrays of cell ids) where each word appears in grid.
  // We accept any occurrence; the moment user selects *one* full path of a word, it locks in.
  const wordPaths = useMemo(() => {
    if (!grid || !words) return new Map();
    const map = new Map(); // word -> Array<Array<number>>
    for (const word of words) {
      const upp = word.toUpperCase().replace(/[^A-Z]/g, "");
      const paths = findWordPaths(grid, upp);
      map.set(upp, paths);
    }
    return map;
  }, [grid, words]);

  // Event listeners from Games top bar:
  useEffect(() => {
    const onReset = () => {
      setSelected(new Set());
      setFoundCells(new Set());
      setFoundWords(new Set());
      setHintCells(new Set());
    };
    const onHint = () => {
      if (!words) return;
      // Choose first unfound word and highlight its first cell briefly
      const target = words.find(w => !foundWords.has(w.toUpperCase()));
      if (!target) return;
      const paths = wordPaths.get(target.toUpperCase()) || [];
      if (!paths.length) return;
      const firstPath = paths[0];
      const firstCell = firstPath[0];
      flashHint([firstCell]);
    };
    const onRevealStart = () => {
      if (!words) return;
      const starts = [];
      for (const w of words) {
        if (foundWords.has(w.toUpperCase())) continue;
        const paths = wordPaths.get(w.toUpperCase()) || [];
        if (paths.length) starts.push(paths[0][0]);
      }
      if (starts.length) flashHint(starts);
    };
    const onRevealSolution = () => {
      if (!words) return;
      const newFoundCells = new Set(foundCells);
      const newFoundWords = new Set(foundWords);
      for (const w of words) {
        const upp = w.toUpperCase();
        if (newFoundWords.has(upp)) continue;
        const paths = wordPaths.get(upp) || [];
        if (!paths.length) continue;
        for (const id of paths[0]) newFoundCells.add(id);
        newFoundWords.add(upp);
      }
      setFoundCells(newFoundCells);
      setFoundWords(newFoundWords);
      setSelected(new Set());
    };
    const onHow = () => {
      alert(
        "Tap letters to select (yellow). When your selection completes any hidden word along a straight line, "\
        + "those letters lock in green. Tap again to deselect yellow letters. Use Reset to clear."
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

  // Toggle selection for a cell (ignore if already found)
  const toggleCell = (r, c) => {
    if (!grid) return;
    const id = cellId(r, c, cols);
    if (foundCells.has(id)) return;

    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);

    // After toggling, check if any unfound word now has a full path selected → lock it green
    maybeLockWords(next);
  };

  const maybeLockWords = (sel) => {
    if (!words) return;
    let changed = false;
    const newFoundCells = new Set(foundCells);
    const newFoundWords = new Set(foundWords);

    for (const w of words) {
      const upp = w.toUpperCase();
      if (newFoundWords.has(upp)) continue;
      const paths = wordPaths.get(upp) || [];
      for (const path of paths) {
        // Path is a match if ALL cells in the path are currently selected (yellow)
        if (path.every(id => sel.has(id))) {
          // Lock these cells as found (green)
          for (const id of path) {
            newFoundCells.add(id);
            // remove from yellow selection once found
            if (sel.has(id)) sel.delete(id);
          }
          newFoundWords.add(upp);
          changed = true;
          break; // stop checking more paths for this word
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

  return (
    <div className={`w-full ${className}`}>
      {/* Grid */}
      <div
        role="grid"
        aria-label="Word search grid"
        className="grid select-none"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: "2px",
          // Let parent size/zoom control overall footprint
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
              ? "rgba(16,185,129,0.22)"         // green-ish (matches .ww-correct)
              : isSel
              ? "#fde68a"                        // yellow for selected
              : isHint
              ? "rgba(59,130,246,0.18)"         // subtle blue flash for hint
              : "white";

            return (
              <button
                key={id}
                role="gridcell"
                aria-pressed={isSel || isFound}
                onClick={() => toggleCell(r, c)}
                className={`flex items-center justify-center border rounded text-base sm:text-lg md:text-xl font-semibold
                            ${isFound ? "ww-correct" : ""}`}
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

/* ------------------------
   Helpers
-------------------------*/

function normalizeGrid(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const rows = arr.map(s => String(s || "").toUpperCase().replace(/[^A-Z]/g, ""));
  const n = rows[0]?.length || 0;
  if (!n || rows.some(r => r.length !== n)) return null;
  return rows;
}

function normalizeWords(arr) {
  if (!Array.isArray(arr)) return null;
  return arr
    .map(s => String(s || "").toUpperCase().replace(/[^A-Z]/g, ""))
    .filter(Boolean);
}

function findWordPaths(grid, word) {
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
