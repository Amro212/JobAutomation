import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@renderer/components/theme-provider';
import { router } from './router';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light">
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  </React.StrictMode>
);
