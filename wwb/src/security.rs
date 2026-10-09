// The security policy — every decision WWB makes about what web content may do.
//
// Servo enforces the web platform's own rules (same-origin, CSP, mixed
// content, CORS). This file is the browser's rules on top of them, kept in
// one place and kept pure, so each one can be read, tested and argued with:
//
//   1. Two kinds of webview, two worlds. The UI webview may only ever show
//      `wwb://ui/`. Page webviews may never show it. Nothing crosses.
//   2. HTTPS-only by default. A plain-http navigation is refused and re-issued
//      as https; the user can exempt a host, and that exemption is visible.
//   3. Dangerous navigations are refused outright: `javascript:` URLs, top-level
//      `data:` documents (a classic phishing carrier), and any scheme WWB does
//      not know. `file:` only when the user typed it.
//   4. Every permission prompt is denied unless the user has said yes, and the
//      UI is told so — a silent deny is a bug report waiting to happen.
//   5. Attack surface WWB does not need is switched off at the engine: WebXR,
//      Bluetooth, gamepads, geolocation, notifications, WebGPU.

use std::collections::BTreeSet;
use std::path::PathBuf;

use servo::{Opts, Preferences};
use url::Url;

/// Where CharacterVerse lives — the home page, the new-tab search and the
/// address bar's suggestions. Overridable at build time (`WWB_CV_ORIGIN`) and
/// at run time (environment `WWB_CV_ORIGIN`) so a fork can point at its own site.
pub fn characterverse_origin() -> Url {
    let raw = std::env::var("WWB_CV_ORIGIN")
        .ok()
        .or_else(|| option_env!("WWB_CV_ORIGIN").map(str::to_owned))
        .unwrap_or_else(|| "https://characterverse1.netlify.app".to_owned());
    Url::parse(&raw)
        .ok()
        .filter(|u| u.scheme() == "https")
        .unwrap_or_else(|| Url::parse("https://characterverse1.netlify.app").expect("static URL"))
}

/// What happens to a navigation.
#[derive(Debug, PartialEq)]
pub enum Decision {
    Allow,
    /// Refuse it, and load this instead (the https upgrade).
    Upgrade(Url),
    /// Refuse it, and tell the user why.
    Deny(&'static str),
}

/// The user's security settings, as the engine holds them.
#[derive(Clone, Debug, Default)]
pub struct Policy {
    pub https_only: bool,
    /// Hosts the user chose to allow over plain http.
    pub http_exceptions: BTreeSet<String>,
}

impl Policy {
    pub fn new() -> Self {
        Self { https_only: true, http_exceptions: BTreeSet::new() }
    }

    /// The decision for a navigation in a page webview (rule 1–3). `typed` is
    /// the URL the user typed into the address bar, if this navigation is it.
    pub fn content_navigation(&self, url: &Url, typed: Option<&Url>) -> Decision {
        match url.scheme() {
            "https" => Decision::Allow,
            "http" => {
                let host = url.host_str().unwrap_or_default();
                let local = host == "localhost" || host == "127.0.0.1" || host == "[::1]";
                if !self.https_only || local || self.http_exceptions.contains(host) {
                    Decision::Allow
                } else {
                    let mut upgraded = url.clone();
                    // set_scheme only fails between special/non-special schemes; http→https is fine.
                    let _ = upgraded.set_scheme("https");
                    if upgraded.port() == Some(80) {
                        let _ = upgraded.set_port(None);
                    }
                    Decision::Upgrade(upgraded)
                }
            },
            "wwb" if url.host_str() == Some("newtab") => Decision::Allow,
            "wwb" => Decision::Deny("WWB's own interface cannot be opened inside a page."),
            "about" if url.path() == "blank" => Decision::Allow,
            "blob" => Decision::Allow,
            "data" => Decision::Deny("Top-level data: documents are blocked — they are a common phishing carrier."),
            "javascript" => Decision::Deny("javascript: URLs are blocked in the address bar and in navigation."),
            "file" if typed.is_some_and(|t| t == url) => Decision::Allow,
            "file" => Decision::Deny("Pages cannot open local files. Type a file: address yourself to open one."),
            _ => Decision::Deny("WWB does not open that kind of address."),
        }
    }

