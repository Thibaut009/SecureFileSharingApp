import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { uploadFile, deleteFile } from '../services/storage';
import { saveFileMetadata, getUserFiles, deleteFileMetadata } from '../services/firestore';
import type { FileMetadata } from '../types';

export function useFiles() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserFiles();
      setFiles(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const upload = useCallback(
    async (file: File, expiresInDays = 7) => {
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      try {
        const { storagePath, downloadURL } = await uploadFile(file, setUploadProgress);
        await saveFileMetadata({
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          storagePath,
          downloadURL,
          expiresInDays,
        });
        await fetchFiles();
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [fetchFiles]
  );

  // Appelle la Cloud Function pour obtenir une URL signée sécurisée (TTL 1h)
  const getSignedUrl = useCallback(async (fileId: string): Promise<string> => {
    const fn = httpsCallable<{ fileId: string }, { signedUrl: string }>(
      functions,
      'generateSignedUrl'
    );
    const result = await fn({ fileId });
    return result.data.signedUrl;
  }, []);

  const remove = useCallback(async (file: FileMetadata) => {
    setError(null);
    try {
      await deleteFile(file.storagePath);
      await deleteFileMetadata(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  return { files, uploading, uploadProgress, loading, error, fetchFiles, upload, getSignedUrl, remove };
}
