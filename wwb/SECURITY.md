# WWB security model

WWB is a browser, so it runs code from strangers. This file says what protects
you, where each protection comes from, and — just as plainly — where the gaps
are. If something here is wrong, it is a bug; report it as one.

## Layers

| Layer | What it does | Where it comes from |
|---|---|---|
| **Process isolation** | Page content runs in separate content processes, never in the process that owns the window, your profile and the UI. A crashed or compromised page takes down its own process; the tab shows "crashed" and the browser carries on. | Servo `multiprocess` (`security.rs::engine_opts`) |
| **OS sandbox — Linux, macOS** | Content processes are confined by Servo's `gaol` profile: read-only access to fonts and a few system files, no arbitrary file system, no spawning programs. | Servo `sandbox` + `servo-constellation` sandbox profile |
| **Process mitigations — Windows** | Content processes put themselves in a one-process job object (cannot start programs), disable extension points (no injected DLLs), restrict image loads (no remote or low-integrity DLLs, System32 first) and enforce strict handle checks. | `sandbox_win.rs` |
| **Two worlds** | The interface is a page at `wwb://ui/` in its own webview. No web page may navigate there; the UI webview may navigate nowhere else. | `security.rs::Policy::ui_navigation`, `content_navigation` |
| **The UI ↔ engine bridge** | Commands travel over `wwb://ui/ipc/…`, carry a 256-bit token minted at each launch, are compared in constant time, and are parsed against a fixed allow-list. `wwb://` responses are never readable by script (`is_fetchable = false`), so no page can read the UI's HTML to learn the token. | `protocol.rs` |
| **HTTPS-only** | Plain-http navigations are refused and re-issued as https. You can exempt a host from the lock menu; the exemption is listed and stays visible as "Not secure". `localhost` is exempt for development. | `security.rs` |
| **Navigation rules** | `javascript:` URLs, top-level `data:` documents and unknown schemes are refused; `file:` opens only when you typed it. | `security.rs` |
| **Permissions** | Camera, microphone, notifications, geolocation and the rest are denied by default, and WWB tells you when a site asked. | `engine.rs::request_permission` |
| **Smaller attack surface** | WebXR, Bluetooth, gamepads, geolocation, notifications and WebGPU are switched off in the engine. | `security.rs::hardened_preferences` |
| **Interface hygiene** | The UI renders every page-supplied string (titles, URLs, search results) as text, never markup, under a CSP of `script-src 'self'` with no inline script. The new-tab page has no script at all. | `ui/ui.js`, `protocol.rs` |
| **TLS** | rustls with the aws-lc-rs provider; no OpenSSL. | `main.rs` |
| **Local data** | History, bookmarks and the session live in one SQLite file in your profile, readable only by you on Unix (`0600`). History never leaves your machine; address-bar history suggestions are answered locally. "Clear browsing data" removes history, the session, cookies and site storage, and keeps bookmarks. | `store.rs` |

## What WWB does *not* protect against — yet

- **Windows has no full sandbox.** Servo's OS sandbox does not cover Windows.
  WWB's mitigations are real, but a compromised content process on Windows
  still runs with your user rights. The next steps are arbitrary-code-guard
  (needs SpiderMonkey's JIT off) and win32k lockdown (needs Servo's font and GL
  paths moved out of content processes).
- **Servo is younger than Blink, Gecko or WebKit.** It has had far less fuzzing
  and far fewer years of attack. Keep WWB updated; every Servo release carries
  security fixes.
- **Builds are unsigned.** Until the release pipeline signs and notarises,
  macOS asks you to confirm the first launch and Windows SmartScreen may warn.
  Verify downloads with the `.sha256` file published beside each one.
- **No Safe Browsing list** — WWB does not yet check URLs against a phishing or
  malware list.
- **No automatic updates** — new versions are a manual download for now.
- **Site compatibility.** Servo does not yet run every site that works in other
  browsers. That is a compatibility gap, not a security one, but a site that
  breaks may push you to work around it — don't disable HTTPS-only to do so.

## Reporting

Report vulnerabilities privately to the CharacterVerse maintainers rather than
in a public issue. Engine bugs that reproduce in Servo itself should also go to
Servo's security process.
