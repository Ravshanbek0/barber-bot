import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { useNotifs } from "../store/notifications";
import { useSocket } from "../hooks/useSocket";
import "./Chat.css";

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const setUnread = useNotifs((s) => s.setUnread);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  const refreshConversations = () =>
    api.get("/conversations/").then(({ data }) => {
      const list = data.results || data;
      setConversations(list);
      setUnread(list.reduce((a, c) => a + (c.unread_count || 0), 0));
    }).catch(() => {});

  useEffect(() => { refreshConversations(); }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    // Opening a thread marks its messages read on the server.
    api.get(`/conversations/${conversationId}/messages/`)
      .then(({ data }) => setMessages(data))
      .then(refreshConversations)
      .catch(() => {});
  }, [conversationId]);

  const { send } = useSocket(
    conversationId ? `/ws/chat/${conversationId}/` : null,
    (msg) => { if (msg.event === "message") setMessages((m) => [...m, msg]); },
    !!conversationId
  );

  // In the list view, refresh unread badges live when a new message arrives.
  useSocket(
    "/ws/notifications/",
    (d) => { if (d.event === "chat.message") refreshConversations(); },
    !conversationId
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    send({ text });
    setText("");
  };

  // Conversation list
  if (!conversationId) {
    return (
      <div className="page">
        {conversations.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji">💬</div>
            <p>Hali suhbatlar yo'q.</p>
            <p className="faint">Usta profilidan "Xabar yozish" orqali boshlang.</p>
          </div>
        ) : (
          <div className="stack gap-2">
            {conversations.map((c) => {
              const other = c.client === user?.id ? c.master_name : c.client_name;
              return (
                <button key={c.id} className="conv-item card" onClick={() => navigate(`/chat/${c.id}`)}>
                  <span className="avatar">{(other || "?")[0]}</span>
                  <div className="grow stack" style={{ minWidth: 0 }}>
                    <strong>{other}</strong>
                    <span className="muted conv-last">{c.last_message?.text || "…"}</span>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="conv-badge">{c.unread_count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Thread view
  return (
    <div className="chat-thread">
      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender === user?.id ? "mine" : ""}`}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input" onSubmit={sendMessage}>
        <input
          className="input"
          placeholder="Xabar yozing…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" aria-label="Yuborish">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M4 12l16-8-6 16-3-6-7-2Z" fill="currentColor" />
          </svg>
        </button>
      </form>
    </div>
  );
}
