import { useEffect, useState } from 'react';

/**
 * A global banner that appears when the browser reports itself offline, so a
 * network failure is explained instead of surfacing as scattered form errors.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const goOffline = (): void => {
      setOffline(true);
    };
    const goOnline = (): void => {
      setOffline(false);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      You appear to be offline. Changes you try to make now will not be saved.
    </div>
  );
}
