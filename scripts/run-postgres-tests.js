'use strict';
const {spawnSync}=require('node:child_process');
if(!process.env.PG_TEST_DATABASE_URL){console.error('BLOCKED: PG_TEST_DATABASE_URL is mandatory for actual PostgreSQL integration certification');process.exit(2)}
const x=spawnSync(process.execPath,['--test','tests/postgres-workflow.test.js'],{stdio:'inherit',env:process.env});process.exit(x.status??2);
