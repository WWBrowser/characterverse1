// Plain object rather than `defineConfig` from 'drizzle-kit': the migration step
// can run before node_modules is installed, and then the config must load
// without resolving the drizzle-kit package itself. `defineConfig` is only an
// identity helper for typing, so nothing is lost.
export default {
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: 'netlify/database/migrations',
}
