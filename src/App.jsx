import React, { useState, useEffect, useRef } from 'react';

/* ----------------------
   Small UI helper components
   ---------------------- */

const LoadingScreen = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center h-[calc(100vh-150px)]">
    <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-b-4 border-blue-500"></div>
    {message && <p className="mt-4 text-lg">{message}</p>}
  </div>
);

const Header = ({ onSettingsClick }) => (
  <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-10">
    <div className="container mx-auto p-4 flex justify-between items-center">
      <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900 dark:text-white">Wodehouse AI Reader</h1>
      <button onClick={onSettingsClick} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.481.398.635 1.08.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 01-.22.127c-.331.183-.581.495-.645.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.075-.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </button>
    </div>
  </header>
);

/* ----------------------
   Library View
   ---------------------- */
const LibraryView = ({ library, onSelectBook }) => (
  <div className="container mx-auto p-4">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
      {library.map(book => (
        <div key={book.id} onClick={() => onSelectBook(book)} className="cursor-pointer group bg-white rounded-lg shadow hover:shadow-lg overflow-hidden">
          <img src={book.coverImage} alt={`Cover of ${book.title}`} className="w-full h-48 object-cover" />
          <div className="p-3">
            <h3 className="font-bold text-sm md:text-base">{book.title}</h3>
            <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{book.author}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ----------------------
   Dictionary Modal
   ---------------------- */
const DictionaryModal = ({ word, loading, error, entries, onClose }) => {
  if (!word) return null;

  const hasEntries = Array.isArray(entries) && entries.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold">Definition: <span className="italic">{word}</span></h3>
          <button onClick={onClose} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">Close</button>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {!loading && error && (
          <p className="text-red-600">{error}</p>
        )}

        {!loading && !error && !hasEntries && (
          <p className="text-gray-700 dark:text-gray-300">No definition found.</p>
        )}

        {!loading && !error && hasEntries && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {entries.map((entry, idx) => (
              <div key={idx} className="mb-4">
                {entry.word && <div className="text-gray-700 dark:text-gray-300 font-semibold">{entry.word}{entry.phonetic ? ` · ${entry.phonetic}` : ''}</div>}
                {entry.meanings?.map((m, i) => (
                  <div key={i} className="mt-2">
                    <div className="font-semibold">{m.partOfSpeech || 'definition'}</div>
                    <ol className="list-decimal pl-5">
                      {m.definitions?.slice(0, 3).map((d, j) => (
                        <li key={j} className="mt-1">
                          <div>{d.definition}</div>
                          {d.example && <div className="text-gray-600 italic">“{d.example}”</div>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ----------------------
   Reading View (sentence-aware pagination + whitespace + dictionary select + mobile long-press)
   ---------------------- */
const ReadingView = ({ book, currentChapterIndex, setCurrentChapterIndex, onBack, onAiSummary }) => {
  if (!book || !Array.isArray(book.chapters) || book.chapters.length === 0) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-blue-600 hover:underline mb-4">&larr; Back to Library</button>
        <div className="text-red-600">Unable to display book — invalid or empty chapters data.</div>
      </div>
    );
  }
  const chapter = book.chapters[currentChapterIndex];
  const rawParagraphs = Array.isArray(chapter?.content)
    ? chapter.content
    : (typeof chapter?.content === 'string' ? chapter.content.split('\n\n') : []);

  // Layout & pagination refs/state
  const viewportRef = useRef(null);   // visible page box
  const measurerRef = useRef(null);   // offscreen measurer
  const [pages, setPages] = useState([]);       // page = array of paragraph strings
  const [pageIndex, setPageIndex] = useState(0);

  // Dictionary states
  const [selectionText, setSelectionText] = useState('');
  const [selectedWord, setSelectedWord] = useState('');
  const [showDefineButton, setShowDefineButton] = useState(false);
  const [defineBtnPos, setDefineBtnPos] = useState({ x: 0, y: 0 });
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState('');
  const [dictEntries, setDictEntries] = useState(null);

  // Mobile long-press state (declare ONCE)
  const longPressTimer = useRef(null);
  const longPressActive = useRef(false);
  const lastTouchPoint = useRef({ x: 0, y: 0 });

  // Sentence splitting
  const splitIntoSentences = (text) => {
    const matches = text.match(/[^.!?…]+[.!?…]"?'?\)?\s*/g);
    return matches || [text];
  };

  // Normalize selected text to a single word
  const normalizeWord = (str) => {
    if (!str) return '';
    const word = str
      .trim()
      .replace(/[“”"‘’'(),.;:!?—–…]/g, ' ')
      .split(/\s+/)[0]
      .toLowerCase();
    const m = word.match(/^[a-z][a-z\-]*$/i);
    return m ? m[0] : '';
  };

  // Pagination core (measure sentences, end pages at boundaries)
  const paginate = () => {
    const viewport = viewportRef.current;
    const measurer = measurerRef.current;
    if (!viewport || !measurer) return;

    const pageComputed = getComputedStyle(viewport);
    const paddingX = parseFloat(pageComputed.paddingLeft) + parseFloat(pageComputed.paddingRight);
    const usableWidth = Math.max(0, viewport.clientWidth - paddingX);
    measurer.style.width = `${usableWidth}px`;

    const maxHeight = viewport.clientHeight;

    const resetMeasurerWith = (paras) => {
      measurer.innerHTML = '';
      paras.forEach(t => {
        const p = document.createElement('p');
        p.className = 'mb-6 text-justify hyphens-auto break-words';
        p.textContent = t;
        measurer.appendChild(p);
      });
    };

    const resultPages = [];
    let currentPage = [];

    const tryAddParagraph = (text) => {
      resetMeasurerWith(currentPage);
      const p = document.createElement('p');
      p.className = 'mb-6 text-justify hyphens-auto break-words';
      p.textContent = text;
      measurer.appendChild(p);

      if (measurer.scrollHeight <= maxHeight) {
        currentPage.push(text);
        return;
      }

      // fallback: build paragraph by sentences
      p.remove();
      const sentences = splitIntoSentences(text);
      let paraBuffer = '';
      const flushParaBufferInto = (arr) => {
        if (paraBuffer.trim()) arr.push(paraBuffer);
        paraBuffer = '';
      };

      for (const s of sentences) {
        const candidate = paraBuffer ? (paraBuffer + s) : s;
        resetMeasurerWith([...currentPage, candidate]);

        if (measurer.scrollHeight <= maxHeight) {
          paraBuffer = candidate;
        } else {
          // close current page
          if (currentPage.length || paraBuffer.trim()) {
            flushParaBufferInto(currentPage);
            resultPages.push(currentPage);
          }
          // start new page with this sentence
          currentPage = [];
          paraBuffer = s;
          resetMeasurerWith([paraBuffer]);

          // If single sentence is taller than a page (edge case)
          if (measurer.scrollHeight > maxHeight) {
            resultPages.push([paraBuffer]);
            paraBuffer = '';
            currentPage = [];
          }
        }
      }
      flushParaBufferInto(currentPage);
    };

    for (const para of rawParagraphs) tryAddParagraph(para);
    if (currentPage.length) resultPages.push(currentPage);

    setPages(resultPages);
    setPageIndex(0);
  };

  // Re-paginate on chapter change or resize
  useEffect(() => {
    paginate();
    const ro = new ResizeObserver(() => paginate());
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapterIndex, chapter]);

  // Navigation
  const goToNextChapter = () => setCurrentChapterIndex(Math.min(book.chapters.length - 1, currentChapterIndex + 1));
  const goToPreviousChapter = () => setCurrentChapterIndex(Math.max(0, currentChapterIndex - 1));
  const goToNextPage = () => setPageIndex(i => Math.min((pages.length || 1) - 1, i + 1));
  const goToPreviousPage = () => setPageIndex(i => Math.max(0, i - 1));

  const currentPageParas = pages[pageIndex] || [];

  // Selection handling (desktop)
  const handleMouseUp = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    const normalized = normalizeWord(text);
    if (normalized && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const offsetY = 8;
      setSelectedWord(normalized);
      setSelectionText(text);
      setDefineBtnPos({ x: rect.left + rect.width / 2, y: rect.top + window.scrollY - offsetY });
      setShowDefineButton(true);
    } else {
      setShowDefineButton(false);
      setSelectionText('');
      setSelectedWord('');
    }
  };

  // Helpers to detect word at a point (for long-press)
  const getWordFromPoint = (clientX, clientY) => {
    const range = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(clientX, clientY)
      : null;
    if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return '';

    const node = range.startContainer;
    let offset = range.startOffset;

    const text = node.textContent || '';
    if (!text) return '';

    // Expand to word boundaries
    let start = offset;
    let end = offset;

    const isWordChar = (ch) => /[A-Za-z\-]/.test(ch);

    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    const word = text.slice(start, end).trim();
    return normalizeWord(word);
  };

  // Mobile long-press handlers (use the ONE set of refs declared above)
  const handleTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const { clientX, clientY } = e.touches[0];
    lastTouchPoint.current = { x: clientX, y: clientY };
    longPressActive.current = true;

    longPressTimer.current = window.setTimeout(() => {
      if (!longPressActive.current) return;
      const sel = window.getSelection();
      let word = '';
      if (sel && sel.toString().trim()) {
        word = normalizeWord(sel.toString());
      }
      if (!word) {
        word = getWordFromPoint(clientX, clientY);
      }
      if (word) {
        setSelectedWord(word);
        setSelectionText(word);
        setDefineBtnPos({ x: clientX, y: window.scrollY + clientY - 8 });
        setShowDefineButton(true);
      }
    }, 550);
  };

  const handleTouchMove = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const { clientX, clientY } = e.touches[0];
    const dx = clientX - lastTouchPoint.current.x;
    const dy = clientY - lastTouchPoint.current.y;
    if (Math.hypot(dx, dy) > 10) {
      longPressActive.current = false;
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchEnd = () => {
    longPressActive.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  };

  // Dictionary lookup (hardened)
  const fetchDefinition = async (word) => {
    if (!word) return;
    setDictLoading(true);
    setDictError('');
    setDictEntries(null);
    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const resp = await fetch(url, {
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
      });

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      const isJSON = contentType.includes('application/json');

      if (resp.status === 404) {
        setDictEntries([]);
        setDictError('');
        return;
      }
      if (!resp.ok) {
        const message = isJSON ? JSON.stringify(await resp.json()) : (await resp.text());
        throw new Error(`Dictionary lookup failed (${resp.status}): ${message.slice(0, 300)}`);
      }

      const data = isJSON ? await resp.json() : [];
      setDictEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setDictError(err?.message || 'Failed to fetch definition.');
      setDictEntries([]);
    } finally {
      setDictLoading(false);
    }
  };

  const openDefinition = () => {
    setShowDefineButton(false);
    fetchDefinition(selectedWord);
  };

  const closeDictionary = () => {
    setDictEntries(null);
    setDictError('');
    setDictLoading(false);
    setSelectedWord('');
    setSelectionText('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-150px)] bg-gray-50">
      {/* Top bar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white">
        <button onClick={onBack} className="text-blue-600 hover:underline mb-4">&larr; Back to Library</button>
        <div className="flex justify-between items-center flex-wrap gap-y-2">
          <div>
            <h2 className="text-2xl font-bold font-serif">{book.title}</h2>
            <h3 className="text-lg text-gray-600 dark:text-gray-400">{chapter.title}</h3>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={goToPreviousChapter} disabled={currentChapterIndex === 0} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Prev Chapter</button>
            <span className="flex-shrink-0">Chapter {currentChapterIndex + 1} of {book.chapters.length}</span>
            <button onClick={goToNextChapter} disabled={currentChapterIndex === book.chapters.length - 1} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Next Chapter</button>
          </div>
        </div>
      </div>

      {/* Centered page with generous whitespace */}
      <div className="flex-grow overflow-hidden flex items-stretch">
        <div className="flex-1 flex items-center justify-center">
          <div
            ref={viewportRef}
            className="w-full max-w-3xl mx-auto bg-white rounded-xl shadow-md px-6 sm:px-10 py-6 sm:py-8 overflow-hidden"
            style={{ height: '100%' }}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Page content (Typography styles) */}
            <article className="prose prose-lg dark:prose-invert max-w-none">
              {currentPageParas.map((p, i) => (
                <p key={i} className="text-justify hyphens-auto break-words">{p}</p>
              ))}
            </article>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white flex justify-between items-center">
        <button onClick={onAiSummary} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Summarize
        </button>
        <div className="flex items-center gap-4">
          <button onClick={goToPreviousPage} disabled={pageIndex === 0} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Prev Page</button>
          <span className="flex-shrink-0">Page {Math.min(pageIndex + 1, pages.length || 1)} of {pages.length || 1}</span>
          <button onClick={goToNextPage} disabled={pageIndex >= (pages.length || 1) - 1} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Next Page</button>
        </div>
      </div>

      {/* Floating "Define" button near selection / long-press point */}
      {showDefineButton && selectedWord && (
        <button
          onClick={openDefinition}
          className="fixed z-40 px-3 py-1 rounded-full bg-blue-600 text-white shadow hover:bg-blue-700"
          style={{ left: defineBtnPos.x, top: defineBtnPos.y, transform: 'translate(-50%, -100%)' }}
        >
          Define
        </button>
      )}

      {/* Off-screen measurer with same typography styles */}
      <div
        ref={measurerRef}
        aria-hidden
        className="fixed -left-[99999px] -top-[99999px] prose prose-lg max-w-none text-justify hyphens-auto break-words px-6 sm:px-10 py-6 sm:py-8"
        style={{ visibility: 'hidden', pointerEvents: 'none' }}
      />

      {/* Dictionary modal */}
      <DictionaryModal
        word={selectedWord}
        loading={dictLoading}
        error={dictError}
        entries={dictEntries}
        onClose={closeDictionary}
      />
    </div>
  );
};

/* ----------------------
   Settings & AI panels
   ---------------------- */
const SettingsPanel = ({ isOpen, onClose, isDarkMode, setIsDarkMode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-20" onClick={onClose}>
      <div className="absolute top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-6">Settings</h3>
        <div className="flex items-center justify-between">
          <label htmlFor="darkModeToggle" className="font-semibold">Dark Mode</label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
            <input type="checkbox" name="darkModeToggle" id="darkModeToggle" checked={isDarkMode} onChange={() => setIsDarkMode(!isDarkMode)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
            <label htmlFor="darkModeToggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
          </div>
        </div>
      </div>
       <style jsx="true">{`.toggle-checkbox:checked { right: 0; border-color: #48bb78; } .toggle-checkbox:checked + .toggle-label { background-color: #48bb78; }`}</style>
    </div>
  );
};

const AiPanel = ({ isOpen, onClose, isLoading, response }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4 font-serif">AI Summary</h3>
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div></div>
        ) : (
          <p className="text-base leading-relaxed whitespace-pre-line">{response}</p>
        )}
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
      </div>
    </div>
  );
};

/* ----------------------
   Main App
   ---------------------- */
export default function App() {
  // state
  const [library, setLibrary] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookContent, setBookContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBookLoading, setIsBookLoading] = useState(false);
  const [bookError, setBookError] = useState(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // dark mode toggle
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // load library.json from public/content/
  useEffect(() => {
    const load = async () => {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const url = `${base}content/library.json`;
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data = await resp.json();
        setLibrary(data);
      } catch (err) {
        console.error("Failed to load library:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // book loader
  const handleSelectBook = async (book) => {
    setSelectedBook(book);
    setBookContent(null);
    setBookError(null);
    setIsBookLoading(true);

    const raw = (book?.contentFile || '').toString();
    let urlString = '';
    try {
      const basePath = import.meta.env.BASE_URL ?? '/';
      const origin = (typeof location !== 'undefined' && location?.origin) ? location.origin : (typeof window !== 'undefined' ? window.location.origin : '');
      let path = raw.trim();

      if (/^https?:\/\//i.test(path)) {
        urlString = path;
      } else {
        path = path.replace(/^\/+/, '');
        if (!path.startsWith('content/')) path = `content/${path}`;
        const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/';
        const baseForURL = origin + normalizedBase;
        urlString = new URL(path, baseForURL).toString();
      }
    } catch {
      urlString = `/content/${encodeURIComponent(raw.replace(/^\/+/, ''))}`;
    }

    try {
      const response = await fetch(urlString, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but got ${contentType || 'unknown'}: ${text.slice(0, 200)}`);
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.chapters)) {
        throw new Error('Book JSON has unexpected format (missing chapters array).');
      }
      setBookContent(data);
      setCurrentChapterIndex(0);
    } catch (error) {
      setBookError(error?.message || 'Failed to load book content');
      setBookContent(null);
    } finally {
      setIsBookLoading(false);
    }
  };

  const handleBackToLibrary = () => {
    setSelectedBook(null);
    setBookContent(null);
    setBookError(null);
    setCurrentChapterIndex(0);
  };

  const retryLoadBook = () => {
    if (selectedBook) handleSelectBook(selectedBook);
  };

  // ChatGPT summary via Netlify Function
  const handleAiSummary = async () => {
    if (!bookContent || !Array.isArray(bookContent.chapters)) return;
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiResponse('');
    const chapter = bookContent.chapters[currentChapterIndex];
    const chapterText = Array.isArray(chapter?.content)
      ? chapter.content.join(' ')
      : (typeof chapter?.content === 'string' ? chapter.content : '');
    if (!chapterText) {
      setAiResponse('No chapter text available to summarize.');
      setIsAiLoading(false);
      return;
    }

    try {
      const resp = await fetch('/api/summarize', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          prompt: `Provide a concise, one-paragraph summary (4–6 sentences, neutral tone) of the following chapter:\n\n${chapterText}`
        })
      });
      const text = await resp.text();
      if (!resp.ok) {
        setAiResponse(`Summary failed: ${resp.status} ${text.slice(0, 400)}`);
        setIsAiLoading(false);
        return;
      }
      const data = JSON.parse(text);
      setAiResponse(data.summary || 'No summary available.');
    } catch (error) {
      setAiResponse('Sorry, I was unable to generate a summary at this time.');
      console.error(error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Main render
  const renderContent = () => {
    if (isLoading) return <LoadingScreen message="Loading Library..." />;

    if (selectedBook) {
      if (isBookLoading) return <LoadingScreen message={`Loading ${selectedBook.title}...`} />;

      if (bookError) {
        return (
          <div className="container mx-auto p-6">
            <button onClick={handleBackToLibrary} className="text-blue-600 hover:underline mb-4">&larr; Back to Library</button>
            <div className="mt-6 text-red-600">
              <h2 className="text-xl font-semibold">Failed to load "{selectedBook.title}"</h2>
              <p className="mt-2 whitespace-pre-wrap">Error: {bookError}</p>
              <div className="mt-4 flex gap-3">
                <button onClick={retryLoadBook} className="px-4 py-2 bg-blue-600 text-white rounded">Retry</button>
                <button onClick={handleBackToLibrary} className="px-4 py-2 bg-gray-200 rounded">Back to Library</button>
              </div>
            </div>
          </div>
        );
      }

      if (!bookContent) {
        return (
          <div className="container mx-auto p-6">
            <button onClick={handleBackToLibrary} className="text-blue-600 hover:underline mb-4">&larr; Back to Library</button>
            <div className="mt-6">
              <h2 className="text-xl font-semibold">No content available</h2>
              <p className="mt-2">The book could not be loaded. You can retry or return to the library.</p>
              <div className="mt-4 flex gap-3">
                <button onClick={retryLoadBook} className="px-4 py-2 bg-blue-600 text-white rounded">Retry</button>
                <button onClick={handleBackToLibrary} className="px-4 py-2 bg-gray-200 rounded">Back to Library</button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <ReadingView
          book={bookContent}
          currentChapterIndex={currentChapterIndex}
          setCurrentChapterIndex={setCurrentChapterIndex}
          onBack={handleBackToLibrary}
          onAiSummary={handleAiSummary}
        />
      );
    }

    return <LibraryView library={library} onSelectBook={handleSelectBook} />;
  };

  return (
    <div className="min-h-screen text-gray-800 dark:text-gray-200 transition-colors duration-300 bg-gray-50">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
      <main className="container mx-auto p-4 md:p-8">
        {renderContent()}
      </main>

      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      <AiPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} isLoading={isAiLoading} response={aiResponse} />
    </div>
  );
}
