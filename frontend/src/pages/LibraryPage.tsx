import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type LibraryItem, type Status } from "../api";
import { Icon } from "../components/Icon";
import { PaperEditor } from "../components/PaperEditor";
import { PaperMeta, shortAuthors } from "../components/PaperMeta";
import { StatusDot } from "../components/StatusPicker";
import { STATUS_LABEL, useStore } from "../store";

type Sort = "downloaded" | "opened" | "published" | "title";
const SORTS: Record<Sort, string> = {
  downloaded: "Mới tải nhất", opened: "Mới mở gần đây", published: "Ngày đăng (mới trước)", title: "Tiêu đề A–Z",
};

function matches(p: LibraryItem, text: string) {
  const hay = [p.title, p.authors.join(" "), p.summary, p.notes, p.tags.join(" "), p.id].join(" ").toLowerCase();
  return text.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function LibraryPage() {
  const { library, libraryLoaded, meta, update, refresh, setError } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedKey = params.get("key");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [folder, setFolder] = useState("*");
  const [tag, setTag] = useState("");
  const [starred, setStarred] = useState(false);
  const [sort, setSort] = useState<Sort>("downloaded");
  const [backfilling, setBackfilling] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: library.length, unread: 0, reading: 0, done: 0 };
    library.forEach((p) => c[p.status]++);
    return c;
  }, [library]);
  const folders = useMemo(() => [...new Set(library.map((p) => p.folder))].sort(), [library]);
  const tags = useMemo(() => [...new Set(library.flatMap((p) => p.tags))].sort(), [library]);
  const missing = library.filter((p) => p.source === "arxiv" && !p.summary).length;

  const shown = useMemo(() => {
    const key: Record<Sort, (p: LibraryItem) => string> = {
      downloaded: (p) => p.downloaded_at, opened: (p) => p.last_opened,
      published: (p) => p.published, title: (p) => p.title.toLowerCase(),
    };
    return library
      .filter((p) => (!text.trim() || matches(p, text.trim()))
        && (status === "all" || p.status === status)
        && (folder === "*" || p.folder === folder)
        && (!tag || p.tags.includes(tag))
        && (!starred || p.starred))
      .sort((a, b) => {
        const x = key[sort](a), y = key[sort](b);
        return sort === "title" ? x.localeCompare(y) : y.localeCompare(x);
      });
  }, [library, text, status, folder, tag, starred, sort]);

  const selected = library.find((p) => p.key === selectedKey);
  const select = (key: string | null) => setParams(key ? { key } : {}, { replace: true });
  const read = (key: string) => navigate(`/read?key=${encodeURIComponent(key)}`);

  const backfill = async () => {
    setBackfilling(true);
    try {
      await api.backfill();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="page library-page">
      <header className="page-head">
        <h1>Thư viện</h1>
        {missing > 0 && (
          <button className="btn" onClick={backfill} disabled={backfilling}
                  title="Các bài tải bằng CLI chưa có abstract trong thư viện">
            {backfilling ? "Đang lấy…" : `Lấy abstract còn thiếu (${missing})`}
          </button>
        )}
      </header>

      <div className="status-tabs" role="tablist" aria-label="Lọc theo trạng thái">
        {(["all", "unread", "reading", "done"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={status === s ? "on" : ""}
                  onClick={() => setStatus(s)}>
            {s !== "all" && <StatusDot status={s} />}
            {s === "all" ? "Tất cả" : STATUS_LABEL[s]}
            <span className="count num">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input id="lib-search" value={text} onChange={(e) => setText(e.target.value)}
                 placeholder="Tìm theo tiêu đề, tác giả, abstract, ghi chú, tag…" aria-label="Tìm trong thư viện" />
        </div>
        <select id="lib-folder" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Thư mục">
          <option value="*">Mọi thư mục</option>
          {folders.map((f) => <option key={f} value={f}>{f || "(thư mục gốc)"}</option>)}
        </select>
        <select id="lib-tag" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
          <option value="">Mọi tag</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        <select id="lib-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
          {Object.entries(SORTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" className={`chip ${starred ? "on" : ""}`} aria-pressed={starred} onClick={() => setStarred(!starred)}>
          <Icon name="star" size={14} /> Bài hay
        </button>
      </div>

      <div className={`library-grid ${selected ? "has-detail" : ""}`}>
        <div className="paper-list" role="list">
          {!libraryLoaded && <p className="dim pad">Đang tải thư viện…</p>}
          {libraryLoaded && library.length === 0 && (
            <div className="empty">
              <p>Thư viện còn trống.</p>
              <button className="btn primary" onClick={() => navigate("/")}><Icon name="search" /> Tìm paper đầu tiên</button>
            </div>
          )}
          {libraryLoaded && library.length > 0 && shown.length === 0 && <p className="dim pad">Không có bài nào khớp bộ lọc.</p>}
          {shown.map((p) => (
            <div key={p.key} role="listitem"
                 className={`paper-row ${p.key === selectedKey ? "selected" : ""}`}
                 onClick={() => select(p.key)} onDoubleClick={() => read(p.key)}
                 tabIndex={0} onKeyDown={(e) => e.key === "Enter" && select(p.key)}>
              <button type="button" className={`star ${p.starred ? "on" : ""}`} aria-label="Đánh dấu bài hay" aria-pressed={p.starred}
                      onClick={(e) => { e.stopPropagation(); update(p.key, { starred: !p.starred }); }}>
                <Icon name="star" size={16} />
              </button>
              <div className="row-main">
                <div className="row-title">{p.title}</div>
                <div className="row-sub">
                  <span>{shortAuthors(p.authors, 2)}</span>
                  <span className="num">{p.published.slice(0, 4)}</span>
                  {p.categories[0] && <span className="cat">{p.categories[0]}</span>}
                  {p.tags.map((t) => <span key={t} className="tag small">#{t}</span>)}
                </div>
              </div>
              <span className={`status-pill ${p.status}`}><StatusDot status={p.status} />{STATUS_LABEL[p.status]}</span>
            </div>
          ))}
        </div>

        {selected && (
          <aside className="detail card" aria-label="Chi tiết bài">
            <div className="detail-head">
              <h2>{selected.title}</h2>
              <button className="icon-btn" aria-label="Đóng" onClick={() => select(null)}><Icon name="close" /></button>
            </div>
            <PaperMeta p={selected} authors={6} />
            <div className="detail-actions">
              <button className="btn primary" onClick={() => read(selected.key)}><Icon name="read" /> Đọc bài này</button>
              <span className="dim small mono" title={selected.file}>{selected.folder || "/"}</span>
            </div>
            <details className="abstract-box" open={!selected.notes}>
              <summary>Abstract</summary>
              <p className="abstract">{selected.summary || "Chưa có abstract — bấm “Lấy abstract còn thiếu” ở trên."}</p>
            </details>
            <PaperEditor key={selected.key} p={selected} notesRows={10} />
          </aside>
        )}
      </div>
      {meta && <p className="dim small foot mono">{meta.library_dir}</p>}
    </div>
  );
}
