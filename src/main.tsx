import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/resilientFetch.js';
import App from './App.tsx';
import './index.css';
import { initTheme } from './lib/theme.js';
import { initRefreshSpin } from './lib/refreshSpin.js';
initRefreshSpin();
initTheme();

const JoinPage = lazy(() => import('./pages/JoinPage.tsx'));
const GiveawayPage = lazy(() => import('./pages/GiveawayPage.tsx'));
const isJoin = window.location.pathname.startsWith('/join/');
const isGiveaway = window.location.pathname.startsWith('/g/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isJoin ? <Suspense fallback={<div className="min-h-screen bg-[#0b0d17]" />}><JoinPage /></Suspense> : isGiveaway ? <Suspense fallback={<div className="min-h-screen bg-[#0b0d17]" />}><GiveawayPage /></Suspense> : <App />}
  </StrictMode>,
);
