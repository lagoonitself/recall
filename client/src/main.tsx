import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { AuthPage } from './pages/Auth';
import { Collections } from './pages/Collections';
import { CollectionPage } from './pages/Collection';
import { ChatPage } from './pages/Chat';
import './style.css';
function Protected() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <main className="app-boot" aria-busy="true" aria-live="polite">
        <span className="spinner" />
        <span className="visually-hidden">Loading your library</span>
      </main>
    );
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}
async function start() {
  let mocking = false;
  if (import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
    mocking = true;
  }
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthPage mocking={mocking} />} />
            <Route element={<Protected />}>
              <Route path="/" element={<Collections />} />
              <Route path="/collections/:id" element={<CollectionPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:conversationId" element={<ChatPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
void start();
