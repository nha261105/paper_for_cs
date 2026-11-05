"""HTTP API for the React frontend (frontend/). Wraps the same code as the CLI.

    uvicorn server:app --reload --port 8000

If frontend/dist exists (after `npm run build`), it is served at / too, so
http://localhost:8000 is the whole app with no Node process running.
"""
import threading
import urllib.error
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from paperfetch import config
from paperfetch.db import STATUSES, ReadingDB
from paperfetch.models import Paper
from paperfetch.sources import arxiv
from paperfetch.storage import Library, clean_folder
from paperfetch.wizard import CATEGORIES

NET_ERRORS = (arxiv.ArxivError, urllib.error.URLError, TimeoutError)
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


class State:
    """Config + library, reloadable without restarting the server."""

    def __init__(self):
        self.lock = threading.Lock()
        self.load()

    def load(self):
        cfg = config.load()
        root = cfg["download_dir"]
        for name in cfg["folders"]:
            (root / clean_folder(name)).mkdir(parents=True, exist_ok=True)
        self.cfg, self.root = cfg, root
        self.lib = Library(root)
        self.db = ReadingDB(root)
        self.db.sync_from_index()


S = State()
app = FastAPI(title="paper_for_cs")


# ---------------------------------------------------------------- models
class PaperIn(BaseModel):
    id: str
    title: str
    authors: list[str]
    published: str
    pdf_url: str
    source: str = "arxiv"
    version: str = ""
    categories: list[str] = []
    updated: str = ""
    summary: str = ""


class DownloadIn(BaseModel):
    paper: PaperIn
    folder: str | None = None  # None = suggestion from category_folders, "" = root


class PatchIn(BaseModel):
    status: Literal["unread", "reading", "done"] | None = None
    starred: bool | None = None
    tags: list[str] | None = None
    notes: str | None = None


def library_item(p: dict) -> dict:
    folder = p["file"].rpartition("/")[0]
    return {**p, "folder": folder}


def get_item(key: str) -> dict:
    p = S.db.get(key)
    if not p:
        raise HTTPException(404, f"không có bài {key!r} trong thư viện")
    return p


# ---------------------------------------------------------------- meta
@app.get("/api/meta")
def meta():
    cfg = S.cfg
    return {
        "library_dir": str(S.root),
        "categories": [{"code": c, "label": label} for c, label in CATEGORIES],
        "sorts": list(arxiv.SORT_MAP),
        "fields": list(arxiv.FIELD_MAP),
        "statuses": STATUSES,
        "defaults": {k: cfg[k] for k in ("max_results", "sort", "field", "categories")},
        "presets": cfg["presets"],
        "category_folders": cfg["category_folders"],
        "folders": S.lib.subfolders(),
        "tags": S.db.all_tags(),
    }


@app.post("/api/reload")
def reload():
    """Re-read config.json and pick up papers downloaded with the CLI."""
    try:
        S.load()
    except (OSError, ValueError) as e:
        raise HTTPException(400, f"lỗi đọc config.json: {e}")
    return {"ok": True}


# ---------------------------------------------------------------- search
@app.get("/api/search")
def search(query: str = "", categories: list[str] = Query(default=[]),
           field: str = "all", sort: str = "relevance",
           since: date | None = None, until: date | None = None,
           max_results: int = Query(10, ge=1, le=200), start: int = Query(0, ge=0)):
    if sort not in arxiv.SORT_MAP or field not in arxiv.FIELD_MAP:
        raise HTTPException(400, "sort/field không hợp lệ")
    if not query.strip() and not categories:
        raise HTTPException(400, "cần nhập chủ đề hoặc chọn ít nhất một lĩnh vực")
    try:
        papers = arxiv.search(query, categories=categories, max_results=max_results, sort=sort,
                              field=field, since=since, until=until, start=start)
    except NET_ERRORS as e:
        raise HTTPException(502, f"lỗi khi gọi arXiv API: {e}")
    keys = S.db.keys()
    return [{**asdict(p), "key": f"{p.source}:{p.id}",
             "in_library": f"{p.source}:{p.id}" in keys,
             "on_disk": S.lib.has(p),
             "suggested_folder": config.folder_for_category(S.cfg, p.categories) or ""}
            for p in papers]


# ---------------------------------------------------------------- library
@app.get("/api/library")
def library():
    S.db.sync_from_index()
    return [library_item(p) for p in S.db.all()]


@app.post("/api/library")
def download(body: DownloadIn):
    paper = Paper(**body.paper.model_dump())
    key = f"{paper.source}:{paper.id}"
    if paper.source != "arxiv":
        raise HTTPException(400, "hiện chỉ hỗ trợ arXiv")
    if S.db.get(key):
        return library_item(S.db.get(key))
    folder = clean_folder(body.folder) if body.folder is not None else (
        config.folder_for_category(S.cfg, paper.categories) or "")
    try:
        pdf = arxiv.download_pdf(paper)
    except NET_ERRORS as e:
        raise HTTPException(502, f"lỗi tải PDF: {e}")
    if not pdf.startswith(b"%PDF"):
        raise HTTPException(502, "arXiv không trả về file PDF")
    with S.lock:
        path = S.lib.save(paper, pdf, folder)
    S.db.add(paper, path.relative_to(S.root).as_posix())
    return library_item(S.db.get(key))


# Keys look like "arxiv:2401.12345" (old IDs contain "/"), so they go in the query string.
@app.get("/api/paper")
def paper(key: str):
    return library_item(get_item(key))


@app.patch("/api/paper")
def update(key: str, body: PatchIn):
    get_item(key)
    fields = body.model_dump(exclude_none=True)
    if "starred" in fields:
        fields["starred"] = int(fields["starred"])
    if "tags" in fields:
        fields["tags"] = sorted({t.strip() for t in fields["tags"] if t.strip()}, key=str.lower)
    if fields:
        S.db.update(key, **fields)
    return library_item(S.db.get(key))


@app.post("/api/paper/opened")
def opened(key: str):
    get_item(key)
    S.db.mark_opened(key)
    return library_item(S.db.get(key))


@app.get("/api/paper/pdf")
def pdf(key: str):
    p = get_item(key)
    path = S.db.pdf_path(p).resolve()
    if not path.is_relative_to(S.root) or not path.exists():
        raise HTTPException(404, "không tìm thấy file PDF")
    # inline -> the browser's own PDF viewer opens it
    return FileResponse(path, media_type="application/pdf",
                        content_disposition_type="inline", filename=path.name)


@app.post("/api/library/backfill")
def backfill():
    """Fetch abstracts for papers downloaded with the CLI (index.csv has none)."""
    ids = S.db.missing_summaries()
    if not ids:
        return {"updated": 0}
    try:
        found = arxiv.fetch_by_ids(ids)
    except NET_ERRORS as e:
        raise HTTPException(502, f"lỗi khi gọi arXiv API: {e}")
    for p in found:
        S.db.update(f"arxiv:{p.id}", summary=p.summary)
    return {"updated": len(found)}


class SPAFiles(StaticFiles):
    """Static build of the React app; unknown paths (/library, /read/...) get index.html."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code != 404 or path.startswith("api/"):
                raise
            return FileResponse(FRONTEND_DIST / "index.html")


if FRONTEND_DIST.exists():
    app.mount("/", SPAFiles(directory=FRONTEND_DIST, html=True), name="frontend")
