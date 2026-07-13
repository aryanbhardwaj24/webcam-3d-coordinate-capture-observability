export function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: string; detail: string }>
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="glass-panel p-4">
          <div className="text-xs uppercase tracking-[0.24em] text-white/45">{item.label}</div>
          <div className="mt-3 text-3xl font-semibold">{item.value}</div>
          <div className="mt-2 text-sm text-white/50">{item.detail}</div>
        </div>
      ))}
    </div>
  )
}

