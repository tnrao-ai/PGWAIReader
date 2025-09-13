import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, RefreshCw, HelpCircle } from "lucide-react";

// Local progress storage per-day
const WW_STORE = "wair_ww_progress_v1";

function todayStr() {
  // Uses local device date so players see today's puzzle in their TZ.
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

export default function WoostersWordWeb() {
  const [dateStr, setDateStr] = useState(todayStr());
  const [puz, setPuz] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [selection, setSelection] = useState([]); // array of [r,c]
  const [dragging, setDragging] = useState(false);
  const [solved, setSolved] = useState([]); // array of indices in puz.answers
  const boardRef = useRef(null);

  const [showHelp, setShowHelp] = useState(false);

  // Load persisted solved for the day
  useEffect(() => {
    try {
      const store = JSON.parse(localStorage.getItem(WW_STORE) || "{}");
      const s = store[dateStr];
      if (Array.isArray(s)) setSolved(s);
    } catch {}
  }, [dateStr]);

  // Persist solved
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

  // Normalize grid rows: allow either "A U N T" or "AUNT"
  const grid = useMemo(() => {
    if (!puz?.grid) return [];
    return puz.grid.map(row => (row.includes(" ") ? row.split(" ").map(x => x.trim()) : row.split("")));
  }, [puz]);

  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  const allSolved = puz && Array.isArray(puz.answers) && solved.length === puz.answers.length;

  // --- Mouse support ---
  const onCellDown = (r, c) => {
    setDragging(true);
    setSelection([[r,c]]);
  };
  const onCellEnter = (r, c) => {
    if (!dragging) return;
    const last = selection[selection.length-1];
    if (!last || last[0] !== r || last[1] !== c) {
      setSelection(prev => [...prev, [r,c]]);
    }
  };
  const onMouseUp = () => {
    if (!dragging) return;
    setDragging(false);
    evaluateSelection();
  };
  useEffect(() => {
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  });

  // --- Touch support ---
  const onTouchStart = (r, c) => {
    setDragging(true);
    setSelection([[r,c]]);
  };
  const onTouchMove = (e) => {
    if (!dragging) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    if (!touch) return;
    const { clientX, clientY } = touch;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Figure out which cell we are over
    const cellSize = Math.min(
      (rect.width - (cols - 1) * 6) / cols,
      (rect.height - (rows - 1) * 6) / rows
    );
    const c = Math.max(0, Math.min(cols-1, Math.floor(x / (cellSize + 6))));
    const r = Math.max(0, Math.min(rows-1, Math.floor(y / (cellSize + 6))));

    const last = selection[selection.length-1];
    if (!last || last[0] !== r || last[1] !== c) {
      setSelection(prev => [...prev, [r,c]]);
    }
  };
  const onTouchEnd = () => {
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
  };

  const resetProgress = () => {
    setSolved([]);
    setSelection([]);
  };

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
                return (
                  <motion.div
                    key={`${r}-${c}`}
                    onMouseDown={() => onCellDown(r, c)}
                    onMouseEnter={() => onCellEnter(r, c)}
                    onTouchStart={() => onTouchStart(r, c)}
                    className={`w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-md border text-base font-semibold cursor-pointer select-none
                      ${solvedCell ? "bg-green-600 text-white border-green-600" :
                        inSel ? "bg-blue-600 text-white border-blue-600" :
                        "bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700"}`}
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
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Drag across letters to form one of the hidden themed answers. If your path matches an answer exactly,
                it will lock in with a green highlight. Find them all to win. Unlimited attempts — have a bash!
              </p>
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
