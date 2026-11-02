import { useState, useEffect } from 'react';

/**
 * Hook to handle the free-tier backend cold start experience.
 * Per design.md section 12.9:
 * "Slow backend (free tier cold start): after 4 seconds of waiting show
 * 'Waking up the server, this can take up to 30 seconds.'"
 */
export function useColdStartNotice(isLoading: boolean, delayMs = 4000) {
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowNotice(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowNotice(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  return showNotice;
}
