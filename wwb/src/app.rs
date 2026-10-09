// The UI backend — the OS window, the GL contexts, compositing and input.
//
// One window, one `WindowRenderingContext`. Inside it, two off-screen contexts:
// one the UI webview paints into (the strip of tabs and toolbar), one the
// active page paints into. Every frame both are painted and blitted into the
// window — the UI along the top, the page below — then presented. While the UI
// has an overlay open (address-bar suggestions, the tab index) it is given the
// whole window instead, and the page is not painted under it.
//
// Input is routed by geometry: a pointer over the strip goes to the UI webview
// with its own coordinates; a pointer below it goes to the active page with
// coordinates shifted up by the strip's height.

use std::error::Error;
use std::rc::Rc;
use std::sync::mpsc;

use euclid::default::{Point2D, Rect, Size2D};
use servo::{
    EventLoopWaker, OffscreenRenderingContext, RenderingContext, ServoBuilder, WebView, WindowRenderingContext,
    protocol_handler::ProtocolRegistry,
};
use winit::application::ApplicationHandler;
use winit::dpi::{LogicalSize, PhysicalPosition, PhysicalSize};
use winit::event::{ElementState, WindowEvent};
use winit::event_loop::{ActiveEventLoop, EventLoop, EventLoopProxy};
use winit::keyboard::ModifiersState;
use winit::raw_window_handle::{HasDisplayHandle, HasWindowHandle};
use winit::window::{Window, WindowId};

use crate::engine::{Engine, Focus};
use crate::input::{self, Shortcut};
use crate::protocol::{self, UiCommand, WwbProtocol};
use crate::security;
use crate::store::{self, Store};

#[derive(Debug)]
pub struct WakerEvent;

#[derive(Clone)]
pub(crate) struct Waker(EventLoopProxy<WakerEvent>);

impl EventLoopWaker for Waker {
    fn clone_box(&self) -> Box<dyn EventLoopWaker> {
        Box::new(self.clone())
    }
    fn wake(&self) {
        let _ = self.0.send_event(WakerEvent);
    }
}

pub(crate) struct Running {
    window: Rc<Window>,
    window_ctx: Rc<WindowRenderingContext>,
    ui_ctx: Rc<OffscreenRenderingContext>,
    content_ctx: Rc<OffscreenRenderingContext>,
    engine: Rc<Engine>,
    cursor: PhysicalPosition<f64>,
    modifiers: ModifiersState,
}

pub(crate) enum App {
    Starting(Waker),
    Running(Box<Running>),
    Failed,
}

impl App {
    pub fn new(event_loop: &EventLoop<WakerEvent>) -> Result<Self, Box<dyn Error>> {
        Ok(Self::Starting(Waker(event_loop.create_proxy())))
    }
}

/// Where the UI and the page sit in the window, in device pixels, top-left origin.
struct Layout {
    ui: (u32, u32),      // width, height
    content: (u32, u32), // width, height — below the UI strip
    strip: u32,
}

fn layout(size: PhysicalSize<u32>, strip: u32, overlay: bool) -> Layout {
    let strip = strip.min(size.height);
    let ui_h = if overlay { size.height } else { strip };
    Layout {
        ui: (size.width.max(1), ui_h.max(1)),
        content: (size.width.max(1), size.height.saturating_sub(strip).max(1)),
        strip,
    }
}

impl Running {
    fn start(event_loop: &ActiveEventLoop, waker: Waker) -> Result<Self, Box<dyn Error>> {
        let attrs = Window::default_attributes()
            .with_title("WWB — Web World Browser")
            .with_inner_size(LogicalSize::new(1280.0, 820.0))
            .with_min_inner_size(LogicalSize::new(480.0, 320.0));
        let window = Rc::new(event_loop.create_window(attrs)?);
        let window_ctx = Rc::new(
            WindowRenderingContext::new(event_loop.display_handle()?, window.window_handle()?, window.inner_size())
                .map_err(|e| format!("could not create a GL context for the window: {e:?}"))?,
        );
        window_ctx.make_current().map_err(|e| format!("could not make the GL context current: {e:?}"))?;

        let size = window.inner_size();
        let strip = (crate::engine::UI_STRIP_CSS_PX * window.scale_factor()).round() as u32;
        let l = layout(size, strip, false);
        let ui_ctx = Rc::new(window_ctx.offscreen_context(PhysicalSize::new(l.ui.0, l.ui.1)));
        let content_ctx = Rc::new(window_ctx.offscreen_context(PhysicalSize::new(l.content.0, l.content.1)));

        // The profile: WWB's SQLite file, and Servo's site data beside it.
        let profile = store::profile_dir();
        let store = Store::open(&profile.join("wwb.sqlite"))?;

        // The `wwb://` scheme and the UI → engine command channel.
        let token = protocol::mint_token();
        let cv_origin = security::characterverse_origin();
        let (tx, rx) = mpsc::channel::<UiCommand>();
        let mut registry = ProtocolRegistry::with_internal_protocols();
        registry
            .register(
                "wwb",
                WwbProtocol::new(token.clone(), cv_origin.as_str().trim_end_matches('/').to_owned(), tx, waker.clone_box()),
            )
            .map_err(|e| format!("could not register the wwb:// scheme: {e:?}"))?;

        let servo = ServoBuilder::default()
            .opts(security::engine_opts(profile.join("engine")))
            .preferences(security::hardened_preferences())
            .protocol_registry(registry)
            .event_loop_waker(Box::new(waker))
            .build();
        servo.setup_logging();

        let engine = Engine::new(servo, window.clone(), ui_ctx.clone(), content_ctx.clone(), store, rx, cv_origin, token);
        engine.start();

        Ok(Self {
            window,
            window_ctx,
            ui_ctx,
            content_ctx,
            engine,
            cursor: PhysicalPosition::new(0.0, 0.0),
            modifiers: ModifiersState::empty(),
        })
    }

