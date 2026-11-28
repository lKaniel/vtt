import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/400-italic.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/im-fell-english-sc/400.css';
import { App } from './ui/App.tsx';
import { errorCapture } from './session/error-capture.ts';
import './index.css';

// From the first moment, so an error while the page starts still reaches the GM's error log.
errorCapture.install(window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
