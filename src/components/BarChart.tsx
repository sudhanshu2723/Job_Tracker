// A recessive horizontal bar list with direct value labels and a color dot.
// Used for both the status pipeline and the source breakdown.

export interface BarDatum {
  label: string;
  count: number;
  color: string; // resolved CSS color or var()
}

export function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bar-list" role="list">
      {data.map((d) => {
        const pct = (d.count / max) * 100;
        return (
          <div
            className={`bar-row${d.count === 0 ? " empty" : ""}`}
            key={d.label}
            role="listitem"
          >
            <span className="name">
              <span className="dot" style={{ background: d.color }} />
              {d.label}
            </span>
            <span
              className="bar-track"
              title={`${d.label}: ${d.count}`}
              aria-label={`${d.label}: ${d.count}`}
            >
              <span
                className="bar-fill"
                style={{
                  width: `${d.count === 0 ? 0 : Math.max(pct, 4)}%`,
                  background: d.color,
                  opacity: d.count === 0 ? 0.3 : 1,
                }}
              />
            </span>
            <span className="count tnum">{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}
