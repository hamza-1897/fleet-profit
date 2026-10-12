import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr('Email or password is wrong.')
    setBusy(false)
  }

  return (
    <div className="mx-auto mt-24 w-full max-w-sm px-4">
      <h1 className="mb-1 text-3xl font-bold">Abu Bakar Traders</h1>
    <p className="mb-6 text-muted">Fleet Management System</p>
      <p className="mb-6 text-muted">Sign in with the office account.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="field" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Password</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {err && <p role="alert" className="text-loss">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
