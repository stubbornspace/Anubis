// Tauri's simulator discovery can reject an installed SDK when no matching
// runtime exists. Keep its build helper alive and let Xcode build generically.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env };
if (
  !env.DEVELOPER_DIR &&
  existsSync("/Applications/Xcode.app/Contents/Developer")
) {
  env.DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";
}
const children = new Set();
function launch(command, args, stdio = "inherit") {
  const child = spawn(command, args, { cwd: root, env, stdio, detached: true });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function stop() {
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (e) {
        if (e.code !== "ESRCH") console.error(e.message);
      }
    }
  }
}
function run(command, args) {
  return new Promise((yes, no) => {
    const child = launch(command, args);
    child.once("error", no);
    child.once("exit", (code, signal) =>
      code === 0
        ? yes()
        : no(new Error(`${command} failed (${signal || code})`)),
    );
  });
}
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, () => {
    stop();
    process.exit(code);
  });
}
let helper;
try {
  if (process.platform !== "darwin")
    throw new Error("iOS builds require macOS and full Xcode.");
  if (process.argv.length > 2)
    throw new Error(
      "ios:simulator takes no arguments; use ios:build for custom device/signing options.",
    );
  await run("xcodebuild", ["-version"]);
  await run("xcodegen", ["--version"]);
  await new Promise((yes, no) => {
    helper = launch(
      process.execPath,
      [
        resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
        "ios",
        "build",
        "--debug",
        "--open",
      ],
      ["ignore", "pipe", "pipe"],
    );
    let tail = "";
    const timeout = setTimeout(
      () => no(new Error("Timed out waiting for the Tauri Xcode helper.")),
      180_000,
    );
    const fail = (code, signal) => {
      clearTimeout(timeout);
      no(
        new Error(
          `Tauri helper exited before opening Xcode (${signal || code})`,
        ),
      );
    };
    helper.once("error", (error) => {
      clearTimeout(timeout);
      no(error);
    });
    helper.once("exit", fail);
    const output = (stream) => (chunk) => {
      stream.write(chunk);
      tail = (tail + chunk.toString()).slice(-4096);
      if (tail.includes("Opening Xcode")) {
        clearTimeout(timeout);
        helper.removeListener("exit", fail);
        yes();
      }
    };
    helper.stdout.on("data", output(process.stdout));
    helper.stderr.on("data", output(process.stderr));
  });
  // The CLI rewrites every target's bundle identifier/product name. Regenerate
  // after it has prepared the project, restoring the distinct UI-test target.
  helper.once("exit", (code) => {
    console.error(`Tauri helper exited during the Xcode build (${code}).`);
    stop();
    process.exitCode = 1;
  });
  await run("xcodegen", [
    "generate",
    "--spec",
    "src-tauri/gen/apple/project.yml",
  ]);
  await run("xcodebuild", [
    "-project",
    "src-tauri/gen/apple/anubis.xcodeproj",
    "-scheme",
    "anubis_iOS",
    "-configuration",
    "debug",
    "-sdk",
    "iphonesimulator",
    "-destination",
    "generic/platform=iOS Simulator",
    "-derivedDataPath",
    resolve(root, "src-tauri/target/ios-simulator"),
    "CODE_SIGNING_ALLOWED=NO",
    "build-for-testing",
  ]);
  console.log(
    "Simulator app and native UI-test target built in src-tauri/target/ios-simulator/Build/Products.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  helper?.removeAllListeners("exit");
  stop();
}
