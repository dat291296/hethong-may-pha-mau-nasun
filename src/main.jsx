import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.jsx'
import { AuthProvider } from './shared/context/AuthContext.jsx'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import { startPerformanceMonitoring } from './shared/diagnostics/performanceMetrics.js'
import { startErrorMonitoring } from './shared/diagnostics/operationalDiagnostics.js'

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
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.dispatchEvent(new CustomEvent('nasun-field-notice',{detail:'Ứng dụng đã có phiên bản mới. Lưu bản nháp, đóng các tab rồi mở lại khi thuận tiện.'}));
    });

    navigator.serviceWorker.register('/sw.js?v=7.0', { updateViaCache: 'none' })
      .then(reg => {
        const notify=()=>window.dispatchEvent(new Event('nasun-app-update-ready'));
        if(reg.waiting)notify();
        reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)notify();});});
        console.log('[SW] Registered successfully:', reg.scope);
        return reg.update();
      })
      .catch(err => console.error('[SW] Registration failed:', err));
  });
}
