import { createFileRoute } from '@tanstack/react-router'

// /wwb/download/:platform — a stable download link for WWB.
//
// Redirects to the package the release workflow (.github/workflows/wwb.yml)
// publishes. Set WWB_DOWNLOAD_BASE to where those packages live, e.g.
//   https://github.com/<owner>/<repo>/releases/latest/download
// Until it is set there is nothing honest to hand out, so the link goes back
// to /wwb, which says the builds are not published yet.

const PACKAGES: Record<string, string> = {
  windows: 'wwb-windows-x86_64.zip',
  macos: 'wwb-macos-arm64.zip',
  linux: 'wwb-linux-x86_64.tar.gz',
}

export const Route = createFileRoute('/wwb/download/$platform')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const pkg = PACKAGES[params.platform]
        const base = (process.env.WWB_DOWNLOAD_BASE || '').replace(/\/+$/, '')
        const wantsChecksum = new URL(request.url).searchParams.has('sha256')
        // Only https bases: a download link is the one place a downgrade matters most.
        if (!pkg || !/^https:\/\//.test(base)) {
          return new Response(null, { status: 302, headers: { Location: `/wwb?download=${pkg ? 'unpublished' : 'unknown'}` } })
        }
        return new Response(null, {
          status: 302,
          headers: { Location: `${base}/${pkg}${wantsChecksum ? '.sha256' : ''}`, 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
