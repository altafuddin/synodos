import { Directory, File, Paths } from 'expo-file-system';
import { createLogger } from '../utils/logger';

const log = createLogger('fileStorage');

const BOOKS_SUBDIR = 'books';

function booksDirectory(): Directory {
  return new Directory(Paths.document, BOOKS_SUBDIR);
}

export function getBookFileUri(bookId: string, format: 'epub' | 'pdf'): string {
  return new File(booksDirectory(), `${bookId}.${format}`).uri;
}

export async function saveBookFile(
  sourceUri: string,
  bookId: string,
  format: 'epub' | 'pdf'
): Promise<string> {
  const dir = booksDirectory();
  dir.create({ intermediates: true, idempotent: true });

  const destination = new File(dir, `${bookId}.${format}`);
  const source = new File(sourceUri);
  source.copy(destination);

  return destination.uri;
}

// Enumerate the on-device book files ({bookId}.{epub|pdf} under books/).
// Unrecognized filenames are ignored. Returns [] if the dir doesn't exist yet.
export function listLocalBookFiles(): { bookId: string; format: 'epub' | 'pdf' }[] {
  try {
    const dir = booksDirectory();
    if (!dir.exists) return [];
    const entries: { bookId: string; format: 'epub' | 'pdf' }[] = [];
    for (const item of dir.list()) {
      if (item instanceof Directory) continue;
      const match = /^(.+)\.(epub|pdf)$/.exec(item.name);
      if (match) {
        entries.push({ bookId: match[1], format: match[2] as 'epub' | 'pdf' });
      }
    }
    return entries;
  } catch (err) {
    log.warn('local_list_failed', { error: String(err) });
    return [];
  }
}

export async function deleteBookFile(
  bookId: string,
  format: 'epub' | 'pdf'
): Promise<void> {
  try {
    const file = new File(getBookFileUri(bookId, format));
    if (file.exists) {
      file.delete();
    }
  } catch (err) {
    log.warn('local_file_delete_failed', { bookId, format, error: String(err) });
  }
}
