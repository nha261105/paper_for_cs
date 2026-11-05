import { ArrowRight, Check, ChevronDown, Download, FolderOpen, Plus, Search, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, type Preset, type SearchParams, type SearchResult } from "@/api";
import { PaperMeta } from "@/components/PaperMeta";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Kbd, Skeleton } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStore, type SearchForm } from "@/store";

const FIELDS: Record<string, string> = { all: "Mọi nơi", title: "Tiêu đề", abstract: "Abstract", author: "Tác giả" };
const SORTS: Record<string, string> = {
  relevance: "Liên quan nhất", date: "Mới nộp nhất", updated: "Mới cập nhật", oldest: "Cũ nhất trước",
};
const PERIODS: Record<string, string> = {
  any: "Mọi thời gian", "7": "7 ngày qua", "30": "30 ngày qua", "180": "6 tháng qua", "365": "1 năm qua", custom: "Khoảng ngày…",
};
const COUNTS = [10, 20, 50, 100];
const UNIT_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };
const EXAMPLES = ["retrieval augmented generation", "diffusion models", "LLM agents", "vision transformer"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

function toParams(f: SearchForm): SearchParams {
  return {
    query: f.query.trim(), categories: f.categories, field: f.field, sort: f.sort, max_results: f.max_results,
    since: f.period === "custom" ? f.since : f.period === "any" ? "" : daysAgo(+f.period),
    until: f.period === "custom" ? f.until : "",
  };
}

/** Pill-shaped trigger for one filter: "Label: value ▾". */
function FilterPill({ label, value, active, children, ...props }: {
  label: string; value?: ReactNode; active?: boolean; children?: ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button type="button" {...props}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap outline-none transition-colors",
        "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-muted",
        active ? "border-foreground/20 bg-card text-foreground" : "bg-card text-muted-foreground",
      )}>
      <span className={cn(active && "text-muted-foreground")}>{label}</span>
      {value && <span className="max-w-48 truncate font-medium text-foreground">{value}</span>}
      <ChevronDown className="size-3.5 text-muted-foreground" />
      {children}
    </button>
  );
}

export function SearchPage() {
  const { searchForm } = useStore();
  if (!searchForm) {
    return <div className="mx-auto max-w-4xl px-6 py-10"><Skeleton className="h-12 w-full" /></div>;
  }
  return <SearchView form={searchForm} />;
}

