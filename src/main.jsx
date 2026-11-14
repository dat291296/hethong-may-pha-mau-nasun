import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.jsx'
import { AuthProvider } from './shared/context/AuthContext.jsx'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import { flushBeforeAppUpdate } from './shared/updates/appUpdateSafety.js'
import { startPerformanceMonitoring } from './shared/diagnostics/performanceMetrics.js'
import { startErrorMonitoring, configureOperationalReporting } from './shared/diagnostics/operationalDiagnostics.js'
import { createRemoteReporter } from './shared/diagnostics/remoteReporting.js'

if (import.meta.env.VITE_REMOTE_REPORTING_ENABLED === 'true') {
configureOperationalReporting(createRemoteReporter({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  release: import.meta.env.VITE_BUILD_REVISION,
  environment: import.meta.env.VITE_APP_ENV || (import.meta.env.PROD ? 'production' : 'development'),
  origin: window.location.origin,
  assets: () => performance.getEntriesByType('resource').map(entry => entry.name),
}))
}
startPerformanceMonitoring()
const stopErrorMonitoring = startErrorMonitoring()
const hotContext = import.meta.hot
if (hotContext) hotContext.dispose(stopErrorMonitoring)

const updateNoticeKey = 'nasun-update-completed';

function AppUpdateNotice() {
  const [visible, setVisible] = useState(() => {
    try { return sessionStorage.getItem(updateNoticeKey) === 'true'; }
    catch { return false; }
  });

  useEffect(() => {
    if (!visible) return;
    try { sessionStorage.removeItem(updateNoticeKey); } catch { /* Storage is unavailable. */ }
  }, [visible]);

  if (!visible) return null;
  return (
    <aside className="app-update-notice">
      <span role="status">NASUN đã cập nhật lên phiên bản mới.</span>
      <button type="button" className="btn btn-secondary" onClick={() => setVisible(false)}>Đóng</button>
    </aside>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <AppUpdateNotice />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Register Service Worker with update check & error recovery
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const applyUpdate = async () => {
      if (reloading || !document.documentElement.dataset.appUpdateReady) return;
      reloading = true;
      try {
        await flushBeforeAppUpdate();
        try { sessionStorage.setItem(updateNoticeKey, 'true'); } catch { /* Reload remains available. */ }
        window.location.reload();
      } catch {
        reloading = false;
      }
    };
    const notify = () => {
      document.documentElement.dataset.appUpdateReady = 'true';
      window.dispatchEvent(new Event('nasun-app-update-ready'));
      void applyUpdate();
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) notify();
    });

    navigator.serviceWorker.register('/sw.js?v=8.0', { updateViaCache: 'none' })
      .then(reg => {
        const check = () => {
          if (navigator.onLine) void reg.update().catch(() => {});
          void applyUpdate();
        };
        window.addEventListener('focus', check);
        window.addEventListener('online', check);
        window.setInterval(check, 5 * 60_000);
        console.log('[SW] Registered successfully:', reg.scope);
        return reg.update();
      })
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}
