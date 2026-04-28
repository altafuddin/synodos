import { useState } from 'react';
import { View, StyleSheet, Platform, ToastAndroid, Alert } from 'react-native';
import {
  Portal,
  Dialog,
  Button,
  ActivityIndicator,
  Text,
  useTheme,
} from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { uploadBook } from '../services/books';
import { saveBookFile } from '../services/fileStorage';
import { useBookStore } from '../stores/bookStore';
import { ApiError } from '../services/api';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../constants/api';

interface UploadModalProps {
  visible: boolean;
  onDismiss: () => void;
}

type ModalState = 'idle' | 'uploading' | 'error';

const ALLOWED_PICKER_TYPES = ['application/epub+zip', 'application/pdf'];

function inferFormat(name: string): 'epub' | 'pdf' | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'epub') return 'epub';
  if (ext === 'pdf') return 'pdf';
  return null;
}

function mimeFor(format: 'epub' | 'pdf'): string {
  return format === 'epub' ? 'application/epub+zip' : 'application/pdf';
}

const FILE_TOO_LARGE_MESSAGE = `File is too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`;

function mapErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return FILE_TOO_LARGE_MESSAGE;
    if (err.status === 400) return err.message;
  }
  return 'Upload failed. Check your connection and try again.';
}

function showLocalCopyWarning() {
  const message =
    'Book uploaded but local copy failed — offline reading will redownload.';
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.LONG);
  } else {
    Alert.alert('Notice', message);
  }
}

export default function UploadModal({ visible, onDismiss }: UploadModalProps) {
  const theme = useTheme();
  const addBook = useBookStore((s) => s.addBook);
  const [state, setState] = useState<ModalState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const reset = () => {
    setState('idle');
    setErrorMsg('');
  };

  const closeModal = () => {
    reset();
    onDismiss();
  };

  const handleDismiss = () => {
    if (state === 'uploading') return;
    closeModal();
  };

  const handleChooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_PICKER_TYPES,
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const format = inferFormat(asset.name);
    if (!format) {
      setErrorMsg('Only EPUB and PDF files are supported.');
      setState('error');
      return;
    }

    if (typeof asset.size === 'number' && asset.size > MAX_UPLOAD_SIZE_BYTES) {
      setErrorMsg(FILE_TOO_LARGE_MESSAGE);
      setState('error');
      return;
    }

    setState('uploading');
    try {
      const book = await uploadBook(asset.uri, asset.name, mimeFor(format));
      try {
        await saveBookFile(asset.uri, book.book_id, book.format);
        addBook(book);
        closeModal();
      } catch {
        addBook(book);
        showLocalCopyWarning();
        closeModal();
      }
    } catch (err) {
      setErrorMsg(mapErrorMessage(err));
      setState('error');
    }
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDismiss}
        dismissable={state !== 'uploading'}
        dismissableBackButton={state !== 'uploading'}
      >
        <Dialog.Title>Add Book</Dialog.Title>
        <Dialog.Content>
          {state === 'idle' && (
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Choose an EPUB or PDF file from your device.
            </Text>
          )}
          {state === 'uploading' && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                variant="bodyMedium"
                style={[styles.uploadingLabel, { color: theme.colors.onSurface }]}
              >
                Uploading...
              </Text>
            </View>
          )}
          {state === 'error' && (
            <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
              {errorMsg}
            </Text>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          {state === 'idle' && [
            <Button key="cancel" onPress={handleDismiss}>
              Cancel
            </Button>,
            <Button key="choose" mode="contained" onPress={handleChooseFile}>
              Choose File
            </Button>,
          ]}
          {state === 'error' && [
            <Button key="close" onPress={closeModal}>
              Close
            </Button>,
            <Button key="try-again" mode="contained" onPress={reset}>
              Try Again
            </Button>,
          ]}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  uploadingLabel: {
    marginLeft: 12,
  },
});