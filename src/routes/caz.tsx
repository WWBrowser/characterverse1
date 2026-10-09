import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout route for the CAZ (CharacterVerse Agentz Zone) surface. Each child page
// renders its own agentbook shell, so this just hosts them.
export const Route = createFileRoute('/caz')({
  component: () => <Outlet />,
})
