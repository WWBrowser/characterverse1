// Input — the OS's keyboard, mouse and wheel, translated into Servo's events
// and routed to whichever webview they belong to.
//
// Routing is geometry for the mouse (the UI strip is on top, the page below
// it) and focus for the keyboard. Nothing here interprets an event; it only
// translates and delivers it.

use std::str::FromStr;

use keyboard_types::{Code, Key, KeyState, Location, Modifiers, NamedKey};
use servo::{
    DevicePoint, InputEvent, KeyboardEvent, MouseButton, MouseButtonAction, MouseButtonEvent, MouseMoveEvent,
    WheelDelta, WheelEvent, WheelMode,
};
use winit::event::{ElementState, KeyEvent, MouseButton as WinitButton, MouseScrollDelta};
use winit::keyboard::{Key as WinitKey, KeyLocation, ModifiersState, NamedKey as WinitNamed, PhysicalKey};

/// Pixels per wheel "line", matching Servo's own example.
const LINE_PX: f64 = 76.0;

pub fn mouse_move(x: f32, y: f32) -> InputEvent {
    InputEvent::MouseMove(MouseMoveEvent::new(DevicePoint::new(x, y).into()))
}

pub fn mouse_button(state: ElementState, button: WinitButton, x: f32, y: f32) -> InputEvent {
    let action = match state {
        ElementState::Pressed => MouseButtonAction::Down,
        ElementState::Released => MouseButtonAction::Up,
    };
    let button = match button {
        WinitButton::Left => MouseButton::Primary,
        WinitButton::Middle => MouseButton::Auxiliary,
        WinitButton::Right => MouseButton::Secondary,
        WinitButton::Back => MouseButton::Back,
        WinitButton::Forward => MouseButton::Forward,
        WinitButton::Other(n) => MouseButton::Other(n),
    };
    InputEvent::MouseButton(MouseButtonEvent::new(action, button, DevicePoint::new(x, y).into()))
}

pub fn wheel(delta: MouseScrollDelta, x: f32, y: f32) -> InputEvent {
    let (dx, dy, mode) = match delta {
        MouseScrollDelta::LineDelta(dx, dy) => (dx as f64 * LINE_PX, dy as f64 * LINE_PX, WheelMode::DeltaLine),
        MouseScrollDelta::PixelDelta(d) => (d.x, d.y, WheelMode::DeltaPixel),
    };
    InputEvent::Wheel(WheelEvent::new(WheelDelta { x: dx, y: dy, z: 0.0, mode }, DevicePoint::new(x, y).into()))
}

pub fn modifiers(state: ModifiersState) -> Modifiers {
    let mut m = Modifiers::empty();
    m.set(Modifiers::SHIFT, state.shift_key());
    m.set(Modifiers::CONTROL, state.control_key());
    m.set(Modifiers::ALT, state.alt_key());
    m.set(Modifiers::META, state.super_key());
    m
}

/// A winit key event as a DOM keyboard event.
pub fn keyboard(event: &KeyEvent, mods: Modifiers) -> InputEvent {
    let key = match &event.logical_key {
        WinitKey::Character(s) => Key::Character(s.to_string()),
        WinitKey::Named(WinitNamed::Space) => Key::Character(" ".into()),
        WinitKey::Named(named) => named_key(*named),
        _ => Key::Named(NamedKey::Unidentified),
    };
    // winit's KeyCode names are the DOM `code` names ("KeyA", "ArrowLeft",
    // "Digit1"), so the Debug name parses straight into keyboard-types.
    let code = match event.physical_key {
        PhysicalKey::Code(c) => Code::from_str(&format!("{c:?}")).unwrap_or(Code::Unidentified),
        PhysicalKey::Unidentified(_) => Code::Unidentified,
    };
    let location = match event.location {
        KeyLocation::Standard => Location::Standard,
        KeyLocation::Left => Location::Left,
        KeyLocation::Right => Location::Right,
        KeyLocation::Numpad => Location::Numpad,
    };
    let state = match event.state {
        ElementState::Pressed => KeyState::Down,
        ElementState::Released => KeyState::Up,
    };
    InputEvent::Keyboard(KeyboardEvent::new(keyboard_types::KeyboardEvent {
        state,
        key,
        code,
        location,
        modifiers: mods,
        repeat: event.repeat,
        is_composing: false,
    }))
}

fn named_key(named: WinitNamed) -> Key {
    let name = match named {
        // The two places winit and the DOM disagree on a name.
        WinitNamed::Super => "Meta".to_owned(),
        other => format!("{other:?}"),
    };
    Key::Named(NamedKey::from_str(&name).unwrap_or(NamedKey::Unidentified))
}

/// Browser shortcuts the engine handles before the page sees the key.
#[derive(Debug, PartialEq, Eq)]
pub enum Shortcut {
    NewTab,
    CloseTab,
    FocusAddressBar,
    Reload,
    Back,
    Forward,
    NextTab,
    PreviousTab,
}

pub fn shortcut(event: &KeyEvent, state: ModifiersState) -> Option<Shortcut> {
    if event.state != ElementState::Pressed {
        return None;
    }
    // ⌘ on macOS, Ctrl elsewhere.
    let primary = if cfg!(target_os = "macos") { state.super_key() } else { state.control_key() };
    match &event.logical_key {
        WinitKey::Character(c) if primary => match c.to_lowercase().as_str() {
            "t" => Some(Shortcut::NewTab),
            "w" => Some(Shortcut::CloseTab),
            "l" => Some(Shortcut::FocusAddressBar),
            "r" => Some(Shortcut::Reload),
            "[" => Some(Shortcut::Back),
            "]" => Some(Shortcut::Forward),
            _ => None,
        },
        WinitKey::Named(WinitNamed::Tab) if state.control_key() => {
            Some(if state.shift_key() { Shortcut::PreviousTab } else { Shortcut::NextTab })
        },
        WinitKey::Named(WinitNamed::F5) => Some(Shortcut::Reload),
        WinitKey::Named(WinitNamed::ArrowLeft) if state.alt_key() => Some(Shortcut::Back),
        WinitKey::Named(WinitNamed::ArrowRight) if state.alt_key() => Some(Shortcut::Forward),
        _ => None,
    }
}
