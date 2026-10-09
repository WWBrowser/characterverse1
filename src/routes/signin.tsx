import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  CircleDot,
  Fingerprint,
  KeyRound,
  Loader2,
  Route as RouteIcon,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  chainPosition,
  collapse,
  createVault,
  enrol,
  forgetVault,
  hailTaxi,
  readPublic,
  signIn,
  step,
  type PublicIdentity,
  type TunnelHandle,
} from '../lib/zkp-client.js'
import { getSessionId } from '../lib/create-ui.js'

// Two doors into the same account.
//
// The legacy door is not deprecated and is not hidden behind a "more options"
// link. It is the one that works on a borrowed laptop, in a browser with storage
// disabled, and after someone drops their phone in a canal — and a passwordless
// scheme that quietly strands those people has not removed friction, it has moved
// it somewhere it cannot be seen. So the two sit side by side, the ZKP door is
// given the wider column because it is the one that needs explaining, and both
// end at the same `cvs_session` cookie.

type Phase = 'unknown' | 'empty' | 'ready' | 'open'

function useVault() {
  const [identity, setIdentity] = useState<PublicIdentity | null>(null)
  const [phase, setPhase] = useState<Phase>('unknown')

  useEffect(() => {
    readPublic().then((pub) => {
      setIdentity(pub)
      setPhase(pub ? 'ready' : 'empty')
    })
  }, [])

  return { identity, setIdentity, phase, setPhase }
}

/* ------------------------------------------------------------- the ZKP door */

