import { ArrowLeft, ChevronsUpDown, ExternalLink, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/api";
import { PaperEditor } from "@/components/PaperEditor";
import { absUrl, PaperMeta } from "@/components/PaperMeta";
import { StatusMenu } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/input";
import { Tip } from "@/components/ui/tooltip";
import { cn, isTyping, modKey } from "@/lib/utils";
import { useStore } from "@/store";

const PANEL_OPEN = "reader.panel";
const PANEL_WIDTH = "reader.width";
const MIN_W = 300, MAX_W = 680;

function load<T>(key: string, fallback: T, parse: (s: string) => T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export function ReaderPage({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { library, libraryLoaded, markOpened, update } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(() => load(PANEL_OPEN, true, (s) => s !== "0"));
  const [width, setWidth] = useState(() => load(PANEL_WIDTH, 380, (s) => Math.min(MAX_W, Math.max(MIN_W, +s || 380))));
  const [dragging, setDragging] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const recent = useMemo(
    () => [...library].sort((a, b) => b.last_opened.localeCompare(a.last_opened) || b.downloaded_at.localeCompare(a.downloaded_at)),
    [library],
  );
  const key = params.get("key") ?? recent[0]?.key ?? null;
  const paper = library.find((p) => p.key === key);

  useEffect(() => {
    if (paper) markOpened(paper.key);
    // Only when the paper changes, not on every edit of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.key]);

  const togglePanel = useCallback(() => {
    setPanel((v) => { save(PANEL_OPEN, v ? "0" : "1"); return !v; });
  }, []);

  // "n" toggles the notes panel (when focus is not in a text field or inside the PDF).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" && !isTyping(e) && !e.metaKey && !e.ctrlKey && !e.altKey) togglePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const right = bodyRef.current!.getBoundingClientRect().right;
    const move = (ev: PointerEvent) => setWidth(Math.min(MAX_W, Math.max(MIN_W, right - ev.clientX)));
    const up = () => {
      setDragging(false);
      setWidth((w) => { save(PANEL_WIDTH, String(Math.round(w))); return w; });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (libraryLoaded && !library.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="font-medium">Chưa có bài nào để đọc</p>
          <p className="mt-1 text-sm text-muted-foreground">Tải một paper về thư viện trước.</p>
          <Button className="mt-4" onClick={() => navigate("/")}><Search /> Tìm paper</Button>
        </div>
      </div>
    );
  }
  if (!paper) {
    return <p className="p-8 text-sm text-muted-foreground">{libraryLoaded ? "Không tìm thấy bài này trong thư viện." : "Đang tải…"}</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-background px-2">
        <Tip label="Về thư viện">
          <Button variant="ghost" size="icon-sm" aria-label="Về thư viện"
            onClick={() => navigate(`/library?key=${encodeURIComponent(paper.key)}`)}>
            <ArrowLeft />
          </Button>
        </Tip>
        <button type="button" onClick={onOpenPalette}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60">
          <span className="truncate font-serif text-[15px] font-semibold">{paper.title}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="ml-auto hidden shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
            <Kbd>{modKey}</Kbd><Kbd>K</Kbd>
          </span>
        </button>
        <StatusMenu value={paper.status} onChange={(status) => update(paper.key, { status })} />
        <Tip label="Mở PDF ở tab mới">
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={api.pdfUrl(paper.key)} target="_blank" rel="noreferrer" aria-label="Mở PDF ở tab mới"><ExternalLink /></a>
          </Button>
        </Tip>
        <Tip label={<>{panel ? "Ẩn ghi chú" : "Hiện ghi chú"} <Kbd className="h-4 border-0 bg-primary-foreground/15 text-primary-foreground">N</Kbd></>}>
          <Button variant="ghost" size="icon-sm" aria-pressed={panel} aria-label={panel ? "Ẩn ghi chú" : "Hiện ghi chú"} onClick={togglePanel}>
            {panel ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </Tip>
      </header>

      <div ref={bodyRef} className="flex min-h-0 flex-1 max-lg:flex-col">
        {/* Plain (not sandboxed) iframe: Chrome/Edge/Firefox open their own PDF viewer here. */}
        <iframe key={paper.key} src={api.pdfUrl(paper.key)} title={paper.title}
          className={cn("min-h-0 flex-1 border-0 bg-muted max-lg:min-h-[75vh]", dragging && "pointer-events-none")} />
        {panel && (
          <>
            <div role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng panel" onPointerDown={startDrag}
              className={cn("relative w-px shrink-0 cursor-col-resize bg-border max-lg:hidden",
                "after:absolute after:inset-y-0 after:-left-1.5 after:w-3 after:content-[''] hover:bg-brand", dragging && "bg-brand")} />
            <aside style={{ "--panel-w": `${width}px` } as React.CSSProperties} aria-label="Ghi chú"
              className="shrink-0 overflow-y-auto bg-card px-5 pt-5 pb-10 lg:w-[var(--panel-w)] max-lg:border-t">
              <h2 className="font-serif text-lg leading-snug font-semibold text-balance">{paper.title}</h2>
              <PaperMeta p={paper} authors={4} className="mt-1.5" />
              <details className="group mt-4 rounded-lg border px-3 py-2 open:pb-3">
                <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground outline-none select-none hover:text-foreground marker:hidden">
                  Abstract <span className="float-right transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/85">{paper.summary || "Chưa có abstract."}</p>
                <a href={absUrl(paper)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand hover:underline">Trang arXiv</a>
              </details>
              <div className="mt-5"><PaperEditor p={paper} notesRows={14} /></div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
