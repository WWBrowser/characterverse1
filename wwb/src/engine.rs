// The browser engine — the coordinator between the UI and the rendering engine.
//
// It owns the tabs, decides what each navigation is allowed to do, keeps the
// UI told about every change, and writes the session to disk as it changes.
// Servo is the rendering engine; this is the part of a browser Servo leaves to
// its embedder.
//
// The /workspace tab system, carried over:
//   - One strip, several kinds of tab. /workspace has chat tabs and frame tabs;
//     WWB has web tabs, CharacterVerse character tabs (/chat/:id), Search tabs
//     and the new-tab page. Kind is read off the URL, so a tab is whatever it
//     is showing now.
//   - Every tab stays alive when it is not the active one — hidden, not torn
//     down — so switching away from a page and back does not reload it or lose
//     what was in flight.
//   - The strip is persisted as it changes (store.rs), so it survives a crash.
//
// One `Rc<Engine>` is the `WebViewDelegate` for every webview, the UI's
// included; each callback checks which webview it is about.

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::sync::mpsc::Receiver;

use euclid::Scale;
use serde::Serialize;
use servo::{
    CreateNewWebViewRequest, LoadStatus, NavigationRequest, OffscreenRenderingContext, PermissionRequest,
    RenderingContext, Servo, StorageType, WebView, WebViewBuilder, WebViewDelegate,
};
use url::Url;
use winit::window::Window;

use crate::protocol::UiCommand;
use crate::security::{self, Decision, Policy};
use crate::store::{SavedTab, Store};

/// Height of the UI strip (tabs + toolbar), in CSS pixels. Must match ui.css.
pub const UI_STRIP_CSS_PX: f64 = 84.0;

pub struct Tab {
    pub id: u64,
    pub webview: WebView,
    pub url: Url,
    pub title: String,
    pub loading: bool,
    pub can_back: bool,
    pub can_forward: bool,
    pub crashed: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Focus {
    Ui,
    Content,
}

pub struct Engine {
    pub servo: Servo,
    window: Rc<Window>,
    ui_ctx: Rc<OffscreenRenderingContext>,
    content_ctx: Rc<OffscreenRenderingContext>,
    ui: RefCell<Option<WebView>>,
    tabs: RefCell<Vec<Tab>>,
    active: Cell<usize>,
    next_id: Cell<u64>,
    policy: RefCell<Policy>,
    store: RefCell<Store>,
    commands: Receiver<UiCommand>,
    /// The last URL the user typed — the only way a `file:` URL gets allowed.
    typed: RefCell<Option<Url>>,
    /// Loads requested from inside a delegate callback, run after the callback
    /// returns (the https upgrade, mostly) — never re-entrantly.
    pending_loads: RefCell<Vec<(u64, Url)>>,
    overlay: Cell<bool>,
    focus: Cell<Focus>,
    notice: RefCell<Option<String>>,
    ui_dirty: Cell<bool>,
    session_dirty: Cell<bool>,
    cv_origin: Url,
    token: String,
}

/// What the UI is told. Kept flat and boring on purpose: the UI renders it and
/// nothing else, so it is the entire contract between the two.
#[derive(Serialize)]
struct UiState<'a> {
    tabs: Vec<UiTab>,
    active: u64,
    #[serde(rename = "httpsOnly")]
    https_only: bool,
    bookmarked: bool,
    secure: bool,
    notice: Option<&'a str>,
    overlay: bool,
    cv: &'a str,
    bookmarks: Vec<SavedTab>,
}

#[derive(Serialize)]
struct UiTab {
    id: u64,
    title: String,
    url: String,
    host: String,
    kind: &'static str,
    loading: bool,
    #[serde(rename = "canBack")]
    can_back: bool,
    #[serde(rename = "canForward")]
    can_forward: bool,
    crashed: bool,
}

