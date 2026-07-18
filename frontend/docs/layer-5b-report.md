# Synodos — Layer 5b: Real react-native-pdf render + page nav

## Scope

Replace the ReaderPdf placeholder with a working `react-native-pdf` render plus
built-in page navigation. **No** progress reporting, **no** resume (that's 5c).
Adds a native dependency → **requires a custom dev-build rebuild** before it runs.

Touched: `frontend/src/components/ReaderPdf.tsx` only.
Not touched: `[bookId].tsx`, `useReader`, `progress.ts`, backend.

## Full `frontend/src/components/ReaderPdf.tsx`

```tsx
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import Pdf from 'react-native-pdf';
import { createLogger } from '../utils/logger';

const log = createLogger('ReaderPdf');

type ReaderPdfProps = {
  bookId: string;
  fileUrl: string;
};

export default function ReaderPdf({ bookId, fileUrl }: ReaderPdfProps) {
  const theme = useTheme();
  // Current page (1-based, from react-native-pdf). Not reported yet — 5c.
  const [, setCurrentPage] = useState(1);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Pdf
        source={{ uri: fileUrl }}
        style={[styles.pdf, { backgroundColor: theme.colors.background }]}
        onLoadComplete={(numberOfPages) => {
          log.info('pdf_loaded', { numberOfPages });
        }}
        onPageChanged={(page, numberOfPages) => {
          setCurrentPage(page);
          log.debug('pdf_page_changed', { page, numberOfPages });
        }}
        onError={(error) => {
          log.warn('pdf_error', { error: String(error) });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
});
```

Notes:
- Props unchanged `{ bookId, fileUrl }`. `bookId` is retained in the signature
  (unused for now — it lands in 5c's `page_N` progress mapping).
- Current page tracked via `setCurrentPage`; state value intentionally unread
  ("track but don't report" rule). Built-in page nav (swipe/scroll) comes free
  from `<Pdf>`.
- All three callbacks log via `createLogger('ReaderPdf')`. `onPageChanged` is
  logged 1-based, no `page_N` mapping yet.
- `tsc --noEmit` passes clean.

## Source-URI finding

- **`file://` URI is correct — not a bare path.** `react-native-pdf`'s
  `source.uri` expects a URI scheme. Our `fileUrl` comes from
  `getBookFileUri(bookId, 'pdf')` → `new File(...).uri`, which yields a
  `file:///data/.../<bookId>.pdf` URI (expo-file-system always returns
  `file://`). On Android the library handles `file://` natively; a bare
  `/data/...` path is not reliably accepted — keep the `file://` form.
- **No `trustAllCerts` needed.** That prop only affects HTTPS network sources
  (TLS cert validation). Irrelevant for a local file — leave it off.
- **No special Android prop required** for a local file. The library reads via
  Android's native `PdfRenderer`; `expo-build-properties` `minSdkVersion: 24`
  already satisfies `PdfRenderer` (API 21+). `withCleartextTraffic` (already in
  app.json) only matters for remote `http://` URLs and doesn't apply here.

## Rebuild command (required — new native dependency)

```bash
cd frontend
eas build --platform android --profile development
```

Then install the resulting APK on the device and resume with
`npx expo start --dev-client`. Until the rebuild is installed, the JS references
a native module absent from the current dev client and the PDF view errors at
runtime.