import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/instrument-sans';
import '@fontsource/fragment-mono';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/global.css';
import { Root } from './app/Root';

createRoot(document.getElementById('root')!).render(<Root />);
