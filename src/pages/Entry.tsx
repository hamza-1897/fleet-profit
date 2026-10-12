import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Vehicle, Product, Trip, Expense, fetchAll, monthRange, monthLabel, dayLabel, rs, num, errText } from '../lib/util'

type Props = { vehicleId: number | null; setVehicleId: (id: number) => void; date: string; setDate: (d: string) => void }

export default function Entry({ vehicleId, setVehicleId, date, setDate }: Props) {
  const month = date.slice(0, 7)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rates, setRates] = useState<Record<number, number>>({})
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const reload = () => setTick(t => t + 1)

  useEffect(() => {
    ;(async () => {
      const [v, p] = await Promise.all([
        supabase.from('vehicles').select('*').order('id'),
        supabase.from('products').select('*').eq('is_active', true).order('id'),
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

  const dayTrips = trips.filter(t => t.trip_date === date)
  const dayExpense = expenses.find(e => e.expense_date === date)
  const dayFreight = dayTrips.reduce((s, t) => s + num(t.freight), 0)
  const dayProfit = dayFreight - num(dayExpense?.total_expense)

  const ledger = useMemo(() => {
    const m = new Map<string, { freight: number; expense: number }>()
    const row = (d: string) => { if (!m.has(d)) m.set(d, { freight: 0, expense: 0 }); return m.get(d)! }
    trips.forEach(t => { row(t.trip_date).freight += num(t.freight) })
    expenses.forEach(e => { row(e.expense_date).expense += num(e.total_expense) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [trips, expenses])
  const monthFreight = ledger.reduce((s, [, x]) => s + x.freight, 0)
  const monthExpense = ledger.reduce((s, [, x]) => s + x.expense, 0)

  async function deleteTrip(id: number) {
    if (!confirm('Delete this trip?')) return
    const { error } = await supabase.from('trips').delete().eq('id', id)
    if (error) setErr(errText(error)); else reload()
  }

  const shownVehicles = vehicles.filter(v => v.is_active || v.id === vehicleId)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="vehicle">Vehicle</label>
          <select id="vehicle" className="field w-44 font-semibold" value={vehicleId ?? ''} onChange={e => setVehicleId(Number(e.target.value))}>
            {shownVehicles.map(v => <option key={v.id} value={v.id}>{v.number}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input id="date" className="field w-48" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="ml-auto text-right">
          <div className="text-sm text-muted">{dayLabel(date)} profit</div>
          <div className={`text-3xl font-bold tabular-nums ${dayProfit > 0 ? 'text-profit' : dayProfit < 0 ? 'text-loss' : ''}`}>Rs {rs(dayProfit)}</div>
        </div>
      </div>

      {err && <p role="alert" className="mb-4 text-loss">{err}</p>}

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="trips-h">
          <h2 id="trips-h" className="mb-2 text-lg font-semibold">Trips on this day</h2>
          <ul className="mb-4 border border-line bg-white">
            {dayTrips.length === 0 && <li className="px-4 py-3 text-muted">No trips yet. Add the first one below.</li>}
            {dayTrips.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <div>
                  <div className="font-semibold">
                    {t.type === 'BAGS'
                      ? `${products.find(p => p.id === t.product_id)?.code ?? 'Product'} · ${rs(num(t.quantity))} bags × Rs ${rs(num(t.rate_used))}`
                      : 'Lump sum'}
                  </div>
                  {t.note && <div className="text-sm text-muted">{t.note}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">Rs {rs(num(t.freight))}</span>
                  <button className="btn" onClick={() => deleteTrip(t.id)} aria-label="Delete trip">Delete</button>
                </div>
              </li>
            ))}
          </ul>
          {vehicleId !== null && <TripForm vehicleId={vehicleId} date={date} products={products} rates={rates} onSaved={reload} />}
        </section>

        <section aria-labelledby="exp-h">
          <h2 id="exp-h" className="mb-2 text-lg font-semibold">Expense on this day</h2>
          {vehicleId !== null && (
            <ExpenseForm
              key={`${vehicleId}-${date}-${dayExpense?.id ?? 'new'}-${dayExpense?.total_expense ?? ''}-${dayExpense?.challan ?? ''}`}
              vehicleId={vehicleId} date={date} existing={dayExpense} onSaved={reload}
            />
          )}
        </section>
      </div>

      <section className="mt-10" aria-labelledby="led-h">
        <h2 id="led-h" className="mb-2 text-lg font-semibold">{monthLabel(month)} for this vehicle</h2>
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[480px] border-collapse">
            <thead><tr><th className="th">Day</th><th className="th num">Freight</th><th className="th num">Expense</th><th className="th num">Profit</th></tr></thead>
            <tbody>
              {ledger.map(([d, x]) => {
                const p = x.freight - x.expense
                return (
                  <tr key={d} className={d === date ? 'bg-accent/20' : 'hover:bg-canvas/60'}>
                    <td className="td"><button className="cursor-pointer underline underline-offset-4" onClick={() => setDate(d)}>{dayLabel(d)}</button></td>
                    <td className="td num">{rs(x.freight)}</td>
                    <td className="td num">{rs(x.expense)}</td>
                    <td className={`td num font-semibold ${p > 0 ? 'text-profit' : p < 0 ? 'text-loss' : ''}`}>{rs(p)}</td>
                  </tr>
                )
              })}
              {ledger.length === 0 && <tr><td className="td text-muted" colSpan={4}>Nothing entered for this month.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-canvas font-semibold">
                <td className="td">Month total</td>
                <td className="td num">{rs(monthFreight)}</td>
                <td className="td num">{rs(monthExpense)}</td>
                <td className="td num">{rs(monthFreight - monthExpense)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}

function TripForm({ vehicleId, date, products, rates, onSaved }: {
  vehicleId: number; date: string; products: Product[]; rates: Record<number, number>; onSaved: () => void
}) {
  const [type, setType] = useState<'BAGS' | 'LUMPSUM'>('BAGS')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const rate = productId ? rates[Number(productId)] : undefined
  const freight = type === 'BAGS' ? num(qty) * (rate ?? 0) : num(amount)
  const ok = freight > 0 && (type === 'LUMPSUM' || (productId !== '' && rate !== undefined && num(qty) > 0))

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    const base = { vehicle_id: vehicleId, trip_date: date, type, freight, note: note.trim() || null }
    const row = type === 'BAGS'
      ? { ...base, product_id: Number(productId), quantity: num(qty), rate_used: rate }
      : { ...base, product_id: null, quantity: null, rate_used: null }
    const { error } = await supabase.from('trips').insert(row)
    setBusy(false)
    if (error) { setErr(errText(error)); return }
    setErr(''); setQty(''); setAmount(''); setNote(''); onSaved()
  }

  return (
    <form onSubmit={add} className="space-y-3 border border-line bg-white p-4">
      <div className="flex gap-2" role="group" aria-label="Trip type">
        <button type="button" className={`btn flex-1 ${type === 'BAGS' ? 'btn-primary' : ''}`} onClick={() => setType('BAGS')}>Bags × rate</button>
        <button type="button" className={`btn flex-1 ${type === 'LUMPSUM' ? 'btn-primary' : ''}`} onClick={() => setType('LUMPSUM')}>Fixed freight</button>
      </div>
      {type === 'BAGS' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="prod">Product</label>
            <select id="prod" className="field" value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">Choose…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code}{rates[p.id] !== undefined ? ` — Rs ${rs(rates[p.id])}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qty">Bags</label>
            <input id="qty" className="field text-right tabular-nums" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          {productId !== '' && rate === undefined && <p className="col-span-2 text-loss">No rate for this product this month. Add it under Rates first.</p>}
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="amt">Freight amount (Rs)</label>
          <input id="amt" className="field text-right tabular-nums" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="note">Note (optional)</label>
        <input id="note" className="field" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      {err && <p role="alert" className="text-loss">{err}</p>}
      <button className="btn btn-primary w-full" disabled={!ok || busy}>Add trip{ok ? ` · Rs ${rs(freight)}` : ''}</button>
    </form>
  )
}

function ExpenseForm({ vehicleId, date, existing, onSaved }: {
  vehicleId: number; date: string; existing?: Expense; onSaved: () => void
}) {
  const [total, setTotal] = useState(existing ? String(num(existing.total_expense)) : '')
  const [challan, setChallan] = useState(existing && num(existing.challan) ? String(num(existing.challan)) : '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (num(challan) > num(total)) { setErr('Challan is part of the total expense, so it cannot be more than the total.'); return }
    setBusy(true)
    const { error } = await supabase.from('daily_expenses').upsert(
      { vehicle_id: vehicleId, expense_date: date, total_expense: num(total), challan: num(challan), note: note.trim() || null },
      { onConflict: 'vehicle_id,expense_date' }
    )
    setBusy(false)
    if (error) { setErr(errText(error)); return }
    setErr(''); onSaved()
  }
  async function remove() {
    if (!existing || !confirm('Delete this day’s expense?')) return
    const { error } = await supabase.from('daily_expenses').delete().eq('id', existing.id)
    if (error) setErr(errText(error)); else onSaved()
  }

  return (
    <form onSubmit={save} className="space-y-3 border border-line bg-white p-4">
      <div>
        <label className="label" htmlFor="tot">Total expense (Rs)</label>
        <input id="tot" className="field text-right tabular-nums" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="chal">Of which challan / fine (Rs)</label>
        <input id="chal" className="field text-right tabular-nums" inputMode="decimal" value={challan} onChange={e => setChallan(e.target.value)} />
        <p className="mt-1 text-sm text-muted">Already inside the total. This box only records how much of it was challan.</p>
      </div>
      <div>
        <label className="label" htmlFor="enote">Note (optional)</label>
        <input id="enote" className="field" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      {err && <p role="alert" className="text-loss">{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={busy || total.trim() === ''}>{existing ? 'Update expense' : 'Save expense'}</button>
        {existing && <button type="button" className="btn" onClick={remove}>Delete</button>}
      </div>
    </form>
  )
}
