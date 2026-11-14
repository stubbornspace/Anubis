use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Cloud {
    pub downloaded: bool,
    pub uploaded: bool,
    pub downloading: bool,
    pub conflicts: usize,
    pub error: String,
}

#[derive(Clone, Copy)]
pub enum Access {
    Metadata = 0,
    Read = 1,
    Replace = 2,
    Delete = 3,
    Move = 4,
    Create = 5,
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod native {
    use super::*;
    use std::{
        ffi::{CStr, CString, c_char, c_int, c_void},
        panic::{AssertUnwindSafe, catch_unwind, resume_unwind},
        path::PathBuf,
    };

    unsafe extern "C" {
        fn anubis_apple_coordinate(
            path: *const c_char,
            destination: *const c_char,
            mode: c_int,
            context: *mut c_void,
            access: extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int,
        ) -> *mut c_char;
        fn anubis_apple_free(value: *mut c_char);
        fn anubis_apple_cloud(path: *const c_char) -> *mut c_char;
        fn anubis_apple_placeholder(path: *const c_char) -> c_int;
        fn anubis_apple_trash(path: *const c_char) -> *mut c_char;
        fn anubis_apple_keep_versions(path: *const c_char) -> *mut c_char;
        fn anubis_apple_watch(
            path: *const c_char,
            context: *mut c_void,
            changed: extern "C" fn(*mut c_void),
        ) -> *mut c_void;
        fn anubis_apple_unwatch(handle: *mut c_void);
    }

    fn path(path: &Path) -> Result<CString, String> {
        use std::os::unix::ffi::OsStrExt;
        CString::new(path.as_os_str().as_bytes()).map_err(|e| e.to_string())
    }
    unsafe fn take(value: *mut c_char) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let text = unsafe { CStr::from_ptr(value) }
            .to_string_lossy()
            .into_owned();
        unsafe { anubis_apple_free(value) };
        Some(text)
    }
    struct Call<F, T> {
        action: Option<F>,
        source: PathBuf,
        destination: Option<PathBuf>,
        result: Option<std::thread::Result<Result<T, String>>>,
    }
    extern "C" fn access<F: FnOnce() -> Result<T, String>, T>(
        context: *mut c_void,
        source: *const c_char,
        destination: *const c_char,
    ) -> c_int {
        let call = unsafe { &mut *context.cast::<Call<F, T>>() };
        let source = unsafe { CStr::from_ptr(source) }.to_bytes();
        use std::os::unix::ffi::OsStrExt;
        let same_source = source == call.source.as_os_str().as_bytes();
        let same_destination = match &call.destination {
            Some(expected) if !destination.is_null() => {
                unsafe { CStr::from_ptr(destination) }.to_bytes() == expected.as_os_str().as_bytes()
            }
            None => destination.is_null(),
            _ => false,
        };
        let result = catch_unwind(AssertUnwindSafe(|| {
            if !same_source || !same_destination {
                return Err(
                    "The document moved during file access. Refresh the folder and try again."
                        .into(),
                );
            }
            call.action
                .take()
                .ok_or("File accessor was called twice.")?()
        }));
        let success = matches!(&result, Ok(Ok(_)));
        call.result = Some(result);
        i32::from(success)
    }
    pub fn coordinate<T, F: FnOnce() -> Result<T, String>>(
        source: &Path,
        destination: Option<&Path>,
        mode: Access,
        action: F,
    ) -> Result<T, String> {
        let from = path(source)?;
        let to = destination.map(path).transpose()?;
        let mut call = Call {
            action: Some(action),
            source: source.into(),
            destination: destination.map(Path::to_path_buf),
            result: None,
        };
        let error = unsafe {
            anubis_apple_coordinate(
                from.as_ptr(),
                to.as_ref().map_or(std::ptr::null(), |s| s.as_ptr()),
                mode as c_int,
                (&mut call as *mut Call<F, T>).cast(),
                access::<F, T>,
            )
        };
        let error = unsafe { take(error) };
        // A completed write must be reported even if coordination cleanup fails.
        match call.result {
            Some(Ok(result)) => result,
            Some(Err(panic)) => resume_unwind(panic),
            None => Err(error.unwrap_or_else(|| {
                "File access was cancelled. Download the file and try again.".into()
            })),
        }
    }
    pub fn cloud(source: &Path) -> Result<Option<Cloud>, String> {
        let value = unsafe { take(anubis_apple_cloud(path(source)?.as_ptr())) }
            .ok_or("Could not read iCloud file status.")?;
        serde_json::from_str(&value).map_err(|e| format!("Could not read iCloud file status: {e}"))
    }
    pub fn placeholder(source: &Path) -> bool {
        path(source).is_ok_and(|p| unsafe { anubis_apple_placeholder(p.as_ptr()) != 0 })
    }
    pub fn trash(source: &Path) -> Result<(), String> {
        match unsafe { take(anubis_apple_trash(path(source)?.as_ptr())) } {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
    pub fn keep_versions(source: &Path) -> Result<(), String> {
        match unsafe { take(anubis_apple_keep_versions(path(source)?.as_ptr())) } {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    pub struct Presenter {
        handle: *mut c_void,
        callback: Box<Box<dyn Fn() + Send + Sync>>,
    }
    // The native presenter owns a serial operation queue and is removed/drained
    // before its callback allocation is dropped. No Objective-C UI objects cross it.
    unsafe impl Send for Presenter {}
    extern "C" fn changed(context: *mut c_void) {
        let callback = unsafe { &*context.cast::<Box<dyn Fn() + Send + Sync>>() };
        let _ = catch_unwind(AssertUnwindSafe(callback));
    }
    impl Presenter {
        pub fn new(
            source: &Path,
            callback: impl Fn() + Send + Sync + 'static,
        ) -> Result<Self, String> {
            let mut callback: Box<Box<dyn Fn() + Send + Sync>> = Box::new(Box::new(callback));
            let handle = unsafe {
                anubis_apple_watch(
                    path(source)?.as_ptr(),
                    (&mut *callback as *mut Box<dyn Fn() + Send + Sync>).cast(),
                    changed,
                )
            };
            Ok(Self { handle, callback })
        }
    }
    impl Drop for Presenter {
        fn drop(&mut self) {
            unsafe { anubis_apple_unwatch(self.handle) };
            let _ = &self.callback; // allocation stays alive through native teardown
        }
    }
}
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub use native::*;

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
pub fn coordinate<T>(
    _: &Path,
    _: Option<&Path>,
    _: Access,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    action()
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
pub fn cloud(_: &Path) -> Result<Option<Cloud>, String> {
    Ok(None)
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
pub fn placeholder(_: &Path) -> bool {
    false
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
pub fn keep_versions(_: &Path) -> Result<(), String> {
    Ok(())
}
