import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthGate from './AuthGate';
import { applyTheme, getSavedCustomAccent, getSavedTheme } from './theme';
import './styles.css';

applyTheme(getSavedTheme(), getSavedCustomAccent());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
