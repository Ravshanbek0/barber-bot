import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store/auth";
import AuthBootstrap from "./components/AuthBootstrap.jsx";
import TopBar from "./components/TopBar.jsx";
import BottomNav from "./components/BottomNav.jsx";
import ShareFab from "./components/ShareFab.jsx";
import RealtimeListener from "./components/RealtimeListener.jsx";
import Search from "./pages/Search.jsx";
import MasterDetail from "./pages/MasterDetail.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Chat from "./pages/Chat.jsx";
import Profile from "./pages/Profile.jsx";

export default function App() {
  return (
    <AuthBootstrap>
      <Shell />
    </AuthBootstrap>
  );
}

function Shell() {
  // Masters land on their dashboard; the search/"Ustalar" feed is client-only,
  // and their bottom nav has no route back to "/", so without this redirect a
  // master who opens the app would be stuck on a client page.
  const isMaster = useAuth((s) => !!s.user?.is_master);
  return (
      <div className="app-shell">
        <RealtimeListener />
        <TopBar />
        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={isMaster ? <Navigate to="/dashboard" replace /> : <Search />}
            />
            <Route path="/m/:handle" element={<MasterDetail />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:conversationId" element={<Chat />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ShareFab />
        <BottomNav />
      </div>
  );
}
