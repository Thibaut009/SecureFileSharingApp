import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from '../firebase';

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export function uploadFile(
  file: File,
  onProgress: (progress: number) => void
): Promise<{ storagePath: string; downloadURL: string }> {
  return new Promise((resolve, reject) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      reject(new Error('Non authentifié'));
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      reject(new Error('Fichier trop volumineux (max 100 MB)'));
      return;
    }

    // Chemin isolé par UID — correspond aux règles Storage
    const storagePath = `files/${uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      (error) => reject(error),
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve({ storagePath, downloadURL });
      }
    );
  });
}

export async function deleteFile(storagePath: string) {
  await deleteObject(ref(storage, storagePath));
}
