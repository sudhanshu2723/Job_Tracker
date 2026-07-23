export function Spinner({ label, full }: { label?: string; full?: boolean }) {
  return (
    <div className={`loader${full ? " loader-full" : ""}`}>
      <span className="spinner" aria-hidden="true" />
      {label && <span className="loader-label">{label}</span>}
    </div>
  );
}
