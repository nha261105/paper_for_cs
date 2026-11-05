import { ArrowDownUp, BookOpen, ExternalLink, FileText, Folder, Hash, Inbox, Search, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type LibraryItem, type Status } from "@/api";
import { PaperEditor } from "@/components/PaperEditor";
import { absUrl, PaperMeta, shortAuthors } from "@/components/PaperMeta";
import { STATUS_LABEL, STATUS_ORDER, StatusBadge, StatusDot } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd, Skeleton } from "@/components/ui/input";
import { cn, isTyping } from "@/lib/utils";
import { useStore } from "@/store";

type Sort = "downloaded" | "opened" | "published" | "title";
const SORTS: Record<Sort, string> = {
  downloaded: "Mới tải", opened: "Mới mở", published: "Ngày đăng", title: "Tiêu đề A–Z",
};
type View = { kind: "all" } | { kind: "status"; value: Status } | { kind: "starred" } | { kind: "folder"; value: string } | { kind: "tag"; value: string };

function matches(p: LibraryItem, text: string) {
  const hay = [p.title, p.authors.join(" "), p.summary, p.notes, p.tags.join(" "), p.id].join(" ").toLowerCase();
  return text.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function inView(p: LibraryItem, v: View) {
  switch (v.kind) {
    case "all": return true;
    case "status": return p.status === v.value;
    case "starred": return p.starred;
    case "folder": return p.folder === v.value;
    case "tag": return p.tags.includes(v.value);
  }
}

function SideItem({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 max-lg:w-auto max-lg:shrink-0",
        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}>
      <span className="grid size-4 place-items-center [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function SideGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <div className="px-2 pt-4 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{title}</div>
      {children}
    </div>
  );
}

