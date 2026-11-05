import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { PaperEditor } from "../components/PaperEditor";
import { PaperMeta, absUrl } from "../components/PaperMeta";
import { StatusDot } from "../components/StatusPicker";
import { useStore } from "../store";

const PANEL_KEY = "reader.panel";

function loadPanel() {
  try {
    return localStorage.getItem(PANEL_KEY) !== "0";
  } catch {
    return true;
  }
}

export function ReaderPage() {
  const { library, libraryLoaded, markOpened } = useStore();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(loadPanel);

  const byRecent = useMemo(
    () => [...library].sort((a, b) => b.last_opened.localeCompare(a.last_opened) || b.downloaded_at.localeCompare(a.downloaded_at)),
    [library],
  );
  const key = params.get("key") ?? byRecent[0]?.key ?? null;
  const paper = library.find((p) => p.key === key);

  useEffect(() => {
    if (paper) markOpened(paper.key);
    // only when the paper changes, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.key]);

  const togglePanel = () => {
    setPanel((v) => {
      try { localStorage.setItem(PANEL_KEY, v ? "0" : "1"); } catch { /* storage blocked */ }
      return !v;
    });
  };

  if (libraryLoaded && !library.length) {
    return (
      <div className="page">
        <div className="empty">
          <p>Chưa có bài nào để đọc.</p>
          <button className="btn primary" onClick={() => navigate("/")}><Icon name="search" /> Tìm paper</button>
        </div>
      </div>
    );
  }
  if (!paper) return <div className="page"><p className="dim pad">{libraryLoaded ? "Không tìm thấy bài này trong thư viện." : "Đang tải…"}</p></div>;

  return (
    <div className="reader">
      <div className="reader-bar">
        <select id="reader-pick" className="paper-pick" value={paper.key} aria-label="Bài đang đọc"
                onChange={(e) => setParams({ key: e.target.value })}>
          {byRecent.map((p) => (
            <option key={p.key} value={p.key}>
              {p.status === "done" ? "● " : p.status === "reading" ? "◐ " : "○ "}{p.title}
            </option>
          ))}
        </select>
        <span className={`status-pill ${paper.status}`}><StatusDot status={paper.status} /></span>
        <a className="icon-btn" href={api.pdfUrl(paper.key)} target="_blank" rel="noreferrer" title="Mở PDF ở tab mới">
          <Icon name="external" />
        </a>
        <button className={`icon-btn ${panel ? "on" : ""}`} onClick={togglePanel} aria-pressed={panel}
                title={panel ? "Ẩn panel ghi chú" : "Hiện panel ghi chú"}>
          <Icon name="panel" />
        </button>
      </div>
      <div className={`reader-body ${panel ? "with-panel" : ""}`}>
        <iframe key={paper.key} className="pdf" src={api.pdfUrl(paper.key)} title={paper.title} />
        {panel && (
          <aside className="reader-panel" aria-label="Ghi chú">
            <h2 className="panel-title">{paper.title}</h2>
            <PaperMeta p={paper} />
            <details className="abstract-box">
              <summary>Abstract</summary>
              <p className="abstract">{paper.summary || "Chưa có abstract."}</p>
              <a href={absUrl(paper)} target="_blank" rel="noreferrer" className="small">Trang arXiv</a>
            </details>
            <PaperEditor key={paper.key} p={paper} notesRows={14} />
          </aside>
        )}
      </div>
    </div>
  );
}
