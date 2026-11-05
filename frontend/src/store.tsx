import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type LibraryItem, type Meta, type Patch, type SearchParams, type SearchResult } from "./api";

export interface SearchState {
  params: SearchParams | null;
  results: SearchResult[];
  exhausted: boolean;
}

interface Store {
  meta: Meta | null;
  library: LibraryItem[];
  libraryLoaded: boolean;
  error: string;
  setError: (msg: string) => void;
  refresh: (reloadConfig?: boolean) => Promise<void>;
  update: (key: string, patch: Patch) => Promise<void>;
  markOpened: (key: string) => Promise<void>;
  addToLibrary: (item: LibraryItem) => void;
  search: SearchState;
  setSearch: (s: SearchState) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState<SearchState>({ params: null, results: [], exhausted: false });

  const refresh = useCallback(async (reloadConfig = false) => {
    try {
      if (reloadConfig) await api.reload();
      const [m, lib] = await Promise.all([api.meta(), api.library()]);
      setMeta(m);
      setLibrary(lib);
      setLibraryLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const replace = useCallback((item: LibraryItem) => {
    setLibrary((lib) => lib.map((p) => (p.key === item.key ? item : p)));
  }, []);

  const update = useCallback(
    async (key: string, patch: Patch) => {
      // Optimistic: the UI changes at once, the server answer then confirms it.
      setLibrary((lib) => lib.map((p) => (p.key === key ? { ...p, ...patch } : p)));
      try {
        replace(await api.update(key, patch));
        if (patch.tags) setMeta((m) => m && { ...m, tags: [...new Set([...m.tags, ...patch.tags!])].sort() });
      } catch (e) {
        setError((e as Error).message);
        refresh();
      }
    },
    [replace, refresh],
  );

  const markOpened = useCallback(
    async (key: string) => {
      try {
        replace(await api.opened(key));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [replace],
  );

  const addToLibrary = useCallback((item: LibraryItem) => {
    setLibrary((lib) => [item, ...lib.filter((p) => p.key !== item.key)]);
    setSearch((s) => ({ ...s, results: s.results.map((r) => (r.key === item.key ? { ...r, in_library: true } : r)) }));
    setMeta((m) => (m && item.folder && !m.folders.includes(item.folder) ? { ...m, folders: [...m.folders, item.folder].sort() } : m));
  }, []);

  const value = useMemo(
    () => ({ meta, library, libraryLoaded, error, setError, refresh, update, markOpened, addToLibrary, search, setSearch }),
    [meta, library, libraryLoaded, error, refresh, update, markOpened, addToLibrary, search],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export const STATUS_LABEL: Record<string, string> = { unread: "Chưa đọc", reading: "Đang đọc", done: "Đã đọc" };
