import React, { useEffect, useState } from "react";

const METRICS_KEY = "wair_metrics_v1";

function getMetrics() {
  try {
    const m = JSON.parse(localStorage.getItem(METRICS_KEY) || '{"ok":0,"fail":0,"cache":0,"net":0,"ms":0,"n":0}');
    return { ...m, total: m.ok + m.fail, avgMs: m.n ? Math.round(m.ms / m.n) : 0 };
  } catch {
    return { ok:0, fail:0, cache:0, net:0, ms:0, n:0, total:0, avgMs:0 };
  }
}

export default function StatsPanel() {
  const [stats, setStats] = useState(getMetrics());

  useEffect(() => {
    const id = setInterval(() => setStats(getMetrics()), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-bold mb-4">📊 Dictionary Stats</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        {[
          { label: "Total Lookups", value: stats.total },
          { label: "Successes", value: stats.ok },
          { label: "Failures", value: stats.fail },
          { label: "Cache Hits", value: stats.cache },
          { label: "Network Hits", value: stats.net },
          { label: "Avg Latency", value: `${stats.avgMs} ms` }
        ].map((item) => (
          <div key={item.label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 transition hover:shadow-sm">
            <div className="text-gray-500">{item.label}</div>
            <div className="text-xl font-semibold">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button
          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
          onClick={() => { localStorage.removeItem(METRICS_KEY); setStats(getMetrics()); }}
        >
          Reset Stats
        </button>
      </div>
    </section>
  );
}
