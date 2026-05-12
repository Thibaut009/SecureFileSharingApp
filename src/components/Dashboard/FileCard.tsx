import { useState } from 'react';
import type { FileMetadata } from '../../types';

interface FileCardProps {
  file: FileMetadata;
  onGetSignedUrl: (fileId: string) => Promise<string>;
  onDelete: (file: FileMetadata) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: { toDate(): Date } | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function isExpired(ts: { toDate(): Date } | null): boolean {
  if (!ts) return false;
  return ts.toDate() < new Date();
}

export function FileCard({ file, onGetSignedUrl, onDelete }: FileCardProps) {
  const [signedUrl, setSignedUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const expired = isExpired(file.expiresAt);

  async function handleGetUrl() {
    setLoadingUrl(true);
    setError('');
    try {
      const url = await onGetSignedUrl(file.id);
      setSignedUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingUrl(false);
    }
  }

  async function handleCopy() {
    if (!signedUrl) return;
    await navigator.clipboard.writeText(signedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    if (!confirm(`Supprimer "${file.name}" ?`)) return;
    setDeleting(true);
    await onDelete(file);
  }

  return (
    <div className={`file-card ${expired ? 'expired' : ''}`}>
      <div className="file-card-header">
        <div className="file-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        </div>
        <div className="file-info">
          <p className="file-name" title={file.name}>{file.name}</p>
          <p className="file-meta">
            {formatBytes(file.size)} · {file.contentType.split('/')[1] || file.contentType}
          </p>
        </div>
        {expired && <span className="badge-expired">Expiré</span>}
      </div>

      <div className="file-card-body">
        <div className="file-stats">
          <span>Ajouté le {formatDate(file.createdAt)}</span>
          <span>Expire le {formatDate(file.expiresAt)}</span>
          <span>{file.accessCount} accès</span>
        </div>

        {signedUrl && (
          <div className="signed-url-box">
            <input type="text" readOnly value={signedUrl} />
            <button className="btn-icon" onClick={handleCopy} title="Copier">
              {copied ? '✓' : '⧉'}
            </button>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="file-card-actions">
        <button
          className="btn-secondary"
          onClick={handleGetUrl}
          disabled={loadingUrl || expired}
        >
          {loadingUrl ? '…' : 'Obtenir le lien'}
        </button>
        <button
          className="btn-danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? '…' : 'Supprimer'}
        </button>
      </div>
    </div>
  );
}
