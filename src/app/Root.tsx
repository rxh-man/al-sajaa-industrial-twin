import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { Landing } from '../components/landing/Landing';
import { useTwinStore } from '../store/useTwinStore';
import { I18nProvider } from '../i18n/i18nContext';

type View = 'landing' | 'twin' | 'demo';

/** the twin is the default; `#landing` shows the landing page, `#demo` plays the story */
const viewFromHash = (): View => (location.hash === '#landing' ? 'landing' : location.hash === '#demo' ? 'demo' : 'twin');

export function Root() {
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // the demo link starts the story as soon as the twin has finished its intro
  useEffect(() => {
    if (view !== 'demo') return;
    const start = () => {
      const s = useTwinStore.getState();
      if (s.boot === 'ready' && s.status === 'idle') s.run();
    };
    start();
    return useTwinStore.subscribe((s, prev) => {
      if (s.boot === 'ready' && prev.boot !== 'ready') start();
    });
  }, [view]);

  return (
    <I18nProvider>
      <MotionConfig reducedMotion="user">{view === 'landing' ? <Landing /> : <App />}</MotionConfig>
    </I18nProvider>
  );
}
