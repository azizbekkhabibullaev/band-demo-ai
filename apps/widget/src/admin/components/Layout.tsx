import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.ts';

const NAV = [
  { to: '/admin',               label: 'Dashboard',     icon: '🏠', exact: true },
  { to: '/admin/conversations',  label: 'Conversations', icon: '💬' },
  { to: '/admin/trends',        label: 'Trends',        icon: '📈' },
  { to: '/admin/complaints',    label: 'Complaints',    icon: '⚠️' },
  { to: '/admin/intents',       label: 'Intents',       icon: '🎯' },
  { to: '/admin/leads',         label: 'Leads',         icon: '📞' },
  { to: '/admin/escalations',   label: 'Escalations',   icon: '🚨' },
  { to: '/admin/insights',      label: 'AI Insights',   icon: '🧠' },
  { to: '/admin/settings',      label: 'Settings',      icon: '⚙️' },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export function AdminLayout({ children, title }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  return (
    <div className="flex h-screen bg-[#0f1117] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[#111318]">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
              <span className="text-[11px] font-bold text-white">IB</span>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-white leading-tight">Ipoteka Bank</div>
              <div className="text-[9px] text-white/40 font-medium tracking-wide uppercase">Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
          {NAV.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => [
                'flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-[12.5px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]',
              ].join(' ')}
            >
              <span className="text-[14px] leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/[0.06]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all duration-150"
          >
            <span>🚪</span> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-12 flex items-center px-6 border-b border-white/[0.06] bg-[#111318]">
          <h1 className="text-[13px] font-semibold text-white/70">{title ?? 'Admin'}</h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] text-white/30 font-mono">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
