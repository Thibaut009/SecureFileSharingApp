import { Timestamp } from 'firebase/firestore';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  contentType: string;
  ownerId: string;
  storagePath: string;
  downloadURL: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  accessCount: number;
  lastAccessedAt?: Timestamp;
}

export interface UploadState {
  progress: number;
  uploading: boolean;
  error: string | null;
}
