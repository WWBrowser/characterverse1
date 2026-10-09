// WWB — Web World Browser.
//
// CharacterVerse's own browser. Not Chromium: the engine is Servo (Stylo,
// layout, WebRender, the SpiderMonkey JavaScript engine, hyper + rustls). WWB
// is everything around it — the window, the compositing of its UI with page
// content, the tab system, the address bar's CharacterVerse Search, local
// persistence, and the security policy — written here.
//
// The eight subsystems of a browser, and where each one lives:
//
//   User Interface ......... ui/ (HTML/CSS/JS, rendered by Servo itself) — the
//                            /workspace tab system, ported
//   Browser Engine ......... engine.rs — tabs, navigation, the UI↔engine bridge
//   Rendering Engine ....... Servo (Stylo + layout + WebRender)
//   JavaScript Engine ...... Servo's SpiderMonkey
//   Networking ............. Servo's net stack, rustls with aws-lc-rs for TLS
//   UI Backend ............. app.rs + input.rs — winit window, GL compositing
//                            of the UI and the page, OS input
//   Data Persistence ....... store.rs (SQLite: tabs, history, bookmarks) plus
//                            Servo's own cookie/storage/IndexedDB in the profile
//   Security Sandbox ....... security.rs (navigation + permission policy),
//                            Servo multiprocess + gaol on Linux/macOS,
//                            sandbox_win.rs mitigations on Windows

mod app;
mod engine;
mod input;
mod protocol;
mod security;
#[cfg(windows)]
mod sandbox_win;
mod store;

use std::error::Error;

use winit::event_loop::EventLoop;

fn main() -> Result<(), Box<dyn Error>> {
    // Servo runs page content in separate processes by re-executing this
    // binary with `--content-process <token>`. That path must come first and
    // must do nothing else: a content process is the least-trusted code WWB
    // runs, and it gets no window, no profile and no UI.
    if let Some(token) = content_process_token() {
        #[cfg(windows)]
        sandbox_win::lock_down_content_process();
        servo::run_content_process(token);
        return Ok(());
    }

    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .map_err(|_| "failed to install the TLS crypto provider")?;

    let event_loop = EventLoop::<app::WakerEvent>::with_user_event().build()?;
    let mut app = app::App::new(&event_loop)?;
    event_loop.run_app(&mut app)?;
    Ok(())
}

/// The token after `--content-process`, if this process is a content process.
fn content_process_token() -> Option<String> {
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == "--content-process" {
            return args.next();
        }
    }
    None
}
