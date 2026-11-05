export type Status = "unread" | "reading" | "done";

export interface PaperBase {
  id: string;
  source: string;
  version: string;
  title: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  summary: string;
  pdf_url: string;
}

export interface SearchResult extends PaperBase {
  key: string;
  in_library: boolean;
  on_disk: boolean;
  suggested_folder: string;
}

export interface LibraryItem extends PaperBase {
  key: string;
  file: string;
  folder: string;
  downloaded_at: string;
  status: Status;
  starred: boolean;
  tags: string[];
  notes: string;
  last_opened: string;
}

export interface Preset {
  query?: string;
  categories?: string[];
  max_results?: number;
  sort?: string;
  field?: string;
  since?: string;
  until?: string;
  last?: string;
  folder?: string;
}

export interface Meta {
  library_dir: string;
  categories: { code: string; label: string }[];
  statuses: Record<Status, string>;
  defaults: { max_results: number; sort: string; field: string; categories: string[] };
  presets: Record<string, Preset>;
  folders: string[];
  tags: string[];
}

export interface SearchParams {
  query: string;
  categories: string[];
  field: string;
  sort: string;
  since: string;
  until: string;
  max_results: number;
  start?: number;
}

export type Patch = Partial<Pick<LibraryItem, "status" | "starred" | "tags" | "notes">>;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new Error("Không kết nối được backend. Backend (uvicorn) có đang chạy không?");
  }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const body = await r.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

const k = (key: string) => `key=${encodeURIComponent(key)}`;

export const api = {
  meta: () => req<Meta>("/api/meta"),
  reload: () => req<{ ok: boolean }>("/api/reload", { method: "POST" }),
  search: (p: SearchParams) => {
    const q = new URLSearchParams({
      query: p.query, field: p.field, sort: p.sort,
      max_results: String(p.max_results), start: String(p.start ?? 0),
    });
    p.categories.forEach((c) => q.append("categories", c));
    if (p.since) q.set("since", p.since);
    if (p.until) q.set("until", p.until);
    return req<SearchResult[]>(`/api/search?${q}`);
  },
  library: () => req<LibraryItem[]>("/api/library"),
  download: (paper: PaperBase, folder: string | null) =>
    req<LibraryItem>("/api/library", { method: "POST", body: JSON.stringify({ paper, folder }) }),
  update: (key: string, patch: Patch) =>
    req<LibraryItem>(`/api/paper?${k(key)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  opened: (key: string) => req<LibraryItem>(`/api/paper/opened?${k(key)}`, { method: "POST" }),
  backfill: () => req<{ updated: number }>("/api/library/backfill", { method: "POST" }),
  pdfUrl: (key: string) => `/api/paper/pdf?${k(key)}`,
};