function SearchView({ form }: { form: SearchForm }) {
  const { meta, search, setSearch, setError, addToLibrary, setSearchForm } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<"" | "search" | "more">("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const run = async (f: SearchForm) => {
    if (!f.query.trim() && !f.categories.length) {
      setError("Nhập chủ đề hoặc chọn ít nhất một lĩnh vực.");
      return;
    }
    const params = toParams(f);
    setLoading("search");
    try {
      setSearch({ params, results: await api.search(params), exhausted: false });
      setExpanded({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading("");
    }
  };

  /** Change filters; if results are on screen, search again with the new filters. */
  const setFilter = (patch: Partial<SearchForm>) => {
    const next = { ...form, ...patch };
    setSearchForm(next);
    if (search.params && (next.query.trim() || next.categories.length)) run(next);
  };

  const applyPreset = (name: string) => {
    const pr: Preset | undefined = meta?.presets[name];
    if (!pr) return;
    let period = "any", since = "", until = "";
    const last = pr.last?.match(/^(\d+)\s*([dwmy])$/i);
    if (last) { period = "custom"; since = daysAgo(+last[1] * UNIT_DAYS[last[2].toLowerCase()]); }
    else if (pr.since || pr.until) { period = "custom"; since = pr.since ?? ""; until = pr.until ?? ""; }
    const next: SearchForm = {
      ...form, query: pr.query ?? "", categories: pr.categories ?? [], sort: pr.sort ?? form.sort,
      field: pr.field ?? form.field, max_results: pr.max_results ?? form.max_results,
      period, since, until, folder: pr.folder ?? form.folder,
    };
    setSearchForm(next);
    run(next);
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
      const item = await api.download(r, form.folder.trim() ? form.folder.trim() : null);
      addToLibrary(item);
      toast.success(`Đã lưu vào ${item.folder || "thư mục gốc"}`, {
        description: r.title,
        action: { label: "Đọc", onClick: () => navigate(`/read?key=${encodeURIComponent(item.key)}`) },
      });
    } catch (err) {
      setError(`Tải ${r.id} không được: ${(err as Error).message}`);
    } finally {
      setBusy((b) => ({ ...b, [r.key]: false }));
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); run(form); };
  const hasPresets = meta && Object.keys(meta.presets).length > 0;
  const periodLabel = form.period === "custom"
    ? `${form.since || "…"} → ${form.until || "nay"}` : PERIODS[form.period];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 pb-16 sm:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tìm paper</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tìm trên arXiv, tải PDF về thư viện của bạn.</p>
        </div>
        {hasPresets && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Preset <ChevronDown className="text-muted-foreground" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Chạy tìm kiếm đã lưu</DropdownMenuLabel>
              {Object.entries(meta!.presets).map(([name, pr]) => (
                <DropdownMenuItem key={name} onSelect={() => applyPreset(name)} className="flex-col items-start gap-0">
                  <span className="font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">{[pr.query, pr.categories?.join(", ")].filter(Boolean).join(" · ")}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <form onSubmit={submit} role="search">
        <div className="flex items-center gap-2 rounded-xl border bg-card p-1.5 pl-4 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            data-search-focus
            id="q"
            value={form.query}
            onChange={(e) => setSearchForm({ ...form, query: e.target.value })}
            placeholder='Chủ đề, tác giả, hoặc cú pháp arXiv như ti:"diffusion" AND au:Ho'
            aria-label="Chủ đề"
            autoFocus
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {!form.query && <Kbd className="max-sm:hidden">/</Kbd>}
          <Button type="submit" disabled={loading === "search"} className="rounded-lg">
            {loading === "search" ? "Đang tìm…" : "Tìm"}
          </Button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CategoryFilter value={form.categories} onApply={(categories) => setFilter({ categories })} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterPill label="Tìm trong" value={FIELDS[form.field]} active={form.field !== "all"} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={form.field} onValueChange={(field) => setFilter({ field })}>
              {Object.entries(FIELDS).map(([v, l]) => <DropdownMenuRadioItem key={v} value={v}>{l}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <PeriodFilter form={form} label={periodLabel} onApply={setFilter} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterPill label="Sắp xếp" value={SORTS[form.sort]} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={form.sort} onValueChange={(sort) => setFilter({ sort })}>
              {Object.entries(SORTS).map(([v, l]) => <DropdownMenuRadioItem key={v} value={v}>{l}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <FilterPill label="Hiện" value={`${form.max_results} bài`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={String(form.max_results)} onValueChange={(v) => setFilter({ max_results: +v })}>
              {COUNTS.map((n) => <DropdownMenuRadioItem key={n} value={String(n)}>{n} bài mỗi trang</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <FolderFilter value={form.folder} folders={meta?.folders ?? []} onChange={(folder) => setSearchForm({ ...form, folder })} />
      </div>

      <div className="mt-8">
        {loading === "search" && <ResultsSkeleton />}

        {loading !== "search" && search.params && (
          <>
            <div className="mb-2 flex items-baseline justify-between px-1 text-sm text-muted-foreground">
              <span>{search.results.length ? `${search.results.length} kết quả` : "Không có kết quả. Thử bớt bộ lọc hoặc đổi từ khoá."}</span>
              {search.results.length > 0 && <span className="max-sm:hidden">{SORTS[search.params.sort]}</span>}
            </div>
            {search.results.length > 0 && (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {search.results.map((r) => (
                  <ResultRow key={r.key} r={r} folder={form.folder.trim() || r.suggested_folder}
                    expanded={!!expanded[r.key]} busy={!!busy[r.key]}
                    onToggle={() => setExpanded((x) => ({ ...x, [r.key]: !x[r.key] }))}
                    onDownload={() => download(r)}
                    onRead={() => navigate(`/read?key=${encodeURIComponent(r.key)}`)} />
                ))}
              </ul>
            )}
            {search.results.length > 0 && !search.exhausted && (
              <Button variant="ghost" className="mt-3 w-full text-muted-foreground" onClick={loadMore} disabled={loading === "more"}>
                {loading === "more" ? "Đang tải thêm…" : "Xem thêm kết quả"}
              </Button>
            )}
            {search.exhausted && <p className="mt-4 text-center text-sm text-muted-foreground">Đã hết kết quả.</p>}
          </>
        )}

        {loading !== "search" && !search.params && (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">Thử một chủ đề:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <Button key={q} variant="outline" size="sm" className="rounded-full"
                  onClick={() => { const next = { ...form, query: q }; setSearchForm(next); run(next); }}>
                  {q}
                </Button>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              arXiv yêu cầu giãn cách 3 giây giữa các request nên mỗi lần tìm mất vài giây.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ r, folder, expanded, busy, onToggle, onDownload, onRead }: {
  r: SearchResult; folder: string; expanded: boolean; busy: boolean;
  onToggle: () => void; onDownload: () => void; onRead: () => void;
}) {
  return (
    <li className="group flex gap-4 px-5 py-4 transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-[17px] leading-snug font-semibold text-balance">{r.title}</h3>
        <PaperMeta p={r} className="mt-1" />
        {r.summary && (
          <button type="button" onClick={onToggle} aria-expanded={expanded}
            className={cn("mt-2 block text-left text-sm leading-relaxed text-muted-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/60 rounded",
              !expanded && "line-clamp-2")}>
            {r.summary}
          </button>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        {r.in_library ? (
          <Button size="sm" variant="secondary" onClick={onRead}>Đọc <ArrowRight /></Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onDownload} disabled={busy}
            className="group-hover:border-foreground/25">
            <Download className={cn(busy && "animate-bounce")} /> {busy ? "Đang tải…" : "Tải về"}
          </Button>
        )}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {r.in_library ? <><Check className="size-3" />Trong thư viện</> : <><FolderOpen className="size-3" />{folder || "thư mục gốc"}</>}
        </span>
      </div>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card" aria-label="Đang tìm" role="status">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2.5 px-5 py-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
      ))}
    </div>
  );
}

/** Multi-select of arXiv categories; applies when the popover closes. */
function CategoryFilter({ value, onApply }: { value: string[]; onApply: (c: string[]) => void }) {
  const { meta } = useStore();
  const [draft, setDraft] = useState(value);
  const [custom, setCustom] = useState("");
  const known = meta?.categories ?? [];
  const extra = draft.filter((c) => !known.some((k) => k.code === c));
  const toggle = (c: string) => setDraft((d) => (d.includes(c) ? d.filter((x) => x !== c) : [...d, c]));
  const addCustom = () => {
    const c = custom.trim();
    if (c && !draft.includes(c)) setDraft([...draft, c]);
    setCustom("");
  };
  return (
    <Popover onOpenChange={(open) => {
      if (open) setDraft(value);
      else if (draft.join() !== value.join()) onApply(draft);
    }}>
      <PopoverTrigger asChild>
        <FilterPill label="Lĩnh vực" value={value.length ? (value.length > 2 ? `${value.length} mục` : value.join(", ")) : "Tất cả"}
          active={value.length > 0} />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1">
        <div className="max-h-80 overflow-y-auto">
          {[...known, ...extra.map((code) => ({ code, label: "" }))].map((c) => {
            const on = draft.includes(c.code);
            return (
              <button key={c.code} type="button" onClick={() => toggle(c.code)} aria-pressed={on}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted">
                <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {on && <Check className="size-3" />}
                </span>
                <span className="w-16 shrink-0 font-mono text-xs">{c.code}</span>
                <span className="truncate text-muted-foreground">{c.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5 border-t p-1.5">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Mã khác, vd cs.DB" className="h-8 font-mono text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} aria-label="Thêm mã lĩnh vực" />
          <Button size="icon-sm" variant="outline" onClick={addCustom} aria-label="Thêm"><Plus /></Button>
          {draft.length > 0 && <Button size="sm" variant="ghost" onClick={() => setDraft([])}>Bỏ chọn</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PeriodFilter({ form, label, onApply }: { form: SearchForm; label: string; onApply: (p: Partial<SearchForm>) => void }) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(form.since);
  const [until, setUntil] = useState(form.until);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setSince(form.since); setUntil(form.until); } }}>
      <PopoverTrigger asChild>
        <FilterPill label="Thời gian" value={label} active={form.period !== "any"} />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1">
        {Object.entries(PERIODS).filter(([v]) => v !== "custom").map(([v, l]) => (
          <button key={v} type="button" onClick={() => { onApply({ period: v }); setOpen(false); }}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted">
            {l} {form.period === v && <Check className="size-4" />}
          </button>
        ))}
        <div className="mt-1 grid gap-2 border-t p-2">
          <span className="text-xs font-medium text-muted-foreground">Khoảng ngày nộp</span>
          <label className="grid gap-1 text-xs text-muted-foreground">Từ
            <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="h-8" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Đến
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8" />
          </label>
          <Button size="sm" disabled={!since && !until}
            onClick={() => { onApply({ period: "custom", since, until }); setOpen(false); }}>Áp dụng</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FolderFilter({ value, folders, onChange }: { value: string; folders: string[]; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setText(""); }}>
      <PopoverTrigger asChild>
        <FilterPill label="Lưu vào" value={value || "Theo lĩnh vực"} active={!!value} />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1">
        <button type="button" onClick={() => { onChange(""); setOpen(false); }}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted">
          <span>Tự xếp theo lĩnh vực <span className="block text-xs text-muted-foreground">theo category_folders trong config</span></span>
          {!value && <Check className="size-4" />}
        </button>
        <div className="max-h-56 overflow-y-auto">
          {folders.map((f) => (
            <button key={f} type="button" onClick={() => { onChange(f); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted">
              <FolderOpen className="size-4 text-muted-foreground" /> <span className="truncate">{f}</span>
              {value === f && <Check className="ml-auto size-4" />}
            </button>
          ))}
        </div>
        <form className="mt-1 flex gap-1.5 border-t p-1.5"
          onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onChange(text.trim()); setOpen(false); } }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Thư mục mới, vd AI/NLP" className="h-8" aria-label="Thư mục mới" />
          <Button size="icon-sm" variant="outline" type="submit" aria-label="Dùng thư mục này"><Plus /></Button>
        </form>
        {value && (
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => { onChange(""); setOpen(false); }}>
            <X /> Bỏ chọn thư mục
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
