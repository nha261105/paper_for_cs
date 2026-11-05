import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { LibraryItem } from "../api";
import { useStore } from "../store";
import { Icon } from "./Icon";
import { StatusPicker } from "./StatusPicker";
import { TagInput } from "./TagInput";

/** Status, star, tags and notes of one library paper. Everything saves by itself. */
export function PaperEditor({ p, notesRows = 12 }: { p: LibraryItem; notesRows?: number }) {
  const { update, meta } = useStore();
  return (
    <div className="editor">
      <div className="field">
        <span className="label">Trạng thái</span>
        <StatusPicker value={p.status} onChange={(status) => update(p.key, { status })} />
      </div>
      <button type="button" className={`star-toggle ${p.starred ? "on" : ""}`} aria-pressed={p.starred}
              onClick={() => update(p.key, { starred: !p.starred })}>
        <Icon name="star" size={16} /> {p.starred ? "Bài hay (đã đánh dấu)" : "Đánh dấu bài hay"}
      </button>
      <div className="field">
        <span className="label">Tags</span>
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
  const [saved, setSaved] = useState<"saved" | "dirty" | "saving">("saved");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(text);
  latest.current = text;

  const save = async () => {
    window.clearTimeout(timer.current);
    if (latest.current === p.notes) return setSaved("saved");
    setSaved("saving");
    await update(p.key, { notes: latest.current });
    setSaved("saved");
  };

  // Autosave 800 ms after the last keystroke, and when leaving the paper.
  useEffect(() => () => { if (latest.current !== p.notes) update(p.key, { notes: latest.current }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  return (
    <div className="field notes">
      <div className="notes-head">
        <span className="label">Ghi chú</span>
        <span className="save-state">{saved === "saved" ? "Đã lưu" : saved === "saving" ? "Đang lưu…" : "Chưa lưu"}</span>
        <div className="mini-tabs">
          <button type="button" className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>Sửa</button>
          <button type="button" className={mode === "view" ? "on" : ""} onClick={() => { save(); setMode("view"); }}>Xem</button>
        </div>
      </div>
      {mode === "edit" ? (
        <textarea
          value={text}
          rows={rows}
          placeholder={"Ghi chú Markdown, vd:\n## Ý chính\n- …\n## Câu hỏi\n- …"}
          aria-label="Ghi chú"
          onChange={(e) => {
            setText(e.target.value);
            setSaved("dirty");
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(save, 800);
          }}
          onBlur={save}
        />
      ) : (
        <div className="markdown" onDoubleClick={() => setMode("edit")}>
          {text ? <Markdown>{text}</Markdown> : <p className="dim">Chưa có ghi chú. Bấm “Sửa” để viết.</p>}
        </div>
      )}
    </div>
  );
}
