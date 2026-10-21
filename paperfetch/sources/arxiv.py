"""arXiv source using the official API: https://info.arxiv.org/help/api/"""
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date

from .. import net
from ..models import Paper

API_URL = "https://export.arxiv.org/api/query"
MIN_INTERVAL = 3.0          # arXiv asks for >= 3 s between requests
THROTTLE_KEY = "arxiv"      # shared by API calls and PDF downloads

ATOM = "{http://www.w3.org/2005/Atom}"
ARXIV = "{http://arxiv.org/schemas/atom}"

# name -> (sortBy, sortOrder)
SORT_MAP = {
    "relevance": ("relevance", "descending"),
    "date": ("submittedDate", "descending"),
    "updated": ("lastUpdatedDate", "descending"),
    "oldest": ("submittedDate", "ascending"),
}
FIELD_MAP = {"all": "all", "title": "ti", "abstract": "abs", "author": "au"}
FIELD_PREFIX = re.compile(r"\b(ti|au|abs|co|jr|cat|rn|id|all|submittedDate):")
ID_RE = re.compile(r"arxiv\.org/abs/(.+?)(v\d+)?$")
# arXiv's index drops these, so "ti:is" matches nothing and would zero out an AND query.
STOPWORDS = set("a an and are as at be but by for if in into is it no not of on or "
                "such that the their then there these they this to was will with".split())


class ArxivError(RuntimeError):
    pass


def build_query(query: str, categories: list[str], field: str = "all",
                since: date | None = None, until: date | None = None) -> str:
    """Plain words are AND-ed within `field`; queries that already use arXiv
    field prefixes (ti:, au:, abs:, ...) are passed through unchanged."""
    q = query.strip()
    if q and not FIELD_PREFIX.search(q):
        words = [w for w in q.split() if w.lower() not in STOPWORDS] or q.split()
        q = " AND ".join(f"{FIELD_MAP[field]}:{w}" for w in words)
    parts = [f"({q})"] if q else []
    if categories:
        parts.append("(" + " OR ".join(f"cat:{c}" for c in categories) + ")")
    if since or until:
        lo = (since or date(1991, 1, 1)).strftime("%Y%m%d") + "0000"
        hi = (until or date.today()).strftime("%Y%m%d") + "2359"
        parts.append(f"submittedDate:[{lo} TO {hi}]")
    return " AND ".join(parts)


def search(query: str, *, categories: list[str] | None = None,
           max_results: int = 10, sort: str = "relevance", field: str = "all",
           since: date | None = None, until: date | None = None,
           start: int = 0) -> list[Paper]:
    sort_by, sort_order = SORT_MAP[sort]
    params = {
        "search_query": build_query(query, categories or [], field, since, until),
        "start": start,
        "max_results": max_results,
        "sortBy": sort_by,
        "sortOrder": sort_order,
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    data = net.get(url, throttle_key=THROTTLE_KEY, min_interval=MIN_INTERVAL)
    return parse_feed(data)


def parse_feed(data: bytes) -> list[Paper]:
    root = ET.fromstring(data)
    papers = []
    for entry in root.findall(f"{ATOM}entry"):
        id_url = entry.findtext(f"{ATOM}id", "")
        if "/api/errors" in id_url:
            raise ArxivError(entry.findtext(f"{ATOM}summary", "").strip())
        m = ID_RE.search(id_url)
        if not m:
            continue
        arxiv_id, version = m.group(1), m.group(2) or ""

        pdf_url = next((link.get("href") for link in entry.findall(f"{ATOM}link")
                        if link.get("title") == "pdf"), None)
        pdf_url = (pdf_url or f"https://arxiv.org/pdf/{arxiv_id}{version}")
        pdf_url = pdf_url.replace("http://", "https://", 1)

        primary = entry.find(f"{ARXIV}primary_category")
        cats = [c.get("term") for c in entry.findall(f"{ATOM}category")]
        if primary is not None:
            cats = [primary.get("term")] + [c for c in cats if c != primary.get("term")]

        papers.append(Paper(
            id=arxiv_id,
            version=version,
            title=" ".join(entry.findtext(f"{ATOM}title", "").split()),
            authors=[a.findtext(f"{ATOM}name", "") for a in entry.findall(f"{ATOM}author")],
            published=entry.findtext(f"{ATOM}published", "")[:10],
            updated=entry.findtext(f"{ATOM}updated", "")[:10],
            summary=" ".join(entry.findtext(f"{ATOM}summary", "").split()),
            categories=cats,
            pdf_url=pdf_url,
            source="arxiv",
        ))
    return papers


def download_pdf(paper: Paper) -> bytes:
    return net.get(paper.pdf_url, throttle_key=THROTTLE_KEY,
                    min_interval=MIN_INTERVAL, timeout=120)
