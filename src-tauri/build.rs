fn main() {
    let target = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    if target == "macos" || target == "ios" {
        cc::Build::new()
            .file("apple/FileAccess.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("anubis_file_access");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rerun-if-changed=apple/FileAccess.m");
    }
    tauri_build::build()
}
