import { apiFetch } from './api';
import type { Book, BookDetail } from '../types';

type BookUploadResponse = {
  book_id: string;
  title: string;
  author: string | null;
  format: 'epub' | 'pdf';
  total_units: number;
  uploaded_at: string;
};

export async function listBooks(): Promise<Book[]> {
  return apiFetch<Book[]>('/api/books');
}

export async function uploadBook(
  fileUri: string,
  fileName: string,
  mimeType: string
): Promise<Book> {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const response = await apiFetch<BookUploadResponse>('/api/books', {
    method: 'POST',
    body: formData,
  });

  return { ...response, last_read_at: null };
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
