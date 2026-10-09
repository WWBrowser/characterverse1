// Enterprise mode — a lightweight, device-local switch that gates the "lean desk"
// tools (ChatCabinet + FileChat) behind an enterprise workspace. The idea: keep
// everyday playground noise out, so what gets marked and filed is real work.
//
// This is intentionally client-side (localStorage). It is a workspace mode, not
// an auth boundary — the gate keeps casual users out of the enterprise surfaces
// while the org decides how to organize, audit and measure character usage.

const KEY = 'cv_enterprise'

export function isEnterprise(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(KEY) === 'on'
}

export function setEnterprise(on: boolean) {
  if (typeof window === 'undefined') return
  if (on) localStorage.setItem(KEY, 'on')
  else localStorage.removeItem(KEY)
  // Let any mounted gate react immediately (storage events don't fire same-tab).
  window.dispatchEvent(new Event('cv-enterprise-change'))
}

// Workspace role — within an enterprise workspace, you act either as the boss /
// auditor (full visibility: the Audit Dashboard, AuditClaw, trimmed negatives,
// FileChat access control) or as staff (use characters, file clean work). Like
// the enterprise switch this is a device-local demo role, not an auth boundary.
const ROLE_KEY = 'cv_role'
export type Role = 'boss' | 'staff'

export function getRole(): Role {
  if (typeof window === 'undefined') return 'staff'
  return localStorage.getItem(ROLE_KEY) === 'boss' ? 'boss' : 'staff'
}

export function setRole(role: Role) {
  if (typeof window === 'undefined') return
  if (role === 'boss') localStorage.setItem(ROLE_KEY, 'boss')
  else localStorage.removeItem(ROLE_KEY)
  window.dispatchEvent(new Event('cv-enterprise-change'))
}