function ZkpDoor() {
  const navigate = useNavigate()
  const { identity, setIdentity, phase, setPhase } = useVault()
  const [tunnel, setTunnel] = useState<TunnelHandle | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [trace, setTrace] = useState<string[]>([])

  const note = useCallback((line: string) => setTrace((t) => [...t.slice(-5), line]), [])

  const makeKey = async () => {
    setBusy('key'); setError('')
    try {
      const pub = await createVault(navigator.platform || 'This browser')
      setIdentity(pub)
      setPhase('ready')
      note('Keypair generated. The private scalar never left this tab.')
      await enrol(getSessionId())
      note('Public point enrolled. The server holds half a key and no secret.')
    } catch (e: any) {
      setError(e?.message || 'Could not create a key on this device.')
    } finally {
      setBusy('')
    }
  }

  const go = async () => {
    setBusy('signin'); setError('')
    try {
      await enrol(getSessionId()).catch(() => null)
      note('Tunnel hailed. Challenge issued, single use.')
      const handle = await signIn('session')
      setTunnel(handle)
      setPhase('open')
      note(`Proof verified at position 0. Tunnel ${handle.tunnelId.slice(0, 12)}… open.`)
      note('Chain key agreed from two throwaway points — the secret it is built from was never sent.')
      if (handle.member) {
        note(`Bound to @${handle.member.handle}. Session cookie issued.`)
        setTimeout(() => navigate({ to: '/social/u/$handle', params: { handle: handle.member!.handle } }), 900)
      } else {
        note('This key is not bound to an account yet — log in once on the right to bind it.')
      }
    } catch (e: any) {
      setError(e?.message || 'The tunnel could not be opened.')
    } finally {
      setBusy('')
    }
  }

  const advance = async () => {
    setBusy('ratchet'); setError('')
    const result = await step(`ui.refresh|${chainPosition() ?? 0}`)
    setBusy('')
    if (!result.ok) {
      setError(result.reason || 'The handshake fell out of step and the tunnel collapsed.')
      setTunnel(null)
      setPhase('ready')
      note('Ratchet mismatch. Tunnel collapsed rather than resynchronised.')
      return
    }
    note(`Handshake renewed. Now at position ${result.counter}; every earlier key is unrecoverable.`)
  }

  const ride = async () => {
    setBusy('taxi'); setError('')
    try {
      const receipt = await hailTaxi('persona-brief:handshake smoke test', 3)
      note(`Node taxi: ${receipt.hops} blind hops, delivered ${receipt.delivered ? 'intact' : 'corrupt'}, then disintegrated.`)
    } catch (e: any) {
      setError(e?.message || 'The ride could not be hailed.')
    } finally {
      setBusy('')
    }
  }

  const end = async () => {
    if (!tunnel) return
    setBusy('collapse')
    await collapse(tunnel.tunnelId, 'signed out').catch(() => null)
    setTunnel(null)
    setPhase('ready')
    setBusy('')
    note('Collapsed. The chain key is gone; only a witness digest survives.')
  }

  const forget = async () => {
    setBusy('forget')
    await forgetVault()
    setIdentity(null)
    setTunnel(null)
    setPhase('empty')
    setBusy('')
    setTrace([])
  }

  return (
    <section className="door door-zkp">
      <header className="door-head">
        <div className="door-mark" aria-hidden="true"><Fingerprint size={18} /></div>
        <div>
          <h2>Agentic ZKP sign-in</h2>
          <p className="door-sub">No password, no seed phrase, nothing secret over the wire.</p>
        </div>
      </header>

      {phase === 'unknown' && (
        <div className="skeleton-stack" aria-label="Checking this device for a key">
          <span style={{ width: '68%' }} /><span style={{ width: '44%' }} /><span style={{ width: '80%' }} />
        </div>
      )}

      {phase === 'empty' && (
        <>
          <p className="door-body">
            This browser holds no key yet. Generating one creates a P-256 keypair here, seals the
            private half under a key the page can use but cannot read out, and sends only the public
            point. There is nothing to write down and nothing to lose.
          </p>
          <button className="door-cta" onClick={makeKey} disabled={busy === 'key'}>
            {busy === 'key' ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
            {busy === 'key' ? 'Generating…' : 'Create a key on this device'}
          </button>
        </>
      )}

      {(phase === 'ready' || phase === 'open') && identity && (
        <>
          <dl className="key-facts">
            <div><dt>Device</dt><dd>{identity.label}</dd></div>
            <div><dt>Public point</dt><dd className="mono">{identity.publicKey.slice(0, 10)}…{identity.publicKey.slice(-6)}</dd></div>
            <div><dt>Private scalar</dt><dd className="never">never transmitted</dd></div>
          </dl>

          {phase === 'ready' && (
            <button className="door-cta" onClick={go} disabled={busy === 'signin'}>
              {busy === 'signin' ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
              {busy === 'signin' ? 'Proving…' : 'Prove and open a tunnel'}
            </button>
          )}

          {phase === 'open' && tunnel && (
            <div className="tunnel-live">
              <div className="tunnel-row">
                <span className="pulse-dot" aria-hidden="true" />
                <span className="mono">{tunnel.tunnelId}</span>
                <span className="pos">position {chainPosition() ?? tunnel.counter}</span>
              </div>
              <div className="tunnel-actions">
                <button onClick={advance} disabled={busy === 'ratchet'}><CircleDot size={13} /> Renew handshake</button>
                <button onClick={ride} disabled={busy === 'taxi'}><RouteIcon size={13} /> Hail a node taxi</button>
                <button onClick={end} disabled={busy === 'collapse'} className="danger">Collapse</button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="door-error" role="alert">{error}</p>}

      {trace.length > 0 && (
        <ol className="trace" aria-label="Handshake trace">
          {trace.map((line, i) => <li key={i}>{line}</li>)}
        </ol>
      )}

      <footer className="door-foot">
        <Link to="/zkp">How the tunnels work <ArrowRight size={12} /></Link>
        {identity && (
          <button className="linkish" onClick={forget} disabled={busy === 'forget'}>
            <Trash2 size={12} /> Forget this device
          </button>
        )}
      </footer>
    </section>
  )
}

/* ---------------------------------------------------------- the legacy door */

function LegacyDoor() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [handle, setHandle] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    const endpoint = mode === 'login' ? '/api/social/login' : '/api/social/signup'
    const payload = mode === 'login' ? { email, password } : { handle, email, password }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBusy(false)
      setError(data.error || 'That did not work.')
      return
    }
    // Signing in with a password is also the moment a ZKP key on this device can
    // be bound to the account — the cookie is now set, so enrolment can attach it.
    // Best effort: a failure here must not block a login that already succeeded.
    await readPublic()
      .then((pub) => (pub ? enrol(getSessionId()) : null))
      .catch(() => null)
    setBusy(false)
    navigate({ to: '/social/u/$handle', params: { handle: data.member.handle } })
  }

  return (
    <section className="door door-legacy">
      <header className="door-head">
        <div className="door-mark subtle" aria-hidden="true"><ShieldCheck size={18} /></div>
        <div>
          <h2>{mode === 'login' ? 'Sign in with a password' : 'Create an account'}</h2>
          <p className="door-sub">Works on any device, including one you have never used before.</p>
        </div>
      </header>

      <form onSubmit={submit}>
        {mode === 'signup' && (
          <label className="field">
            <span>Handle</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} required minLength={3} autoComplete="username" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="door-error" role="alert">{error}</p>}
        <button className="door-cta ghost" type="submit" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : null}
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <footer className="door-foot">
        <button className="linkish" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
          {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
        </button>
      </footer>

      <p className="bind-note">
        Signing in here also binds any key held by this browser to your account, so the
        left-hand door works next time.
      </p>
    </section>
  )
}

/* ---------------------------------------------------------------- the page */

function SignInPage() {
  return (
    <div className="signin-page">
      <div className="signin-inner">
        <div className="signin-lede">
          <h1>Two doors, one account</h1>
          <p>
            The right-hand door checks a password against a scrypt hash. The left-hand door checks a
            zero-knowledge proof against a public point — the server stores nothing that could sign
            in as you, so there is no credential table worth stealing.
          </p>
        </div>

        <div className="doors">
          <ZkpDoor />
          <LegacyDoor />
        </div>

        <aside className="compare">
          <h3>What actually differs</h3>
          <table>
            <thead>
              <tr><th scope="col">&nbsp;</th><th scope="col">Password</th><th scope="col">Agentic ZKP</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Stored server-side</th><td>scrypt hash of your secret</td><td>a public curve point</td></tr>
              <tr><th scope="row">If the database leaks</th><td>offline cracking is possible</td><td>nothing to crack</td></tr>
              <tr><th scope="row">Replay of a captured login</th><td>works until you change it</td><td>fails at the next step</td></tr>
              <tr><th scope="row">New device</th><td>type it in</td><td>needs a fresh key, bound once</td></tr>
              <tr><th scope="row">Lost device</th><td>nothing lost</td><td>revoke the key, keep the account</td></tr>
              <tr><th scope="row">Script running on this page</th><td>can read what you type</td><td>can mint proofs while resident</td></tr>
            </tbody>
          </table>
          <p className="compare-note">
            That last row is the honest one. Neither door survives a compromised page, and any
            scheme that claims otherwise is describing hardware it does not have.
          </p>
        </aside>
      </div>

      <style>{`
        .signin-page { min-height: calc(100vh - 60px); padding: 48px 24px 72px; background:
          radial-gradient(900px 420px at 18% -8%, rgba(124,92,191,.16), transparent 62%),
          radial-gradient(700px 380px at 92% 8%, rgba(57,135,229,.10), transparent 58%),
          var(--bg-primary); }
        .signin-inner { max-width: 1080px; margin: 0 auto; }
        .signin-lede { max-width: 640px; margin-bottom: 34px; }
        .signin-lede h1 { font-size: 34px; letter-spacing: -.02em; margin: 0 0 10px; color: var(--text-primary); }
        .signin-lede p { color: var(--text-secondary); line-height: 1.65; margin: 0; font-size: 15px; }

        .doors { display: grid; grid-template-columns: 1.15fr .85fr; gap: 22px; align-items: start; }
        @media (max-width: 900px) { .doors { grid-template-columns: 1fr; } }

        .door { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px;
          padding: 26px 24px; }
        .door-zkp { border-color: rgba(167,139,250,.34); box-shadow: 0 18px 44px -28px rgba(124,92,191,.7); }
        .door-head { display: flex; gap: 13px; align-items: flex-start; margin-bottom: 18px; }
        .door-mark { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
          background: rgba(124,92,191,.18); color: var(--accent-light); flex-shrink: 0; }
        .door-mark.subtle { background: var(--bg-hover); color: var(--text-secondary); }
        .door-head h2 { margin: 0 0 3px; font-size: 17px; color: var(--text-primary); }
        .door-sub { margin: 0; font-size: 13px; color: var(--text-secondary); }
        .door-body { color: var(--text-secondary); font-size: 14px; line-height: 1.65; margin: 0 0 18px; }

        .door-cta { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px; border-radius: 10px; border: 1px solid var(--accent); background: var(--accent);
          color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
          transition: transform .12s ease, filter .12s ease; }
        .door-cta:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .door-cta:disabled { opacity: .6; cursor: default; }
        .door-cta.ghost { background: transparent; color: var(--text-primary); border-color: var(--border); }
        .door-cta.ghost:hover:not(:disabled) { background: var(--bg-hover); }

        .key-facts { margin: 0 0 18px; display: grid; gap: 7px; }
        .key-facts > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
        .key-facts dt { color: var(--text-secondary); }
        .key-facts dd { margin: 0; color: var(--text-primary); }
        .key-facts .never { color: #199e70; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }

        .tunnel-live { border: 1px solid var(--border); border-radius: 11px; padding: 13px; background: var(--bg-secondary); }
        .tunnel-row { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; flex-wrap: wrap; }
        .pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: #0ca30c; flex-shrink: 0;
          animation: pulse 1.9s ease-in-out infinite; }
        .pos { margin-left: auto; font-size: 12px; color: var(--text-secondary); }
        .tunnel-actions { display: flex; gap: 7px; flex-wrap: wrap; }
        .tunnel-actions button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px;
          font-size: 12px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg-card);
          color: var(--text-primary); cursor: pointer; }
        .tunnel-actions button:hover:not(:disabled) { background: var(--bg-hover); }
        .tunnel-actions button:disabled { opacity: .5; cursor: default; }
        .tunnel-actions .danger { color: #ec835a; border-color: rgba(236,131,90,.35); }

        .skeleton-stack { display: grid; gap: 9px; }
        .skeleton-stack span { height: 11px; border-radius: 5px; background: var(--bg-hover);
          animation: pulse 1.5s ease-in-out infinite; }

        .trace { margin: 16px 0 0; padding: 0 0 0 16px; display: grid; gap: 5px; }
        .trace li { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
        .door-error { margin: 14px 0 0; font-size: 13px; color: #ec835a; }

        .field { display: block; margin-bottom: 13px; }
        .field span { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; }
        .field input { width: 100%; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border);
          background: var(--bg-secondary); color: var(--text-primary); font-size: 14px; }
        .field input:focus { outline: 2px solid var(--accent-light); outline-offset: 1px; border-color: transparent; }

        .door-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px;
          margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); flex-wrap: wrap; }
        .door-foot a, .linkish { display: inline-flex; align-items: center; gap: 5px; font-size: 12px;
          color: var(--accent-light); background: none; border: none; padding: 0; cursor: pointer; text-decoration: none; }
        .linkish:hover, .door-foot a:hover { text-decoration: underline; }
        .bind-note { margin: 13px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.55; }

        .compare { margin-top: 30px; background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 14px; padding: 22px 24px; }
        .compare h3 { margin: 0 0 14px; font-size: 15px; color: var(--text-primary); }
        .compare table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .compare th, .compare td { text-align: left; padding: 9px 12px 9px 0; border-bottom: 1px solid var(--border);
          color: var(--text-secondary); font-weight: 400; vertical-align: top; }
        .compare thead th { color: var(--text-primary); font-weight: 600; font-size: 12px;
          text-transform: uppercase; letter-spacing: .06em; }
        .compare tbody th { color: var(--text-primary); font-weight: 500; padding-right: 20px; }
        .compare-note { margin: 14px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
      `}</style>
    </div>
  )
}

export const Route = createFileRoute('/signin')({ component: SignInPage })
