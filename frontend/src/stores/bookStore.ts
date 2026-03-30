import { create } from 'zustand';
import type { Book } from '../types';
import type { ThemeName } from '../constants/themes';
import { listBooks } from '../services/books';

interface BookStore {
  books: Book[];
  activeBookId: string | null;
  theme: ThemeName;
  isLoading: boolean;
  error: string | null;

  fetchBooks: () => Promise<void>;
  setActiveBook: (bookId: string | null) => void;
  setTheme: (theme: ThemeName) => void;
  removeBook: (bookId: string) => void;
  clearError: () => void;
}

export const useBookStore = create<BookStore>((set) => ({
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

  removeBook: (bookId) =>
    set((state) => ({
      books: state.books.filter((b) => b.book_id !== bookId),
    })),

  clearError: () => set({ error: null }),
}));
