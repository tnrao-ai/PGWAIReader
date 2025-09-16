// src/pages/Reader.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import LicenseModal from '../components/LicenseModal';
import { safeHTML, titleForChapter } from '../utils/chapterizer';
import { emit } from '../utils/readingMetrics';
import { getSearchText, putSearchText, saveProgress, loadProgress } from '../utils/indexedDb';

export default function Reader() {
  const { id } = useParams();
  const loc = useLocation();
  const titleFromNav = loc?.state?.title || '';
  const [book, setBook] = useState(null); // { chapters, license, title }
  const [active, setActive] = useState(0);
  const [showLicense, setShowLicense] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(true);

  const parentRef = useRef(null);

  // Virtualizer for paragraphs within the active chapter
  const paragraphs = useMemo(() => (book?.chapters?.[active]?.content || '').split(/\n{2,}/), [book, active]);
  const rowVirtualizer = useVirtualizer({
    count: paragraphs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/.netlify/functions/fetchBook?id=${id}&title=${encodeURIComponent(titleFromNav || '')}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        if (cancelled) return;
        setBook({ ...data, title: data.title || titleFromNav });
        setLoading(false);
        emit('chapter_open', { id, chapterIndex: 0 });
        // Restore progress
        const p = await loadProgress(id);
        setActive(p.chapterIndex || 0);
        // Build search index if not present
        const existing = await getSearchText(id);
        if (!existing) {
          // If we have text chapters, index them
          const plain = data.chapters.map(c => c.content.replace(/<[^>]+>/g, '')).join('\n\n');
          await putSearchText(id, plain);
        }
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, titleFromNav]);

  // Save progress occasionally
  useEffect(() => {
    const handler = setInterval(async () => {
      // Save current offset (top item index)
      const offset = parentRef.current?.scrollTop || 0;
      await saveProgress(id, active, offset);
    }, 1500);
    return () => clearInterval(handler);
  }, [id, active]);

  // Edge prefetch next chapter after idle
  useEffect(() => {
    if (!book?.chapters) return;
    const next = book.chapters[active + 1];
    if (!next) return;
    const timer = setTimeout(() => {
      // No actual network prefetch needed here since content is in memory,
      // but this is where you’d prefetch images or heavy assets if present.
    }, 800);
    return () => clearTimeout(timer);
  }, [book, active]);

  // Search
  useEffect(() => {
    let a = true;
    const run = async () => {
      const q = query.trim();
      if (!q) { setHits([]); return; }
      const text = await getSearchText(id);
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = [];
      let m;
      const MAX = 50;
      while ((m = re.exec(text)) && matches.length < MAX) {
        const start = Math.max(0, m.index - 50);
        const end = Math.min(text.length, m.index + q.length + 50);
        matches.push({ ctx: text.slice(start, end), idx: m.index });
      }
      if (a) setHits(matches);
    };
    const t = setTimeout(run, 250);
    return () => { a = false; clearTimeout(t); };
  }, [id, query]);

  if (loading) {
    return <div className="p-6">Loading book…</div>;
  }
  if (!book) {
    return <div className="p-6">Could not load the book.</div>;
  }

  const { chapters, license, title } = book;

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* TOC */}
      <aside className="w-64 border-r overflow-auto p-3 hidden md:block">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm pr-2 line-clamp-2">{title || 'Book'}</h2>
          <button title="About & License" className="text-xs underline" onClick={() => setShowLicense(true)}>
            License
          </button>
        </div>
        <ol className="space-y-1">
          {chapters.map((ch, i) => (
            <li key={i}>
              <button
                onClick={() => { setActive(i); emit('chapter_open', { id, chapterIndex: i }); }}
                className={`w-full text-left text-sm px-2 py-1 rounded ${i===active ? 'bg-neutral-200 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
              >
                {titleForChapter(ch, i)}
              </button>
            </li>
          ))}
        </ol>
        {/* Search */}
        <div className="mt-6">
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Search in book…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {!!hits.length && (
            <div className="mt-2 max-h-48 overflow-auto text-xs space-y-2">
              {hits.map((h, i) => (
                <div key={i} className="p-2 rounded bg-neutral-100 dark:bg-neutral-800">
                  …{h.ctx}…
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Chapter content */}
      <main className="flex-1 overflow-hidden">
        <div ref={parentRef} className="h-full overflow-auto p-4">
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {rowVirtualizer.getVirtualItems().map(virt => (
              <div
                key={virt.key}
                data-index={virt.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virt.start}px)`
                }}
                className="mb-4"
              >
                <p className="leading-7 whitespace-pre-wrap">
                  {paragraphs[virt.index]}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t p-3 flex gap-2 justify-between">
          <button
            disabled={active<=0}
            onClick={() => { setActive(a => Math.max(0, a-1)); emit('chapter_prev', { id, chapterIndex: active-1 }); }}
            className="px-3 py-1 rounded bg-neutral-200 dark:bg-neutral-800 disabled:opacity-50"
          >
            ◀ Prev
          </button>
          <div className="text-sm opacity-70 self-center">
            {titleForChapter(chapters[active], active)}
          </div>
          <button
            disabled={active>=chapters.length-1}
            onClick={() => { setActive(a => Math.min(chapters.length-1, a+1)); emit('chapter_next', { id, chapterIndex: active+1 }); }}
            className="px-3 py-1 rounded bg-neutral-200 dark:bg-neutral-800 disabled:opacity-50"
          >
            Next ▶
          </button>
        </div>
      </main>

      <LicenseModal open={showLicense} onClose={() => setShowLicense(false)} license={license} />
    </div>
  );
}
