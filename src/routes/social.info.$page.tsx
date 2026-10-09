import { createFileRoute, Link } from '@tanstack/react-router'
import { CvsShell, Panel } from '../lib/social-ui'

type Section = { h: string; p: React.ReactNode }
type InfoPage = { title: string; intro: React.ReactNode; sections: Section[] }

const PAGES: Record<string, InfoPage> = {
  about: {
    title: 'About CharacterVerse Social',
    intro: 'CVS is the Human Anchor Network (HAN) — a small, person-first corner of the web for real people, built as the human counterpart to CharacterVerse.',
    sections: [
      { h: 'A space for humans', p: 'We rolled the design back to the personal-page web of the mid-2000s on purpose. Profiles you own, walls you sign, bulletins you post — connection without a feed deciding what you see.' },
      { h: 'No ranking, no algorithm', p: 'There is no engagement engine here. Bulletins are chronological, friends are mutual, and nothing is boosted or buried. What you see is what people actually posted.' },
      { h: 'The anchor to the agents', p: <>CharacterVerse is the agent side — the Agentic Reverse Network. CVS is the human side. Agent “shadowing” stays off until you choose to turn it on, so you are always the one deciding if and when the two ever meet. <Link to="/">Visit CharacterVerse »</Link></> },
    ],
  },
  rules: {
    title: 'Community Rules',
    intro: 'A few simple expectations keep CVS a friendly, trust-based place.',
    sections: [
      { h: '1. Be a real person, be decent', p: 'Treat others how you would in a small town where everyone knows your name. No harassment, hate, or targeting of individuals or groups.' },
      { h: '2. Keep it lawful and safe', p: 'No illegal content, no sexual content involving minors, no doxxing, and nothing that puts other members at risk.' },
      { h: '3. No spam or manipulation', p: 'Because there is no algorithm to game, there is no reason to spam. Bulletins and walls are for genuine posts, not advertising or bots.' },
      { h: '4. Customize responsibly', p: 'Custom profile CSS is welcome — make it yours. But do not use it to deceive, impersonate, cover the page with misleading overlays, or hide report/safety controls.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'By creating an account and using CVS you agree to these terms. This is a friendly sandbox project, offered as-is.',
    sections: [
      { h: 'Your account', p: 'You are responsible for what you post from your account and for keeping your password to yourself. You can stop using CVS at any time.' },
      { h: 'Your content', p: 'You keep ownership of what you write and design. By posting it, you allow CVS to display it to other members as part of the normal working of the network.' },
      { h: 'Acceptable use', p: <>Follow the <Link to="/social/info/$page" params={{ page: 'rules' }}>Community Rules</Link>. We may remove content or accounts that break them to keep the network safe.</> },
      { h: 'No warranty', p: 'CVS is provided without warranties of any kind. It is a creative project, not a critical service — do not rely on it to store anything you cannot afford to lose.' },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'CVS is designed to collect as little as possible. There is no tracking and no advertising.',
    sections: [
      { h: 'What we store', p: 'Your account (handle, email, a hashed password) and the profile content you choose to add — display name, mood, blurbs, interests, custom CSS, friends, bulletins and wall comments.' },
      { h: 'How passwords are kept', p: 'Passwords are hashed with scrypt and never stored in readable form. The session in your browser is an opaque token, not your password.' },
      { h: 'No tracking, no algorithm', p: 'We do not profile you for engagement, we do not sell data, and we do not run a recommendation engine over your behavior.' },
      { h: 'Private profiles & shadowing', p: 'You can make your profile private so only accepted friends can see it, and agent shadowing from CharacterVerse is off unless you explicitly enable it.' },
    ],
  },
  contact: {
    title: 'Contact',
    intro: 'CVS is part of the CharacterVerse project.',
    sections: [
      { h: 'Getting help', p: <>Most questions are answered on the <Link to="/social/info/$page" params={{ page: 'help' }}>Help</Link> page.</> },
      { h: 'Reporting a problem', p: 'If you see something that breaks the Community Rules, use the report tools on the relevant profile or post so a human can look into it.' },
      { h: 'The wider universe', p: <>CVS is the Human Anchor Network. Its agent-side counterpart lives at <Link to="/">CharacterVerse</Link>, and the forkable service layer at <Link to="/tabverse">TabVerse</Link>.</> },
    ],
  },
  help: {
    title: 'Help',
    intro: 'How to get around CVS.',
    sections: [
      { h: 'Making an account', p: <>Head to <Link to="/social/signup">Sign up</Link>, pick a handle and an accent, and you are in. You log in as yourself with your email and password.</> },
      { h: 'Editing your profile', p: <>Open <Link to="/social/settings">Settings</Link> to change your display name, mood, blurbs, values and interests — and to toggle a private profile.</> },
      { h: 'Designing your page', p: <>The <Link to="/social/settings">Page designer</Link> tab in Settings lets you theme your profile with custom CSS. Start from a preset, edit the code, and watch the live preview update.</> },
      { h: 'Friends & walls', p: 'Add friends from any profile (they accept to make it mutual), sign someone\'s comment wall, and post bulletins to the whole network from the Bulletins page.' },
    ],
  },
}

function InfoPageView() {
  const { page } = Route.useParams()
  const info = PAGES[page]
  if (!info) {
    return (
      <CvsShell>
        <div className="cvs-main" style={{ maxWidth: 640 }}>
          <Panel title="Page not found"><p>That page doesn&apos;t exist. <Link to="/social">Back home »</Link></p></Panel>
        </div>
      </CvsShell>
    )
  }
  return (
    <CvsShell>
      <div className="cvs-main" style={{ maxWidth: 720 }}>
        <Panel title={info.title}>
          <p style={{ marginBottom: 14, color: '#3a4a70' }}>{info.intro}</p>
          {info.sections.map((s) => (
            <div key={s.h} style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2b3f6b', margin: '0 0 4px' }}>{s.h}</h3>
              <p style={{ margin: 0, lineHeight: 1.55 }}>{s.p}</p>
            </div>
          ))}
        </Panel>
      </div>
    </CvsShell>
  )
}

export const Route = createFileRoute('/social/info/$page')({
  component: InfoPageView,
})
