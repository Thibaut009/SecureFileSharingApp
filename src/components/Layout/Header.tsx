import type { User } from 'firebase/auth';
import { logout } from '../../services/auth';

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>SecureShare</span>
        </div>
        <div className="header-user">
          <span className="user-name">{user.displayName || user.email}</span>
          <button className="btn-ghost" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
