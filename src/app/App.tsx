import { useEffect, useState, useCallback } from 'react';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { Sales } from './components/Sales';
import { Lessees } from './components/Lessees';
import { History } from './components/History';
import { Settings } from './components/Settings';
import { createEmptyAppData, loadData, normalizeAutomaticMonthEntries, saveData } from './data/store';
import type { Section, AppData } from './data/types';

export default function App() {
  const [user, setUser] = useState<string | null>(() => sessionStorage.getItem('dbms_user'));
  const [section, setSection] = useState<Section>('dashboard');
  const [data, setData] = useState<AppData>(() => createEmptyAppData());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    loadData()
      .then(loaded => {
        if (active) setData(loaded);
      })
      .catch(error => {
        console.error('Failed to load data from remote server', error);
        if (active) setData(createEmptyAppData());
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleDataUpdate = useCallback(async (newData: AppData) => {
    const normalized = normalizeAutomaticMonthEntries(newData);
    setData(normalized);
    try {
      await saveData(normalized);
    } catch (error) {
      console.error('Failed to save data to SQL backend', error);
    }
  }, []);

  const handleLogin = (u: string) => {
    sessionStorage.setItem('dbms_user', u);
    setUser(u);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('dbms_user');
    setUser(null);
    setSettingsOpen(false);
  };

  const bgImages = data.locations
    .map(location => location.imageUrl)
    .filter(Boolean)
    .concat(data.sharedBackgroundImage ? [data.sharedBackgroundImage] : []);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading data...</div>;
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} bgImages={bgImages} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar
        currentSection={section}
        onNavigate={setSection}
        onLogout={handleLogout}
        onOpenSettings={() => setSettingsOpen(true)}
        currentUser={user}
      />

      <main className="pt-14">
        {section === 'dashboard' && <Dashboard data={data} bgImages={bgImages} />}
        {section === 'sales' && <Sales data={data} onUpdateData={handleDataUpdate} />}
        {section === 'lessees' && <Lessees data={data} onUpdateData={handleDataUpdate} />}
        {section === 'history' && <History data={data} onUpdateData={handleDataUpdate} />}
      </main>

      {settingsOpen && (
        <Settings
          data={data}
          onUpdateData={handleDataUpdate}
          onClose={() => setSettingsOpen(false)}
          onSwitchAccount={handleLogout}
        />
      )}
    </div>
  );
}
