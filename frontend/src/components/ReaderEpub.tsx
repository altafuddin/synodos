import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ReadiumView,
  type ReadiumViewRef,
  type Preferences,
} from 'react-native-readium';
import type { Locator } from '../types';
import { useReader } from '../hooks/useReader';
import { useBookStore } from '../stores/bookStore';

type ReaderEpubProps = {
  bookId: string;
  fileUrl: string;
  initialLocator?: Locator;
};

const ReaderEpub = forwardRef<ReadiumViewRef, ReaderEpubProps>(
  ({ bookId, fileUrl, initialLocator }, ref) => {
    const innerRef = useRef<ReadiumViewRef>(null);
    const theme = useBookStore((s) => s.theme);
    const { handleLocationChange, handlePublicationReady } = useReader(bookId);

    useImperativeHandle(
      ref,
      () => ({
        goTo: (locator) => innerRef.current?.goTo(locator),
        goForward: () => innerRef.current?.goForward(),
        goBackward: () => innerRef.current?.goBackward(),
      }),
      []
    );

    const preferences: Preferences = { theme };

    console.log('[Synodos] ReaderEpub mounting with fileUrl:', fileUrl);

    return (
      <View style={styles.container}>
        <ReadiumView
          ref={innerRef}
          style={styles.reader}
          file={{ url: fileUrl, initialLocation: initialLocator }}
          preferences={preferences}
          onLocationChange={handleLocationChange}
          onPublicationReady={handlePublicationReady}
        />
      </View>
    );
  }
);

ReaderEpub.displayName = 'ReaderEpub';

export default ReaderEpub;

const styles = StyleSheet.create({
  container: { flex: 1 },
  reader: { flex: 1
  },
});