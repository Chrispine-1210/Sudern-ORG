'use strict';
if (process.env.DATABASE_URL) {
 require('./mfa').key(); // refuse malformed or missing keys before opening the listener
 require('./server-postgres').start().catch(e=>{console.error('Postgres startup refused:',e.message);process.exitCode=1});
} else if (process.env.NODE_ENV==='production') {
 throw Error('DATABASE_URL must be configured; SQLite is development-only and is not production MFA protected');
} else {
 console.warn('LEGACY LOCAL SQLITE MODE ONLY — PRIVILEGED MFA UNAVAILABLE. Never expose this mode publicly.');
 require('./server').start();
}
