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
   Reading View (defensive)
   ---------------------- */
const ReadingView = ({ book, currentChapterIndex, setCurrentChapterIndex, onBack, onAiSummary }) => {
  // Defensive guards
  if (!book || !Array.isArray(book.chapters) || book.chapters.length === 0) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
        <div className="text-red-600">Unable to display book — invalid or empty chapters data.</div>
      </div>
    );
  }

  const chapter = book.chapters[currentChapterIndex];
  if (!chapter || (!Array.isArray(chapter.content) && typeof chapter.content !== 'string')) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
        <div className="text-red-600">Unable to display chapter — invalid chapter structure.</div>
      </div>
    );
  }

  // Layout & pagination
  const contentPaneRef = useRef(null);
  const contentTextRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [currentChapterIndex]);

  useEffect(() => {
    const calculatePages = () => {
      requestAnimationFrame(() => {
        if (!contentPaneRef.current || !contentTextRef.current) return;
        const paneWidth = contentPaneRef.current.clientWidth || 1;
        const totalTextWidth = contentTextRef.current.scrollWidth || paneWidth;
        const pages = Math.max(1, Math.ceil(totalTextWidth / paneWidth));
        setTotalPages(pages);
      });
    };

    const ro = new ResizeObserver(calculatePages);
    if (contentPaneRef.current) ro.observe(contentPaneRef.current);
    calculatePages();
    return () => ro.disconnect();
  }, [chapter]);

  const goToNextChapter = () => setCurrentChapterIndex(Math.min(book.chapters.length - 1, currentChapterIndex + 1));
  const goToPreviousChapter = () => setCurrentChapterIndex(Math.max(0, currentChapterIndex - 1));
  const goToNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1));
  const goToPreviousPage = () => setCurrentPage(p => Math.max(1, p - 1));

  const paragraphs = Array.isArray(chapter.content) ? chapter.content : (typeof chapter.content === 'string' ? chapter.content.split('\n\n') : []);

  return (
    <div className="flex flex-col h-[calc(100vh-150px)] bg-white">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button onClick={onBack} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
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

      <div ref={contentPaneRef} className="flex-grow overflow-hidden relative w-full">
        <div
          ref={contentTextRef}
          className="h-full text-lg leading-relaxed font-serif p-4 md:p-6 text-left"
          style={{
            height: '100%',
            columnWidth: contentPaneRef.current ? `${contentPaneRef.current.clientWidth}px` : '100%',
            columnGap: '50px',
            transform: `translateX(-${(currentPage - 1) * (contentPaneRef.current?.clientWidth + 50 || 0)}px)`,
            transition: 'transform 0.4s ease-in-out'
          }}
        >
          {paragraphs.map((p, i) => (<p key={i} className="mb-6 break-inside-avoid-column">{p}</p>))}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-between items-center">
        <button onClick={onAiSummary} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 flex items-center gap-2">
          Summarize
        </button>
        {totalPages > 1 && (
          <div className="flex items-center gap-4">
            <button onClick={goToPreviousPage} disabled={currentPage === 1} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Prev Page</button>
            <span className="flex-shrink-0">Page {currentPage} of {totalPages}</span>
            <button onClick={goToNextPage} disabled={currentPage === totalPages} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50">Next Page</button>
          </div>
        )}
      </div>
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
        {isLoading ? ( <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div></div>) : (<p className="text-base leading-relaxed whitespace-pre-line">{response}</p>)}
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
      </div>
    </div>
  );
};

/* ----------------------
   Gemini call (unchanged behavior: API key placeholder)
   ---------------------- */