    /// The decision for a navigation in the UI webview (rule 1).
    pub fn ui_navigation(url: &Url) -> Decision {
        if url.scheme() == "wwb" && url.host_str() == Some("ui") {
            Decision::Allow
        } else {
            Decision::Deny("The WWB interface only shows itself.")
        }
    }
}

/// The engine options: multiprocess always; the OS sandbox where Servo has one.
pub fn engine_opts(profile_dir: PathBuf) -> Opts {
    let mut opts = Opts::default();
    // One content process per site group. Even without an OS sandbox this keeps
    // a page's crash — or its compromise — out of the process that holds the
    // window, the profile and the UI.
    opts.multiprocess = true;
    // Servo's gaol sandbox exists for Linux and macOS. On Windows WWB applies
    // its own process mitigations instead (sandbox_win.rs); see SECURITY.md.
    opts.sandbox = cfg!(any(target_os = "linux", target_os = "macos"));
    // Cookies, localStorage, IndexedDB and the HTTP cache live in the profile.
    opts.config_dir = Some(profile_dir);
    opts
}

/// The engine preferences, with what WWB does not need switched off (rule 5).
pub fn hardened_preferences() -> Preferences {
    let mut prefs = Preferences::default();
    prefs.dom_webxr_enabled = false;
    prefs.dom_bluetooth_enabled = false;
    prefs.dom_gamepad_enabled = false;
    prefs.dom_geolocation_enabled = false;
    prefs.dom_notification_enabled = false;
    prefs.dom_webgpu_enabled = false;
    // Say what we are. Sites that sniff for a Chromium or Firefox token will
    // still find Servo's platform string at the front.
    prefs.user_agent = format!("{} WWB/{}", prefs.user_agent, env!("CARGO_PKG_VERSION"));
    prefs
}

/// Is this address-bar input a URL to load, or a CharacterVerse Search?
///
/// A URL if it parses with a scheme WWB opens, or if it looks like a host
/// ("example.com", "localhost:3000"). Everything else is a search — the
/// address bar is CharacterVerse Search's box.
pub fn classify_input(input: &str) -> Option<Url> {
    let s = input.trim();
    if s.is_empty() || s.contains(char::is_whitespace) {
        return None;
    }
    if let Ok(u) = Url::parse(s) {
        if matches!(u.scheme(), "https" | "http" | "file" | "wwb" | "about") {
            return Some(u);
        }
    }
    // Local development servers rarely have certificates; everything else is
    // assumed https, and the HTTPS-only policy would upgrade it anyway.
    if s.starts_with("localhost") || s.starts_with("127.0.0.1") {
        return Url::parse(&format!("http://{s}")).ok();
    }
    let hosty = s.split(['/', ':']).next().is_some_and(|h| h.contains('.') && !h.starts_with('.') && !h.ends_with('.'));
    if hosty {
        return Url::parse(&format!("https://{s}")).ok();
    }
    None
}

/// The CharacterVerse Search results page for a query.
pub fn search_url(query: &str) -> Url {
    let mut u = characterverse_origin();
    u.set_path("/search");
    u.query_pairs_mut().clear().append_pair("q", query.trim());
    u
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn https_only_upgrades_http() {
        let p = Policy::new();
        assert_eq!(p.content_navigation(&u("http://example.com/a?b"), None), Decision::Upgrade(u("https://example.com/a?b")));
        assert_eq!(p.content_navigation(&u("http://localhost:3000/"), None), Decision::Allow);
    }

    #[test]
    fn exceptions_are_per_host() {
        let mut p = Policy::new();
        p.http_exceptions.insert("legacy.example".into());
        assert_eq!(p.content_navigation(&u("http://legacy.example/"), None), Decision::Allow);
        assert!(matches!(p.content_navigation(&u("http://other.example/"), None), Decision::Upgrade(_)));
    }

    #[test]
    fn dangerous_schemes_are_refused() {
        let p = Policy::new();
        assert!(matches!(p.content_navigation(&u("javascript:alert(1)"), None), Decision::Deny(_)));
        assert!(matches!(p.content_navigation(&u("data:text/html,<h1>hi"), None), Decision::Deny(_)));
        assert!(matches!(p.content_navigation(&u("wwb://ui/"), None), Decision::Deny(_)));
        assert_eq!(p.content_navigation(&u("wwb://newtab/"), None), Decision::Allow);
    }

    #[test]
    fn file_only_when_typed() {
        let p = Policy::new();
        let f = u("file:///tmp/a.html");
        assert!(matches!(p.content_navigation(&f, None), Decision::Deny(_)));
        assert_eq!(p.content_navigation(&f, Some(&f)), Decision::Allow);
    }

    #[test]
    fn ui_only_shows_itself() {
        assert_eq!(Policy::ui_navigation(&u("wwb://ui/")), Decision::Allow);
        assert!(matches!(Policy::ui_navigation(&u("https://example.com/")), Decision::Deny(_)));
    }

    #[test]
    fn address_bar_input() {
        assert_eq!(classify_input("example.com"), Some(u("https://example.com/")));
        assert_eq!(classify_input("https://servo.org/x"), Some(u("https://servo.org/x")));
        assert_eq!(classify_input("localhost:3000"), Some(u("http://localhost:3000/")));
        assert_eq!(classify_input("a sky pirate who argues back"), None);
        assert_eq!(classify_input("closures"), None);
        assert_eq!(classify_input("javascript:alert(1)"), None);
    }
}
