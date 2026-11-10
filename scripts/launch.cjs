// Launches the built Electron app with ELECTRON_RUN_AS_NODE removed, because
// a machine-level copy of that variable forces the exe to act as plain Node.
// Pass "--remote-debugging-port=9222" as argv[2] to also open a DevTools port
// (used by scripts/qa-insights-height.mjs, which starts the app on a temporary profile).
//
// The child's real status is reported, so a crash cannot hide behind "exited with code 0".
const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// A Windows crash arrives as a large unsigned code, e.g. 3221225477 = 0xC0000005 (access violation).
const hex = (code) => `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`

const args = process.argv[2] ? [process.argv[2], '.'] : ['.']
const child = spawn(exe, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: false })
child.stdout.on('data', (d) => process.stdout.write(d))
child.stderr.on('data', (d) => process.stderr.write(d))
child.on('error', (error) => {
  console.error(`[launch] could not start electron: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[launch] electron crashed with signal ${signal}`)
    process.exitCode = 1
  } else if (code === 0) {
    console.log('[launch] electron exited with code 0')
    process.exitCode = 0
  } else if (typeof code === 'number') {
    console.error(`[launch] electron crashed with code ${code} (${hex(code)})`)
    process.exitCode = 1
  } else {
    console.error('[launch] electron ended without an exit code (it may have crashed)')
    process.exitCode = 1
  }
})
