import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster, toast } from 'sonner';

import { AppErrorBoundary } from '@renderer/components/error-boundary';
import { ThemeProvider } from '@renderer/components/theme-provider';
import { router } from './router';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import './styles/globals.css';

/* ── Renderer-level global error handlers ──────────────────── */

window.onerror = (_message, _source, _lineno, _colno, error) => {
  console.error('[renderer:onerror]', error);
  toast.error(error?.message ?? 'An unexpected error occurred.');
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error('[renderer:unhandledrejection]', event.reason);
  const message =
    event.reason instanceof Error
      ? event.reason.message
      : 'An unhandled promise rejection occurred.';
  toast.error(message);
};

/* ── Render ────────────────────────────────────────────────── */

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors />
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
