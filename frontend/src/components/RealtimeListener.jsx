import { useEffect } from "react";
import { api } from "../api/client";
import { useSocket } from "../hooks/useSocket";
import { useNotifs } from "../store/notifications";
import { haptic } from "../lib/telegram";

/**
 * App-wide realtime listener: keeps the unread-message count fresh for the
 * bottom-nav badge. Mounted once inside the authenticated shell.
 */
export default function RealtimeListener() {
  const setUnread = useNotifs((s) => s.setUnread);
  const bump = useNotifs((s) => s.bump);

  useEffect(() => {
    api
      .get("/conversations/")
      .then(({ data }) => {
        const list = data.results || data;
        setUnread(list.reduce((a, c) => a + (c.unread_count || 0), 0));
      })
      .catch(() => {});
  }, [setUnread]);

  useSocket("/ws/notifications/", (d) => {
    if (d.event === "chat.message") {
      bump();
      haptic("light");
    }
  });

  return null;
}