impl Engine {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        servo: Servo,
        window: Rc<Window>,
        ui_ctx: Rc<OffscreenRenderingContext>,
        content_ctx: Rc<OffscreenRenderingContext>,
        store: Store,
        commands: Receiver<UiCommand>,
        cv_origin: Url,
        token: String,
    ) -> Rc<Self> {
        let mut policy = Policy::new();
        if store.setting("https_only").as_deref() == Some("0") {
            policy.https_only = false;
        }
        if let Some(list) = store.setting("http_exceptions") {
            policy.http_exceptions = serde_json::from_str(&list).unwrap_or_default();
        }
        Rc::new(Self {
            servo,
            window,
            ui_ctx,
            content_ctx,
            ui: RefCell::new(None),
            tabs: RefCell::new(Vec::new()),
            active: Cell::new(0),
            next_id: Cell::new(1),
            policy: RefCell::new(policy),
            store: RefCell::new(store),
            commands,
            typed: RefCell::new(None),
            pending_loads: RefCell::new(Vec::new()),
            overlay: Cell::new(false),
            focus: Cell::new(Focus::Content),
            notice: RefCell::new(None),
            ui_dirty: Cell::new(true),
            session_dirty: Cell::new(false),
            cv_origin,
            token,
        })
    }

    fn scale(&self) -> f32 {
        self.window.scale_factor() as f32
    }

    /// Build the UI webview and restore the saved session (or open a new tab).
    pub fn start(self: &Rc<Self>) {
        let ui_url = Url::parse("wwb://ui/").expect("static URL");
        let ui = WebViewBuilder::new(&self.servo, self.ui_ctx.clone() as Rc<dyn RenderingContext>)
            .url(ui_url)
            .hidpi_scale_factor(Scale::new(self.scale()))
            .delegate(self.clone())
            .build();
        *self.ui.borrow_mut() = Some(ui);

        let (saved, active) = self.store.borrow().load_session().unwrap_or_default();
        let restorable: Vec<Url> = saved.iter().filter_map(|t| Url::parse(&t.url).ok()).collect();
        if restorable.is_empty() {
            self.open_tab(newtab_url(), true);
        } else {
            for url in restorable {
                self.open_tab(url, false);
            }
            self.activate(active.min(self.tabs.borrow().len() - 1));
        }
    }

    pub fn ui_webview(&self) -> Option<WebView> {
        self.ui.borrow().clone()
    }

    pub fn active_webview(&self) -> Option<WebView> {
        self.tabs.borrow().get(self.active.get()).map(|t| t.webview.clone())
    }

    pub fn focus(&self) -> Focus {
        self.focus.get()
    }

    pub fn set_focus(&self, focus: Focus) {
        self.focus.set(focus);
        if let Some(ui) = self.ui_webview() {
            ui.set_focused(focus == Focus::Ui);
        }
        if let Some(page) = self.active_webview() {
            page.set_focused(focus == Focus::Content);
        }
    }

    /// While an overlay is open the UI webview gets the whole window.
    pub fn overlay(&self) -> bool {
        self.overlay.get()
    }

    /// The UI strip's height in device pixels.
    pub fn ui_strip_px(&self) -> u32 {
        (UI_STRIP_CSS_PX * self.window.scale_factor()).round() as u32
    }

    /* ---------------------------------------------------------- tabs */

    fn open_tab(self: &Rc<Self>, url: Url, activate: bool) -> u64 {
        let webview = WebViewBuilder::new(&self.servo, self.content_ctx.clone() as Rc<dyn RenderingContext>)
            .url(url.clone())
            .hidpi_scale_factor(Scale::new(self.scale()))
            .delegate(self.clone())
            .build();
        self.adopt_webview(webview, url, activate)
    }

    fn adopt_webview(&self, webview: WebView, url: Url, activate: bool) -> u64 {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        webview.hide();
        self.tabs.borrow_mut().push(Tab {
            id,
            webview,
            url,
            title: String::new(),
            loading: true,
            can_back: false,
            can_forward: false,
            crashed: false,
        });
        if activate {
            self.activate(self.tabs.borrow().len() - 1);
        }
        self.session_dirty.set(true);
        self.ui_dirty.set(true);
        id
    }

    fn activate(&self, index: usize) {
        let tabs = self.tabs.borrow();
        if index >= tabs.len() {
            return;
        }
        if let Some(old) = tabs.get(self.active.get()) {
            old.webview.hide();
            old.webview.set_focused(false);
        }
        self.active.set(index);
        let tab = &tabs[index];
        tab.webview.show();
        tab.webview.set_focused(self.focus.get() == Focus::Content);
        drop(tabs);
        self.session_dirty.set(true);
        self.ui_dirty.set(true);
        self.window.request_redraw();
    }

    fn index_of(&self, id: u64) -> Option<usize> {
        self.tabs.borrow().iter().position(|t| t.id == id)
    }

    fn index_of_webview(&self, webview: &WebView) -> Option<usize> {
        self.tabs.borrow().iter().position(|t| t.webview.id() == webview.id())
    }

    fn close_tab(self: &Rc<Self>, id: u64) {
        let Some(index) = self.index_of(id) else { return };
        let removed = self.tabs.borrow_mut().remove(index);
        removed.webview.hide();
        drop(removed); // dropping the last handle destroys the webview
        if self.tabs.borrow().is_empty() {
            // A browser always has a tab; closing the last opens CharacterVerse Search.
            self.open_tab(newtab_url(), true);
            return;
        }
        let active = self.active.get();
        let next = if index < active || active >= self.tabs.borrow().len() { active.saturating_sub(1) } else { active };
        self.active.set(usize::MAX);
        self.activate(next.min(self.tabs.borrow().len() - 1));
    }

    /// Resize every content webview to the content area, and the UI to its own.
    pub fn resize(&self, ui_size: winit::dpi::PhysicalSize<u32>, content_size: winit::dpi::PhysicalSize<u32>) {
        self.ui_ctx.resize(ui_size);
        if let Some(ui) = self.ui_webview() {
            ui.resize(ui_size);
        }
        self.content_ctx.resize(content_size);
        for tab in self.tabs.borrow().iter() {
            tab.webview.resize(content_size);
        }
    }

    pub fn set_scale(&self, scale: f32) {
        if let Some(ui) = self.ui_webview() {
            ui.set_hidpi_scale_factor(Scale::new(scale));
        }
        for tab in self.tabs.borrow().iter() {
            tab.webview.set_hidpi_scale_factor(Scale::new(scale));
        }
    }

    /* ------------------------------------------------------ commands */

    /// Run everything that queued up while Servo was spinning: UI commands,
    /// deferred loads, the UI refresh and the session write.
    pub fn after_spin(self: &Rc<Self>) {
        while let Ok(cmd) = self.commands.try_recv() {
            self.handle(cmd);
        }
        let loads: Vec<_> = self.pending_loads.borrow_mut().drain(..).collect();
        for (id, url) in loads {
            if let Some(i) = self.index_of(id) {
                self.tabs.borrow()[i].webview.load(url);
            }
        }
        if self.session_dirty.replace(false) {
            self.save_session();
        }
        if self.ui_dirty.replace(false) {
            self.push_ui_state();
        }
    }

    fn handle(self: &Rc<Self>, cmd: UiCommand) {
        match cmd {
            UiCommand::Ready => self.ui_dirty.set(true),
            UiCommand::Navigate { tab, input } => {
                let url = self.resolve_input(&input);
                let index = tab.and_then(|id| self.index_of(id)).unwrap_or(self.active.get());
                if let Some(t) = self.tabs.borrow().get(index) {
                    t.webview.load(url);
                }
                self.set_focus(Focus::Content);
            },
            UiCommand::NewTab { input } => {
                let url = input.map(|i| self.resolve_input(&i)).unwrap_or_else(newtab_url);
                self.open_tab(url, true);
            },
            UiCommand::CloseTab { tab } => self.close_tab(tab),
            UiCommand::FocusTab { tab } => {
                if let Some(i) = self.index_of(tab) {
                    self.activate(i);
                }
            },
            UiCommand::MoveTab { tab, to } => {
                if let Some(from) = self.index_of(tab) {
                    let active_id = self.tabs.borrow()[self.active.get()].id;
                    let mut tabs = self.tabs.borrow_mut();
                    let t = tabs.remove(from);
                    let to = to.min(tabs.len());
                    tabs.insert(to, t);
                    let new_active = tabs.iter().position(|t| t.id == active_id).unwrap_or(0);
                    drop(tabs);
                    self.active.set(new_active);
                    self.session_dirty.set(true);
                    self.ui_dirty.set(true);
                }
            },
            UiCommand::Back => {
                if let Some(w) = self.active_webview() {
                    w.go_back(1);
                }
            },
            UiCommand::Forward => {
                if let Some(w) = self.active_webview() {
                    w.go_forward(1);
                }
            },
            UiCommand::Reload => {
                if let Some(w) = self.active_webview() {
                    w.reload();
                }
            },
            UiCommand::ToggleBookmark => {
                let tabs = self.tabs.borrow();
                if let Some(t) = tabs.get(self.active.get()) {
                    let now = self.store.borrow().toggle_bookmark(t.url.as_str(), &t.title).unwrap_or(false);
                    drop(tabs);
                    self.say(if now { "Bookmarked." } else { "Bookmark removed." });
                }
            },
            UiCommand::SetHttpsOnly { on } => {
                self.policy.borrow_mut().https_only = on;
                let _ = self.store.borrow().set_setting("https_only", if on { "1" } else { "0" });
                self.say(if on { "HTTPS-only is on." } else { "HTTPS-only is off — plain http pages will load." });
            },
            UiCommand::AllowHttpFor { host } => {
                let list = {
                    let mut policy = self.policy.borrow_mut();
                    policy.http_exceptions.insert(host.clone());
                    serde_json::to_string(&policy.http_exceptions).unwrap_or_default()
                };
                let _ = self.store.borrow().set_setting("http_exceptions", &list);
                self.say(&format!("{host} may load over plain http. It is not encrypted."));
                if let Some(w) = self.active_webview() {
                    if let Ok(url) = Url::parse(&format!("http://{host}/")) {
                        w.load(url);
                    }
                }
            },
            UiCommand::ClearBrowsingData => {
                let _ = self.store.borrow().clear_browsing_data();
                let sdm = self.servo.site_data_manager();
                let names: Vec<String> = sdm.site_data(StorageType::all()).iter().map(|s| s.name()).collect();
                let refs: Vec<&str> = names.iter().map(String::as_str).collect();
                sdm.clear_site_data(&refs, StorageType::all());
                sdm.clear_cookies(None);
                self.session_dirty.set(true);
                self.say("History, cookies and site storage cleared. Bookmarks kept.");
            },
            UiCommand::SetOverlay { open } => {
                self.overlay.set(open);
                self.ui_dirty.set(true);
                self.window.request_redraw();
            },
            UiCommand::FocusContent => self.set_focus(Focus::Content),
            UiCommand::Suggest { input } => {
                let matches = self.store.borrow().history_matches(input.trim(), 5).unwrap_or_default();
                let rows: Vec<_> = matches.iter().map(|t| serde_json::json!({ "url": t.url, "title": t.title })).collect();
                if let (Some(ui), Ok(json)) = (self.ui_webview(), serde_json::to_string(&rows)) {
                    ui.evaluate_javascript(
                        format!("window.wwb && window.wwb.historySuggestions({json}, {:?}, {:?})", input, self.token),
                        |_| {},
                    );
                }
            },
        }
    }

    /// Keyboard shortcuts that are engine commands (see input.rs).
    pub fn shortcut_command(self: &Rc<Self>, sc: crate::input::Shortcut) {
        use crate::input::Shortcut;
        match sc {
            Shortcut::NewTab => {
                self.handle(UiCommand::NewTab { input: None });
                self.set_focus(Focus::Ui);
                if let Some(ui) = self.ui_webview() {
                    ui.evaluate_javascript("window.wwb && window.wwb.focusAddress()", |_| {});
                }
            },
            Shortcut::CloseTab => {
                let id = self.tabs.borrow().get(self.active.get()).map(|t| t.id);
                if let Some(id) = id {
                    self.close_tab(id);
                }
            },
            Shortcut::Reload => self.handle(UiCommand::Reload),
            Shortcut::Back => self.handle(UiCommand::Back),
            Shortcut::Forward => self.handle(UiCommand::Forward),
            Shortcut::NextTab | Shortcut::PreviousTab => {
                let n = self.tabs.borrow().len();
                if n > 1 {
                    let a = self.active.get();
                    let next = if sc == Shortcut::NextTab { (a + 1) % n } else { (a + n - 1) % n };
                    self.activate(next);
                }
            },
            Shortcut::FocusAddressBar => {},
        }
        self.after_spin();
    }

    /// Address-bar input → a URL. Anything that is not a URL is a
    /// CharacterVerse Search: the address bar is the search box.
    fn resolve_input(&self, input: &str) -> Url {
        match security::classify_input(input) {
            Some(url) => {
                *self.typed.borrow_mut() = Some(url.clone());
                url
            },
            None => security::search_url(input),
        }
    }

    fn say(&self, text: &str) {
        *self.notice.borrow_mut() = Some(text.to_owned());
        self.ui_dirty.set(true);
    }

    /* ----------------------------------------------------- UI + disk */

    fn kind_of(&self, url: &Url) -> &'static str {
        if url.scheme() == "wwb" {
            return "newtab";
        }
        if url.origin() == self.cv_origin.origin() {
            if url.path().starts_with("/chat/") {
                return "character";
            }
            if url.path().starts_with("/search") {
                return "search";
            }
            return "characterverse";
        }
        "web"
    }

    fn push_ui_state(&self) {
        let Some(ui) = self.ui_webview() else { return };
        let tabs = self.tabs.borrow();
        let active = tabs.get(self.active.get());
        let bookmarked = active.map(|t| self.store.borrow().is_bookmarked(t.url.as_str()).unwrap_or(false)).unwrap_or(false);
        let notice = self.notice.borrow_mut().take();
        let state = UiState {
            tabs: tabs
                .iter()
                .map(|t| UiTab {
                    id: t.id,
                    title: if t.title.is_empty() { t.url.as_str().to_owned() } else { t.title.clone() },
                    url: if t.url.scheme() == "wwb" { String::new() } else { t.url.as_str().to_owned() },
                    host: t.url.host_str().unwrap_or_default().to_owned(),
                    kind: self.kind_of(&t.url),
                    loading: t.loading,
                    can_back: t.can_back,
                    can_forward: t.can_forward,
                    crashed: t.crashed,
                })
                .collect(),
            active: active.map(|t| t.id).unwrap_or(0),
            https_only: self.policy.borrow().https_only,
            bookmarked,
            secure: active.is_some_and(|t| matches!(t.url.scheme(), "https" | "wwb")),
            notice: notice.as_deref(),
            overlay: self.overlay.get(),
            cv: self.cv_origin.as_str(),
            bookmarks: self.store.borrow().bookmarks().unwrap_or_default(),
        };
        let Ok(json) = serde_json::to_string(&state) else { return };
        // The token proves to the UI that this call came from the engine; the
        // UI ignores renders without it.
        ui.evaluate_javascript(format!("window.wwb && window.wwb.render({json}, {:?})", self.token), |_| {});
    }

    fn save_session(&self) {
        let tabs: Vec<SavedTab> = self
            .tabs
            .borrow()
            .iter()
            .map(|t| SavedTab { url: t.url.as_str().to_owned(), title: t.title.clone() })
            .collect();
        let _ = self.store.borrow_mut().save_session(&tabs, self.active.get());
    }

    fn update_tab(&self, webview: &WebView, f: impl FnOnce(&mut Tab)) {
        if let Some(i) = self.index_of_webview(webview) {
            f(&mut self.tabs.borrow_mut()[i]);
            self.ui_dirty.set(true);
        }
    }

    fn is_ui(&self, webview: &WebView) -> bool {
        self.ui.borrow().as_ref().is_some_and(|ui| ui.id() == webview.id())
    }
}

