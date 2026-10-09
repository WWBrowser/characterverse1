import { createFileRoute, Outlet } from '@tanstack/react-router'

// Layout route for CVT (CharacterVerse TabVerse). Children own their own content.
export const Route = createFileRoute('/tabverse')({
  component: () => <Outlet />,
})
