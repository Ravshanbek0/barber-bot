import { useEffect, useRef } from "react";
import { useAuth } from "../store/auth";

// Default to same-origin (proxied by Vite) so it works locally and over HTTPS tunnels.
const WS_BASE =
  import.meta.env.VITE_WS_BASE ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

/**
 * Open an authenticated WebSocket to `path` (e.g. "/ws/notifications/").
 * Calls onMessage(data) for each JSON frame. Reconnects on drop.
 */
export function useSocket(path, onMessage, enabled = true) {
  const token = useAuth((s) => s.tokens?.access);
  const ref = useRef(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!enabled || !token || !path) return;
    let closed = false;
    let retry;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}${path}?token=${token}`);
      ref.current = ws;
      ws.onmessage = (e) => {
        try { handler.current?.(JSON.parse(e.data)); } catch {}
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2500);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ref.current?.close();
    };
  }, [path, token, enabled]);

  const send = (obj) => {
    if (ref.current?.readyState === WebSocket.OPEN) {
      ref.current.send(JSON.stringify(obj));
    }
  };
  return { send };
}
