import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { SnackbarProvider } from '@clinic/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { queryClient } from './lib/session.ts';
import { applyTheme } from './lib/storage.ts';
import { router } from './router.tsx';

applyTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Falta #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <RouterProvider router={router} />
      </SnackbarProvider>
    </QueryClientProvider>
  </StrictMode>,
);
