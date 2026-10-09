// The `wwb://` scheme — WWB's own pages, and the bridge from its UI to its engine.
//
//   wwb://ui/                the browser UI (the tab strip, the toolbar, the
//                            address bar). Only the UI webview may show it.
//   wwb://ui/ui.css, ui.js   its assets, compiled into the binary
//   wwb://ui/ipc/<command>   a command from the UI to the engine
//   wwb://newtab/            the new-tab page: CharacterVerse Search
//
// Why a scheme and not a JavaScript binding: Servo's embedding API exposes
// custom protocols, and a protocol is a narrow, auditable door — one function,
// one parser, one allow-list of commands below.
//
// What keeps a web page from driving the browser through it:
//   - Every command must carry this launch's secret token, compared in
//     constant time. The token is minted at start-up and written only into
//     the UI page's HTML.
//   - `is_fetchable` is false, so no page — not even the UI — can read a
//     `wwb://` response from script. A page cannot fetch the UI's HTML to
//     learn the token, and an IPC response says nothing anyway.
//   - The engine refuses to let any page webview navigate to `wwb://ui/`
//     (security.rs), and refuses to let the UI webview go anywhere else.
//
// This handler runs on Servo's networking thread. It owns nothing of the
// browser: it parses, checks the token, and hands a `UiCommand` to the main
// thread over a channel, then wakes the event loop.

use std::future::Future;
use std::pin::Pin;
use std::sync::mpsc::Sender;

use http::HeaderValue;
use servo::protocol_handler::{
    DoneChannel, FetchContext, HttpStatus, ProtocolHandler, Request, ResourceFetchTiming, Response, ResponseBody,
};
use servo::EventLoopWaker;
use url::Url;

const UI_HTML: &str = include_str!("../ui/index.html");
const UI_CSS: &str = include_str!("../ui/ui.css");
const UI_JS: &str = include_str!("../ui/ui.js");
const NEWTAB_HTML: &str = include_str!("../ui/newtab.html");

/// Everything the UI may ask the engine to do. Anything else is refused.
#[derive(Debug, Clone, PartialEq)]
pub enum UiCommand {
    /// The UI has loaded and wants the current state.
    Ready,
    /// Load address-bar input in a tab: a URL, or a CharacterVerse Search.
    Navigate { tab: Option<u64>, input: String },
    NewTab { input: Option<String> },
    CloseTab { tab: u64 },
    FocusTab { tab: u64 },
    MoveTab { tab: u64, to: usize },
    Back,
    Forward,
    Reload,
    ToggleBookmark,
    SetHttpsOnly { on: bool },
    AllowHttpFor { host: String },
    ClearBrowsingData,
    /// The UI needs the whole window for a moment (suggestions, the tab index).
    SetOverlay { open: bool },
    /// Keyboard focus belongs to the page again (Escape, a click on content).
    FocusContent,
    /// Local history matching what is being typed — answered from SQLite by
    /// the engine, so history never leaves the machine.
    Suggest { input: String },
}

impl UiCommand {
    /// Parse `/ipc/<command>?…` — strictly. Unknown commands, missing
    /// arguments and absurd sizes are all `None`.
    pub fn parse(url: &Url) -> Option<Self> {
        let name = url.path().strip_prefix("/ipc/")?;
        let q = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());
        let id = |k: &str| q(k).and_then(|v| v.parse::<u64>().ok());
        let text = |k: &str| q(k).filter(|v| v.len() <= 4096);
        Some(match name {
            "ready" => Self::Ready,
            "navigate" => Self::Navigate { tab: id("tab"), input: text("input")? },
            "new-tab" => Self::NewTab { input: text("input").filter(|s| !s.is_empty()) },
            "close-tab" => Self::CloseTab { tab: id("tab")? },
            "focus-tab" => Self::FocusTab { tab: id("tab")? },
            "move-tab" => Self::MoveTab { tab: id("tab")?, to: q("to")?.parse().ok()? },
            "back" => Self::Back,
            "forward" => Self::Forward,
            "reload" => Self::Reload,
            "bookmark" => Self::ToggleBookmark,
            "https-only" => Self::SetHttpsOnly { on: q("on")? == "1" },
            "allow-http" => Self::AllowHttpFor { host: q("host").filter(|h| !h.is_empty() && h.len() <= 253)? },
            "clear-data" => Self::ClearBrowsingData,
            "overlay" => Self::SetOverlay { open: q("open")? == "1" },
            "focus-content" => Self::FocusContent,
            "suggest" => Self::Suggest { input: text("input")? },
            _ => return None,
        })
    }
}

