import { useEffect, useState } from 'react';
import { PrivacyBanner } from './components/PrivacyNotice';
import { seedSampleDataIfNeeded } from './lib/db';
import type { Route } from './routes';
import { Dashboard } from './screens/Dashboard';
import { PracticeHistory } from './screens/PracticeHistory';
import { PracticeSession } from './screens/PracticeSession';
import { StoryLibrary } from './screens/StoryLibrary';

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'dashboard' }, label: 'Dashboard' },
  { route: { name: 'library' }, label: 'Story Library' },
  { route: { name: 'practice' }, label: 'Practice Session' },
  { route: { name: 'history' }, label: 'Practice History' },
];

type Startup = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  // Bumped on every navigation so screens always remount with fresh data.
  const [visit, setVisit] = useState(0);
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });

  useEffect(() => {
    seedSampleDataIfNeeded().then(
      () => setStartup({ status: 'ready' }),
      (error: unknown) =>
        setStartup({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  }, []);

  const navigate = (next: Route) => {
    setRoute(next);
    setVisit((v) => v + 1);
  };

  let screen;
  if (startup.status === 'loading') {
    screen = <p>Opening local storage…</p>;
  } else if (startup.status === 'error') {
    screen = (
      <div className="card">
        <h1>Local storage is unavailable</h1>
        <p className="error">{startup.message}</p>
        <p>
          Interview Lab keeps everything in this browser&apos;s IndexedDB. Some browsers disable it in
          private windows or when site data is blocked. Try a normal window, or allow site data for
          this page.
        </p>
      </div>
    );
  } else {
    switch (route.name) {
      case 'dashboard':
        screen = <Dashboard key={visit} navigate={navigate} />;
        break;
      case 'library':
        screen = <StoryLibrary key={visit} navigate={navigate} />;
        break;
      case 'practice':
        screen = <PracticeSession key={visit} navigate={navigate} initialStoryId={route.storyId} />;
        break;
      case 'history':
        screen = <PracticeHistory key={visit} />;
        break;
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            IL
          </span>
          Interview Lab
        </div>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.route.name}
              className={route.name === item.route.name ? 'nav-item active' : 'nav-item'}
              aria-current={route.name === item.route.name ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className="sidebar-note">
          <span aria-hidden>🔒</span> Data stays on this device
        </p>
      </aside>
      <main className="content">
        <PrivacyBanner />
        {screen}
      </main>
    </div>
  );
}
