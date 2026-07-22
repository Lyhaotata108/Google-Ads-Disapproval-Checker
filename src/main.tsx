import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ApiConfiguredApp from './ApiConfiguredApp.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiConfiguredApp />
  </StrictMode>,
);
