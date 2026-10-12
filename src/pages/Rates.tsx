import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MonthPicker from '../components/MonthPicker'
import { Product, prevMonth, monthLabel, errText } from '../lib/util'

export default function Rates({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function loadRates(m: string) {
    const { data, error } = await supabase.from('rates').select('product_id,rate_per_bag').eq('month', m)
    if (error) throw error
    const map: Record<number, string> = {}
    ;(data ?? []).forEach((r: any) => { map[r.product_id] = String(Number(r.rate_per_bag)) })
    return map
  }

  useEffect(() => {
    ;(async () => {
      try {
        const p = await supabase.from('products').select('*').eq('is_active', true).order('id')
        if (p.error) throw p.error
        setProducts((p.data ?? []) as Product[])
        setInputs(await loadRates(month)); setErr(''); setMsg('')
      } catch (ex) { setErr(errText(ex)) }
    })()
  }, [month])

  async function copyPrev() {
    try {
      const prev = await loadRates(prevMonth(month))
      if (Object.keys(prev).length === 0) { setMsg(`No rates found for ${monthLabel(prevMonth(month))}.`); return }
      setInputs(cur => ({ ...cur, ...prev }))
      setMsg(`Copied from ${monthLabel(prevMonth(month))}. Change what is different, then press Save rates.`)
    } catch (ex) { setErr(errText(ex)) }
  }

  async function save() {
    const rows = products
      .filter(p => (inputs[p.id] ?? '').trim() !== '')
      .map(p => ({ month, product_id: p.id, rate_per_bag: Number(inputs[p.id]) }))
    if (rows.some(r => !(r.rate_per_bag >= 0))) { setErr('Every rate must be a number.'); return }
    const { error } = await supabase.from('rates').upsert(rows, { onConflict: 'month,product_id' })
    if (error) { setErr(errText(error)); return }
    setErr(''); setMsg('Rates saved.')
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6"><MonthPicker month={month} onChange={setMonth} /></div>
      <p className="mb-4 text-muted">Rate per bag for {monthLabel(month)}. Trips already entered keep the rate they were saved with, so changing a rate here never changes old trips.</p>
      <div className="border border-line bg-white">
        {products.map(p => (
          <div key={p.id} className="flex items-center justify-between gap-4 border-b border-line px-4 py-2 last:border-b-0">
            <label htmlFor={`rate-${p.id}`} className="font-semibold">{p.code}</label>
            <div className="flex items-center gap-2">
              <span className="text-muted">Rs</span>
              <input id={`rate-${p.id}`} className="field w-32 text-right tabular-nums" inputMode="decimal" value={inputs[p.id] ?? ''} onChange={e => setInputs(c => ({ ...c, [p.id]: e.target.value }))} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" onClick={save}>Save rates</button>
        <button className="btn" onClick={copyPrev}>Copy from {monthLabel(prevMonth(month))}</button>
      </div>
      {err && <p role="alert" className="mt-3 text-loss">{err}</p>}
      {msg && <p role="status" className="mt-3 text-profit">{msg}</p>}
    </div>
  )
}
