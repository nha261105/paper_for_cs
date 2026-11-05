import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Icon } from "./components/Icon";
import { LibraryPage } from "./pages/LibraryPage";
import { ReaderPage } from "./pages/ReaderPage";
import { SearchPage } from "./pages/SearchPage";
import { useStore } from "./store";

export function App() {
  const { library, error, setError, refresh } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const reading = library.filter((p) => p.status === "reading").length;

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(""), 8000);
    return () => window.clearTimeout(t);
  }, [error, setError]);

  return (
    <div className="shell">
      <nav className="nav" aria-label="Điều hướng chính">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>paper<span className="dim">_for_</span>cs</span>
        </div>
        <NavLink to="/" end><Icon name="search" /> <span>Tìm kiếm</span></NavLink>
        <NavLink to="/library"><Icon name="library" /> <span>Thư viện</span>
          <span className="badge num">{library.length}</span></NavLink>
        <NavLink to="/read"><Icon name="read" /> <span>Đọc</span>
          {reading > 0 && <span className="badge num" title="Đang đọc">{reading}</span>}</NavLink>
        <button className="nav-refresh" disabled={refreshing}
                title="Đọc lại config.json và nhận các bài vừa tải bằng CLI"
                onClick={async () => { setRefreshing(true); await refresh(true); setRefreshing(false); }}>
          <Icon name="refresh" size={16} className={refreshing ? "spin" : ""} /> <span>Làm mới</span>
        </button>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/read" element={<ReaderPage />} />
          <Route path="*" element={<SearchPage />} />
        </Routes>
      </main>
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button className="icon-btn" aria-label="Đóng" onClick={() => setError("")}><Icon name="close" size={16} /></button>
        </div>
      )}
    </div>
  );
}
