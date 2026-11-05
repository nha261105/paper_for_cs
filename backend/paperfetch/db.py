"""Reading database for the web app: metadata + reading status, tags, notes.

Lives next to the PDFs as <download_dir>/library.db. index.csv stays the CLI's
log; `sync_from_index` pulls anything the CLI downloaded into the database.
"""
import csv
import functools
import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from .models import Paper
from .storage import INDEX_NAME

DB_NAME = "library.db"
STATUSES = {"unread": "Chưa đọc", "reading": "Đang đọc", "done": "Đã đọc"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
    key           TEXT PRIMARY KEY,          -- "<source>:<id>"
    source        TEXT NOT NULL,
    id            TEXT NOT NULL,
    version       TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL,
    authors       TEXT NOT NULL DEFAULT '[]', -- JSON list
    published     TEXT NOT NULL DEFAULT '',
    updated       TEXT NOT NULL DEFAULT '',
    categories    TEXT NOT NULL DEFAULT '[]', -- JSON list, primary first
    summary       TEXT NOT NULL DEFAULT '',
    pdf_url       TEXT NOT NULL DEFAULT '',
    file          TEXT NOT NULL DEFAULT '',   -- path relative to download_dir
    downloaded_at TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'unread',
    starred       INTEGER NOT NULL DEFAULT 0,
    tags          TEXT NOT NULL DEFAULT '[]', -- JSON list
    notes         TEXT NOT NULL DEFAULT '',
    last_opened   TEXT NOT NULL DEFAULT ''
);
"""
JSON_COLS = ("authors", "categories", "tags")


def _locked(method):
    """Serialize access: the web API calls the database from several threads."""
    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)
    return wrapper


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


class ReadingDB:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / DB_NAME
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self.conn.executescript(SCHEMA)

    # ---- writing -----------------------------------------------------------
    @_locked
    def add(self, paper: Paper, file: str, downloaded_at: str = "") -> None:
        """Insert a downloaded paper, or refresh its metadata (keeps status/tags/notes)."""
        row = {
            "key": f"{paper.source}:{paper.id}", "source": paper.source, "id": paper.id,
            "version": paper.version, "title": paper.title,
            "authors": json.dumps(paper.authors, ensure_ascii=False),
            "published": paper.published, "updated": paper.updated,
            "categories": json.dumps(paper.categories), "summary": paper.summary,
            "pdf_url": paper.pdf_url, "file": file, "downloaded_at": downloaded_at or _now(),
        }
        cols = ", ".join(row)
        marks = ", ".join(f":{c}" for c in row)
        # Don't wipe a known abstract with an empty one (index.csv has none).
        updates = ", ".join(
            f"{c} = CASE WHEN excluded.{c} != '' THEN excluded.{c} ELSE {c} END"
            if c == "summary" else f"{c} = excluded.{c}"
            for c in row if c not in ("key", "downloaded_at"))
        with self.conn:
            self.conn.execute(f"INSERT INTO papers ({cols}) VALUES ({marks}) "
                              f"ON CONFLICT(key) DO UPDATE SET {updates}", row)

    @_locked
    def update(self, key: str, **fields) -> None:
        allowed = {"status", "starred", "tags", "notes", "last_opened", "summary"}
        bad = set(fields) - allowed
        if bad:
            raise ValueError(f"cannot update {sorted(bad)}")
        for c in JSON_COLS:
            if c in fields:
                fields[c] = json.dumps(fields[c], ensure_ascii=False)
        sets = ", ".join(f"{c} = :{c}" for c in fields)
        with self.conn:
            self.conn.execute(f"UPDATE papers SET {sets} WHERE key = :key", {**fields, "key": key})

    @_locked
    def mark_opened(self, key: str) -> None:
        with self.conn:
            self.conn.execute("UPDATE papers SET last_opened = ?, "
                              "status = CASE WHEN status = 'unread' THEN 'reading' ELSE status END "
                              "WHERE key = ?", (_now(), key))

    # ---- reading -----------------------------------------------------------
    @staticmethod
    def _decode(row: sqlite3.Row) -> dict:
        d = dict(row)
        for c in JSON_COLS:
            d[c] = json.loads(d[c] or "[]")
        d["starred"] = bool(d["starred"])
        return d

    @_locked
    def get(self, key: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM papers WHERE key = ?", (key,)).fetchone()
        return self._decode(row) if row else None

    @_locked
    def all(self) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM papers ORDER BY downloaded_at DESC").fetchall()
        return [self._decode(r) for r in rows]

    @_locked
    def keys(self) -> set[str]:
        return {r[0] for r in self.conn.execute("SELECT key FROM papers")}

    @_locked
    def all_tags(self) -> list[str]:
        tags = set()
        for (t,) in self.conn.execute("SELECT tags FROM papers"):
            tags.update(json.loads(t or "[]"))
        return sorted(tags, key=str.lower)

    @_locked
    def missing_summaries(self, source: str = "arxiv") -> list[str]:
        return [r[0] for r in self.conn.execute(
            "SELECT id FROM papers WHERE source = ? AND summary = ''", (source,))]

    def pdf_path(self, paper: dict) -> Path:
        return self.root / paper["file"]

    # ---- syncing with the CLI ----------------------------------------------
    @_locked
    def sync_from_index(self) -> int:
        """Import rows from index.csv that aren't in the database yet. Returns count."""
        index = self.root / INDEX_NAME
        if not index.exists():
            return 0
        known = self.keys()
        added = 0
        with open(index, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                key = f"{r['source']}:{r['id']}"
                if key in known or not (self.root / r["file"]).exists():
                    continue
                paper = Paper(
                    id=r["id"], version=r["version"], title=r["title"],
                    authors=[a for a in r["authors"].split("; ") if a],
                    published=r["published"], pdf_url=r["pdf_url"], source=r["source"],
                    categories=r["categories"].split(),
                )
                self.add(paper, r["file"], r["downloaded_at"])
                known.add(key)
                added += 1
        return added
