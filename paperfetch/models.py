from dataclasses import dataclass, field


@dataclass
class Paper:
    id: str                 # source-specific ID without version, e.g. "2401.12345"
    title: str
    authors: list[str]
    published: str          # YYYY-MM-DD
    pdf_url: str
    source: str             # "arxiv", later "semanticscholar", "openalex", ...
    version: str = ""       # e.g. "v2" (arXiv only)
    categories: list[str] = field(default_factory=list)  # primary category first
    updated: str = ""       # YYYY-MM-DD of the latest version
    summary: str = ""       # abstract

    def short_authors(self, n: int = 3) -> str:
        names = ", ".join(self.authors[:n])
        return names + (", et al." if len(self.authors) > n else "")