pub fn newtab_url() -> Url {
    Url::parse("wwb://newtab/").expect("static URL")
}

impl WebViewDelegate for Engine {
    fn notify_new_frame_ready(&self, _webview: WebView) {
        self.window.request_redraw();
    }

    fn notify_url_changed(&self, webview: WebView, url: Url) {
        if self.is_ui(&webview) {
            return;
        }
        let _ = self.store.borrow().record_visit(url.as_str(), "");
        self.update_tab(&webview, |t| t.url = url);
        self.session_dirty.set(true);
    }

    fn notify_page_title_changed(&self, webview: WebView, title: Option<String>) {
        if self.is_ui(&webview) {
            return;
        }
        let title = title.unwrap_or_default();
        if let Some(i) = self.index_of_webview(&webview) {
            let url = self.tabs.borrow()[i].url.clone();
            let _ = self.store.borrow().retitle(url.as_str(), &title);
        }
        self.update_tab(&webview, |t| t.title = title);
        self.session_dirty.set(true);
    }

    fn notify_load_status_changed(&self, webview: WebView, status: LoadStatus) {
        self.update_tab(&webview, |t| t.loading = !matches!(status, LoadStatus::Complete));
    }

    fn notify_history_changed(&self, webview: WebView, entries: Vec<Url>, current: usize) {
        self.update_tab(&webview, |t| {
            t.can_back = current > 0;
            t.can_forward = current + 1 < entries.len();
        });
    }

