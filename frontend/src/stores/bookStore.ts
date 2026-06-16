import { create } from 'zustand';
import type { Book } from '../types';
import type { ThemeName } from '../constants/themes';
import { deleteBook, listBooks } from '../services/books';
import { deleteBookFile } from '../services/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('bookStore');

interface BookStore {
  books: Book[];
  activeBookId: string | null;
  theme: ThemeName;
  isLoading: boolean;
  error: string | null;

  fetchBooks: () => Promise<void>;
  setActiveBook: (bookId: string | null) => void;
  setTheme: (theme: ThemeName) => void;
  addBook: (book: Book) => void;
  removeBook: (bookId: string) => Promise<void>;
  clearError: () => void;
}

export const useBookStore = create<BookStore>((set, get) => ({
  books: [],
  activeBookId: null,
  theme: 'dark',
  isLoading: false,
  error: null,

  fetchBooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const books = await listBooks();
      set({ books, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load books';
      set({ error: message, isLoading: false });
    }
  },

  setActiveBook: (bookId) => set({ activeBookId: bookId }),

  setTheme: (theme) => set({ theme }),

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
