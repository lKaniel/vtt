import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/400-italic.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import { App } from './ui/App.tsx';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
