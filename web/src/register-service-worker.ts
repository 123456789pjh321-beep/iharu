// This worker supplies a static connection-error page; it does not store user data offline.
export function registerConnectionFallback() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  void navigator.serviceWorker.register('/sw.js', {scope:'/',updateViaCache:'none'})
    .catch(() => console.warn('Connection fallback could not be registered.'));
}
