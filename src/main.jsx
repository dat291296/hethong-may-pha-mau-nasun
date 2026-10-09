import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { startPerformanceMonitoring } from './lib/performanceMetrics.js'
import { startErrorMonitoring } from './lib/operationalDiagnostics.js'

startPerformanceMonitoring()
const stopErrorMonitoring = startErrorMonitoring()
if (import.meta.hot) import.meta.hot.dispose(stopErrorMonitoring)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Register Service Worker with update check & error recovery
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js?v=7.0', { updateViaCache: 'none' })
      .then(reg => {
        console.log('[SW] Registered successfully:', reg.scope);
        return reg.update();
      })
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}
