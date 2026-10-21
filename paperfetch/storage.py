"""Where PDFs go: file naming, duplicate detection, and the index.csv log."""
import csv
import re
import unicodedata
from datetime import datetime
from pathlib import Path

from .models import Paper

INDEX_NAME = "index.csv"
INDEX_FIELDS = ["source", "id", "version", "title", "authors", "published",
                "categories", "folder", "file", "pdf_url", "downloaded_at"]
MAX_TITLE_CHARS = 80


def safe_id(paper: Paper) -> str:
    # Old-style arXiv IDs contain a slash, e.g. "hep-th/9901001".
    return paper.id.replace("/", "_")


def filename_for(paper: Paper) -> str:
    title = unicodedata.normalize("NFKD", paper.title).encode("ascii", "ignore").decode()
    title = re.sub(r"[^A-Za-z0-9-]+", "_", title).strip("_")[:MAX_TITLE_CHARS].rstrip("_")
    return f"{safe_id(paper)}{paper.version}_{title}.pdf"


class Library:
    def __init__(self, root: Path):
        self.root = root
        self.index_path = root / INDEX_NAME
        self._known = self._load_known()

    def _load_known(self) -> set[str]:
        known = set()
        if self.index_path.exists():
            with open(self.index_path, newline="", encoding="utf-8-sig") as f:
                known |= {f"{r['source']}:{r['id']}" for r in csv.DictReader(f)}
        # Also catch PDFs that are on disk but missing from the index.
        self._pdf_names = [p.name for p in self.root.rglob("*.pdf")] if self.root.exists() else []
        return known

    def has(self, paper: Paper) -> bool:
        if f"{paper.source}:{paper.id}" in self._known:
            return True
        sid = safe_id(paper)
        return any(re.match(rf"{re.escape(sid)}(v\d+)?_", n) for n in self._pdf_names)

    def subfolders(self) -> list[str]:
        if not self.root.exists():
            return []
        return sorted(p.relative_to(self.root).as_posix()
                      for p in self.root.rglob("*") if p.is_dir())

    def save(self, paper: Paper, pdf: bytes, folder: str) -> Path:
        dest_dir = self.root / folder if folder else self.root
        dest_dir.mkdir(parents=True, exist_ok=True)
        path = dest_dir / filename_for(paper)
        tmp = path.with_suffix(".pdf.part")
        tmp.write_bytes(pdf)
        tmp.replace(path)
        self._append_index(paper, path)
        self._known.add(f"{paper.source}:{paper.id}")
        return path

    def _append_index(self, paper: Paper, path: Path) -> None:
        new_file = not self.index_path.exists()
        rel = path.relative_to(self.root)
        with open(self.index_path, "a", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=INDEX_FIELDS)
            if new_file:
                w.writeheader()
            w.writerow({
                "source": paper.source,
                "id": paper.id,
                "version": paper.version,
                "title": paper.title,
                "authors": "; ".join(paper.authors),
                "published": paper.published,
                "categories": " ".join(paper.categories),
                "folder": rel.parent.as_posix() if rel.parent != Path(".") else "",
                "file": rel.as_posix(),
                "pdf_url": paper.pdf_url,
                "downloaded_at": datetime.now().isoformat(timespec="seconds"),
            })
