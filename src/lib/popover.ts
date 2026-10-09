import { useEffect, useRef } from 'react'

/**
 * One dismissal behaviour for every popover on the index.
 *
 * Escape closes, a click outside closes, and focus moves into the panel on open
 * so the thing is operable from the keyboard alone. Written once because three
 * popovers that each guessed at this would each get a different corner of it
 * wrong, and the corner people notice is the one where the panel will not shut.
 *
 * The outside-click listener is attached on a deferred tick deliberately: the
 * click that opened the panel is still propagating when this effect runs, so
 * binding immediately means the opening click is also the closing click.
 *
 * `autoFocus` is opt-out for menus that sit under a live text field — moving
 * focus out of the search box to open a menu beside it would lose the caret.
 */
export function useDismissable<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  autoFocus = true,
) {
  const panel = useRef<T>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    if (autoFocus) panel.current?.querySelector<HTMLElement>('button, a, input, select')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      clearTimeout(id)
    }
  }, [onClose, autoFocus])

  return panel
}
