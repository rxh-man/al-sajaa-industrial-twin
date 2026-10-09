import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { Landing } from '../components/landing/Landing';
import { useTwinStore } from '../store/useTwinStore';

type View = 'landing' | 'twin' | 'demo';

const viewFromHash = (): View => (location.hash === '#twin' ? 'twin' : location.hash === '#demo' ? 'demo' : 'landing');

/** `#twin` opens the 3D twin, `#demo` opens it and plays the story, anything else is the landing page. */
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

  return <MotionConfig reducedMotion="user">{view === 'landing' ? <Landing /> : <App />}</MotionConfig>;
}
