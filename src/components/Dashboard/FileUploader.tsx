import { useState, useRef, DragEvent, ChangeEvent } from 'react';

interface FileUploaderProps {
  onUpload: (file: File, expiresInDays: number) => Promise<void>;
  uploading: boolean;
  progress: number;
}

export function FileUploader({ onUpload, uploading, progress }: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file, expiresInDays);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file, expiresInDays);
    e.target.value = '';
  }

  return (
    <div className="uploader-section">
      <div className="uploader-controls">
        <label htmlFor="expires">Expiration du lien :</label>
        <select
          id="expires"
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value))}
          disabled={uploading}
        >
          <option value={1}>1 jour</option>
          <option value={3}>3 jours</option>
          <option value={7}>7 jours</option>
          <option value={30}>30 jours</option>
        </select>
      </div>

      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleChange}
          disabled={uploading}
        />
        {uploading ? (
          <div className="upload-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span>{Math.round(progress)}%</span>
          </div>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Glissez un fichier ici ou <strong>cliquez pour parcourir</strong></p>
            <span className="drop-hint">Taille max : 100 MB</span>
          </>
        )}
      </div>
    </div>
  );
}
