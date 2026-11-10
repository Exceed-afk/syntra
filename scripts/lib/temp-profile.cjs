// One place where a throw-away Electron profile is built, pruned and cleaned up, and where a
// script checks that it is not about to touch the real one.
//
// The app's own profile is %APPDATA%\<productName> (package.json: "Feeblest's Everything"), and
// only `npm run dev` and `npm run start` may use it. Everything that starts Electron for testing
// gets `feeblest-<purpose>-<pid>` inside the OS temp folder instead.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const REAL_NAME = "Feeblest's Everything"
const created = new Set()
let cleanupRegistered = false

/** The folder the app itself uses: %APPDATA%\<productName>. */
function realProfilePath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appData, REAL_NAME)
}

function normalize(dir) {
  return path.resolve(dir).replace(/[/\\]+$/, '').toLowerCase()
}

/**
 * Refuses to continue when the folder in use is the real profile.
 * `ALLOW_REAL_PROFILE=1` is the only way past it, and only for a deliberate, one-off run.
 */
function assertNotRealProfile(profilePath) {
  if (!profilePath) {
    throw new Error('the Electron profile in use could not be determined, so this script refuses to run')
  }
  if (normalize(profilePath) !== normalize(realProfilePath())) return
  if (process.env.ALLOW_REAL_PROFILE === '1') {
    console.warn(`[profile] using the REAL app data folder (ALLOW_REAL_PROFILE=1): ${profilePath}`)
    return
  }
  console.error(
    `[profile] refusing to run against the real app data folder:\n  ${profilePath}\n` +
    'Only `npm run dev` and `npm run start` may use it. Set ALLOW_REAL_PROFILE=1 to override.'
  )
  process.exit(1)
}

/** `feeblest-<purpose>-<pid>` in the OS temp folder, removed when this process exits. */
function tempProfilePath(purpose) {
  const name = String(purpose || 'qa').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'qa'
  const dir = path.join(os.tmpdir(), `feeblest-${name}-${process.pid}`)
  created.add(dir)
  if (!cleanupRegistered) {
    cleanupRegistered = true
    process.on('exit', () => {
      for (const current of created) {
        try { fs.rmSync(current, { recursive: true, force: true }) } catch { /* already gone */ }
      }
    })
  }
  return dir
}

/** Removes leftover profiles of one purpose, never the one in use. */
function pruneProfiles(purpose, keep) {
  const prefix = `feeblest-${purpose}-`
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith(prefix)) continue
    const dir = path.join(os.tmpdir(), name)
    if (keep && normalize(dir) === normalize(keep)) continue
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* in use or already gone */ }
  }
}

/** Ends a process and everything it started (renderers, GPU, network service). */
function killTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
    return
  }
  try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
}

/**
 * The --user-data-dir of the Electron app listening on a CDP port, or null when no such app is
 * running. An app started without --user-data-dir gets the real profile, which is what this
 * reports, so assertNotRealProfile() can refuse it.
 */
function cdpProfilePath(port) {
  const marker = `--remote-debugging-port=${port}`
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Select-Object -ExpandProperty CommandLine"
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const line = out.split(/\r?\n/).find((entry) => entry && entry.includes(marker))
      if (!line) return null
      const match = line.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/)
      return match ? (match[1] || match[2]) : realProfilePath() // no switch: Electron's default is the real profile
    }
    const out = execFileSync('ps', ['-Ao', 'args'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const line = out.split(/\r?\n/).find((entry) => entry && entry.includes(marker))
    if (!line) return null
    const match = line.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/)
    return match ? (match[1] || match[2]) : realProfilePath()
  } catch {
    return null
  }
}

module.exports = { realProfilePath, assertNotRealProfile, tempProfilePath, pruneProfiles, killTree, cdpProfilePath }
