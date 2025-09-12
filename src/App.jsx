import React, { useState, useEffect, useRef } from 'react';

// Loading screen component
const LoadingScreen = ({ message }) => (
  <div className="flex items-center justify-center h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mx-auto mb-4"></div>
      <p className="text-xl font-semibold text-gray-700">{message}</p>
    </div>
  </div>
);

// Library view component
const LibraryView = ({ library, onSelectBook }) => (
  <div className="p-6">
    <h1 className="text-3xl font-bold mb-6">Library</h1>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {library.map(book => (
        <div
          key={book.id}
          className="bg-white shadow-md rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-300"
          onClick={() => onSelectBook(book)}
        >
          <img src={book.coverImage} alt={book.title} className="w-full h-48 object-cover" />
          <div className="p-4">
            <h2 className="text-lg font-semibold">{book.title}</h2>
            <p className="text-gray-600">{book.author}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// AI Panel component
const AiPanel = ({ isOpen, isLoading, response, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex justify-end z-50">
      <div className="w-1/3 bg-white h-full p-6 overflow-y-auto">
        <button
          onClick={onClose}
          className="mb-4 text-gray-500 hover:text-gray-700 focus:outline-none"
        >
          Close
        </button>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-semibold mb-4">AI Summary</h2>
            <p className="text-gray-700 whitespace-pre-line">{response}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Reading view component
const ReadingView = ({ book, currentChapterIndex, setCurrentChapterIndex, onBack, onAiSummary }) => {
  if (!book || !Array.isArray(book.chapters) || book.chapters.length === 0) {
    return (
      <div className="p-6 text-red-600">
        <button onClick={onBack} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
        <p>Unable to display book — invalid or empty chapters data.</p>
      </div>
    );
  }

  const chapter = book.chapters[currentChapterIndex];
  if (!chapter || !Array.isArray(chapter.content)) {
    return (
      <div className="p-6 text-red-600">
        <button onClick={onBack} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
        <p>Unable to display chapter — invalid chapter structure.</p>
      </div>
    );
  }

  const contentPaneRef = useRef(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setPageIndex(0);
  }, [currentChapterIndex]);

  useEffect(() => {
    const updatePages = () => {
      if (contentPaneRef.current) {
        const scrollWidth = contentPaneRef.current.scrollWidth;
        const clientWidth = contentPaneRef.current.clientWidth;
        const pages = Math.ceil(scrollWidth / clientWidth);
        setTotalPages(pages);
      }
    };

    updatePages();
    const resizeObserver = new ResizeObserver(updatePages);
    if (contentPaneRef.current) {
      resizeObserver.observe(contentPaneRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [chapter]);

  const handleNextPage = () => {
    if (pageIndex < totalPages - 1) {
      setPageIndex(pageIndex + 1);
    }
  };

  const handlePrevPage = () => {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    }
  };

  return (
    <div className="flex h-screen">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 bg-gray-100">
          <button onClick={onBack} className="text-blue-500 hover:underline">
            &larr; Back to Library
          </button>
          <h1 className="text-2xl font-semibold text-center">{book.title}</h1>
          <button
            onClick={onAiSummary}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Summarize
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <div
            ref={contentPaneRef}
            className="h-full overflow-x-hidden whitespace-normal"
            style={{
              columnWidth: contentPaneRef.current ? `${contentPaneRef.current.clientWidth}px` : '100%',
              columnGap: '2rem',
              transform: `translateX(-${pageIndex * 100}%)`,
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            <h2 className="text-xl font-bold mb-4">{chapter.title}</h2>
            {chapter.content.map((para, index) => (
              <p key={index} className="mb-4 text-justify">
                {para}
              </p>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center p-4 bg-gray-100">
          <button
            onClick={handlePrevPage}
            disabled={pageIndex === 0}
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {pageIndex + 1} of {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={pageIndex >= totalPages - 1}
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>

        <div className="flex justify-between items-center p-4 bg-gray-100">
          <button
            onClick={() => setCurrentChapterIndex(Math.max(0, currentChapterIndex - 1))}
            disabled={currentChapterIndex === 0}
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
          >
            Previous Chapter
          </button>
          <button
            onClick={() =>
              setCurrentChapterIndex(Math.min(book.chapters.length - 1, currentChapterIndex + 1))
            }
            disabled={currentChapterIndex === book.chapters.length - 1}
            className="px-4 py-2 bg-gray-300 rounded disabled:opacity-50"
          >
            Next Chapter
          </button>
        </div>
      </div>
    </div>
  );
};

const callGeminiAPI = async (prompt) => {
  const apiKey = ""; // TODO: Insert your Gemini API key here if needed
  if (!apiKey) {
    throw new Error("Gemini API key not provided.");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );
  if (!response.ok) {
    throw new Error("Failed to call Gemini API");
  }
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
};

// Main App component
const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [library, setLibrary] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookContent, setBookContent] = useState(null);
  const [isBookLoading, setIsBookLoading] = useState(false);
  const [bookError, setBookError] = useState(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');

  // Load library.json
  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const response = await fetch(`${base}content/library.json`, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setLibrary(data);
        console.log("Loaded library.json:", data);
      } catch (error) {
        console.error("Failed to load library:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadLibrary();
  }, []);

  // Select a book
  const handleSelectBook = async (book) => {
    setSelectedBook(book);
    setBookContent(null);
    setBookError(null);
    setIsBookLoading(true);

    try {
      const base = import.meta.env.BASE_URL || '/';
      const url = `${base}content/${book.contentFile}`;
      console.log("Fetching book from:", url);

      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      if (!data || !Array.isArray(data.chapters)) {
        throw new Error('Book JSON has unexpected format (missing chapters array).');
      }

      setBookContent(data);
      setCurrentChapterIndex(0);
      setBookError(null);
      console.log("Loaded book JSON:", data);
    } catch (error) {
      console.error("Failed to load book content:", error);
      setBookError(error.message || 'Failed to load book content');
      setBookContent(null);
    } finally {
      setIsBookLoading(false);
    }
  };

  const handleBackToLibrary = () => {
    setSelectedBook(null);
    setBookContent(null);
    setCurrentChapterIndex(0);
    setBookError(null);
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

  const renderContent = () => {
    if (isLoading) {
      return <LoadingScreen message="Loading Library..." />;
    }

    if (selectedBook) {
      if (isBookLoading) {
        return <LoadingScreen message={`Loading ${selectedBook.title}...`} />;
      }

      if (bookError) {
        return (
          <div className="p-6">
            <button onClick={handleBackToLibrary} className="text-blue-500 hover:underline mb-4">&larr; Back to Library</button>
            <div className="mt-6 text-red-600">
              <h2 className="text-xl font-semibold">Failed to load "{selectedBook.title}"</h2>
              <p className="mt-2">Error: {bookError}</p>
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
          <div className="p-6">
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
    <div className="bg-gray-50 min-h-screen">
      {renderContent()}
      <AiPanel
        isOpen={isAiPanelOpen}
        isLoading={isAiLoading}
        response={aiResponse}
        onClose={() => setIsAiPanelOpen(false)}
      />
    </div>
  );
};

export default App;
