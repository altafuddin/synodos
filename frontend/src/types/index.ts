export interface Book {
  id: string;
  title: string;
  author: string;
  format: 'epub' | 'pdf';
  total_units: number;
  created_at: string;
  read_positions: Record<string, number>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ReadPositions {
  [unit_id: string]: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface ProgressPayload {
  unit_id: string;
  scroll_pct: number;
}