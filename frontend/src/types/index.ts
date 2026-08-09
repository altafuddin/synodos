export interface Book {
  book_id: string;
  title: string;
  author: string | null;
  format: 'epub' | 'pdf';
  total_units: number;
  uploaded_at: string;
  last_read_at: string | null;
  // Client-side only — set by the store's local-file reconciliation, never
  // returned by the server. undefined = not yet checked; false = the local
  // copy is gone and the book can't be opened on this device.
  hasLocalFile?: boolean;
}

export interface BookDetail extends Book {
  current_position: string | null;
  current_progression: number | null;
  read_positions: ReadPositions;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ReadPositions {
  [unit_id: string]: number;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface ProgressPayload {
  unit_id: string;
  scroll_pct: number;
}

export interface LocatorLocations {
  progression: number;
  position?: number;
  totalProgression?: number;
}

export interface Locator {
  href: string;
  type: string;
  title?: string;
  locations?: LocatorLocations;
}