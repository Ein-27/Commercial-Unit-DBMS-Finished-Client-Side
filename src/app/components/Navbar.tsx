import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Section } from '../data/types';
import { Logo } from './Logo';
import { getApiUrl } from '../api/serverConfig';

const NAV_ITEMS: { id: Section; label: string; icon: ReactNode }[] = [
  {
    id: 'dashboard', label: 'Dashboard',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    id: 'sales', label: 'Sales',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  },
  {
    id: 'lessees', label: 'Lessees',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    id: 'history', label: 'History',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
];

interface Props {
  currentSection: Section;
  onNavigate: (section: Section) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  currentUser: string;
}

interface ServerInfo {
  host: string;
  port: number;
  bindHost: string;
  url: string;
}

export function Navbar({ currentSection, onNavigate, onLogout, onOpenSettings, currentUser }: Props) {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [serverInfoError, setServerInfoError] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchServerInfo = async () => {
      try {
        const response = await fetch(getApiUrl('/api/server-info'), { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Server info request failed with ${response.status}`);
        const payload = await response.json() as ServerInfo;
        if (active) {
          setServerInfo(payload);
          setServerInfoError(false);
        }
      } catch (error) {
        console.warn('Server info lookup failed', error);
        if (active) {
          setServerInfoError(true);
        }
      }
    };

    void fetchServerInfo();
    const intervalId = window.setInterval(() => {
      void fetchServerInfo();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-blue-900 shadow-lg h-14 flex items-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-6">
        <div className="w-8 h-8 bg-white/20 rounded-lg overflow-hidden">
          <Logo className="w-full h-full" />
        </div>
        <span className="text-white font-semibold text-sm hidden sm:block leading-tight text-center whitespace-nowrap">
          Commercial Unit Leasing<br />DBMS
        </span>
      </div>

      {/* Nav items */}
      <div className="flex items-center gap-1 flex-1">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${currentSection === item.id ? 'bg-white text-blue-900 font-semibold' : 'text-blue-100 hover:bg-blue-800 hover:text-white'}`}>
            {item.icon}
            <span className="hidden sm:block">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Right side: server info + user + settings + logout */}
      <div className="flex items-center gap-1">
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-blue-700/60 bg-blue-800/60 px-3 py-1 mr-2 text-[11px] text-blue-100 shrink-0" title={serverInfo?.url ?? 'Waiting for server info'}>
          <span className={`h-2.5 w-2.5 rounded-full ${serverInfoError ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <span className="font-mono">
            {serverInfo ? `${serverInfo.host}:${serverInfo.port}` : 'Detecting...'}
          </span>
        </div>

        <span className="text-blue-300 text-xs hidden md:block mr-2">{currentUser}</span>

        {/* Settings gear */}
        <button onClick={onOpenSettings}
          className="flex items-center gap-1.5 text-sm text-blue-200 hover:text-white hover:bg-blue-800 px-3 py-1.5 rounded-lg transition-colors"
          title="Settings">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden md:block">Settings</span>
        </button>

        {/* Logout */}
        <button onClick={onLogout}
          className="flex items-center gap-1.5 text-sm text-red-300 hover:text-red-100 hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:block">Logout</span>
        </button>
      </div>
    </nav>
  );
}
