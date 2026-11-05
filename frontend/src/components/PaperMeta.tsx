import type { PaperBase } from "../api";

export function absUrl(p: PaperBase) {
  return `https://arxiv.org/abs/${p.id}${p.version}`;
}

export function shortAuthors(authors: string[], n = 3) {
  return authors.slice(0, n).join(", ") + (authors.length > n ? ", et al." : "");
}

export function PaperMeta({ p, authors = 4 }: { p: PaperBase; authors?: number }) {
  return (
    <div className="meta">
      <div className="authors">{shortAuthors(p.authors, authors)}</div>
      <div className="meta-line">
        <span className="num">{p.published}</span>
        {p.updated && p.updated !== p.published && <span className="dim">cập nhật {p.updated}</span>}
        <a className="mono" href={absUrl(p)} target="_blank" rel="noreferrer">
          arXiv:{p.id}{p.version}
        </a>
        {p.categories.slice(0, 4).map((c, i) => (
          <span key={c} className={`cat ${i === 0 ? "primary" : ""}`}>{c}</span>
        ))}
      </div>
    </div>
  );
}
