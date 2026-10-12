import { monthLabel, pad } from '../lib/util'

export default function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number)
    const dt = new Date(y, m - 1 + d, 1)
    onChange(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`)
  }
  return (
    <div className="flex items-center gap-2">
      <button className="btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
      <span className="min-w-44 text-center text-xl font-semibold">{monthLabel(month)}</span>
      <button className="btn" onClick={() => shift(1)} aria-label="Next month">›</button>
    </div>
  )
}
