'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sudern.db');
let db;
function now(){ return new Date().toISOString(); }
function id(prefix){ return prefix+'_'+crypto.randomBytes(9).toString('hex'); }
function initDb(file=DATABASE_PATH){
  if(file!==':memory:') fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const c = new DatabaseSync(file); c.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if(file!==':memory:') c.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  c.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','director','programme_officer','finance_officer','mel_officer','viewer')),
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS programmes (
 id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, focus TEXT NOT NULL,
 description TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','active','completed','¶»§q«^