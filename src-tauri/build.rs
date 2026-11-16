fn main() {
    let target = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    if target == "macos" {
        let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
        let output = root.join("target/app-icon");
        std::fs::create_dir_all(&output).expect("create app icon output directory");
        println!("cargo:rerun-if-changed=icons/Anubis.icon");
        println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
        let mut command = std::process::Command::new("xcrun");
        if std::env::var_os("DEVELOPER_DIR").is_none()
            && std::path::Path::new("/Applications/Xcode.app/Contents/Developer").exists()
        {
            command.env(
                "DEVELOPER_DIR",
                "/Applications/Xcode.app/Contents/Developer",
            );
        }
        let result = command
            .arg("actool")
            .arg(root.join("icons/Anubis.icon"))
            .arg("--compile")
            .arg(&output)
            .args([
                "--platform",
                "macosx",
                "--minimum-deployment-target",
                "14.0",
                "--app-icon",
                "Anubis",
            ])
            .arg("--output-partial-info-plist")
            .arg(output.join("Info.plist"))
            .output()
            .expect("run actool (full Xcode 26 or newer is required for the macOS icon)");
        assert!(
            result.status.success(),
            "Icon compilation failed: {}\n{}",
            String::from_utf8_lossy(&result.stdout),
            String::from_utf8_lossy(&result.stderr)
        );
    }
    if target == "macos" || target == "ios" {
        cc::Build::new()
            .file("apple/FileAccess.m")
            .file("apple/NoteSync.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .compile("anubis_file_access");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CloudKit");
        println!("cargo:rerun-if-changed=apple/NoteSync.m");
        println!("cargo:rerun-if-changed=apple/FileAccess.m");
    }
    tauri_build::build()
}
