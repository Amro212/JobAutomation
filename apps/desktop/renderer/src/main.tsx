import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@renderer/components/theme-provider';
import { router } from './router';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light">
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  </React.StrictMode>
);
