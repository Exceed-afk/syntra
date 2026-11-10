// Runs electron-vite dev with ELECTRON_RUN_AS_NODE removed (same reason as launch.cjs).
// The child's real status is reported: a crash must not look like a clean close.
const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// A Windows crash arrives as a large unsigned code, e.g. 3221225477 = 0xC0000005 (access violation).
const hex = (code) => `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`

const child = spawn('npx electron-vite dev', { cwd: root, env, stdio: 'inherit', shell: true })
child.on('error', (error) => {
  console.error(`[dev] could not start electron-vite: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[dev] electron crashed with signal ${signal}`)
    process.exitCode = 1
  } else if (code === 0) {
    process.exitCode = 0
  } else if (typeof code === 'number') {
    console.error(`[dev] electron crashed with code ${code} (${hex(code)})`)
    process.exitCode = 1
  } else {
    console.error('[dev] electron ended without an exit code (it may have crashed)')
    process.exitCode = 1
  }
})