import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, platform } from "node:os";

// Detect if running as a compiled binary (vs `bun tui.tsx` or `deno run`)
// Compiled binaries have execPath pointing to the binary itself
const execName = basename(process.execPath);
const isDeno = typeof (globalThis as any).Deno !== "undefined";
export const isCompiledBinary = execName === "erwindb" || (!execName.includes("bun") && !isDeno);

// Resolution order for finding ErwinDB data directory:
// 1. ERWINDB_HOME env var (explicit override)
// 2. XDG_DATA_HOME/erwindb (Linux standard)
// 3. Platform-specific defaults (where installers put files)
// 4. Current directory (development fallback)

function findDataDir(): string {
  // 1. Explicit env var override
  if (process.env.ERWINDB_HOME) {
    return process.env.ERWINDB_HOME;
  }

  // 2. XDG_DATA_HOME (Linux/macOS standard)
  const xdgData =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  const xdgPath = join(xdgData, "erwindb");
  if (existsSync(join(xdgPath, "data"))) {
    return xdgPath;
  }

  // 3. Platform-specific defaults
  const platformDefaults =
    platform() === "darwin"
      ? [
          "/opt/homebrew/share/erwindb", // Homebrew ARM
          "/usr/local/share/erwindb", // Homebrew Intel
        ]
      : [
          "/usr/share/erwindb", // System-wide Linux
          "/usr/local/share/erwindb", // Local Linux
        ];

  for (const path of platformDefaults) {
    if (existsSync(join(path, "data"))) {
      return path;
    }
  }

  // 4. Current directory fallback (development)
  return process.cwd();
}

export const ERWINDB_HOME = findDataDir();

// Determine sqlite-vec extension filename based on platform
function getSqliteVecExtension(): string {
  const ext = platform() === "darwin" ? "dylib" : "so";
  return `vec0.${ext}`;
}

// Distribution structure paths (lib/, models/, data/ subdirs)
export const PATHS = {
  database: join(ERWINDB_HOME, "data", "erwin_stackoverflow.db"),
  models: join(ERWINDB_HOME, "models"),
  sqliteVec: join(ERWINDB_HOME, "lib", getSqliteVecExtension()),
};

// Check if we're in development mode (running via bun, not compiled)
export const isDevelopment = !isCompiledBinary;

// For development (bun tui.tsx), use cwd paths and npm sqlite-vec
export function getDevPaths() {
  return {
    database: join(process.cwd(), "erwin_stackoverflow.db"),
    models: join(process.cwd(), "models"),
    sqliteVec: null, // Use sqlite-vec npm package in dev
  };
}

// For compiled binary running from project dir (flat structure)
function getCompiledDevPaths() {
  const cwd = process.cwd();
  const ext = platform() === "darwin" ? "dylib" : "so";

  // Try to find sqlite-vec in node_modules (for local compiled testing)
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const plat = platform();
  const nodeModulesVec = join(cwd, `node_modules/sqlite-vec-${plat}-${arch}/vec0.${ext}`);

  return {
    database: join(cwd, "erwin_stackoverflow.db"),
    models: join(cwd, "models"),
    sqliteVec: existsSync(nodeModulesVec) ? nodeModulesVec : null,
  };
}

// Get the appropriate paths based on environment
export function getPaths() {
  if (isDevelopment) {
    return getDevPaths();
  }

  // For compiled binary, check if distribution structure exists
  if (existsSync(PATHS.database)) {
    return PATHS;
  }

  // Fall back to flat structure for local compiled testing
  return getCompiledDevPaths();
}