pub struct WwbProtocol {
    token: String,
    cv_origin: String,
    commands: Sender<UiCommand>,
    waker: Box<dyn EventLoopWaker>,
}

impl WwbProtocol {
    pub fn new(token: String, cv_origin: String, commands: Sender<UiCommand>, waker: Box<dyn EventLoopWaker>) -> Self {
        Self { token, cv_origin, commands, waker }
    }

    fn page(&self, url: &Url) -> (u16, &'static str, Vec<u8>) {
        match (url.host_str(), url.path()) {
            (Some("ui"), "/" | "/index.html") => (
                200,
                "text/html; charset=utf-8",
                UI_HTML.replace("{{WWB_TOKEN}}", &self.token).replace("{{CV_ORIGIN}}", &self.cv_origin).into_bytes(),
            ),
            (Some("ui"), "/ui.css") => (200, "text/css; charset=utf-8", UI_CSS.as_bytes().to_vec()),
            (Some("ui"), "/ui.js") => (200, "text/javascript; charset=utf-8", UI_JS.as_bytes().to_vec()),
            (Some("ui"), p) if p.starts_with("/ipc/") => self.command(url),
            (Some("newtab"), "/" | "/index.html") => (
                200,
                "text/html; charset=utf-8",
                NEWTAB_HTML.replace("{{CV_ORIGIN}}", &self.cv_origin).into_bytes(),
            ),
            _ => (404, "text/plain; charset=utf-8", b"Not part of WWB.".to_vec()),
        }
    }

    fn command(&self, url: &Url) -> (u16, &'static str, Vec<u8>) {
        let presented = url.query_pairs().find(|(k, _)| k == "k").map(|(_, v)| v.into_owned()).unwrap_or_default();
        if !constant_time_eq(presented.as_bytes(), self.token.as_bytes()) {
            return (403, "text/plain; charset=utf-8", Vec::new());
        }
        match UiCommand::parse(url) {
            Some(cmd) => {
                if self.commands.send(cmd).is_ok() {
                    self.waker.wake();
                }
                (204, "text/plain; charset=utf-8", Vec::new())
            },
            None => (400, "text/plain; charset=utf-8", Vec::new()),
        }
    }
}

