# WWB — Web World Browser

CharacterVerse's own web browser. **Not Chromium:** the engine is
[Servo](https://servo.org) — Stylo for CSS, Servo's layout, WebRender for
painting, SpiderMonkey for JavaScript, hyper + rustls for the network. WWB is
everything a browser needs around an engine: the window, the compositor that
puts the interface and the page on screen together, the tab system, the
address bar, persistence and the security policy.

- **Its interface is the CharacterVerse `/workspace` tab system** — one strip
  holding every kind of tab, tabs kept alive (hidden, not reloaded) when you
  switch away, the strip persisted as it changes so it survives a crash, a
  Search button and an Index that groups tabs by what they are.
- **Its search is CharacterVerse Search.** The address bar is the search box:
  anything that isn't an address is a CharacterVerse Search, suggestions come
  from the CharacterVerse index plus your local history, and the new tab is
  CharacterVerse Search with all three engines (CharacterVerse, AgentechVerse,
  SpatialVerse).

## Architecture

The eight subsystems of a browser (the architecture in the brief's Choice B),
and where each one lives:

| Subsystem | In WWB |
|---|---|
| **User interface** | `ui/` — HTML, CSS and JS rendered by Servo in its own webview at `wwb://ui/`. Tab strip, toolbar, address bar, suggestions, tab index, lock and menu panels. |
| **Browser engine** | `src/engine.rs` — tabs, navigation, the UI↔engine bridge, the session, and Servo's `WebViewDelegate`. |
| **Rendering engine** | Servo: HTML parsing, the DOM, Stylo (CSSOM + style), layout, WebRender. |
| **JavaScript engine** | Servo's SpiderMonkey, JIT on. |
| **Networking** | Servo's net stack (DNS, HTTP and HTTPS, WebSockets, the HTTP cache); TLS by rustls with aws-lc-rs. WWB's own `wwb://` scheme in `src/protocol.rs`. |
| **UI backend (graphics & compositing)** | `src/app.rs` + `src/input.rs` — the winit window, one GL context, two off-screen contexts (UI and page) blitted into it every frame, and OS input routed by geometry and focus. |
| **Data persistence** | `src/store.rs` — SQLite for tabs, history, bookmarks and settings; Servo's own cookies, localStorage, sessionStorage, IndexedDB and HTTP cache in the profile's `engine/` folder. |
| **Security sandbox** | `src/security.rs` (navigation, permission and engine policy), Servo multiprocess + `gaol` on Linux/macOS, `src/sandbox_win.rs` on Windows. See [SECURITY.md](SECURITY.md). |

### How the interface talks to the engine

```
  ┌──────────────── window (WindowRenderingContext) ────────────────┐
  │  UI webview  ── wwb://ui/ ── paints into ui OffscreenContext     │  84 CSS px
  │──────────────────────────────────────────────────────────────── │
  │  active page webview ── paints into content OffscreenContext     │
  └──────────────────────────────────────────────────────────────── ┘

  UI ──fetch wwb://ui/ipc/<cmd>?k=<launch token>──▶ WwbProtocol (net thread)
                                                    └─ channel ─▶ Engine (main thread)
  Engine ──evaluate_javascript("wwb.render(state, token)")──▶ UI
```

The UI has no authority of its own: it sends commands and renders the state
the engine pushes back. Pages can't reach the bridge. It needs the launch
token, and no script can read a `wwb://` response to learn it.

## Building

Requirements: Rust 1.88+ and Servo's native build dependencies — on Linux
clang, cmake, pkg-config, Mesa GL/EGL, X11/Wayland and fontconfig/freetype
headers (the exact list is in `.github/workflows/wwb.yml`); on macOS the Xcode
command-line tools; on Windows Visual Studio Build Tools and LLVM.

```sh
cd wwb
cargo test            # the policy, store and protocol unit tests
cargo run --release   # build and launch
```

The first build compiles Servo and takes a while (25–45 minutes is normal).
Set `WWB_CV_ORIGIN=https://your-site` to point WWB at a different
CharacterVerse deployment.

## Downloads

`.github/workflows/wwb.yml` builds and tests WWB on Linux, macOS and Windows
on every change to `wwb/`, and a tag `wwb-v*` publishes the packages (with
`.sha256` checksums) to a GitHub Release. The CharacterVerse `/wwb` page links
to them once `WWB_DOWNLOAD_BASE` is set on the site.

## Shortcuts

| | |
|---|---|
| New tab | Ctrl/⌘ T |
| Close tab | Ctrl/⌘ W |
| Address bar | Ctrl/⌘ L |
| Reload | Ctrl/⌘ R, F5 |
| Back / Forward | Alt ← / Alt →, Ctrl/⌘ [ / ] |
| Next / previous tab | Ctrl Tab / Ctrl Shift Tab |

## Known gaps in 0.1

- `<select>` drop-downs, `alert`/`confirm`/`prompt`, file pickers and context
  menus are Servo "embedder controls" that WWB does not draw yet; they fall
  back to Servo's defaults (dialogs are dismissed).
- No downloads manager, no extensions, no sync, no automatic updates.
- Site compatibility is Servo's: most of the modern web, not all of it.
- See [SECURITY.md](SECURITY.md) for the security gaps, Windows first.

## Licence

MPL-2.0, like Servo.
