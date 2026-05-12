import { useEffect } from 'react';
import { FileCard } from './FileCard';
import type { FileMetadata } from '../../types';

interface FileListProps {
  files: FileMetadata[];
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  onGetSignedUrl: (fileId: string) => Promise<string>;
  onDelete: (file: FileMetadata) => Promise<void>;
}

export function FileList({ files, loading, error, onLoad, onGetSignedUrl, onDelete }: FileListProps) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

  if (loading) {
    return <div className="state-message">Chargement de vos fichiers…</div>;
  }

  if (error) {
    return (
      <div className="state-message error-text">
        Erreur : {error}
        <button className="btn-ghost" onClick={onLoad}>Réessayer</button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="state-message empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
        <p>Aucun fichier pour l'instant.<br />Uploadez votre premier fichier ci-dessus.</p>
      </div>
    );
  }

  return (
    <div className="file-list">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onGetSignedUrl={onGetSignedUrl}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
