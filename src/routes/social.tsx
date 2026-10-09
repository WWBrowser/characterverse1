import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout route for the CVS (CharacterVerse Social) surface. Each child page
// renders its own retro shell, so this simply hosts them.
export const Route = createFileRoute('/social')({
  component: () => <Outlet />,
})
