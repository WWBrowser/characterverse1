import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

// The ZKP SSO tunnel architecture, written down.
//
// A page rather than a markdown file in a folder, because the people who need to
// argue with this document — a security reviewer, a procurement officer, whoever
// inherits it — will find a URL and will not find `docs/architecture-v2-FINAL.md`.
// It is deliberately blunt about which parts are implemented, which are modelled
// in one process, and which are honest fiction, since a document that flatters
// the system it describes is worth less than no document at all.

type Status = 'built' | 'modelled' | 'future'

const STATUS_COPY: Record<Status, { label: string; colour: string }> = {
  // Not colour alone — every chip carries its word, because "green vs amber" is
  // exactly the distinction a reviewer with deuteranopia would lose.
  built: { label: 'Implemented', colour: '#199e70' },
  modelled: { label: 'Modelled in one process', colour: '#c98500' },
  future: { label: 'Not built', colour: '#9090b0' },
}

function Chip({ status }: { status: Status }) {
  const s = STATUS_COPY[status]
  return (
    <span className="chip" style={{ color: s.colour, borderColor: s.colour + '55' }}>
      {s.label}
    </span>
  )
}

function Section({
  n,
  title,
  status,
  children,
}: {
  n: string
  title: string
  status?: Status
  children: React.ReactNode
}) {
  return (
    <section className="sec">
      <h2>
        <span className="secn">{n}</span>
        {title}
        {status && <Chip status={status} />}
      </h2>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------- the diagrams */

function NestedDiagram() {
  return (
    <figure className="fig">
      <svg viewBox="0 0 560 210" role="img" aria-labelledby="nest-title nest-desc">
        <title id="nest-title">Three nested tunnels</title>
        <desc id="nest-desc">
          An outer identity gateway contains a middle intent and authorization layer, which contains
          an inner secure enclave. Keys derive inward only.
        </desc>
        <rect x="8" y="8" width="544" height="194" rx="14" fill="none" stroke="#3987e5" strokeWidth="2" />
        <text x="24" y="30" fill="#e8e8f5" fontSize="12" fontWeight="600">Depth 0 · Identity gateway</text>
        <text x="24" y="47" fill="#9090b0" fontSize="11">Authenticates the staff agent. Zero visibility into any user environment.</text>

        <rect x="30" y="58" width="500" height="132" rx="12" fill="none" stroke="#d95926" strokeWidth="2" />
        <text x="46" y="80" fill="#e8e8f5" fontSize="12" fontWeight="600">Depth 1 · Intent &amp; authorization</text>
        <text x="46" y="97" fill="#9090b0" fontSize="11">Spawns only on a dual-signed grant. Scoped to one ticket, expires on a clock.</text>

        <rect x="52" y="108" width="456" height="70" rx="10" fill="none" stroke="#199e70" strokeWidth="2" />
        <text x="68" y="130" fill="#e8e8f5" fontSize="12" fontWeight="600">Depth 2 · Secure enclave</text>
        <text x="68" y="147" fill="#9090b0" fontSize="11">Touches account state and index metadata. Never raw conversation content.</text>
        <text x="68" y="166" fill="#9090b0" fontSize="11">Holds no enclave salt of its own — nothing derives inward from here.</text>
      </svg>
      <figcaption>
        Each layer derives its child from its own chain key <em>plus</em> a salt held only at that
        depth. Holding an outer key is not sufficient to compute an inner one.
      </figcaption>
    </figure>
  )
}

function TaxiDiagram() {
  const hops = [
    { x: 96, label: 'nd-lisbon' },
    { x: 236, label: 'nd-osaka' },
    { x: 376, label: 'nd-quito' },
  ]
  return (
    <figure className="fig">
      <svg viewBox="0 0 520 150" role="img" aria-labelledby="taxi-title taxi-desc">
        <title id="taxi-title">A three-hop node taxi ride</title>
        <desc id="taxi-desc">
          A payload leaves the rider wrapped in three layers, each hop peels exactly one layer and
          learns only the next hop, and the ride disintegrates after delivery.
        </desc>
        <line x1="52" y1="62" x2="468" y2="62" stroke="#2d2d45" strokeWidth="2" />
        <circle cx="30" cy="62" r="12" fill="#7c5cbf" />
        <text x="30" y="94" fill="#9090b0" fontSize="10" textAnchor="middle">rider</text>
        {hops.map((h, i) => (
          <g key={h.label}>
            <circle cx={h.x} cy="62" r="14" fill="none" stroke="#3987e5" strokeWidth="2" />
            <text x={h.x} y="66" fill="#e8e8f5" fontSize="10" textAnchor="middle">{3 - i}</text>
            <text x={h.x} y="94" fill="#9090b0" fontSize="10" textAnchor="middle">{h.label}</text>
            <text x={h.x} y="110" fill="#9090b0" fontSize="9" textAnchor="middle">peels 1 layer</text>
          </g>
        ))}
        <circle cx="492" cy="62" r="12" fill="#199e70" />
        <text x="492" y="94" fill="#9090b0" fontSize="10" textAnchor="middle">drop-off</text>
        <text x="260" y="26" fill="#9090b0" fontSize="11" textAnchor="middle">
          each node knows only where to hand the packet on
        </text>
        <text x="260" y="138" fill="#9090b0" fontSize="10" textAnchor="middle">
          after delivery the route, the keys and the layers cease to exist
        </text>
      </svg>
      <figcaption>
        The number in each node is how many layers remain. No hop ever holds both the origin and
        the destination, which is the property that makes the route itself uninteresting to observe.
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------------- page */

function ZkpDocPage() {
  return (
    <div className="doc">
      <div className="doc-inner">
        <header className="doc-head">
          <p className="kicker">CharacterVerse · Architecture note</p>
          <h1>The ZKP SSO tunnel, and the node taxi that rides it</h1>
          <p className="standfirst">
            How someone signs in without a password or a seed phrase, how the session renews itself
            continuously, how support staff get in without a master key, and how a payload crosses
            the network without any single node learning who sent it or where it went.
          </p>
          <p className="doc-links">
            <Link to="/signin">Try both doors <ArrowRight size={12} /></Link>
          </p>
        </header>

        <Section n="01" title="What replaces the password" status="built">
          <p>
            Enrolment generates a P-256 keypair in the browser. The private scalar is sealed under a
            non-extractable AES-GCM key in IndexedDB and never leaves the device. The server receives
            only the public point.
          </p>
          <p>
            Signing in is a Schnorr proof of knowledge, Fiat–Shamir transformed. The server issues a
            single-use challenge; the browser returns a commitment <code>R = kG</code> and a response{' '}
            <code>s = k + c·x mod n</code>; the server checks <code>sG = R + cP</code>. The private
            scalar <code>x</code> is never transmitted and cannot be recovered from the proof.
          </p>
          <p className="callout">
            The consequence worth stating plainly: <strong>there is no credential table</strong>. A
            complete dump of <code>zkp_identities</code> yields public curve points, which are
            public. There is no hash to crack offline, no rainbow table, and no value in stealing it.
            This is the property a password database can never have no matter how good the KDF is.
          </p>
          <p>
            The challenge binds three things — the nonce, the tunnel identifier and the scope — so a
            proof minted for a session tunnel cannot be replayed into a support tunnel, and a proof
            for one tunnel cannot open another. Both cases are covered by tests.
          </p>
        </Section>

        <Section n="02" title="Why it is not a seed phrase" status="built">
          <p>
            A seed phrase is a static master key: written down once, valid forever, catastrophic when
            copied, and unrecoverable when lost. The trade here is different in every direction.
          </p>
          <ul className="compare-list">
            <li><strong>Nothing to write down.</strong> The key is generated per device and never displayed.</li>
            <li><strong>Nothing to copy.</strong> There is no phrase to photograph or phish, because there is no phrase.</li>
            <li><strong>Losing a device is not losing an account.</strong> Revoke that key; the other doors still open.</li>
            <li><strong>Compromise is bounded.</strong> A stolen key opens tunnels until it is revoked. A stolen seed phrase owns everything, silently, forever.</li>
          </ul>
          <p>
            The cost is honest and it is real: a key that exists only on one device means a new device
            starts with no key. That is why the password door stays. Binding happens once — sign in
            with a password on the new device and the key generated there attaches to the same account.
          </p>
        </Section>

        <Section n="03" title="The tunnel lifecycle" status="built">
          <ol className="steps">
            <li>
              <strong>Hail.</strong> The server mints a tunnel row in <code>pending</code>, a single-use
              nonce, a salt, and a throwaway P-256 keypair. The salt is mixed from the most recently
              collapsed tunnel&rsquo;s residue and fresh CSPRNG bytes. The public point goes back with
              the challenge; the private half sits on the pending row and is overwritten the moment the
              tunnel opens.
            </li>
            <li>
              <strong>Prove.</strong> The browser answers the challenge and sends a throwaway point of
              its own. On success the tunnel moves to <code>open</code> and the nonce is wiped. Each
              side then combines its own private half with the other&rsquo;s public point, arriving at a
              shared secret that was never transmitted, and hashes the proof and nonce in alongside it
              to derive the chain key.
            </li>
            <li>
              <strong>Ratchet.</strong> Every authenticated action advances the chain by one HKDF step.
              The message key for step N is derived and the chain is immediately replaced.
            </li>
            <li>
              <strong>Collapse.</strong> The chain key and enclave salt are set to null in the same
              statement that writes a one-way witness digest. What survives proves the tunnel ran to a
              given position; it cannot reconstruct a single message key.
            </li>
          </ol>
          <p className="callout">
            <strong>Why the key agreement is there at all.</strong> An earlier version derived the chain
            from the proof alone. That works, and it is wrong: the proof travels over the wire, so
            anyone recording the plaintext transcript could rebuild every session key that followed.
            The chain would have been secret only because TLS was — a property not worth claiming.
            With the ephemeral exchange, a recorder holding the entire handshake still cannot reach the
            chain, because the one value it is built from is the one value nobody sent. The proof is
            still hashed in, because key agreement on its own would establish a beautifully private
            channel with a complete stranger; the proof is what makes it <em>your</em> channel.
          </p>
          <p className="callout">
            <strong>On recycling entropy — the part that had to be built carefully.</strong> Seeding the
            next tunnel purely from the collapsed one&rsquo;s residue would be a serious bug: one
            compromise would derive every tunnel that followed, which is the exact opposite of forward
            secrecy. So the residue is always hashed together with 32 fresh random bytes. The recycling
            is genuine and it contributes to the pool — it just never <em>determines</em> it.
          </p>
        </Section>

        <Section n="04" title="Continuous renewal, and what it actually stops" status="built">
          <p>
            The handshake renews on every interaction rather than at a fixed interval. Two properties
            follow, and it is worth separating them from the ones that do not.
          </p>
          <p>
            <strong>Forward secrecy.</strong> Each step derives its key from the previous chain key
            through a one-way function. Capturing the chain at position 40 does not recover the keys
            for positions 1 through 39. Traffic recorded earlier stays unreadable.
          </p>
          <p>
            <strong>Hijack detection.</strong> Two parties cannot occupy the same ratchet position. If
            an attacker replays a captured request, the positions diverge, the next step fails to
            verify, and the tunnel collapses rather than resynchronising. There is no benign case where
            two clients share a chain, so there is nothing to preserve by being lenient.
          </p>
          <p className="caveat">
            <strong>What it does not do.</strong> Ratcheting does not detect an attacker who has taken
            over the browser itself — that attacker <em>is</em> the client and moves the chain
            legitimately. It bounds what a network attacker can do with captured traffic. It does not
            bound what a compromised page can do while it is running.
          </p>
        </Section>

        <Section n="05" title="Staff access without a master key" status="built">
          <NestedDiagram />
          <p>
            Support staff have identities of their own, and holding one grants nothing. Reaching a
            user&rsquo;s state requires a delegation signed by both parties:
          </p>
          <ol className="steps">
            <li>Staff request a grant naming a ticket, a scope and an expiry. This authorises nothing.</li>
            <li>
              The account holder&rsquo;s own key countersigns a challenge derived from the grant&rsquo;s
              exact contents. Widening the scope afterwards invalidates the signature — the consent is
              to specific terms, not to the general idea of support.
            </li>
            <li>Depth 1 spawns only when both signatures, an unexpired clock and a matching scope are present.</li>
            <li>Depth 2 spawns only from a live depth 1.</li>
          </ol>
          <p>
            <strong>Cascading collapse.</strong> Collapsing any tunnel collapses its children first,
            recursively. An inner enclave left alive under a dead gateway is precisely the orphaned
            backdoor this architecture exists to prevent, so it is structurally impossible rather than
            merely discouraged.
          </p>
          <p>
            <strong>Privilege segmentation is enforced by the key derivation, not by a policy check.</strong>{' '}
            Deriving a child needs the parent&rsquo;s enclave salt, which is stored at the parent&rsquo;s
            depth and never travels outward. A compromised gateway session cannot compute anything at
            depth 2 — not because the API refuses, but because the arithmetic does not work.
          </p>
        </Section>

        <Section n="06" title="The node taxi" status="modelled">
          <TaxiDiagram />
          <p>
            A payload that must cross the network is wrapped once per hop, innermost hop first, under
            AES-GCM with a per-ride key derived from that ride&rsquo;s entropy.
          </p>
          <ol className="steps">
            <li><strong>Hail.</strong> The tunnel signals that a wrapped payload needs to move. No destination is broadcast.</li>
            <li>
              <strong>Ride.</strong> Each node decrypts exactly one layer and finds the identifier of the
              next node and nothing else. The first hop cannot see the destination; the last cannot see
              the origin; none of them can see the payload.
            </li>
            <li><strong>Drop-off.</strong> The final layer yields the payload. That hop has no next hop and cannot see past itself.</li>
            <li><strong>Disintegration.</strong> The hop keys and layers are discarded and the ride&rsquo;s entropy is recycled forward.</li>
          </ol>
          <p>
            AES-GCM authenticates every layer, so a hop cannot quietly mutate what it is forwarding.
            A tampered layer fails its tag at the next hop and the ride dies rather than delivering a
            corrupted packet — verified by test.
          </p>
          <p className="caveat">
            <strong>Where this is modelled rather than deployed.</strong> The hops here are iterations of
            a loop inside one server invocation, not eight machines in eight jurisdictions. The
            cryptography is real — the onion genuinely is layered per hop and each layer genuinely can
            only be opened by its own key — but the <em>network</em> property that makes onion routing
            valuable requires the nodes to be operated independently. Distributing them changes the
            transport and leaves the mathematics untouched. Until that happens, treat the unlinkability
            claim as a design, not a deployed guarantee.
          </p>
          <p className="caveat">
            One further honesty note: the route is stored on the ride row for inspection while this is
            being built. In a real deployment the route belongs only in the rider&rsquo;s own encrypted
            receipt. The column is marked in the schema so it is not mistaken for a property.
          </p>
        </Section>

        <Section n="07" title="Auditable encryption, without a backdoor" status="built">
          <p>
            The problem this is aimed at: regulators want assurance about what an AI system did, and
            the usual answer is an inspection key. A key for the good guys is a key, and keys leak. The
            approach here is to make the audit trail publishable instead of privileged.
          </p>
          <p>
            Every line in <code>zkp_audit</code> records that a proof was presented, at which depth and
            position, and whether it verified — as a digest of the proof, never the proof itself. An
            auditor can confirm that a specific presentation was the one logged. Nobody can replay the
            log to impersonate anyone, so it needs no access control and can be handed over whole.
          </p>
          <p className="caveat">
            <strong>What is honestly missing.</strong> Proving a statement <em>about a model&rsquo;s
            behaviour</em> — &ldquo;this agent stayed inside its safety envelope&rdquo; — without revealing the
            conversation needs an arithmetic circuit over the model&rsquo;s execution and a proving
            system to run it. That is zkML, it is measured in megabytes of proving key and seconds per
            proof, and it is <strong>not implemented here</strong>. What exists is a commitment:{' '}
            <code>governanceCommitment()</code> hashes a decision&rsquo;s inputs and outputs so the
            record can be shown unedited later. That is tamper-evidence, not zero-knowledge, and calling
            it anything more would be dishonest.
          </p>
        </Section>

        <Section n="08" title="Synthetic apps and the packet payload database" status="future">
          <p>
            Two ideas from the design that are recorded here and deliberately not built, because
            building them badly would be worse than not building them.
          </p>
          <p>
            <strong>Synthetic apps.</strong> Interfaces compiled into volatile memory with randomised
            element identifiers, leaving no disk artifact. The security value is real against a memory
            scraper looking for stable selectors. The value is <em>not</em> encryption, despite the
            framing — an attacker who can read process memory can read a randomised layout too, just
            more slowly. It belongs in the anti-scraping column, not the cryptography column.
          </p>
          <p>
            <strong>Synthetic packet payload database.</strong> A store whose contents are useless when
            dumped, because what is retained is commitments and ephemeral state rather than plaintext.
            The ransomware-immunity claim follows honestly for the tunnel tables in this
            implementation — a dump yields public points and one-way digests. It does <em>not</em>
            follow for the rest of the platform, where conversations are stored so people can read them
            later. Extending it would mean client-side encryption of message content, which changes
            what search and moderation can see and is a product decision before it is a security one.
          </p>
        </Section>

        <Section n="09" title="The threat model, stated as limits">
          <table className="limits">
            <thead>
              <tr><th scope="col">Attacker</th><th scope="col">Outcome</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Steals the whole database</th><td>Gets public points and one-way digests. Inherits any tunnel open at that instant, each expiring within minutes and unable to derive anything at the next depth.</td></tr>
              <tr><th scope="row">Records network traffic</th><td>Sees proofs that reveal nothing about the keys behind them, and cannot replay one — the position has moved. Even holding the complete handshake transcript, it cannot derive the chain: the secret that produces it is agreed from two throwaway points and never transmitted.</td></tr>
              <tr><th scope="row">Copies the browser profile off disk</th><td>Gets ciphertext plus a key handle that cannot be serialised out. The identity does not travel.</td></tr>
              <tr><th scope="row">Runs script on the page (XSS)</th><td><strong>Wins.</strong> Can mint proofs while resident. No client-side scheme survives this; hardware-backed passkeys are the real answer and should carry high-value scopes.</td></tr>
              <tr><th scope="row">Compromises the server</th><td>Can issue cookies for anyone. ZKP removes the credential store, not the need to trust the thing checking the proof.</td></tr>
              <tr><th scope="row">Phishes a user</th><td>There is no phrase or password to hand over. A malicious page can still ask the real key to sign — origin binding and a user gesture are the mitigations, and only the latter is universal.</td></tr>
            </tbody>
          </table>
        </Section>

        <footer className="doc-foot">
          <p>
            Kernel: <code>src/lib/tunnel.ts</code> · server state: <code>db/zkp.ts</code> · vault:{' '}
            <code>src/lib/zkp-client.ts</code> · endpoint: <code>src/routes/api.zkp.ts</code>
          </p>
        </footer>
      </div>

      <style>{`
        .doc { background: var(--bg-primary); min-height: calc(100vh - 60px); padding: 52px 24px 80px; }
        .doc-inner { max-width: 760px; margin: 0 auto; }
        .kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
          color: var(--accent-light); margin: 0 0 12px; }
        .doc-head h1 { font-size: 36px; line-height: 1.15; letter-spacing: -.02em; margin: 0 0 16px;
          color: var(--text-primary); }
        .standfirst { font-size: 16px; line-height: 1.7; color: var(--text-secondary); margin: 0 0 18px; }
        .doc-links a { display: inline-flex; align-items: center; gap: 5px; font-size: 13px;
          color: var(--accent-light); text-decoration: none; }
        .doc-links a:hover { text-decoration: underline; }
        .doc-head { padding-bottom: 34px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }

        .sec { padding: 34px 0; border-bottom: 1px solid var(--border); }
        .sec h2 { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
          font-size: 20px; color: var(--text-primary); margin: 0 0 16px; letter-spacing: -.01em; }
        .secn { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
          color: var(--accent-light); }
        .chip { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 8px;
          border: 1px solid; border-radius: 999px; font-weight: 600; }
        .sec p { font-size: 15px; line-height: 1.72; color: var(--text-secondary); margin: 0 0 14px; }
        .sec strong { color: var(--text-primary); font-weight: 600; }
        .sec code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
          background: var(--bg-card); padding: 1px 5px; border-radius: 4px; color: var(--accent-light); }

        .callout { border-left: 2px solid var(--accent); padding: 4px 0 4px 16px; }
        .caveat { border-left: 2px solid #c98500; padding: 4px 0 4px 16px; }

        .steps { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 11px; }
        .steps li { font-size: 15px; line-height: 1.68; color: var(--text-secondary); }
        .compare-list { margin: 0 0 14px; padding-left: 20px; display: grid; gap: 8px; }
        .compare-list li { font-size: 15px; line-height: 1.65; color: var(--text-secondary); }

        .fig { margin: 0 0 20px; }
        .fig svg { width: 100%; height: auto; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 12px; padding: 8px; }
        .fig figcaption { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-top: 10px; }

        .limits { width: 100%; border-collapse: collapse; font-size: 14px; }
        .limits th, .limits td { text-align: left; padding: 12px 14px 12px 0; vertical-align: top;
          border-bottom: 1px solid var(--border); color: var(--text-secondary); line-height: 1.6; }
        .limits thead th { color: var(--text-primary); font-size: 11px; text-transform: uppercase;
          letter-spacing: .08em; }
        .limits tbody th { color: var(--text-primary); font-weight: 500; padding-right: 22px; width: 32%; }

        .doc-foot { padding-top: 26px; }
        .doc-foot p { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.8; }
      `}</style>
    </div>
  )
}

export const Route = createFileRoute('/zkp')({ component: ZkpDocPage })
