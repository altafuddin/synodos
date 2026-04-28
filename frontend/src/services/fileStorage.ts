import { Directory, File, Paths } from 'expo-file-system';

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
    console.warn(`Failed to delete local book file ${bookId}.${format}:`, err);
  }
}