    fn notify_crashed(&self, webview: WebView, _reason: String, _backtrace: Option<String>) {
        // The crash stayed in its content process; the browser is fine. Say so.
        self.update_tab(&webview, |t| {
            t.crashed = true;
            t.loading = false;
        });
        self.say("A page crashed. Its process was isolated — reload the tab to try again.");
    }

    fn notify_closed(&self, webview: WebView) {
        // window.close() from page content: close the tab, after the callback.
        if let Some(i) = self.index_of_webview(&webview) {
            let mut tabs = self.tabs.borrow_mut();
            // A page cannot close the browser's last tab; it can only close itself.
            if tabs.len() > 1 {
                tabs.remove(i);
                drop(tabs);
                let active = self.active.get().min(self.tabs.borrow().len() - 1);
                self.active.set(usize::MAX);
                self.activate(active);
            }
        }
    }

    fn request_navigation(&self, webview: WebView, request: NavigationRequest) {
        if self.is_ui(&webview) {
            match security::Policy::ui_navigation(&request.url) {
                Decision::Allow => request.allow(),
                _ => request.deny(),
            }
            return;
        }
        let typed = self.typed.borrow().clone();
        let decision = self.policy.borrow().content_navigation(&request.url, typed.as_ref());
        match decision {
            Decision::Allow => request.allow(),
            Decision::Upgrade(https) => {
                request.deny();
                if let Some(i) = self.index_of_webview(&webview) {
                    let id = self.tabs.borrow()[i].id;
                    self.pending_loads.borrow_mut().push((id, https));
                }
                self.say("Upgraded to HTTPS. To allow plain http for this site, use the lock menu.");
            },
            Decision::Deny(why) => {
                request.deny();
                self.say(why);
            },
        }
    }

    fn request_create_new(&self, parent: WebView, request: CreateNewWebViewRequest) {
        // window.open and target=_blank become a tab next to their opener. The
        // UI webview opens nothing.
        if self.is_ui(&parent) {
            return;
        }
        let webview = request.builder(self.content_ctx.clone() as Rc<dyn RenderingContext>).delegate(parent.delegate()).build();
        let url = webview.url().unwrap_or_else(newtab_url);
        self.adopt_webview(webview, url, true);
    }

    fn request_permission(&self, webview: WebView, request: PermissionRequest) {
        // Default-deny, and say so (rule 4 in security.rs).
        let feature = format!("{:?}", request.feature());
        request.deny();
        let host = webview.url().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_default();
        self.say(&format!("Blocked {host} from using {feature}."));
    }
}
