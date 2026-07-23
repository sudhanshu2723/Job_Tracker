"use client";

/** Compact page list with ellipses, e.g. 1 … 4 5 6 … 20. */
export function pageNumbers(current: number, total: number): (number | "…")[] {
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  const arr = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of arr) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

interface PagerProps {
  page: number; // current (already clamped) page
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPage: (page: number) => void;
}

/** Result count + numbered pagination controls. Renders nothing when empty. */
export function Pager({ page, totalPages, pageSize, totalItems, onPage }: PagerProps) {
  if (totalItems === 0) return null;
  return (
    <div className="pager">
      <span className="pager-info">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
      </span>
      {totalPages > 1 && (
        <>
          <button className="btn" disabled={page === 1} onClick={() => onPage(page - 1)}>
            Prev
          </button>
          {pageNumbers(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span className="pager-ellipsis" key={`e${i}`}>
                …
              </span>
            ) : (
              <button
                key={p}
                className={`btn pager-num${p === page ? " active" : ""}`}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            className="btn"
            disabled={page === totalPages}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