impl ProtocolHandler for WwbProtocol {
    fn load(
        &self,
        request: &mut Request,
        _done_chan: &mut DoneChannel,
        _context: &FetchContext,
    ) -> Pin<Box<dyn Future<Output = Response> + Send>> {
        let servo_url = request.current_url();
        let url: Url = servo_url.as_url().clone();
        let (status, content_type, body) = self.page(&url);

        let mut response = Response::new(servo_url, ResourceFetchTiming::new(request.timing_type()));
        *response.body.lock() = ResponseBody::Done(body);
        response.status = HttpStatus::new_raw(status, Vec::new());
        response.headers.insert(http::header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        // The UI may talk to itself and read CharacterVerse Search for the
        // address bar's suggestions; nothing else. No inline script, no eval.
        // The new-tab page is a plain form that submits to CharacterVerse
        // Search: no script at all, and it may submit nowhere else.
        let csp = match url.host_str() {
            Some("ui") => Some(format!(
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: {cv}; connect-src 'self' {cv}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
                cv = self.cv_origin
            )),
            Some("newtab") => Some(format!(
                "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action {cv}; frame-ancestors 'none'; base-uri 'none'",
                cv = self.cv_origin
            )),
            _ => None,
        };
        if let Some(v) = csp.and_then(|c| HeaderValue::from_str(&c).ok()) {
            response.headers.insert(http::header::CONTENT_SECURITY_POLICY, v);
        }
        response.headers.insert(http::header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
        response.headers.insert(http::header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        Box::pin(std::future::ready(response))
    }

    /// No page may read a `wwb://` response from script — see the header.
    fn is_fetchable(&self) -> bool {
        false
    }

    fn is_secure(&self) -> bool {
        true
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// A fresh launch token: 32 random bytes, hex.
pub fn mint_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random number generator is unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn parses_known_commands_only() {
        assert_eq!(UiCommand::parse(&u("wwb://ui/ipc/back")), Some(UiCommand::Back));
        assert_eq!(
            UiCommand::parse(&u("wwb://ui/ipc/navigate?tab=3&input=closures")),
            Some(UiCommand::Navigate { tab: Some(3), input: "closures".into() })
        );
        assert_eq!(UiCommand::parse(&u("wwb://ui/ipc/close-tab")), None, "missing argument");
        assert_eq!(UiCommand::parse(&u("wwb://ui/ipc/rm-rf")), None, "unknown command");
        assert_eq!(UiCommand::parse(&u("wwb://ui/elsewhere")), None);
    }

    #[test]
    fn constant_time_compare() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }

    struct NoWaker;
    impl EventLoopWaker for NoWaker {
        fn clone_box(&self) -> Box<dyn EventLoopWaker> {
            Box::new(NoWaker)
        }
        fn wake(&self) {}
    }

    fn handler() -> (WwbProtocol, std::sync::mpsc::Receiver<UiCommand>) {
        let (tx, rx) = std::sync::mpsc::channel();
        (WwbProtocol::new("t0ken".into(), "https://cv.example".into(), tx, Box::new(NoWaker)), rx)
    }

    #[test]
    fn ui_page_carries_this_launchs_token_and_nothing_unfilled() {
        let (h, _) = handler();
        let (status, ty, body) = h.page(&u("wwb://ui/"));
        let html = String::from_utf8(body).unwrap();
        assert_eq!((status, ty), (200, "text/html; charset=utf-8"));
        assert!(html.contains(r#"content="t0ken""#));
        assert!(html.contains("https://cv.example"));
        assert!(!html.contains("{{"), "every placeholder is filled");
    }

    #[test]
    fn commands_need_the_token() {
        let (h, rx) = handler();
        assert_eq!(h.page(&u("wwb://ui/ipc/back")).0, 403, "no token");
        assert_eq!(h.page(&u("wwb://ui/ipc/back?k=guess")).0, 403, "wrong token");
        assert!(rx.try_recv().is_err(), "a refused command never reaches the engine");
        assert_eq!(h.page(&u("wwb://ui/ipc/back?k=t0ken")).0, 204);
        assert_eq!(rx.try_recv().unwrap(), UiCommand::Back);
        assert_eq!(h.page(&u("wwb://ui/ipc/format-disk?k=t0ken")).0, 400, "unknown command, right token");
    }

    #[test]
    fn newtab_and_unknown_paths() {
        let (h, _) = handler();
        let (status, _, body) = h.page(&u("wwb://newtab/"));
        let html = String::from_utf8(body).unwrap();
        assert_eq!(status, 200);
        assert!(html.contains(r#"action="https://cv.example/search""#));
        assert!(!html.contains("{{") && !html.contains("<script"), "filled, and script-free");
        assert_eq!(h.page(&u("wwb://ui/../../etc/passwd")).0, 404);
        assert_eq!(h.page(&u("wwb://elsewhere/")).0, 404);
    }

    #[test]
    fn tokens_are_long_and_fresh() {
        let (a, b) = (mint_token(), mint_token());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
}
