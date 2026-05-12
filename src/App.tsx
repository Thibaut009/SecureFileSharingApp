import { useAuth } from './hooks/useAuth';
import { useFiles } from './hooks/useFiles';
import { AuthPage } from './components/Auth/AuthPage';
import { Header } from './components/Layout/Header';
import { FileUploader } from './components/Dashboard/FileUploader';
import { FileList } from './components/Dashboard/FileList';

function Dashboard() {
  const {
    files, uploading, uploadProgress, loading, error,
    fetchFiles, upload, getSignedUrl, remove,
  } = useFiles();

  async function handleUpload(file: File, expiresInDays: number) {
    try {
      await upload(file, expiresInDays);
    } catch {
      // error surfaced via hook state
    }
  }

  return (
    <main className="dashboard">
      <section className="dashboard-section">
        <h2>Uploader un fichier</h2>
        <FileUploader onUpload={handleUpload} uploading={uploading} progress={uploadProgress} />
      </section>

      <section className="dashboard-section">
        <div className="section-header">
          <h2>Mes fichiers</h2>
          <button className="btn-ghost" onClick={fetchFiles} disabled={loading}>
            Actualiser
          </button>
        </div>
        <FileList
          files={files}
          loading={loading}
          error={error}
          onLoad={fetchFiles}
          onGetSignedUrl={getSignedUrl}
          onDelete={remove}
        />
      </section>
    </main>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <div className="app">
      <Header user={user} />
      <Dashboard />
    </div>
  );
}