export function LibraryPage() {
  const { library, libraryLoaded, update, refresh, setError } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const openKey = params.get("key");
  const [text, setText] = useState("");
  const [view, setView] = useState<View>({ kind: "all" });
  const [sort, setSort] = useState<Sort>("downloaded");
  const [cursor, setCursor] = useState(0);
  const [backfilling, setBackfilling] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const counts = useMemo(() => {
    const status: Record<string, number> = { unread: 0, reading: 0, done: 0 };
    const folders: Record<string, number> = {};
    const tags: Record<string, number> = {};
    for (const p of library) {
      status[p.status]++;
      folders[p.folder] = (folders[p.folder] ?? 0) + 1;
      p.tags.forEach((t) => (tags[t] = (tags[t] ?? 0) + 1));
    }
    return { status, folders, tags, starred: library.filter((p) => p.starred).length };
  }, [library]);

  const shown = useMemo(() => {
    const key: Record<Sort, (p: LibraryItem) => string> = {
      downloaded: (p) => p.downloaded_at, opened: (p) => p.last_opened,
      published: (p) => p.published, title: (p) => p.title.toLowerCase(),
    };
    return library
      .filter((p) => inView(p, view) && (!text.trim() || matches(p, text.trim())))
      .sort((a, b) => (sort === "title" ? key[sort](a).localeCompare(key[sort](b)) : key[sort](b).localeCompare(key[sort](a))));
  }, [library, view, text, sort]);

  useEffect(() => setCursor(0), [view, text, sort]);
  const missing = library.filter((p) => p.source === "arxiv" && !p.summary).length;
  const selected = library.find((p) => p.key === openKey);
  const open = (key: string | null) => setParams(key ? { key } : {}, { replace: true });
  const read = (key: string) => navigate(`/read?key=${encodeURIComponent(key)}`);

  // j / k move, Enter opens details, o reads, s stars.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || selected) return;
      const cur = shown[cursor];
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, shown.length - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "Enter" && cur) open(cur.key);
      else if (e.key === "o" && cur) read(cur.key);
      else if (e.key === "s" && cur) update(cur.key, { starred: !cur.starred });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

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

  const viewTitle = view.kind === "all" ? "Tất cả bài" : view.kind === "status" ? STATUS_LABEL[view.value]
    : view.kind === "starred" ? "Bài hay" : view.kind === "folder" ? (view.value || "Thư mục gốc") : `#${view.value}`;
  const is = (v: View) => JSON.stringify(v) === JSON.stringify(view);

  return (
    <div className="flex h-full max-lg:flex-col">
      <aside className="shrink-0 overflow-y-auto border-r px-3 py-6 lg:w-60 max-lg:border-r-0 max-lg:border-b max-lg:py-3">
        <h1 className="px-2 text-lg font-semibold tracking-tight max-lg:hidden">Thư viện</h1>
        <div className="max-lg:flex max-lg:gap-1 max-lg:overflow-x-auto max-lg:[scrollbar-width:none] [&>div]:max-lg:contents [&_.uppercase]:max-lg:hidden">
          <SideGroup title="Trạng thái">
            <SideItem active={is({ kind: "all" })} onClick={() => setView({ kind: "all" })} icon={<Inbox />} label="Tất cả" count={library.length} />
            {STATUS_ORDER.map((s) => (
              <SideItem key={s} active={is({ kind: "status", value: s })} onClick={() => setView({ kind: "status", value: s })}
                icon={<StatusDot status={s} />} label={STATUS_LABEL[s]} count={counts.status[s]} />
            ))}
            <SideItem active={is({ kind: "starred" })} onClick={() => setView({ kind: "starred" })}
              icon={<Star className="fill-star text-star" />} label="Bài hay" count={counts.starred} />
          </SideGroup>
          {Object.keys(counts.folders).length > 0 && (
            <SideGroup title="Thư mục">
              {Object.entries(counts.folders).sort().map(([f, n]) => (
                <SideItem key={f} active={is({ kind: "folder", value: f })} onClick={() => setView({ kind: "folder", value: f })}
                  icon={<Folder />} label={f || "Thư mục gốc"} count={n} />
              ))}
            </SideGroup>
          )}
          {Object.keys(counts.tags).length > 0 && (
            <SideGroup title="Tags">
              {Object.entries(counts.tags).sort().map(([t, n]) => (
                <SideItem key={t} active={is({ kind: "tag", value: t })} onClick={() => setView({ kind: "tag", value: t })}
                  icon={<Hash />} label={t} count={n} />
              ))}
            </SideGroup>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-xl font-semibold tracking-tight">
              {viewTitle} <span className="ml-1 text-base font-normal text-muted-foreground tabular-nums">{shown.length}</span>
            </h2>
            {missing > 0 && (
              <Button variant="ghost" size="sm" onClick={backfill} disabled={backfilling} className="text-muted-foreground"
                title="Các bài tải bằng CLI chưa có abstract">
                <FileText /> {backfilling ? "Đang lấy abstract…" : `Lấy abstract còn thiếu (${missing})`}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><ArrowDownUp className="text-muted-foreground" />{SORTS[sort]}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as Sort)}>
                  {Object.entries(SORTS).map(([v, l]) => <DropdownMenuRadioItem key={v} value={v}>{l}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card px-3 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <Search className="size-4 text-muted-foreground" />
            <input data-search-focus value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setText(""))}
              placeholder="Lọc theo tiêu đề, tác giả, abstract, ghi chú, tag…" aria-label="Lọc thư viện"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <Kbd className="max-sm:hidden">/</Kbd>
          </div>

          {!libraryLoaded && (
            <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          )}
          {libraryLoaded && library.length === 0 && (
            <div className="rounded-xl border border-dashed px-6 py-14 text-center">
              <p className="font-medium">Thư viện còn trống</p>
              <p className="mt-1 text-sm text-muted-foreground">Tìm một chủ đề rồi bấm “Tải về” để thêm bài đầu tiên.</p>
              <Button className="mt-4" onClick={() => navigate("/")}><Search /> Tìm paper</Button>
            </div>
          )}
          {libraryLoaded && library.length > 0 && shown.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Không có bài nào khớp.</p>
          )}

          {shown.length > 0 && (
            <ul ref={listRef} className="divide-y overflow-hidden rounded-xl border bg-card">
              {shown.map((p, i) => (
                <li key={p.key} data-index={i}
                  className={cn("group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                    i === cursor && "bg-muted/50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand")}
                  onClick={() => { setCursor(i); open(p.key); }} onDoubleClick={() => read(p.key)}>
                  <button type="button" aria-label={p.starred ? "Bỏ đánh dấu bài hay" : "Đánh dấu bài hay"} aria-pressed={p.starred}
                    onClick={(e) => { e.stopPropagation(); update(p.key, { starred: !p.starred }); }}
                    className={cn("mt-0.5 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      p.starred ? "text-star" : "text-muted-foreground/80 hover:text-foreground")}>
                    <Star className={cn("size-4", p.starred && "fill-star")} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setCursor(i); open(p.key); }}
                      className="block max-w-full text-left font-serif text-[15.5px] leading-snug font-semibold outline-none focus-visible:underline max-sm:line-clamp-2 sm:truncate">
                      {p.title}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      <span>{shortAuthors(p.authors, 2)}</span>
                      <span className="tabular-nums">{p.published.slice(0, 4)}</span>
                      {p.categories[0] && <span>{p.categories[0]}</span>}
                      {p.tags.map((t) => <span key={t} className="rounded bg-accent px-1.5 text-xs text-accent-foreground">{t}</span>)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    <span className="max-sm:hidden"><StatusBadge status={p.status} /></span>
                    <span className="sm:hidden" title={STATUS_LABEL[p.status]}><StatusDot status={p.status} /></span>
                    <Button variant="ghost" size="icon-xs" aria-label="Đọc" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={(e) => { e.stopPropagation(); read(p.key); }}>
                      <BookOpen />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {shown.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground max-sm:hidden">
              <span><Kbd>j</Kbd> <Kbd>k</Kbd> di chuyển</span><span><Kbd>Enter</Kbd> chi tiết</span>
              <span><Kbd>o</Kbd> đọc</span><span><Kbd>s</Kbd> đánh dấu</span><span>Nhấp đúp để đọc</span>
            </p>
          )}
        </div>
      </section>

      <Dialog open={!!selected} onOpenChange={(o) => !o && open(null)}>
        {selected && (
          <SheetContent title={selected.title}>
            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8">
              <h2 className="pr-8 font-serif text-xl leading-snug font-semibold text-balance">{selected.title}</h2>
              <PaperMeta p={selected} authors={6} className="mt-2" />
              <div className="mt-4 flex gap-2">
                <Button onClick={() => read(selected.key)}><BookOpen /> Đọc</Button>
                <Button variant="outline" asChild>
                  <a href={absUrl(selected)} target="_blank" rel="noreferrer"><ExternalLink /> arXiv</a>
                </Button>
              </div>
              <div className="mt-6">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Abstract</div>
                <p className="text-sm leading-relaxed text-foreground/85">
                  {selected.summary || "Chưa có abstract. Bấm “Lấy abstract còn thiếu” ở trang Thư viện."}
                </p>
              </div>
              <div className="my-6 h-px bg-border" />
              <PaperEditor p={selected} notesRows={10} />
              <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground"><Folder className="size-3.5" />
                <span className="truncate font-mono">{selected.file}</span></p>
            </div>
          </SheetContent>
        )}
      </Dialog>
    </div>
  );
}
