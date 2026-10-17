import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Vehicle, Product, pad, todayStr, dayLabel, rs, num, errText } from '../lib/util'

type Props = { vehicleId: number | null; setVehicleId: (id: number) => void; date: string; setDate: (d: string) => void }

const chip = (on: boolean) =>
  `cursor-pointer rounded-sm border px-4 py-2 font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:bg-canvas'}`

const yesterdayStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function Entry({ vehicleId, setVehicleId, date, setDate }: Props) {
  const month = date.slice(0, 7)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rates, setRates] = useState<Record<number, number>>({})

  const [type, setType] = useState<'BAGS' | 'LUMPSUM'>('BAGS')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [expTotal, setExpTotal] = useState('')
  const [expChallan, setExpChallan] = useState('')

  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

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
    ;(async () => {
      const { data, error } = await supabase.from('rates').select('product_id,rate_per_bag').eq('month', month)
      if (error) { setErr(errText(error)); return }
      const map: Record<number, number> = {}
      ;(data ?? []).forEach((x: any) => { map[x.product_id] = Number(x.rate_per_bag) })
      setRates(map)
    })()
  }, [month])

  const rate = productId ? rates[Number(productId)] : undefined
  const loadFilled = type === 'BAGS' ? productId !== '' && num(qty) > 0 : num(amount) > 0
  const expFilled = expTotal.trim() !== ''
  const canSave = vehicleId !== null && (loadFilled || expFilled)
  const vehicleNo = vehicles.find(v => v.id === vehicleId)?.number ?? ''

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (vehicleId === null) return
    setMsg('')
    if (type === 'BAGS' && (productId !== '') !== (num(qty) > 0)) { setErr(productId === '' ? 'Choose the product.' : 'Enter the number of bags.'); return }
    if (!expFilled && num(expChallan) > 0) { setErr('Enter the total expense too. Challan is a part of it.'); return }
    if (expFilled && num(expChallan) > num(expTotal)) { setErr('Challan is part of the total expense, so it cannot be more than the total.'); return }

    setBusy(true)
    try {
      let total = num(expTotal), challan = num(expChallan)
      if (expFilled) {
        // One expense row per vehicle per day: if it exists, add to it (after asking).
        const { data, error } = await supabase.from('daily_expenses').select('*').eq('vehicle_id', vehicleId).eq('expense_date', date).maybeSingle()
        if (error) throw error
        if (data) {
          if (!confirm(`Rs ${rs(num(data.total_expense))} expense is already saved for ${vehicleNo} on this date.\nAdd Rs ${rs(total)} to it (new total Rs ${rs(num(data.total_expense) + total)})?`)) { setBusy(false); return }
          total += num(data.total_expense); challan += num(data.challan)
        }
      }
      const parts: string[] = []
      if (loadFilled) {
        const row = type === 'BAGS'
          ? { vehicle_id: vehicleId, trip_date: date, type, product_id: Number(productId), quantity: num(qty), freight: null, note: note.trim() || null }
          : { vehicle_id: vehicleId, trip_date: date, type, product_id: null, quantity: null, freight: num(amount), note: note.trim() || null }
        const { error } = await supabase.from('trips').insert(row)
        if (error) throw error
        parts.push(type === 'BAGS' ? `${products.find(p => p.id === Number(productId))?.code} ${rs(num(qty))} bags` : `freight Rs ${rs(num(amount))}`)
      }
      if (expFilled) {
        const { error } = await supabase.from('daily_expenses').upsert(
          { vehicle_id: vehicleId, expense_date: date, total_expense: total, challan },
          { onConflict: 'vehicle_id,expense_date' }
        )
        if (error) throw error
        parts.push(`expense Rs ${rs(num(expTotal))}`)
      }
      setMsg(`Saved for ${vehicleNo}, ${dayLabel(date)}: ${parts.join(' + ')}`)
      setErr(''); setProductId(''); setQty(''); setAmount(''); setNote(''); setExpTotal(''); setExpChallan('')
    } catch (ex) {
      setErr(errText(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl space-y-8">
      <section aria-labelledby="s1">
        <h2 id="s1" className="mb-3 text-lg font-semibold">1. Vehicle and date</h2>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Vehicle">
          {vehicles.filter(v => v.is_active || v.id === vehicleId).map(v => (
            <button type="button" key={v.id} aria-pressed={v.id === vehicleId} className={chip(v.id === vehicleId)} onClick={() => setVehicleId(v.id)}>{v.number}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" className="field w-48" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={() => setDate(todayStr())}>Today</button>
          <button type="button" className="btn" onClick={() => setDate(yesterdayStr())}>Yesterday</button>
        </div>
      </section>

      <section aria-labelledby="s2">
        <h2 id="s2" className="mb-3 text-lg font-semibold">2. Load</h2>
        <div className="mb-4 flex gap-2" role="group" aria-label="Load type">
          <button type="button" aria-pressed={type === 'BAGS'} className={`flex-1 ${chip(type === 'BAGS')}`} onClick={() => setType('BAGS')}>Bags</button>
          <button type="button" aria-pressed={type === 'LUMPSUM'} className={`flex-1 ${chip(type === 'LUMPSUM')}`} onClick={() => setType('LUMPSUM')}>Fixed freight (bags unknown)</button>
        </div>
        {type === 'BAGS' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Product">
              {products.map(p => (
                <button type="button" key={p.id} aria-pressed={String(p.id) === productId} className={chip(String(p.id) === productId)} onClick={() => setProductId(String(p.id))}>{p.code}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="label" htmlFor="qty">Number of bags</label>
                <input id="qty" className="field w-44 text-right text-xl tabular-nums" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              {productId !== '' && num(qty) > 0 && (
                rate !== undefined
                  ? <div className="pb-2 text-xl font-semibold tabular-nums">= Rs {rs(num(qty) * rate)} <span className="text-sm font-normal text-muted">at Rs {rs(rate)}/bag</span></div>
                  : <div className="pb-2 text-muted">Rate not set for this month yet. The freight fills in once you add it under Rates.</div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="amt">Freight amount (Rs)</label>
            <input id="amt" className="field w-56 text-right text-xl tabular-nums" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        )}
        <div className="mt-4">
          <label className="label" htmlFor="note">Note (optional)</label>
          <input id="note" className="field" value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </section>

      <section aria-labelledby="s3">
        <h2 id="s3" className="mb-1 text-lg font-semibold">3. Expense <span className="text-sm font-normal text-muted">(optional)</span></h2>
        <p className="mb-3 text-sm text-muted">Leave empty if there is no expense to add. If this vehicle already has an expense for the date, the new amount is added to it.</p>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label" htmlFor="tot">Total expense (Rs)</label>
            <input id="tot" className="field w-44 text-right text-xl tabular-nums" inputMode="decimal" value={expTotal} onChange={e => setExpTotal(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="chal">Of which challan (Rs)</label>
            <input id="chal" className="field w-44 text-right text-xl tabular-nums" inputMode="decimal" value={expChallan} onChange={e => setExpChallan(e.target.value)} />
          </div>
        </div>
      </section>

      {err && <p role="alert" className="text-loss">{err}</p>}
      {msg && <p role="status" className="border-l-4 border-profit bg-white px-4 py-3 font-medium text-profit">{msg}</p>}

      <button className="btn btn-primary w-full py-3 text-lg" disabled={!canSave || busy}>{busy ? 'Saving…' : `Save entry for ${vehicleNo || 'vehicle'}`}</button>
    </form>
  )
}
