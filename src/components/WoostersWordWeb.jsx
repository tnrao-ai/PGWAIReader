import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, RefreshCw, HelpCircle, Lightbulb } from "lucide-react";

const WW_STORE = "wair_ww_progress_v1";
const WW_HINTS = "wair_ww_hints_v1";
const MAX_HINTS_PER_DAY = 3;

function todayStr() {
  return new Date().toISOString().slice(0,10);
}

async function loadPuzzle(dateStr) {
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base}content/games/wordweb/${dateStr}.json`;
  const resp = await fetch(url, { cache: "no-cache" });
  if (!resp.ok) throw new Error(`Puzzle not found for ${dateStr}`);
  return resp.json();
}

function samePath(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i=0;i<a.length;i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  return true;
}

function dirBetween(a, b) {
  // Returns normalized direction [dr, dc] if adjacent; otherwise null
  const dr = b[0] - a[0];
  const dc = b[1] - a[1];
  if (dr === 0 && dc === 0) return null;
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return null;
  return [Math.sign(dr), Math.sign(dc)];
}

export default function WoostersWordWeb() {
  const [dateStr, setDateStr] = useState(todayStr());
  const [puz, setPuz] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [selection, setSelection] = useState([]);     // [[r,c], ...]
  const [dragging, setDragging] = useState(false);
  const [lockedDir, setLockedDir] = useState(null);   // [dr, dc] once second cell chosen
  const [solved, setSolved] = useState([]);           // indices into puz.answers
  const [hintFlash, setHintFlash] = useState([]);     // coords to briefly highlight
  const [showHelp, setShowHelp] = useState(false);
  const [hintCount, setHintCount] = useState(0);

  const boardRef = useRef(null);

  // Load progress
  useEffect(() => {
    try {
      const store = JSON.parse(localStorage.getItem(WW_STORE) || "{}");
      const s = store[dateStr];
      if (Array.isArray(s)) setSolved(s);
    } catch {}
    try {
      const hints = JSON.parse(localStorage.getItem(WW_HINTS) || "{}");
      setHintCount(hints[dateStr] || 0);
    } catch { setHintCount(0); }
  }, [dateStr]);

  // Persist progress
  useEffect(() => {
    const store = (() => { try { return JSON.parse(localStorage.getItem(WW_STORE) || "{}"); } catch { return {}; } })();
    store[dateStr] = solved;
    localStorage.setItem(WW_STORE, JSON.stringify(store));
  }, [dateStr, solved]);

  // Load puzzle
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      setSelection([]);
      setSolved([]);
      setLockedDir(null);
      setHintFlash([]);
      try {
        const data = await loadPuzzle(dateStr);
        setPuz(data);
      } catch (e) {
        setError(e?.message || "Failed to load puzzle.");
        setPuz(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [dateStr]);

  // Normalize grid rows
  const grid = useMemo(() => {
    if (!puz?.grid) return [];
    return puz.grid.map(row => (row.includes(" ") ? row.split(" ").map(x => x.trim()) : row.split("")));
  }, [puz]);

  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  const allSolved = puz && Array.isArray(puz.answers) && solved.length === puz.answers.length;

  // ======== Selection mechanics (precise straight-line with backtrack) ========
  const beginSelection = (r, c) => {
    setDragging(true);
    setSelection([[r,c]]);
    setLockedDir(null);
  };

  const extendSelection = (r, c) => {
    if (!dragging) return;
    setSelection(prev => {
      if (prev.length === 0) return [[r,c]];

      const last = prev[prev.length - 1];

      // Backtrack support: if moving back to the previous cell, pop last
      if (prev.length >= 2) {
        const prevCell = prev[prev.length - 2];
        if (r === prevCell[0] && c === prevCell[1]) {
          const copy = prev.slice(0, prev.length - 1);
          // If we popped back to length 1, unlock direction
          if (copy.length < 2) setLockedDir(null);
          return copy;
        }
      }

      // Must be adjacent
      const d = dirBetween(last, [r,c]);
      if (!d) return prev;

      // If we don’t have a locked direction yet and this is the 2nd unique cell, lock it
      if (!lockedDir && !(r === last[0] && c === last[1])) {
        setLockedDir(d);
        return [...prev, [r,c]];
      }

      // If we have a locked direction, only accept cells continuing that direction from the last
      if (lockedDir) {
        if (d[0] === lockedDir[0] && d[1] === lockedDir[1]) {
          return [...prev, [r,c]];
        }
        // Ignore off-line moves
        return prev;
      }

      // Fallback (shouldn’t happen): just add if unique
      if (!(r === last[0] && c === last[1])) return [...prev, [r,c]];
      return prev;
    });
  };

  const finishSelection = () => {
    if (!dragging) return;
    setDragging(false);
    evaluateSelection();
  };

  const evaluateSelection = () => {
    if (!puz?.answers) return;
    const idx = puz.answers.findIndex((ans, i) => !solved.includes(i) && samePath(ans.path, selection));
    if (idx >= 0) {
      setSolved(prev => [...prev, idx]);
    }
    setSelection([]);
    setLockedDir(null);
  };

  // Mouse
  const onCellMouseDown = (r, c) => beginSelection(r, c);
  const onCellMouseEnter = (r, c) => extendSelection(r, c);
  useEffect(() => {
    const up = () => finishSelection();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  });

  // Touch (drag within board)
  const onTouchStart = (r, c) => beginSelection(r, c);
  const onTouchMove = (e) => {
    if (!dragging) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    if (!touch) return;
    const { clientX, clientY } = touch;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const cellSize = 38; // ~2.4rem minus gap; fixed to keep math stable
    const gap = 6;
    const per = cellSize + gap;

    const c = Math.max(0, Math.min(cols-1, Math.floor(x / per)));
    const r = Math.max(0, Math.min(rows-1, Math.floor(y / per)));

    extendSelection(r, c);
  };
  const onTouchEnd = () => finishSelection();

  const resetProgress = () => {
    setSolved([]);
    setSelection([]);
    setLockedDir(null);
  };

  // ======== Subtle Hints ========
  const triggerHint = () => {
    if (!puz?.answers || hintCount >= MAX_HINTS_PER_DAY) return;

    // pick a random unsolved answer
    const unsolved = puz.answers
      .map((a, i) => ({ i, a }))
      .filter(({ i }) => !solved.includes(i));
    if (unsolved.length === 0) return;

    const pick = unsolved[Math.floor(Math.random() * unsolved.length)].a;

    // If any part of that path is already selected (rare since selection clears), use the next cell; else first cell
    const nextCoord = pick.path[0]; // simple, subtle nudge: show the starting cell

    setHintFlash([nextCoord]);
    setTimeout(() => setHintFlash([]), 1500);

    // record hint usage
    const hints = (() => { try { return JSON.parse(localStorage.getItem(WW_HINTS) || "{}"); } catch { return {}; } })();
    const used = (hints[dateStr] || 0) + 1;
    hints[dateStr] = used;
    localStorage.setItem(WW_HINTS, JSON.stringify(hints));
    setHintCount(used);
  };

  const isHintCell = (r, c) => hintFlash.some(([rr, cc]) => rr === r && cc === c);

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <motion.div initial={{ rotate: -10, scale: 0.9 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}>
            <Trophy className="w-6 h-6 text-yellow-500" />
          </motion.div>
          <h2 className="text-lg font-bold">Wooster’s Word Web</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Hint"
            disabled={hintCount >= MAX_HINTS_PER_DAY}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 ${hintCount >= MAX_HINTS_PER_DAY
              ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"}`}
            onClick={triggerHint}
          >
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <span className="text-sm">Hint ({MAX_HINTS_PER_DAY - hintCount} left)</span>
          </button>
          <button
            title="How to play"
            className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={() => setShowHelp(true)}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            title="Reset today’s progress"
            className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={resetProgress}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="text-sm text-gray-600 dark:text-gray-400">{dateStr}</div>
        </div>
      </div>

      {loading && <div>Loading puzzle…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {puz && (
        <>
          <div className="mb-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">Theme</div>
            <div className="text-base font-semibold">{puz.theme}</div>
          </div>

          <div
            ref={boardRef}
            className="inline-grid select-none touch-none"
            style={{
              gridTemplateColumns: `repeat(${cols}, 2.4rem)`,
              gridAutoRows: "2.4rem",
              gap: "6px"
            }}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {grid.map((row, r) =>
              row.map((ch, c) => {
                const inSel = selection.some(([rr,cc]) => rr===r && cc===c);
                const solvedCell = (puz.answers || []).some((ans, i) =>
                  solved.includes(i) && ans.path.some(([rr,cc]) => rr===r && cc===c)
                );
                const hinted = isHintCell(r, c);

                const baseClasses = `w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-md border text-base font-semibold cursor-pointer select-none`;
                const bgClasses = solvedCell
                  ? "bg-green-600 text-white border-green-600"
                  : inSel
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700";

                return (
                  <motion.div
                    key={`${r}-${c}`}
                    onMouseDown={() => onCellMouseDown(r, c)}
                    onMouseEnter={() => onCellMouseEnter(r, c)}
                    onTouchStart={() => onTouchStart(r, c)}
                    className={`${baseClasses} ${bgClasses} ${hinted ? "ring-2 ring-amber-400" : ""}`}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    {ch.toUpperCase()}
                  </motion.div>
                );
              })
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Solved: {solved.length} / {(puz.answers || []).length}
            </div>

            <AnimatePresence>
              {allSolved && (
                <motion.div
                  className="mt-3 text-lg flex items-center gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  🏆 <span>Splendid! You’ve untangled the web like Jeeves at his best.</span>
                </motion.div>
              )}
            </AnimatePresence>

            {!!solved.length && (
              <div className="mt-3 text-sm">
                <div className="font-semibold mb-1">Found words</div>
                <ul className="list-disc pl-5">
                  {puz.answers
                    .map((a, i) => ({ a, i }))
                    .filter(({ i }) => solved.includes(i))
                    .map(({ a, i }) => <li key={i}>{a.text}</li>)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {showHelp && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg"
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-2">How to play</h3>
              <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc pl-5 space-y-2">
                <li>Click (or tap) a starting letter, then drag in a straight line. After the second cell, your path locks to that direction (up, down, left, right, or diagonal).</li>
                <li>To correct mistakes, simply drag back over the previous cell to undo (backtrack).</li>
                <li>Release to submit the current path. If it matches a hidden answer exactly, it locks in green.</li>
                <li>Need a nudge? Use <strong>Hint</strong> — it briefly highlights the next starting cell. You have {MAX_HINTS_PER_DAY} hints per day.</li>
              </ul>
              <div className="mt-4 text-right">
                <button
                  className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                  onClick={() => setShowHelp(false)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
