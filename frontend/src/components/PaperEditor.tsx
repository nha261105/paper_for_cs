import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { LibraryItem } from "@/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { StatusSegmented } from "./Status";
import { TagInput } from "./TagInput";
import { Textarea } from "./ui/input";

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}

/** Status, star, tags and notes of one library paper. Everything saves by itself. */
export function PaperEditor({ p, notesRows = 12 }: { p: LibraryItem; notesRows?: number }) {
  const { update, meta } = useStore();
  return (
    <div className="grid gap-5">
      <div>
        <Label>Trạng thái</Label>
        <StatusSegmented value={p.status} onChange={(status) => update(p.key, { status })} />
      </div>
      <button type="button" aria-pressed={p.starred} onClick={() => update(p.key, { starred: !p.starred })}
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          p.starred ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}>
        <Star className={cn("size-4", p.starred && "fill-star text-star")} />
        {p.starred ? "Bài hay" : "Đánh dấu bài hay"}
      </button>
      <div>
        <Label>Tags</Label>
        <TagInput value={p.tags} suggestions={meta?.tags ?? []} onChange={(tags) => update(p.key, { tags })} />
      </div>
      <Notes key={p.key} p={p} rows={notesRows} />
    </div>
  );
}

function Notes({ p, rows }: { p: LibraryItem; rows: number }) {
  const { update } = useStore();
  const [text, setText] = useState(p.notes);
  const [mode, setMode] = useState<"edit" | "view">(p.notes ? "view" : "edit");
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(text);
  const savedText = useRef(p.notes);
  latest.current = text;

  const save = async () => {
    window.clearTimeout(timer.current);
    if (latest.current === savedText.current) return setState("saved");
    setState("saving");
    const value = latest.current;
    await update(p.key, { notes: value });
    savedText.current = value;
    setState(latest.current === value ? "saved" : "dirty");
  };

  // Save pending text when switching to another paper or leaving the page.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (latest.current !== savedText.current) update(p.key, { notes: latest.current });
  }, [p.key, update]);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Ghi chú</span>
        <span className="text-[11px] text-muted-foreground/80" aria-live="polite">
          {state === "saved" ? "Đã lưu" : state === "saving" ? "Đang lưu…" : "Chưa lưu"}
        </span>
        <div className="ml-auto flex rounded-md bg-muted p-0.5 text-xs">
          {(["edit", "view"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m}
              onClick={() => { if (m === "view") save(); setMode(m); }}
              className={cn("rounded px-2 py-0.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                mode === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              {m === "edit" ? "Viết" : "Xem"}
            </button>
          ))}
        </div>
      </div>
      {mode === "edit" ? (
        <Textarea
          value={text}
          rows={rows}
          aria-label="Ghi chú"
          placeholder={"Markdown, ví dụ:\n## Ý chính\n- …\n## Câu hỏi\n- …"}
          onChange={(e) => {
            setText(e.target.value);
            setState("dirty");
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(save, 800);
          }}
          onBlur={save}
        />
      ) : (
        <div onDoubleClick={() => setMode("edit")}
          className="prose prose-sm max-w-none min-h-28 rounded-md border bg-card px-3 py-2 dark:prose-invert prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-sm prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
          {text ? <Markdown>{text}</Markdown> : <p className="text-muted-foreground">Chưa có ghi chú. Bấm “Viết” để bắt đầu.</p>}
        </div>
      )}
    </div>
  );
}
