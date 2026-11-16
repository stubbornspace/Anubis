# Tauri build review — November 15, 2026

The macOS release app and unsigned iOS simulator app/native test target compile successfully on this Mac. This is a build/configuration and source review, not certification of every native runtime path or a public-release readiness sign-off.

## Scope

Used the local Tauri router, planning, build, config, mobile, IPC, and security skills. Reviewed frontend/build scripts, dependency versions, capabilities/CSP, desktop and iOS configuration, icon packaging, native commands, workspace persistence/lifecycle, Notes persistence and CloudKit integration. Preserved the existing uncommitted feature and artwork changes.

## Findings and changes

| Priority | Finding | Disposition |
| --- | --- | --- |
| P2 | Development CSP allowed HMR only on localhost; physical iOS uses `TAURI_DEV_HOST`. Vite's standalone default port also differed from Tauri's URL. | Fixed: default port 1420, explicit device HMR host/port 1421, WebSockets allowed only in development CSP. Release CSP unchanged. Physical-device HMR still needs a device check. |
| P2 | Generated Xcode project included a personal signing team and assigned the app's identifier/product name to the UI-test target. | Regenerated from `project.yml`, restoring `.uitests`, its test product and scheme, and removing the team. Tauri 2.12.4 rewrites these settings when opening Xcode; README now documents regeneration **after** opening the helper. Follow-up: `npm run ios:simulator` now automates this sequence; manual Xcode/device workflows still need the documented regeneration. |
| P2 | `ios:simulator` reports `iOS platform not installed` in this installed SDK/runtime environment, even with full Xcode selected. | Fixed at the project-command level: `ios:simulator` now uses the Xcode/helper path automatically and succeeds without a matching installed simulator runtime. The underlying direct Tauri CLI discovery limitation remains. |
| P2 | Notes sync runs on the same frontend serial queue as save/navigation and sets `busy`; editor editability follows that flag. CloudKit operations can wait up to 45 seconds per native wait. | Fixed in follow-up: network waits are outside the local queue; duplicate sync requests coalesce. Clean snapshots reconcile after both success and failure; dirty or concurrently edited snapshots stay intact. Added delayed-network/controller race tests and UI regression coverage. |
| P3 | TypeScript incremental build metadata was tracked despite its ignore rule. | Removed `tsconfig.tsbuildinfo` from the working tree; future builds regenerate an ignored copy. Include its deletion in the next commit. |
| P3 | README prerequisites implied Command Line Tools were enough, although the new icon compiler requires full Xcode. | Corrected prerequisites and documented `DEVELOPER_DIR`. |

## Validation

On Apple Silicon with Xcode 27.2, Node 26.13.1 and Rust 1.100:

- `npm test`: 7 passed.
- `npm run test:e2e`: 124 passed across Chromium, WebKit, iPhone and iPad projects.
- `npm run test:native`: 24 passed, 1 opt-in iCloud test ignored.
- `npm run desktop:check`: passed.
- `npm run desktop:build -- --bundles app`: passed, including TypeScript/Vite compilation and release Rust linking; produced `src-tauri/target/release/bundle/macos/Anubis.app`.
- Inspected the built macOS Info.plist and resources: bundle ID retained, minimum macOS 14, `CFBundleIconName`/`CFBundleIconFile` match `Anubis`, and `Assets.car` plus `Anubis.icns` are present. The default build remains local-only.
- `npm audit --omit=dev`: no reported production dependency vulnerabilities. This is not a Rust dependency audit.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, Prettier on changed Vite/Tauri config, and `git diff --check`: passed.
- Simulator `build-for-testing` passed after project regeneration, compiling both app and native UI-test target. Tests were compiled, not executed on a simulator during this review.

Simulator verification sequence (leave the first command running while using a second terminal):

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios:build -- --debug --open
```

```sh
xcodegen generate --spec src-tauri/gen/apple/project.yml
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project src-tauri/gen/apple/anubis.xcodeproj \
  -scheme anubis_iOS -configuration debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/anubis-review-ios \
  CODE_SIGNING_ALLOWED=NO build-for-testing
```

Build logs for this run are `/tmp/anubis-review-{unit,ui,native,check,desktop,ios,ios-cli}.log`; these are temporary local artifacts.

## Remaining release validation

CloudKit account access, cross-device/offline/conflicting transfers, and physical-device file-provider lifecycle require explicit native testing. The browser tests mock IPC and cannot establish these properties. No live user library or iCloud data was used in this review. The prior development-signed DMG in Downloads was preserved; this review's app build does not replace it or prove notarized distribution. No new installer was delivered.

Vite reports an approximately 865 KB minified JavaScript chunk (269 KB gzip), mostly the editor stack. It is a performance follow-up, not a build error. Public distribution still requires the appropriate signing/provisioning and notarization workflow. Windows/Linux were not validated, and Android is outside this project's requested targets.

The Vite changes follow the [official Tauri Vite integration](https://v2.tauri.app/start/frontend/vite/); CSP and bundle settings were checked against the [Tauri configuration reference](https://v2.tauri.app/reference/config/).

## Follow-up fixes

`npm run ios:simulator` now builds successfully without manually keeping a second terminal open or repairing the generated test target. Its process cleanup was checked: no Tauri helper or Xcode build remained after completion. The command builds native tests but does not run them.

Sync regression validation: 13 unit tests passed, including six new controller concurrency/recovery cases; all 38 Chromium/WebKit Notes UI tests passed, including eight sync cases. Native persistence tests remain 24 passed, one explicit iCloud opt-in test ignored. The macOS release app and automated simulator app/test builds both passed.

Device discovery could not enumerate devices because the tool host uses Command Line Tools and reports `xcrun: error: unable to find utility "simctl", not a developer tool or in PATH`. The build script's per-process Xcode selection does not change that tool host. Live cross-device CloudKit validation remains pending an available second signed-in Apple device and isolated test-zone setup; no production Notes zone was used.

## User-confirmed Mac sync

After installing `Anubis_0.1.0_CloudKit-5Macs_arm64_20261115-182752.dmg`, the user confirmed that both Macs launch successfully and sync works. This establishes a successful basic Mac-to-Mac manual test. It does not establish offline conflict handling, image transfers, account changes, or iPhone/iPad behavior. The refreshed profile includes all five registered Macs; only the two tested Macs have reported launch/sync confirmation.