    fn current_layout(&self) -> Layout {
        layout(self.window.inner_size(), self.engine.ui_strip_px(), self.engine.overlay())
    }

    fn relayout(&self) {
        let l = self.current_layout();
        self.window_ctx.resize(self.window.inner_size());
        self.engine.resize(PhysicalSize::new(l.ui.0, l.ui.1), PhysicalSize::new(l.content.0, l.content.1));
        self.window.request_redraw();
    }

    fn paint(&self) {
        let l = self.current_layout();
        let height = self.window.inner_size().height as i32;
        let overlay = self.engine.overlay();

        if let Some(ui) = self.engine.ui_webview() {
            ui.paint();
        }
        if !overlay {
            if let Some(page) = self.engine.active_webview() {
                page.paint();
            }
        }

        // Blit into the window. GL's origin is bottom-left, so a rectangle at
        // top-left `y` with height `h` starts at `height - y - h`.
        self.window_ctx.prepare_for_rendering();
        let gl = self.window_ctx.glow_gl_api();
        if !overlay {
            if let Some(blit) = self.content_ctx.render_to_parent_callback() {
                let (w, h) = (l.content.0 as i32, l.content.1 as i32);
                blit(&*gl, Rect::new(Point2D::new(0, height - l.strip as i32 - h), Size2D::new(w, h)));
            }
        }
        if let Some(blit) = self.ui_ctx.render_to_parent_callback() {
            let (w, h) = (l.ui.0 as i32, l.ui.1 as i32);
            blit(&*gl, Rect::new(Point2D::new(0, height - h), Size2D::new(w, h)));
        }
        self.window_ctx.present();
    }

    /// Which webview the pointer is over, and the point in its own coordinates.
    fn hit(&self) -> Option<(WebView, f32, f32, Focus)> {
        let (x, y) = (self.cursor.x as f32, self.cursor.y as f32);
        let strip = self.engine.ui_strip_px() as f32;
        if self.engine.overlay() || y < strip {
            self.engine.ui_webview().map(|w| (w, x, y, Focus::Ui))
        } else {
            self.engine.active_webview().map(|w| (w, x, y - strip, Focus::Content))
        }
    }

    fn keyboard_target(&self) -> Option<WebView> {
        match self.engine.focus() {
            Focus::Ui => self.engine.ui_webview(),
            Focus::Content => self.engine.active_webview(),
        }
    }

    fn spin(&self) {
        let overlay_before = self.engine.overlay();
        self.engine.servo.spin_event_loop();
        self.engine.after_spin();
        if self.engine.overlay() != overlay_before {
            self.relayout();
        }
    }
}

impl ApplicationHandler<WakerEvent> for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if let Self::Starting(waker) = self {
            match Running::start(event_loop, waker.clone()) {
                Ok(running) => *self = Self::Running(Box::new(running)),
                Err(e) => {
                    eprintln!("WWB could not start: {e}");
                    *self = Self::Failed;
                    event_loop.exit();
                },
            }
        }
    }

    fn user_event(&mut self, _event_loop: &ActiveEventLoop, _event: WakerEvent) {
        if let Self::Running(r) = self {
            r.spin();
        }
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        let Self::Running(r) = self else { return };
        r.spin();

        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::RedrawRequested => r.paint(),
            WindowEvent::Resized(_) => r.relayout(),
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                r.engine.set_scale(scale_factor as f32);
                r.relayout();
            },
            WindowEvent::ModifiersChanged(m) => r.modifiers = m.state(),
            WindowEvent::CursorMoved { position, .. } => {
                r.cursor = position;
                if let Some((w, x, y, _)) = r.hit() {
                    w.notify_input_event(input::mouse_move(x, y));
                }
            },
            WindowEvent::MouseInput { state, button, .. } => {
                if let Some((w, x, y, region)) = r.hit() {
                    if state == ElementState::Pressed && r.engine.focus() != region {
                        r.engine.set_focus(region);
                    }
                    w.notify_input_event(input::mouse_button(state, button, x, y));
                }
            },
            WindowEvent::MouseWheel { delta, .. } => {
                if let Some((w, x, y, _)) = r.hit() {
                    w.notify_input_event(input::wheel(delta, x, y));
                }
            },
            WindowEvent::KeyboardInput { event, is_synthetic: false, .. } => {
                if let Some(sc) = input::shortcut(&event, r.modifiers) {
                    r.engine.shortcut(sc);
                    return;
                }
                if let Some(w) = r.keyboard_target() {
                    w.notify_input_event(input::keyboard(&event, input::modifiers(r.modifiers)));
                }
            },
            _ => {},
        }
    }
}

impl Engine {
    /// Browser shortcuts: handled here, never seen by the page.
    pub fn shortcut(self: &Rc<Self>, sc: Shortcut) {
        match sc {
            Shortcut::FocusAddressBar => {
                self.set_focus(Focus::Ui);
                if let Some(ui) = self.ui_webview() {
                    ui.evaluate_javascript("window.wwb && window.wwb.focusAddress()", |_| {});
                }
            },
            other => self.shortcut_command(other),
        }
    }
}
