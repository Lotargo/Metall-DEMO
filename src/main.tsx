import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './handbook-surfaces.css';
import '@fontsource-variable/inter';
import { startDemo } from './demo/browser';

startDemo().then(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)).catch(error => {
  document.getElementById('root')!.textContent = error instanceof Error ? error.message : 'Не удалось открыть демо.';
});
