import { apiFetch } from './api';
import type { Book, BookDetail } from '../types';

export async function listBooks(): Promise<Book[]> {
  return apiFetch<Book[]>('/api/books');
}

export async function getBook(bookId: string): Promise<BookDetail> {
  return apiFetch<BookDetail>(`/api/books/${bookId}`);
}

export async function deleteBook(bookId: string): Promise<void> {
  return apiFetch<void>(`/api/books/${bookId}`, { method: 'DELETE' });
}

export async function patchBook(
  bookId: string,
  updates: { title?: string; author?: string }
): Promise<Book> {
  return apiFetch<Book>(`/api/books/${bookId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}
