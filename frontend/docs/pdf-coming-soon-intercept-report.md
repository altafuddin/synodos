# Synodos — "PDF reader coming soon" intercept (read-only investigation)

## Symptom

Tapping a PDF book shows a snackbar "PDF reader coming soon" instead of opening
the reader. EPUB navigates fine.

## Scope

Read-only. No code changed. Goal: locate the guard so the PDF fix can mirror the
EPUB tap path.

## 1. Grep hits

- `"coming soon"` → **`src/app/index.tsx:90`** — `PDF reader coming soon`
- `"PDF reader"` → **`src/app/index.tsx:90`** (same line)

No other matches in `src/`. The intercept lives entirely in `src/app/index.tsx`
(the Library screen). `LibraryCard.tsx` only renders the card and forwards its
`onPress` — it has no routing/format guard. Its `book.format === 'epub'` check
(`LibraryCard.tsx:13`) is purely for the badge color, not navigation.

## 2. The intercept — `src/app/index.tsx` (verbatim)

**Tap handler deciding navigate vs banner** (`index.tsx:21-32`):

```tsx
const renderItem = ({ item }: { item: Book }) => (
  <LibraryCard
    book={item}
    onPress={() => {
      if (item.format === 'epub') {
        router.push(`/reader/${item.book_id}`);
      } else {
        setSnackbarVisible(true);
      }
    }}
  />
);
```

**Exact format check** (`index.tsx:25-29`):

```tsx
if (item.format === 'epub') {
  router.push(`/reader/${item.book_id}`);
} else {
  setSnackbarVisible(true);
}
```

This is a **whitelist on `'epub'`**, not a blacklist on `'pdf'` — anything that
isn't exactly `'epub'` (i.e. `'pdf'`) falls into the `else` and triggers the
snackbar. That `else` branch is the guard to remove.

**Snackbar mechanism:** Paper `Snackbar` driven by a `useState` boolean flag
(`index.tsx:3` import, `:15` state, `:85-91` render):

```tsx
const [snackbarVisible, setSnackbarVisible] = useState(false);
...
<Snackbar
  visible={snackbarVisible}
  onDismiss={() => setSnackbarVisible(false)}
  duration={3000}
>
  PDF reader coming soon
</Snackbar>
```

`setSnackbarVisible(true)` in the `else` branch is the only trigger;
auto-dismisses after 3000ms.

## 3. EPUB tap path (to mirror for the PDF fix)

- **Route pushed:** `router.push(\`/reader/${item.book_id}\`)` — the Expo Router
  dynamic route `src/app/reader/[bookId].tsx`.
- **Params:** the `book_id` (backend UUID string) is passed as the `bookId` path
  segment — no query params, no extra state. The reader screen reads it via
  `useLocalSearchParams<{ bookId: string }>()` and itself branches EPUB vs PDF on
  `bookDetail.format` (already format-aware from Layer 5a).

## Fix direction (not applied)

Collapse the `else { setSnackbarVisible(true) }` branch so PDF takes the same
`router.push(\`/reader/${item.book_id}\`)` path. The reader screen already handles
the PDF format, so no other wiring is needed. The now-unused `snackbarVisible`
state and `<Snackbar>` can be removed once the branch is gone.