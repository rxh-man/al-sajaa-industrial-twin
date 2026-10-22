import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/instrument-sans';
import '@fontsource/fragment-mono';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/global.css';
import { Root } from './app/Root';

// Startup timestamps (performance.mark). Read them with performance.getEntriesByType('mark').
performance.mark('app:module-start');
createRoot(document.getElementById('root')!).render(<Root />);
performance.mark('app:render-called');
