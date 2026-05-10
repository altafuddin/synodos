import { apiFetch } from './api';

export async function reportProgress(
  bookId: string,
  unitId: string,
  scrollPct: number
): Promise<void> {
  await apiFetch<unknown>(`/api/books/${bookId}/progress`, {
    method: 'POST',
    body: JSON.stringify({ unit_id: unitId, scroll_pct: scrollPct }),
  });
}