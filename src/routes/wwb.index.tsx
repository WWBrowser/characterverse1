import { createFileRoute, Link } from '@tanstack/react-router'
import { Download, ShieldCheck, Search, Layers, Cpu, Network, HardDrive, MonitorSmartphone, Code2 } from 'lucide-react'

// /wwb — WWB, the Web World Browser: what it is, how it is built, how it keeps
// you safe (and where it does not yet), and where to get it.

export const Route = createFileRoute('/wwb/')({
  component: WwbPage,
  validateSearch: (s: Record<string, unknown>): { download?: 'unpublished' | 'unknown' } =>
    s.download === 'unpublished' || s.download === 'unknown' ? { download: s.download } : {},
})

const PLATFORMS = [
  { id: 'windows', label: 'Windows', note: 'x86-64 · .zip' },
  { id: 'macos', label: 'macOS', note: 'Apple silicon · .app' },
  { id: 'linux', label: 'Linux', note: 'x86-64 · .tar.gz' },
] as const

const SUBSYSTEMS = [
  { icon: Layers, name: 'User interface', where: 'ui/', what: 'The /workspace tab system as the browser chrome: one strip for every kind of tab, tabs kept alive when you switch away, an Index that groups them, a Search button.' },
  { icon: Cpu, name: 'Browser engine', where: 'src/engine.rs', what: 'Tabs, navigation, the session, and the narrow bridge between the interface and the engine.' },
  { icon: MonitorSmartphone, name: 'Rendering engine', where: 'Servo', what: 'HTML parsing, the DOM, Stylo for CSS, Servo layout, WebRender for painting.' },
  { icon: Code2, name: 'JavaScript engine', where: 'Servo · SpiderMonkey', what: 'The same JS engine as Firefox, JIT on.' },
  { icon: Network, name: 'Networking', where: 'Servo net + rustls', what: 'HTTP and HTTPS, WebSockets and the HTTP cache; TLS by rustls, no OpenSSL.' },
  { icon: MonitorSmartphone, name: 'UI backend', where: 'src/app.rs', what: 'The OS window, one GL context, and the compositor that puts the interface and the page on screen together.' },
  { icon: HardDrive, name: 'Data persistence', where: 'src/store.rs', what: 'SQLite for tabs, history and bookmarks — local only; Servo keeps cookies and site storage in the same profile.' },
  { icon: ShieldCheck, name: 'Security sandbox', where: 'src/security.rs', what: 'Multiprocess content, an OS sandbox on Linux and macOS, process mitigations on Windows, HTTPS-only, default-deny permissions.' },
]

const PROTECTIONS = [
  ['Pages run in separate processes', 'yes', 'yes', 'yes'],
  ['OS sandbox on content processes', 'yes', 'yes', 'partial'],
  ['HTTPS-only, on by default', 'yes', 'yes', 'yes'],
  ['Permissions denied unless you allow them', 'yes', 'yes', 'yes'],
  ['Interface unreachable from pages', 'yes', 'yes', 'yes'],
  ['Signed and notarised builds', 'no', 'no', 'no'],
] as const

function WwbPage() {
  const { download } = Route.useSearch()
  return (
    <div className="wwb-page">
      <header className="wwb-hero">
        <p className="wwb-eyebrow">CharacterVerse · native browser</p>
        <h1>
          WWB <span>Web World Browser</span>
        </h1>
        <p className="wwb-lede">
          Our own web browser — built on the Servo engine, not Chromium. Its interface is the CharacterVerse
          workspace tab system; its search is CharacterVerse Search. Type anything that isn&rsquo;t an address and
          you are searching characters, agents and spaces.
        </p>

        {download && (
          <p className="wwb-alert" role="status">
            {download === 'unpublished'
              ? 'Builds are not published yet. The release workflow builds them on every change — once a release is tagged, these buttons download it. Until then, build from source below.'
              : 'There is no WWB build for that platform.'}
          </p>
        )}

        <div className="wwb-downloads">
          {PLATFORMS.map((p) => (
            <a key={p.id} className="wwb-dl" href={`/wwb/download/${p.id}`}>
              <Download size={16} />
              <span>
                <strong>{p.label}</strong>
                <small>{p.note}</small>
              </span>
            </a>
          ))}
        </div>
        <p className="wwb-fine">
          Every package ships with a <code>.sha256</code> checksum (<code>/wwb/download/&lt;platform&gt;?sha256</code>).
          Builds are not code-signed yet: macOS asks you to confirm the first launch, and Windows SmartScreen may warn.
        </p>
      </header>

      <section>
        <h2>
          <Search size={16} /> CharacterVerse Search is the address bar
        </h2>
        <p>
          The address bar is CharacterVerse Search&rsquo;s box. Suggestions come from the CharacterVerse index and from
          your own history — history answered locally, never sent anywhere. The new tab is CharacterVerse Search, with
          all three engines one click apart: CharacterVerse for chat, AgentechVerse for tasks, SpatialVerse for things
          inside 3D spaces.
        </p>
      </section>

      <section>
        <h2>Eight subsystems</h2>
        <div className="wwb-grid">
          {SUBSYSTEMS.map((s) => (
            <div key={s.name} className="wwb-card">
              <div className="wwb-card-head">
                <s.icon size={15} />
                <strong>{s.name}</strong>
                <code>{s.where}</code>
              </div>
              <p>{s.what}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>
          <ShieldCheck size={16} /> Security, platform by platform
        </h2>
        <table className="wwb-table">
          <thead>
            <tr>
              <th />
              <th>Linux</th>
              <th>macOS</th>
              <th>Windows</th>
            </tr>
          </thead>
          <tbody>
            {PROTECTIONS.map(([what, ...cells]) => (
              <tr key={what}>
                <td>{what}</td>
                {cells.map((c, i) => (
                  <td key={i} data-v={c}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="wwb-fine">
          Windows is &ldquo;partial&rdquo; on purpose and in plain words: Servo&rsquo;s OS sandbox covers Linux and
          macOS, so on Windows WWB applies process mitigations of its own — no child processes, no injected DLLs, no
          remote DLLs, strict handle checks. They are real, and they are not a full sandbox. The complete security model,
          gaps included, ships with the browser as <code>SECURITY.md</code>.
        </p>
      </section>

      <section>
        <h2>Build it yourself</h2>
        <pre>{`git clone <this repository>
cd wwb
cargo test            # policy, storage and protocol tests
cargo run --release   # builds Servo the first time — 25–45 minutes`}</pre>
        <p>
          Rust 1.88 or newer and Servo&rsquo;s native build dependencies. Point WWB at another CharacterVerse with{' '}
          <code>WWB_CV_ORIGIN</code>. Open the <Link to="/search">search page</Link> in any browser to see what WWB
          searches.
        </p>
      </section>
    </div>
  )
}
