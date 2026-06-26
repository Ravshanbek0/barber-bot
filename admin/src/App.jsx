import { useState } from "react";
import { getAuth } from "./api";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";

export default function App() {
  const [auth, setAuthState] = useState(getAuth());
  if (!auth) return <Login onLogin={setAuthState} />;
  return <Dashboard auth={auth} />;
}
