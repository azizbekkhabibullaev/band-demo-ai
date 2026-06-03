import { useState, useEffect } from 'react';
import { verifyToken, login as apiLogin } from '../api/client.ts';

export function useAuth() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const tok = localStorage.getItem('admin_token');
    if (!tok) { setAuthenticated(false); return; }
    verifyToken().then(ok => setAuthenticated(ok));
  }, []);

  async function login(username: string, password: string): Promise<boolean> {
    try {
      const res = await apiLogin(username, password);
      localStorage.setItem('admin_token', res.token);
      localStorage.setItem('admin_tenant', res.tenant);
      setAuthenticated(true);
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_tenant');
    setAuthenticated(false);
  }

  return { authenticated, login, logout };
}
