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
//
// Mass-wipe guard: a successful GET /api/books that returns [] is
// indistinguishable from a genuinely empty library, and the backend keeps no
// copy of the original file — so wiping every local file on the strength of
// one empty response is unrecoverable (Phase 2 makes this real: mid-migration,
// before user_id is assigned, the endpoint legitimately returns 200 [] for a
// user who has books). So if the orphan count equals the total local file
// count AND at least one local file exists, all deletion is skipped and a warn
// line records both counts. Any smaller orphan set — some local files still
// match a server record — deletes as before, so a library the user emptied one
// book at a time through the app still gets cleaned up. The hasLocalFile
// mapping runs in both cases; the guard skips deletion only, not reconciliation.
function reconcileWithLocalFiles(books: Book[]): Book[] {
  try {
    const local = listLocalBookFiles();
    const localKeys = new Set(local.map((f) => `${f.bookId}.${f.format}`));
    const serverKeys = new Set(books.map((b) => `${b.book_id}.${b.format}`));

    const orphans = local.filter(
      (file) => !serverKeys.has(`${file.bookId}.${file.format}`)
    );

    if (local.length > 0 && orphans.length === local.length) {
      log.warn('local_reconcile_mass_wipe_skipped', {
        orphanCount: orphans.length,
        localCount: local.length,
      });
    } else {
      for (const file of orphans) {
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
