interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
  /** Items per page (for display) */
  perPage?: number;
}

export default function Pagination({ page, pages, total, onChange, perPage = 20 }: PaginationProps) {
  if (pages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  // Build page numbers to display
  const pageNumbers: (number | '...')[] = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(pages - 1, page + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (page < pages - 2) pageNumbers.push('...');
    pageNumbers.push(pages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
      <p className="text-sm text-slate-500">
        Affichage {from}–{to} sur {total.toLocaleString('fr-FR')} résultats
      </p>
      <div className="flex items-center gap-1">
        <button
          className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          disabled={page <= 1}
          onClick={() => onChange(1)}
          title="Première page"
        >
          «
        </button>
        <button
          className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          title="Page précédente"
        >
          ‹
        </button>

        {pageNumbers.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-slate-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              className={`min-w-[2rem] px-2.5 py-1.5 rounded-lg text-sm font-medium transition ${
                p === page
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          title="Page suivante"
        >
          ›
        </button>
        <button
          className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          disabled={page >= pages}
          onClick={() => onChange(pages)}
          title="Dernière page"
        >
          »
        </button>
      </div>
    </div>
  );
}
