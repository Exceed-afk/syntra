// Quick schema check against the real app database (read-only). Uses the
// system-Node addon copy the tests use (tests/sqlite.ts points there too).
//
// It opens the real profile, so it refuses to run without ALLOW_REAL_PROFILE=1:
//   ALLOW_REAL_PROFILE=1 node scripts/check-db.cjs
const fs = require('node:fs')
const path = require('node:path')
const { realProfilePath, assertNotRealProfile } = require('./lib/temp-profile.cjs')

const root = path.join(__dirname, '..')
const profile = realProfilePath()
assertNotRealProfile(profile)

const binding = path.join(root, 'node_modules', 'better-sqlite3', 'build-node', 'Release', 'better_sqlite3.node')
const Database = require('better-sqlite3')(undefined, { nativeBinding: fs.existsSync(binding) ? binding : undefined })
const dbPath = path.join(profile, 'data', 'everything.db')
const db = new Database(dbPath, { readonly: true })
console.log('user_version =', db.pragma('user_version', { simple: true }))
const cols = db.prepare("PRAGMA table_info('trades')").all().map((c) => c.name)
console.log('trades columns:', cols.join(', '))
console.log('closed_at set on', db.prepare('SELECT COUNT(*) c FROM trades WHERE closed_at IS NOT NULL').get().c, 'of', db.prepare('SELECT COUNT(*) c FROM trades').get().c, 'trades')
db.close()
