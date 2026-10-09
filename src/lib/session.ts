// Device-local session id, shared across the site (matches the `cv_session` key
// used by chat and character creation). Used to attribute bounties, tester
// feedback and training signals to a workspace without requiring auth.

const KEY = 'cv_session'

export function getSession(): string {
  if (typeof window === 'undefined') return 'anon'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    localStorage.setItem(KEY, id)
  }
  return id
}
