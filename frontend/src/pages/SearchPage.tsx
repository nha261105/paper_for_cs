import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Preset, type SearchParams, type SearchResult } from "../api";
import { Icon } from "../components/Icon";
import { PaperMeta } from "../components/PaperMeta";
import { useStore, type SearchForm } from "../store";

const FIELDS: Record<string, string> = { all: "Mọi nơi", title: "Tiêu đề", abstract: "Abstract", author: "Tác giả" };
const SORTS: Record<string, string> = {
  relevance: "Liên quan nhất", date: "Mới nộp nhất", updated: "Mới cập nhật nhất", oldest: "Cũ nhất trước",
};
const PERIODS: Record<string, string> = {
  any: "Không giới hạn", "7": "7 ngày qua", "30": "30 ngày qua", "180": "6 tháng qua", "365": "1 năm qua", custom: "Tự chọn",
};
const UNIT_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

type Form = SearchForm;

export function SearchPage() {
  const { searchForm } = useStore();
  if (!searchForm) return <div className="page"><p className="dim pad">Đang tải cấu hình…</p></div>;
  return <SearchView form={searchForm} />;
}

function SearchView({ form }: { form: Form }) {
  const { meta, search, setSearch, setError, addToLibrary, setSearchForm } = useStore();
  const navigate = useNavigate();
  const setForm = (f: (prev: Form) => Form) => setSearchForm(f(form));
  const [customCat, setCustomCat] = useState("");
  const [loading, setLoading] = useState<"" | "search" | "more">("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [openAbs, setOpenAbs] = useState<Record<string, boolean>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const applyPreset = (name: string) => {
    const pr: Preset | undefined = meta?.presets[name];
    if (!pr) return;
    let period = "any", since = "", until = "";
    const last = pr.last?.match(/^(\d+)\s*([dwmy])$/i);
    if (last) { period = "custom"; since = daysAgo(+last[1] * UNIT_DAYS[last[2].toLowerCase()]); }
    else if (pr.since || pr.until) { period = "custom"; since = pr.since ?? ""; until = pr.until ?? ""; }
    setForm((f) => ({
      ...f, query: pr.query ?? "", categories: pr.categories ?? [], sort: pr.sort ?? f.sort,
      field: pr.field ?? f.field, max_results: pr.max_results ?? f.max_results,
      period, since, until, folder: pr.folder ?? f.folder,
    }));
  };

  const toggleCat = (c: string) =>
    set("categories", form.categories.includes(c) ? form.categories.filter((x) => x !== c) : [...form.categories, c]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.query.trim() && !form.categories.length) {
      setError("Cần nhập chủ đề hoặc chọn ít nhất một lĩnh vực.");
      return;
    }
    const params: SearchParams = {
      query: form.query.trim(), categories: form.categories, field: form.field, sort: form.sort,
      max_results: form.max_results,
      since: form.period === "custom" ? form.since : form.period === "any" ? "" : daysAgo(+form.period),
      until: form.period === "custom" ? form.until : "",
    };
    setLoading("search");
    try {
      setSearch({ params, results: await api.search(params), exhausted: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading("");
    }
  };

  const loadMore = async () => {
    if (!search.params) return;
    setLoading("more");
    try {
      const seen = new Set(search.results.map((r) => r.id));
      const more = (await api.search({ ...search.params, start: search.results.length })).filter((r) => !seen.has(r.id));
      setSearch({ ...search, results: [...search.results, ...more], exhausted: more.length === 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading("");
    }
  };

  const download = async (r: SearchResult) => {
    setBusy((b) => ({ ...b, [r.key]: true }));
    try {
      addToLibrary(await api.download(r, form.folder.trim() ? form.folder.trim() : null));
    } catch (err) {
      setError(`Tải ${r.id} lỗi: ${(err as Error).message}`);
    } finally {
      setBusy((b) => ({ ...b, [r.key]: false }));
    }
  };

  const knownCats = meta?.categories ?? [];
  const extraCats = form.categories.filter((c) => !knownCats.some((k) => k.code === c));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Tìm paper trên arXiv</h1>
        {meta && Object.keys(meta.presets).length > 0 && (
          <label className="inline">
            <span className="label">Preset</span>
            <select defaultValue="" onChange={(e) => applyPreset(e.target.value)} aria-label="Chọn preset">
              <option value="" disabled>Chọn preset…</option>
              {Object.keys(meta.presets).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </header>

      <form className="search-form card" onSubmit={submit}>
        <div className="row query-row">
          <input id="q" className="big" value={form.query} autoFocus
                 placeholder='Chủ đề, vd "retrieval augmented generation" hoặc ti:"diffusion" AND au:Ho'
                 aria-label="Chủ đề" onChange={(e) => set("query", e.target.value)} />
          <select id="field" value={form.field} onChange={(e) => set("field", e.target.value)} aria-label="Tìm trong">
            {Object.entries(FIELDS).map(([v, l]) => <option key={v} value={v}>Trong: {l}</option>)}
          </select>
          <button className="btn primary" type="submit" disabled={loading === "search"}>
            <Icon name="search" /> {loading === "search" ? "Đang tìm…" : "Tìm"}
          </button>
        </div>

        <div className="field">
          <span className="label">Lĩnh vực <span className="dim">(không chọn = tất cả)</span></span>
          <div className="chips">
            {knownCats.map((c) => (
              <button key={c.code} type="button" className={`chip ${form.categories.includes(c.code) ? "on" : ""}`}
                      aria-pressed={form.categories.includes(c.code)} onClick={() => toggleCat(c.code)} title={c.label}>
                <span className="mono">{c.code}</span> {c.label}
              </button>
            ))}
            {extraCats.map((c) => (
              <button key={c} type="button" className="chip on" aria-pressed onClick={() => toggleCat(c)}>
                <span className="mono">{c}</span>
              </button>
            ))}
            <input className="chip-input mono" value={customCat} placeholder="+ mã khác, vd cs.DB" aria-label="Thêm mã lĩnh vực"
                   onChange={(e) => setCustomCat(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") {
                       e.preventDefault();
                       const c = customCat.trim();
                       if (c && !form.categories.includes(c)) set("categories", [...form.categories, c]);
                       setCustomCat("");
                     }
                   }} />
          </div>
        </div>

        <div className="row wrap">
          <label className="field"><span className="label">Sắp xếp</span>
            <select id="sort" value={form.sort} onChange={(e) => set("sort", e.target.value)}>
              {Object.entries(SORTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">Thời gian nộp</span>
            <select id="period" value={form.period} onChange={(e) => set("period", e.target.value)}>
              {Object.entries(PERIODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {form.period === "custom" && (
            <>
              <label className="field"><span className="label">Từ ngày</span>
                <input id="since" type="date" value={form.since} onChange={(e) => set("since", e.target.value)} />
              </label>
              <label className="field"><span className="label">Đến ngày</span>
                <input id="until" type="date" value={form.until} onChange={(e) => set("until", e.target.value)} />
              </label>
            </>
          )}
          <label className="field narrow"><span className="label">Số kết quả</span>
            <input id="n" type="number" min={1} max={200} value={form.max_results}
                   onChange={(e) => set("max_results", Math.max(1, Math.min(200, +e.target.value || 10)))} />
          </label>
          <label className="field grow"><span className="label">Lưu vào thư mục</span>
            <input id="folder" list="folders" value={form.folder} placeholder="Để trống = gợi ý theo category"
                   onChange={(e) => set("folder", e.target.value)} />
            <datalist id="folders">{meta?.folders.map((f) => <option key={f} value={f} />)}</datalist>
          </label>
        </div>
      </form>

      {loading === "search" && <p className="dim pad">Đang hỏi arXiv… (arXiv yêu cầu giãn cách 3 giây giữa các request)</p>}

      {search.params && loading !== "search" && (
        <section className="results">
          <h2 className="section-title">
            {search.results.length ? `${search.results.length} kết quả` : "Không có kết quả"}
          </h2>
          {search.results.map((r, i) => (
            <article key={r.key} className="result card">
              <div className="result-main">
                <h3><span className="idx num">{i + 1}</span>{r.title}</h3>
                <PaperMeta p={r} authors={5} />
                {r.summary && (
                  <>
                    <button type="button" className="link-btn" aria-expanded={!!openAbs[r.key]}
                            onClick={() => setOpenAbs((o) => ({ ...o, [r.key]: !o[r.key] }))}>
                      <Icon name="chevron" size={14} className={openAbs[r.key] ? "rot" : ""} />
                      {openAbs[r.key] ? "Ẩn abstract" : "Xem abstract"}
                    </button>
                    {openAbs[r.key] && <p className="abstract">{r.summary}</p>}
                  </>
                )}
              </div>
              <div className="result-actions">
                {r.in_library ? (
                  <button className="btn" onClick={() => navigate(`/read?key=${encodeURIComponent(r.key)}`)}>
                    <Icon name="read" /> Đọc
                  </button>
                ) : (
                  <button className="btn primary" disabled={busy[r.key]} onClick={() => download(r)}>
                    <Icon name="download" /> {busy[r.key] ? "Đang tải…" : "Tải về"}
                  </button>
                )}
                {!r.in_library && (
                  <span className="dim small">→ {form.folder.trim() || r.suggested_folder || "thư mục gốc"}</span>
                )}
                {r.in_library && <span className="ok small">Đã có trong thư viện</span>}
              </div>
            </article>
          ))}
          {search.results.length > 0 && !search.exhausted && (
            <button className="btn wide" onClick={loadMore} disabled={loading === "more"}>
              {loading === "more" ? "Đang tải thêm…" : "Tải thêm kết quả"}
            </button>
          )}
          {search.exhausted && <p className="dim pad">Hết kết quả.</p>}
        </section>
      )}

      {!search.params && loading !== "search" && (
        <div className="empty">
          <p>Nhập chủ đề hoặc chọn lĩnh vực rồi bấm <b>Tìm</b>.</p>
          <p className="dim">Mẹo: dùng cú pháp arXiv như <code>ti:</code>, <code>au:</code>, <code>abs:</code> với AND / OR.</p>
        </div>
      )}
    </div>
  );
}
