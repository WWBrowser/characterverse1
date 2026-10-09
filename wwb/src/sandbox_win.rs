// Windows content-process hardening.
//
// Servo's OS sandbox (gaol) covers Linux and macOS; on Windows, Servo runs
// content processes isolated but unsandboxed. WWB does not pretend otherwise
// (SECURITY.md says so in as many words). What it does instead is apply the
// mitigations Windows lets a process apply to itself, first thing on start-up,
// before a single byte of web content is parsed:
//
//   - A job object that allows exactly one active process: a compromised
//     content process cannot start another program.
//   - Extension points disabled: no AppInit DLLs, no legacy hooks injected.
//   - Image loads restricted: no DLLs from remote shares, none with a low
//     mandatory label, System32 preferred over the search path.
//   - Strict handle checks: using a bad handle kills the process instead of
//     being something an exploit can probe.
//
// These are real, but they are not a sandbox: a compromised content process
// still runs with the user's rights. Each mitigation is best-effort — a
// failure is reported to stderr and the process continues, because a browser
// that refused to render on an older Windows build would just be uninstalled.
// What it deliberately does NOT enable: arbitrary-code-guard (SpiderMonkey's
// JIT writes executable code) and win32k lockdown (font and GL paths still
// need it). Turning those on is the next step, and needs the JIT off.

use core::ffi::c_void;
use core::mem::size_of;

use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_ACTIVE_PROCESS,
    JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION, JobObjectExtendedLimitInformation, SetInformationJobObject,
};
use windows_sys::Win32::System::SystemServices::{
    PROCESS_MITIGATION_EXTENSION_POINT_DISABLE_POLICY, PROCESS_MITIGATION_IMAGE_LOAD_POLICY,
    PROCESS_MITIGATION_STRICT_HANDLE_CHECK_POLICY,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, ProcessExtensionPointDisablePolicy, ProcessImageLoadPolicy, ProcessStrictHandleCheckPolicy,
    SetProcessMitigationPolicy,
};

pub fn lock_down_content_process() {
    // SAFETY: plain Win32 calls on this process with correctly sized,
    // zero-initialised structures; no pointers outlive the calls.
    unsafe {
        no_child_processes();

        let mut ext = PROCESS_MITIGATION_EXTENSION_POINT_DISABLE_POLICY::default();
        ext.Anonymous.Flags = 1; // DisableExtensionPoints
        apply("extension points", ProcessExtensionPointDisablePolicy, &ext);

        let mut img = PROCESS_MITIGATION_IMAGE_LOAD_POLICY::default();
        img.Anonymous.Flags = 0b111; // NoRemoteImages | NoLowMandatoryLabelImages | PreferSystem32Images
        apply("image loads", ProcessImageLoadPolicy, &img);

        let mut handles = PROCESS_MITIGATION_STRICT_HANDLE_CHECK_POLICY::default();
        handles.Anonymous.Flags = 0b11; // RaiseExceptionOnInvalidHandleReference | HandleExceptionsPermanentlyEnabled
        apply("strict handles", ProcessStrictHandleCheckPolicy, &handles);
    }
}

unsafe fn apply<T>(what: &str, policy: i32, value: &T) {
    let ok = unsafe { SetProcessMitigationPolicy(policy, value as *const T as *const c_void, size_of::<T>()) };
    if ok == 0 {
        eprintln!("WWB: could not apply the {what} mitigation to a content process");
    }
}

unsafe fn no_child_processes() {
    unsafe {
        let job: HANDLE = CreateJobObjectW(core::ptr::null(), core::ptr::null());
        if job.is_null() {
            eprintln!("WWB: could not create a job object for a content process");
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = core::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_ACTIVE_PROCESS | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
        info.BasicLimitInformation.ActiveProcessLimit = 1;
        let set = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const c_void,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        // The job handle is deliberately leaked: it must live as long as the process.
        if set == 0 || AssignProcessToJobObject(job, GetCurrentProcess()) == 0 {
            eprintln!("WWB: could not confine a content process to a job object");
        }
    }
}
