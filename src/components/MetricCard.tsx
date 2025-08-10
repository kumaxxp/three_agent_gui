export function MetricCard({ label, value, hint }: { label: string; value: string | number | undefined; hint?: string }) {
  return (
    <div className="rounded-2xl border p-3 min-w-[120px]">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value ?? '-'}</div>
      {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
    </div>
  );
}
