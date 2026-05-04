import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";

export default function App() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
