import type { Status } from "../api";
import { STATUS_LABEL } from "../store";

const ORDER: Status[] = ["unread", "reading", "done"];

export function StatusDot({ status }: { status: Status }) {
  return <span className={`dot ${status}`} aria-hidden="true" />;
}

export function StatusPicker({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Trạng thái đọc">
      {ORDER.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s}
                className={value === s ? "on" : ""} onClick={() => onChange(s)}>
          <StatusDot status={s} />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
