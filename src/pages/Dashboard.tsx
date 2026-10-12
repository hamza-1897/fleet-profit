import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import MonthPicker from '../components/MonthPicker'
import { Vehicle, Product, Trip, Expense, fetchAll, monthRange, monthLabel, rs, num, errText, tripFreight } from '../lib/util'

type Props = { month: string; setMonth: (m: string) => void; onOpen: (vehicleId: number) => void }

export default function Dashboard({ month, setMonth, onOpen }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [rates, setRates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let off = false
    ;(async () => {
      setLoading(true)
      try {
        const { from, to } = monthRange(month)
        const [v, p, t, e, r] = await Promise.all([
          supabase.from('vehicles').select('*').order('id'),
          supabase.from('products').select('*').order('id'),
          fetchAll<Trip>((a, b) => supabase.from('trips').select('*').gte('trip_date', from).lt('trip_date', to).order('id').range(a, b)),
          fetchAll<Expense>((a, b) => supabase.from('daily_expenses').select('*').gte('expense_date', from).lt('expense_date', to).order('id').range(a, b)),
          supabase.from('rates').select('product_id,rate_per_bag').eq('month', month),
        ])
        if (r.error) throw r.error
        if (v.error) throw v.error
        if (p.error) throw p.error
        if (off) return
        setVehicles((v.data ?? []) as Vehicle[]); setProducts((p.data ?? []) as Product[])
        const map: Record<number, number> = {}
        ;(r.data ?? []).forEach((x: any) => { map[x.product_id] = Number(x.rate_per_bag) })
        setRates(map); setTrips(t); setExpenses(e); setErr('')
      } catch (ex) {
        if (!off) setErr(errText(ex))
      } finally {
        if (!off) setLoading(false)
      }
    })()
    return () => { off = true }
  }, [month])

  const rows = useMemo(() => {
    return vehicles
      .map(v => {
        const t = trips.filter(x => x.vehicle_id === v.id)
        const e = expenses.filter(x => x.vehicle_id === v.id)
        const priced = t.map(x => tripFreight(x, rates))
        const freight = priced.reduce((s, x) => s + x.amount, 0)
        const pending = priced.filter(x => x.pending).length
        const expense = e.reduce((s, x) => s + num(x.total_expense), 0)
        const challan = e.reduce((s, x) => s + num(x.challan), 0)
        return { v, days: new Set(t.map(x => x.trip_date)).size, freight, expense, challan, net: freight - expense, pending, used: t.length + e.length > 0 }
      })
      .filter(r => r.v.is_active || r.used)
  }, [vehicles, trips, expenses, rates])

  const total = rows.reduce(
    (s, r) => ({ pending: s.pending + r.pending, days: s.days + r.days, freight: s.freight + r.freight, expense: s.expense + r.expense, challan: s.challan + r.challan, net: s.net + r.net }),
    { pending: 0, days: 0, freight: 0, expense: 0, challan: 0, net: 0 }
  )

  function exportExcel() {
    const vNum = (id: number) => vehicles.find(v => v.id === id)?.number ?? String(id)
    const pCode = (id: number | null) => (id === null ? '' : products.find(p => p.id === id)?.code ?? '')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      ...rows.map(r => ({ Vehicle: r.v.number, Days: r.days, 'Total Freight': r.freight, 'Total Expenses': r.expense, 'Of which Challan': r.challan, 'Net Profit/Loss': r.net, Status: r.used ? (r.net > 0 ? 'PROFIT' : 'LOSS') : '' })),
      { Vehicle: 'GRAND TOTAL', Days: total.days, 'Total Freight': total.freight, 'Total Expenses': total.expense, 'Of which Challan': total.challan, 'Net Profit/Loss': total.net },
    ]), 'Summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      [...trips].sort((a, b) => a.trip_date.localeCompare(b.trip_date)).map(t => ({ Date: t.trip_date, Vehicle: vNum(t.vehicle_id), Type: t.type, Product: pCode(t.product_id), Bags: t.quantity ?? '', Rate: tripFreight(t, rates).rate ?? '', Freight: tripFreight(t, rates).pending ? 'RATE PENDING' : tripFreight(t, rates).amount, Note: t.note ?? '' }))
    ), 'Trips')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map(e => ({ Date: e.expense_date, Vehicle: vNum(e.vehicle_id), 'Total Expense': num(e.total_expense), 'Of which Challan': num(e.challan), Note: e.note ?? '' }))
    ), 'Expenses')
    XLSX.writeFile(wb, `fleet-profit-${month}.xlsx`)
  }

  const tone = (n: number) => (n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : '')

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <button className="btn" onClick={exportExcel} disabled={loading}>Download Excel</button>
      </div>

      {err && <p role="alert" className="mb-4 text-loss">{err}</p>}

      {total.pending > 0 && (
        <p role="status" className="mb-4 border-l-4 border-accent bg-white px-4 py-3">
          <b>{total.pending} trip{total.pending > 1 ? 's' : ''}</b> in {monthLabel(month)} still have no rate, so their freight is counted as 0. Enter the rates under the Rates tab and everything updates by itself.
        </p>
      )}

      <section aria-label={`Totals for ${monthLabel(month)}`} className="mb-6 grid grid-cols-1 divide-y divide-line border border-line bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-4"><div className="text-sm text-muted">Total freight</div><div className="text-2xl font-semibold tabular-nums">Rs {rs(total.freight)}</div></div>
        <div className="p-4"><div className="text-sm text-muted">Total expenses</div><div className="text-2xl font-semibold tabular-nums">Rs {rs(total.expense)}</div></div>
        <div className="p-4"><div className="text-sm text-muted">Net profit</div><div className={`text-4xl font-bold tabular-nums ${tone(total.net)}`}>Rs {rs(total.net)}</div></div>
      </section>

      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="th">Vehicle</th>
              <th className="th num">Days</th>
              <th className="th num">Freight</th>
              <th className="th num">Expenses</th>
              <th className="th num">Challan (included)</th>
              <th className="th num">Net</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.v.id} className="hover:bg-canvas/60">
                <td className="td"><button className="cursor-pointer font-semibold underline decoration-accent decoration-2 underline-offset-4" onClick={() => onOpen(r.v.id)}>{r.v.number}</button></td>
                <td className="td num">{r.days}</td>
                <td className="td num">{rs(r.freight)}{r.pending > 0 && <span className="ml-1 text-xs font-normal text-loss" title="Trips waiting for a rate">({r.pending} pending)</span>}</td>
                <td className="td num">{rs(r.expense)}</td>
                <td className="td num text-muted">{rs(r.challan)}</td>
                <td className={`td num font-semibold ${tone(r.net)}`}>{rs(r.net)}</td>
                <td className={`td font-semibold ${tone(r.net)}`}>{r.used ? (r.net > 0 ? 'PROFIT' : 'LOSS') : '—'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td className="td text-muted" colSpan={7}>No vehicles yet. Add them under Vehicles & products.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="bg-canvas font-semibold">
              <td className="td">Grand total</td>
              <td className="td num">{total.days}</td>
              <td className="td num">{rs(total.freight)}</td>
              <td className="td num">{rs(total.expense)}</td>
              <td className="td num text-muted">{rs(total.challan)}</td>
              <td className={`td num ${tone(total.net)}`}>{rs(total.net)}</td>
              <td className="td"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">Days = days with at least one trip. Challan is already part of expenses and is not subtracted again. Click a vehicle to enter or fix its days.</p>
    </div>
  )
}
