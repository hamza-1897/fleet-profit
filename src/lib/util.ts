export type Vehicle = { id: number; number: string; is_active: boolean }
export type Product = { id: number; code: string; is_active: boolean }
export type Trip = {
  id: number; vehicle_id: number; trip_date: string; type: 'BAGS' | 'LUMPSUM'
  product_id: number | null; quantity: number | null; rate_used: number | null
  freight: number; note: string | null
}
export type Expense = {
  id: number; vehicle_id: number; expense_date: string
  total_expense: number; challan: number; note: string | null
}

export const pad = (n: number) => String(n).padStart(2, '0')
export const num = (v: unknown) => Number(v) || 0
export const rs = (n: number) => Math.round(n).toLocaleString('en-US')

// Local date (not UTC), so late-night entries in Pakistan do not land on the wrong day.
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const currentMonth = () => todayStr().slice(0, 7)

export const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`
  return { from: `${m}-01`, to: `${next}-01` }
}
export const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`
}
export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
export const dayLabel = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Supabase returns at most 1000 rows per request, so read page by page.
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<any>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await build(i, i + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export const errText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
