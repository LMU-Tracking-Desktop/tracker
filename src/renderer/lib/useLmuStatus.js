import { useEffect, useState } from "react";

export function useLmuStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api?.getLmuStatus?.().then((s) => {
      if (!cancelled) setConnected(!!s?.connected);
    });
    const off = window.api?.onLmuStatusChange?.((payload) => {
      setConnected(!!payload?.connected);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  return connected;
}
