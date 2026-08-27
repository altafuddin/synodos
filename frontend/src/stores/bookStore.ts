import { create } from 'zustand';
import type { Book } from '../types';
import type { ThemeName } from '../constants/themes';
import { deleteBook, listBooks } from '../services/books';
import { deleteBookFile, listLocalBookFiles } from '../services/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('bookStore');

interface BookStore {
  books: Book[];
  activeBookId: string | null;
  theme: ThemeName;
  fontSize: number;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;

  fetchBooks: () => Promise<void>;
  setActiveBook: (bookId: string | null) => void;
  setTheme: (theme: ThemeName) => void;
  setFontSize: (fontSize: number) => void;
  addBook: (book: Book) => void;
  removeBook: (bookId: string) => Promise<void>;
  clearError: () => void;
}

// Post-fetch reconciliation. The server list stays the sole source of truth;
// this only (a) flags each book with hasLocalFile so the UI can mark
// unreadable ones, and (b) deletes orphan local files that match no server
// record. Any filesystem error degrades to "assume present" — never fails
// the fetch.
function reconcileWithLocalFiles(books: Book[]): Book[] {
  try {
    const local = listLocalBookFiles();
    const localKeys = new Set(local.map((f) => `${f.bookId}.${f.format}`));
    const serverKeys = new Set(books.map((b) => `${b.book_id}.${b.format}`));

    for (const file of local) {
      const key = `${file.bookId}.${file.format}`;
      if (!serverKeys.has(key)) {
        log.info('orphan_local_file_deleted', {
          bookId: file.bookId,
          format: file.format,
        });
        void deleteBookFile(file.bookId, file.format);
      }
    }

    return books.map((b) => ({
      ...b,
      hasLocalFile: localKeys.has(`${b.book_id}.${b.format}`),
    }));
  } catch (err) {
    log.warn('local_reconcile_failed', { error: String(err) });
    return books;
  }
}

export const useBookStore = create<BookStore>((set, get) => ({
  books: [],
  activeBookId: null,
  theme: 'dark',
  fontSize: 1.0,
  isLoading: false,
  hasLoaded: false,
  error: null,

  fetchBooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const books = await listBooks();
      set({ books: reconcileWithLocalFiles(books), isLoading: false, hasLoaded: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load books';
      set({ error: message, isLoading: false });
    }
  },

  setActiveBook: (bookId) => set({ activeBookId: bookId }),

  setTheme: (theme) => set({ theme }),

  setFontSize: (fontSize) => set({ fontSize }),

  addBook: (book) =>
    set((state) => ({
      books: [book, ...state.books],
    })),

  removeBook: async (bookId) => {
    const format = get().books.find((b) => b.book_id === bookId)?.format;

    await deleteBook(bookId);

    set((state) => ({
      books: state.books.filter((b) => b.book_id !== bookId),
    }));

    if (format) {
      void deleteBookFile(bookId, format);
    } else {
      log.warn('remove_book_unknown_format', { bookId });
    }
  },

  clearError: () => set({ error: null }),
}));
