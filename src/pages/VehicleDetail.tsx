import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import MonthPicker from '../components/MonthPicker'
import { Vehicle, Product, Trip, Expense, fetchAll, monthRange, dayLabel, pad, rs, num, errText, tripFreight } from '../lib/util'

type Props = {
  vehicleId: number | null; setVehicleId: (id: number) => void
  month: string; setMonth: (m: string) => void
  onAddEntry: (date: string) => void
}

export default function VehicleDetail({ vehicleId, setVehicleId, month, setMonth, onAddEntry }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rates, setRates] = useState<Record<number, number>>({})
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const reload = () => setTick(t => t + 1)

  useEffect(() => {
    ;(async () => {
      const [v, p] = await Promise.all([
        supabase.from('vehicles').select('*').order('id'),
        supabase.from('products').select('*').order('id'),
      ])
      if (v.error || p.error) { setErr(errText(v.error ?? p.error)); return }
      const vs = (v.data ?? []) as Vehicle[]
      setVehicles(vs); setProducts((p.data ?? []) as Product[])
      if (vehicleId === null) { const first = vs.find(x => x.is_active); if (first) setVehicleId(first.id) }
    })()
  }, [])

  useEffect(() => {
    const vid = vehicleId
    if (vid === null) return
    let off = false
    ;(async () => {
      try {
        const { from, to } = monthRange(month)
        const [r, t, e] = await Promise.all([
          supabase.from('rates').select('product_id,rate_per_bag').eq('month', month),
          fetchAll<Trip>((a, b) => supabase.from('trips').select('*').eq('vehicle_id', vid).gte('trip_date', from).lt('trip_date', to).order('id').range(a, b)),
          fetchAll<Expense>((a, b) => supabase.from('daily_expenses').select('*').eq('vehicle_id', vid).gte('expense_date', from).lt('expense_date', to).order('id').range(a, b)),
        ])
        if (r.error) throw r.error
        if (off) return
        const map: Record<number, number> = {}
        ;(r.data ?? []).forEach((x: any) => { map[x.product_id] = Number(x.rate_per_bag) })
        setRates(map); setTrips(t); setExpenses(e); setErr('')
      } catch (ex) { if (!off) setErr(errText(ex)) }
    })()
    return () => { off = true }
  }, [vehicleId, month, tick])

  const code = (id: number | null) => products.find(p => p.id === id)?.code ?? '?'

  // One row for every calendar day of the month, worked or not.
  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const count = new Date(y, m, 0).getDate()
    return Array.from({ length: count }, (_, i) => {
      const date = `${month}-${pad(i + 1)}`
      const dt = trips.filter(t => t.trip_date === date)
      const ex = expenses.find(e => e.expense_date === date)
      const priced = dt.map(t => tripFreight(t, rates))
      const freight = priced.reduce((s, x) => s + x.amount, 0)
      return {
        date, trips: dt, expense: ex,
        bags: dt.reduce((s, t) => s + (t.type === 'BAGS' ? num(t.quantity) : 0), 0),
        freight, pending: priced.some(x => x.pending),
        exp: num(ex?.total_expense), challan: num(ex?.challan),
        used: dt.length > 0 || !!ex,
      }
    })
  }, [month, trips, expenses, rates])

  const tot = days.reduce(
    (s, d) => ({ worked: s.worked + (d.trips.length > 0 ? 1 : 0), bags: s.bags + d.bags, freight: s.freight + d.freight, exp: s.exp + d.exp, challan: s.challan + d.challan, pending: s.pending + d.trips.filter(t => tripFreight(t, rates).pending).length }),
    { worked: 0, bags: 0, freight: 0, exp: 0, challan: 0, pending: 0 }
  )
  const net = tot.freight - tot.exp
  const tone = (n: number) => (n > 0 ? 'text-profit' : n < 0 ? 'text-loss' : '')

  async function deleteTrip(id: number) {
    if (!confirm('Delete this trip?')) return
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) setErr(errText(error)); else reload()
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <label className="label" htmlFor="veh">Vehicle</label>
          <select id="veh" className="field w-44 text-lg font-semibold" value={vehicleId ?? ''} onChange={e => setVehicleId(Number(e.target.value))}>
            {vehicles.filter(v => v.is_active || v.id === vehicleId).map(v => <option key={v.id} value={v.id}>{v.number}</option>)}
          </select>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {err && <p role="alert" className="mb-4 text-loss">{err}</p>}
      {tot.pending > 0 && (
        <p role="status" className="mb-4 border-l-4 border-accent bg-white px-4 py-3">
          <b>{tot.pending} trip{tot.pending > 1 ? 's' : ''}</b> still have no rate, so their freight is counted as 0. Enter the rates under the Rates tab.
        </p>
      )}

      <section aria-label="Month totals" className="mb-6 grid grid-cols-2 divide-x divide-y divide-line border border-line bg-white sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        {[
          ['Days worked', String(tot.worked)],
          ['Bags', rs(tot.bags)],
          ['Freight', rs(tot.freight)],
          ['Expenses', rs(tot.exp)],
          ['Challan (included)', rs(tot.challan)],
        ].map(([label, value]) => (
          <div key={label} className="p-3"><div className="text-sm text-muted">{label}</div><div className="text-xl font-semibold tabular-nums">{value}</div></div>
        ))}
        <div className="p-3"><div className="text-sm text-muted">Net profit</div><div className={`text-2xl font-bold tabular-nums ${tone(net)}`}>{rs(net)}</div></div>
      </section>

      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className="th">Date</th><th className="th">Load</th>
              <th className="th num">Bags</th><th className="th num">Freight</th>
              <th className="th num">Expense</th><th className="th num">Challan</th><th className="th num">Profit</th>
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const dash = <span className="text-line">–</span>
              const p = d.freight - d.exp
              return (
                <Fragment key={d.date}>
                  <tr className={d.used ? 'hover:bg-canvas/60' : 'text-muted'}>
                    <td className="td whitespace-nowrap">
                      <button className="cursor-pointer underline underline-offset-4" aria-expanded={open === d.date} onClick={() => setOpen(open === d.date ? null : d.date)}>{dayLabel(d.date)}</button>
                    </td>
                    <td className="td">{d.trips.length ? d.trips.map(t => (t.type === 'BAGS' ? `${code(t.product_id)} ${rs(num(t.quantity))}` : 'Fixed freight')).join(', ') : dash}</td>
                    <td className="td num">{d.bags ? rs(d.bags) : dash}</td>
                    <td className="td num">{d.trips.length ? <>{rs(d.freight)}{d.pending && <span className="ml-1 text-xs text-loss">pending</span>}</> : dash}</td>
                    <td className="td num">{d.expense ? rs(d.exp) : dash}</td>
                    <td className="td num">{d.challan ? rs(d.challan) : dash}</td>
                    <td className={`td num font-semibold ${tone(p)}`}>{d.used ? rs(p) : dash}</td>
                  </tr>
                  {open === d.date && (
                    <tr>
                      <td colSpan={7} className="border-b border-line bg-canvas/60 px-4 py-4">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <h3 className="mb-2 font-semibold">Trips</h3>
                            {d.trips.length === 0 && <p className="text-muted">No trips on this day.</p>}
                            <ul>
                              {d.trips.map(t => {
                                const f = tripFreight(t, rates)
                                return (
                                  <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
                                    <span>{t.type === 'BAGS' ? `${code(t.product_id)} · ${rs(num(t.quantity))} bags${f.rate !== undefined ? ` × Rs ${rs(f.rate)}` : ''}` : 'Fixed freight'}{t.note ? ` (${t.note})` : ''} — <b>{f.pending ? 'rate pending' : `Rs ${rs(f.amount)}`}</b></span>
                                    <button className="btn" onClick={() => deleteTrip(t.id)}>Delete</button>
                                  </li>
                                )
                              })}
                            </ul>
                            <button className="btn btn-primary mt-3" onClick={() => onAddEntry(d.date)}>Add entry for this day</button>
                          </div>
                          <ExpenseEdit key={`${d.date}-${d.expense?.id ?? 'n'}-${d.exp}-${d.challan}`} vehicleId={vehicleId!} date={d.date} existing={d.expense} onDone={reload} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-canvas font-semibold">
              <td className="td">Month total</td><td className="td"></td>
              <td className="td num">{rs(tot.bags)}</td><td className="td num">{rs(tot.freight)}</td>
              <td className="td num">{rs(tot.exp)}</td><td className="td num">{rs(tot.challan)}</td>
              <td className={`td num ${tone(net)}`}>{rs(net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">Click a date to correct or delete that day. Grey rows are days with no entry. Challan is already inside Expense.</p>
    </div>
  )
}

function ExpenseEdit({ vehicleId, date, existing, onDone }: { vehicleId: number; date: string; existing?: Expense; onDone: () => void }) {
  const [total, setTotal] = useState(existing ? String(num(existing.total_expense)) : '')
  const [challan, setChallan] = useState(existing && num(existing.challan) ? String(num(existing.challan)) : '')
  const [err, setErr] = useState('')

  async function save() {
    if (total.trim() === '') { setErr('Enter the total expense.'); return }
    if (num(challan) > num(total)) { setErr('Challan cannot be more than the total expense.'); return }
    const { error } = await supabase.from('daily_expenses').upsert(
      { vehicle_id: vehicleId, expense_date: date, total_expense: num(total), challan: num(challan) },
      { onConflict: 'vehicle_id,expense_date' }
    )
    if (error) setErr(errText(error)); else onDone()
  }
  async function remove() {
    if (!existing || !confirm('Delete this day’s expense?')) return
    const { error } = await supabase.from('daily_expenses').delete().eq('id', existing.id)
    if (error) setErr(errText(error)); else onDone()
  }

  return (
    <div>
      <h3 className="mb-2 font-semibold">Expense</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor={`t-${date}`}>Total (Rs)</label><input id={`t-${date}`} className="field w-36 text-right tabular-nums" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} /></div>
        <div><label className="label" htmlFor={`c-${date}`}>Challan (Rs)</label><input id={`c-${date}`} className="field w-36 text-right tabular-nums" inputMode="decimal" value={challan} onChange={e => setChallan(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={save}>{existing ? 'Update' : 'Save'}</button>
        {existing && <button className="btn" onClick={remove}>Delete</button>}
      </div>
      {err && <p role="alert" className="mt-2 text-loss">{err}</p>}
    </div>
  )
}