import React, { useState, useEffect, useRef } from 'react';

// Main Application Component
export default function App() {
  const [library, setLibrary] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookContent, setBookContent] = useState(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    fetch('/content/library.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => {
        setLibrary(data);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to load library:", error);
        setIsLoading(false);
      });
  }, []);

  const handleSelectBook = (book) => {
    setSelectedBook(book);
    setIsLoading(true);
    fetch(`/content/${book.contentFile}`, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => {
        setBookContent(data);
        setCurrentChapterIndex(0);
        setIsLoading(false);
      })
      .catch(error => {
        console.error("Failed to load book content:", error);
        setIsLoading(false);
      });
  };
  
  const handleBackToLibrary = () => {
    setSelectedBook(null);
    setBookContent(null);
  };

  const handleAiSummary = async () => {
    if (!bookContent) return;
    setIsAiPanelOpen(true);
    setIsAiLoading(true);
    setAiResponse('');

    const chapterText = bookContent.chapters[currentChapterIndex].content.join(' ');
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
  
  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen text-gray-800 dark:text-gray-200 transition-colors duration-300">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
      <main className="container mx-auto p-4 md:p-8">
        {!selectedBook ? (
          <LibraryView library={library} onSelectBook={handleSelectBook} />
        ) : (
          <ReadingView 
            book={bookContent} 
            currentChapterIndex={currentChapterIndex}
            setCurrentChapterIndex={setCurrentChapterIndex}
            onBack={handleBackToLibrary} 
            onAiSummary={handleAiSummary}
          />
        )}
      </main>
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      <AiPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} isLoading={isAiLoading} response={aiResponse} />
    </div>
  );
}

// UI Components
const Header = ({ onSettingsClick }) => (
  <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-10">
    <div className="container mx-auto p-4 flex justify-between items-center">
      <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900 dark:text-white">Wodehouse AI Reader</h1>
      <button onClick={onSettingsClick} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.481.398.635 1.08.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 01-.22.127c-.331.183-.581.495-.645.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.075-.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87l.213-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </header>
);

const LibraryView = ({ library, onSelectBook }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
    {library.map(book => (
      <div key={book.id} onClick={() => onSelectBook(book)} className="cursor-pointer group">
        <img 
          src={book.coverImage} 
          alt={`Cover of ${book.title}`} 
          className="rounded-lg shadow-lg group-hover:shadow-xl transform group-hover:-translate-y-1 transition-all duration-300 w-full" 
        />
        <div className="mt-2">
          <h3 className="font-bold text-sm md:text-base">{book.title}</h3>
          <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">{book.author}</p>
        </div>
      </div>
    ))}
  </div>
);

const ReadingView = ({ book, currentChapterIndex, setCurrentChapterIndex, onBack, onAiSummary }) => {
  const chapter = book.chapters[currentChapterIndex];
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const contentPaneRef = useRef(null);
  const contentTextRef = useRef(null);

  useEffect(() => {
    const calculatePages = () => {
      if (contentPaneRef.current && contentTextRef.current) {
        requestAnimationFrame(() => {
          const paneWidth = contentPaneRef.current.clientWidth;
          const totalTextWidth = contentTextRef.current.scrollWidth;
          if (paneWidth > 0) {
            const pages = Math.max(1, Math.ceil(totalTextWidth / paneWidth));
            setTotalPages(pages);
          }
        });
      }
    };
    const resizeObserver = new ResizeObserver(calculatePages);
    if (contentPaneRef.current) {
      resizeObserver.observe(contentPaneRef.current);
    }
    calculatePages();
    setCurrentPage(1);
    return () => {
      if (contentPaneRef.current) {
        resizeObserver.unobserve(contentPaneRef.current);
      }
    };
  }, [chapter]);

  const goToNextChapter = () => {
    if (currentChapterIndex < book.chapters.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
    }
  };

  const goToPreviousChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
    }
  };
  
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-150px)]">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button onClick={onBack} className="text-blue-500 hover:underline mb-4">
          &larr; Back to Library
        </button>
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
      
      {/* Paginated Content */}
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
             {chapter.content.map((paragraph, index) => (
              <p key={index} className="mb-6 break-inside-avoid-column">{paragraph}</p>
            ))}
          </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-between items-center">
        <button onClick={onAiSummary} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 22.5l-.648-1.938a3.375 3.375 0 00-2.672-2.672L11.25 18l1.938-.648a3.375 3.375 0 002.672-2.672L16.25 13.5l.648 1.938a3.375 3.375 0 002.672 2.672L21.75 18l-1.938.648a3.375 3.375 0 00-2.672 2.672z" /></svg>
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

const SettingsPanel = ({ isOpen, onClose, isDarkMode, setIsDarkMode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-20" onClick={onClose}>
      <div className="absolute top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-6">Settings</h3>
        <div className="flex items-center justify-between">
          <label htmlFor="darkModeToggle" className="font-semibold">Dark Mode</label>
          <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
            <input 
              type="checkbox" 
              name="darkModeToggle" 
              id="darkModeToggle" 
              checked={isDarkMode}
              onChange={() => setIsDarkMode(!isDarkMode)}
              className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
            />
            <label htmlFor="darkModeToggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
          </div>
        </div>
      </div>
       <style jsx="true">{`
        .toggle-checkbox:checked {
          right: 0;
          border-color: #48bb78;
        }
        .toggle-checkbox:checked + .toggle-label {
          background-color: #48bb78;
        }
      `}</style>
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
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <p className="text-base leading-relaxed">{response}</p>
        )}
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
      </div>
    </div>
  );
}

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-b-4 border-blue-500"></div>
  </div>
);


// Helper function to call Gemini API
async function callGeminiAPI(prompt) {
    const apiKey = ""; // Leave empty for Canvas environment
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
    };

    let response;
    let retries = 3;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

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
        delay *= 2; // Exponential backoff
    }
    
    throw new Error("API call failed after multiple retries.");
}

