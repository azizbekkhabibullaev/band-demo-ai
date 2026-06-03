import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.ts';

function useAdminMode() {
  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);
}

export function LoginPage() {
  useAdminMode();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, authenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authenticated) navigate('/admin', { replace: true });
  }, [authenticated, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      navigate('/admin', { replace: true });
    } else {
      setError('Invalid credentials. Check your username and password.');
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#2563eb,transparent)' }} />
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle,#7c3aed,transparent)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-xl"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
              <path d="M12 3L14 9H20L15 13L17 19L12 15L7 19L9 13L4 9H10L12 3Z"
                fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Banking Intelligence</h1>
          <p className="text-[12px] text-white/40 mt-1">Admin Platform · Ipoteka Bank</p>
        </div>

        {/* Card */}
        <div className="bg-[#161b27] rounded-2xl border border-white/[0.08] p-6 shadow-2xl">
          <h2 className="text-[15px] font-semibold text-white mb-1">Sign in to continue</h2>
          <p className="text-[12px] text-white/40 mb-5">Enter your admin credentials</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08]
                  text-white text-[13px] placeholder-white/20 outline-none
                  focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08]
                  text-white text-[13px] placeholder-white/20 outline-none
                  focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all"
                required
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-white text-[13px] font-semibold
                disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-white/20 mt-4">
          Banking Intelligence Platform · v2.0
        </p>
      </div>
    </div>
  );
}
