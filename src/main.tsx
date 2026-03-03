import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Interceptar fetch para redirigir las peticiones al backend en producción
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (typeof input === 'string' && (input.startsWith('/api/') || input.startsWith('/uploads/'))) {
    input = apiUrl + input;
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
