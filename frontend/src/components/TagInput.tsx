import { useId, useState } from "react";
import { Icon } from "./Icon";

export function TagInput({ value, suggestions, onChange }: {
  value: string[]; suggestions: string[]; onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" aria-label={`Bỏ tag ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={listId}
        placeholder={value.length ? "" : "Thêm tag…"}
        aria-label="Thêm tag"
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v);
          else setText(v);
        }}
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
