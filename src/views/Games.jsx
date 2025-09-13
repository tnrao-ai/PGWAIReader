import React, { useState } from "react";
import WoostersWordWeb from "../components/WoostersWordWeb.jsx";
import JeevesJottings from "../components/JeevesJottings.jsx";
import StatsPanel from "../components/StatsPanel.jsx";

const GamesLegal = () => (
  <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
    <h2 className="text-lg font-bold mb-3">⚖️ Legal Disclaimer</h2>
    <p className="text-sm text-gray-700 dark:text-gray-300">
      All puzzles and quizzes on this site — including <em>Wooster’s Word Web</em> and <em>Jeeves’ Jottings</em> —
      are constructed from the public-domain works of P. G. Wodehouse, made freely available thanks to{" "}
      <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer" className="underline">Project Gutenberg</a>.
      This section is intended for literary fun and wordplay, and is not affiliated with nor derived from any commercial puzzle providers.
      Availability is restricted to users in the United States in accordance with applicable licensing terms.
    </p>
  </section>
);

export default function Games() {
  const tabs = [
    { key: "ww", label: "🕸️ Wooster’s Word Web" },
    { key: "jj", label: "📝 Jeeves’ Jottings" },
    { key: "ds", label: "📊 Dictionary Stats" },
    { key: "lg", label: "⚖️ Legal" }
  ];
  const [tab, setTab] = useState("ww");

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg border transition transform active:scale-[0.98]
              ${tab === t.key ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ww" && <WoostersWordWeb />}
      {tab === "jj" && <JeevesJottings />}
      {tab === "ds" && <StatsPanel />}
      {tab === "lg" && <GamesLegal />}
    </div>
  );
}
