import { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { saveServerConfig, checkServerConnection } from '../api/serverConfig';

interface Props {
  onLogin: (user: string) => void;
  bgImages: string[];
}

const USERS_KEY = 'dbms_users';

export function loadUsers(): Record<string, string> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { CommercialBLDG: 'camary' };
}

export function saveUsers(users: Record<string, string>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function LoginPage({ onLogin, bgImages }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [bgIdx, setBgIdx] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (bgImages.length <= 1) return;
    const iv = setInterval(() => setBgIdx(i => (i + 1) % bgImages.length), 4000);
    return () => clearInterval(iv);
  }, [bgImages.length]);

  const handleCheckConnection = async () => {
    setError('');

    if (!ip.trim() || !port.trim()) {
      setError('Server IP and port are required.');
      setStatus('');
      return;
    }

    setIsChecking(true);
    setStatus(`Checking server ${ip.trim()}:${port.trim()}...`);

    try {
      await checkServerConnection({ ip: ip.trim(), port: port.trim() });
      saveServerConfig({ ip: ip.trim(), port: port.trim() });
      setStatus(`Connection successful to ${ip.trim()}:${port.trim()}`);
    } catch (error) {
      setStatus('');
      setError(`Unable to reach server at ${ip.trim()}:${port.trim()}. ${(error as Error).message}`);
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ip.trim() || !port.trim()) {
      setError('Server IP and port are required.');
      return;
    }

    setIsChecking(true);
    setStatus(`Checking server ${ip.trim()}:${port.trim()}...`);

    try {
      await checkServerConnection({ ip: ip.trim(), port: port.trim() });
      saveServerConfig({ ip: ip.trim(), port: port.trim() });

      const users = loadUsers();
      if (users[username] === password) {
        onLogin(username);
      } else {
        setError('Invalid username or password.');
      }
    } catch (error) {
      setError(`Unable to reach server at ${ip.trim()}:${port.trim()}. ${(error as Error).message}`);
    } finally {
      setIsChecking(false);
      setStatus('');
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden">
      {bgImages.map((img, i) => (
        <div key={i} className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{ backgroundImage: `url(${img})`, opacity: i === bgIdx ? 1 : 0 }} />
      ))}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-blue-900 px-8 py-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 bg-white/20 rounded-2xl overflow-hidden">
                <Logo className="w-full h-full" />
              </div>
            </div>
            <h1 className="text-white text-xl font-bold">Commercial Unit Leasing Management System</h1>
          </div>

          <form onSubmit={handleLogin} className="px-8 py-6 space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Server IP</label>
              <input
                type="text"
                value={ip}
                onChange={e => { setIp(e.target.value); setError(''); setStatus(''); }}
                onBlur={() => {
                  if (ip.trim() && port.trim()) saveServerConfig({ ip: ip.trim(), port: port.trim() });
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 192.168.0.10"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Server Port</label>
              <input
                type="text"
                value={port}
                onChange={e => { setPort(e.target.value); setError(''); setStatus(''); }}
                onBlur={() => {
                  if (ip.trim() && port.trim()) saveServerConfig({ ip: ip.trim(), port: port.trim() });
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 3001"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1"></div>
              <button
                type="button"
                onClick={handleCheckConnection}
                disabled={isChecking}
                className="rounded-lg bg-blue-100 text-blue-800 px-4 py-2 text-sm font-medium hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChecking ? 'Checking...' : 'Check Connection'}
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); } }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Password</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {status && <p className="text-blue-600 text-sm text-center">{status}</p>}
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button type="submit"
              disabled={isChecking}
              className="w-full bg-blue-900 text-white rounded-lg py-2.5 text-sm hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isChecking ? 'Checking connection...' : 'Sign In'}
            </button>
            <p className="text-center text-xs text-gray-400">Authorized personnel only</p>
          </form>
        </div>
      </div>
    </div>
  );
}
