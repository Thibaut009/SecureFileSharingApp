import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { FileMetadata } from '../types';

export async function saveFileMetadata(data: {
  name: string;
  size: number;
  contentType: string;
  storagePath: string;
  downloadURL: string;
  expiresInDays?: number;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non authentifié');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays ?? 7));

  const docRef = await addDoc(collection(db, 'files'), {
    name: data.name,
    size: data.size,
    contentType: data.contentType,
    storagePath: data.storagePath,
    downloadURL: data.downloadURL,
    ownerId: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    accessCount: 0,
  });

  return docRef.id;
}

export async function getUserFiles(): Promise<FileMetadata[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(
    collection(db, 'files'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as FileMetadata[];
}

export async function deleteFileMetadata(fileId: string) {
  await deleteDoc(doc(db, 'files', fileId));
}
