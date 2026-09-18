import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/plus-jakarta-sans/wght-italic.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

const root = document.getElementById('root');

if (!root) throw new Error('Application root is missing.');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
