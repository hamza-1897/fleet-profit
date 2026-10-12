import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errText } from '../lib/util'

type Item = { id: number; is_active: boolean; [k: string]: any }

function Manager({ table, field, title, hint }: { table: 'vehicles' | 'products'; field: 'number' | 'code'; title: string; hint: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('id')
    if (error) setErr(errText(error)); else setItems((data ?? []) as Item[])
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const { error } = await supabase.from(table).insert({ [field]: name.trim() })
    if (error) { setErr(error.code === '23505' ? 'That name already exists.' : errText(error)); return }
    setName(''); setErr(''); load()
  }
  async function toggle(it: Item) {
    const { error } = await supabase.from(table).update({ is_active: !it.is_active }).eq('id', it.id)
    if (error) setErr(errText(error)); else load()
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      <ul className="mb-3 border border-line bg-white">
        {items.map(it => (
          <li key={it.id} className="flex items-center justify-between border-b border-line px-4 py-2 last:border-b-0">
            <span className={it.is_active ? 'font-semibold' : 'text-muted line-through'}>{it[field]}</span>
            <button className="btn" onClick={() => toggle(it)}>{it.is_active ? 'Stop using' : 'Use again'}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input className="field" placeholder={field === 'number' ? 'New vehicle number' : 'New product code'} value={name} onChange={e => setName(e.target.value)} aria-label={title} />
        <button className="btn btn-primary">Add</button>
      </form>
      {err && <p role="alert" className="mt-2 text-loss">{err}</p>}
    </section>
  )
}

export default function Setup() {
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <Manager table="vehicles" field="number" title="Vehicles" hint="Stopped vehicles disappear from daily entry but keep all their old records." />
      <Manager table="products" field="code" title="Products" hint="Add a new cement type here, then give it a rate under Rates." />
    </div>
  )
}
