import { X } from "lucide-react";
import { useId, useState } from "react";

export function TagInput({ value, suggestions, onChange }: {
  value: string[]; suggestions: string[]; onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-accent py-0.5 pr-1 pl-2 text-xs font-medium text-accent-foreground">
          {t}
          <button type="button" aria-label={`Bỏ tag ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}
            className="rounded p-0.5 opacity-60 hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={listId}
        placeholder={value.length ? "Thêm…" : "Thêm tag, Enter để lưu"}
        aria-label="Thêm tag"
        className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(text); }
          if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
