import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './lib/supabase'
import { currentMonth, todayStr } from './lib/util'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Entry from './pages/Entry'
import VehicleDetail from './pages/VehicleDetail'
import Rates from './pages/Rates'
import Setup from './pages/Setup'

type Tab = 'entry' | 'detail' | 'dashboard' | 'rates' | 'setup'
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Monthly summary' },
  { id: 'detail', label: 'Vehicle detail' },
  { id: 'entry', label: 'New entry' },
  { id: 'rates', label: 'Rates' },
  { id: 'setup', label: 'Vehicles & products' },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [month, setMonth] = useState(currentMonth())
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [date, setDate] = useState(todayStr())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return <p className="p-8">Supabase keys are missing. Copy <b>.env.example</b> to <b>.env</b>, fill both values, then restart <b>npm run dev</b>.</p>
  }
  if (!ready) return <p className="p-8 text-muted">Loading…</p>
  if (!session) return <Login />

  // Clicking a vehicle in the summary opens its day-by-day detail for the month being viewed.
  const openVehicle = (id: number) => {
    setVehicleId(id)
    setTab('detail')
  }

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-6 px-4 pt-4">
          <h1 className="pb-3 text-xl font-bold">Fleet Profit</h1>
          <nav className="flex flex-wrap gap-1" aria-label="Main">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`cursor-pointer border-b-4 px-3 pb-2 pt-1 font-medium ${tab === t.id ? 'border-accent text-white' : 'border-transparent text-white/70 hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button className="pb-3 text-sm text-white/70 hover:text-white" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <ErrorBoundary key={tab}>
        {tab === 'detail' && <VehicleDetail vehicleId={vehicleId} setVehicleId={setVehicleId} month={month} setMonth={setMonth} onAddEntry={d => { setDate(d); setTab('entry') }} />}
        {tab === 'dashboard' && <Dashboard month={month} setMonth={setMonth} onOpen={openVehicle} />}
        {tab === 'entry' && <Entry vehicleId={vehicleId} setVehicleId={setVehicleId} date={date} setDate={setDate} />}
        {tab === 'rates' && <Rates month={month} setMonth={setMonth} />}
        {tab === 'setup' && <Setup />}
        </ErrorBoundary>
      </main>
    </div>
  )
}