async function callGeminiAPI(prompt) {
  const apiKey = ""; // <-- add your key if you use this
  if (!apiKey) throw new Error("Gemini API key not provided.");

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  let response;
  let retries = 3;
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (response.ok) {
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "No summary available.";
      } else {
        console.error(`API call failed with status: ${response.status}`);
        if (i === retries - 1) throw new Error(`API call failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay *= 2;
  }
  throw new Error("API call failed after multiple retries.");
}

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

  // dark mode toggle effect
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // load library.json from public/content/library.json (uses Vite base)
  useEffect(() => {
    const load = async () => {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const url = `${base}content/library.json`;
        console.log("[DEBUG] fetching library from:", url);
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data = await resp.json();
        setLibrary(data);
        // debug the contentFile entries for easier diagnosis
        console.log("[DEBUG] Loaded library entries:", data.map(b => ({ id: b.id, contentFile: b.contentFile })));
      } catch (err) {
        console.error("Failed to load library:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  /* Robust book loader with diagnostics and URL normalization */
  const handleSelectBook = async (book) => {
    setSelectedBook(book);
    setBookContent(null);
    setBookError(null);
    setIsBookLoading(true);

    const raw = (book?.contentFile || '').toString();
    console.log("[DEBUG] selected book:", { id: book?.id, contentFileRaw: raw });

    let urlString = '';
    try {
      const basePath = import.meta.env.BASE_URL ?? '/';
      const origin = (typeof location !== 'undefined' && location?.origin) ? location.origin : (typeof window !== 'undefined' ? window.location.origin : '');
      let path = raw.trim();

      if (/^https?:\/\//i.test(path)) {
        // absolute URL — use as-is (but validate)
        urlString = path;
      } else {
        // make sure no leading slashes
        path = path.replace(/^\/+/, '');
        if (!path.startsWith('content/')) path = `content/${path}`;
        const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/';
        const baseForURL = origin + normalizedBase;
        urlString = new URL(path, baseForURL).toString();
      }
    } catch (err) {
      console.error("[DEBUG] URL constructor failed:", err);
      try {
        const fallback = `/content/${encodeURIComponent(raw.replace(/^\/+/, ''))}`;
        console.log("[DEBUG] fallback URL:", fallback);
        urlString = fallback;
      } catch (err2) {
        console.error("[DEBUG] fallback encode failed:", err2);
        setBookError(`Invalid contentFile value: ${raw}`);
        setIsBookLoading(false);
        return;
      }
    }

    console.log("[DEBUG] Fetching book from URL:", urlString);

    try {
      const response = await fetch(urlString, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      console.log("[DEBUG] response content-type:", contentType);

      let data;
      if (contentType.includes('application/json') || contentType.includes('text/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("[DEBUG] Non-JSON response snippet:", text.slice(0, 1000));
        throw new Error(`Expected JSON but server returned ${contentType || 'unknown'}. Response starts with: ${text.slice(0,200).replace(/\n/g,' ')}`);
      }

      if (!data || !Array.isArray(data.chapters)) {
        throw new Error('Book JSON has unexpected format (missing chapters array).');
      }

      setBookContent(data);
      setCurrentChapterIndex(0);
      setBookError(null);
      console.log("[DEBUG] Loaded book JSON successfully:", { id: book.id, chapters: data.chapters?.length ?? 0 });
    } catch (error) {
      console.error("[ERROR] Failed to load book content:", error);
      const name = error?.name ?? 'Error';
      const msg = error?.message ?? String(error);
      setBookError(`${name}: ${msg}`);
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
    const prompt = `Provide a concise, one-paragraph summary of the following chapter:\n\n${chapterText}`;
    try {
      const response = await callGeminiAPI(prompt);
      setAiResponse(response);
    } catch (error) {
      setAiResponse('Sorry, I was unable to generate a summary at this time.');
      console.error("Gemini API call failed:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Main render logic with error UI to avoid infinite spinner
  const renderContent = () => {
    if (isLoading) return <LoadingScreen message="Loading Library..." />;

    if (selectedBook) {
      if (isBookLoading) return <LoadingScreen message={`Loading ${selectedBook.title}...`} />;

      if (bookError) {
        return (
          <div className="container mx-auto p-6">
            <button onClick={handleBackToLibrary} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
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
            <button onClick={handleBackToLibrary} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
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
