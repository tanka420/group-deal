import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {store} from '../src/db/store';
const root=path.resolve(__dirname,'../..'),sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
function originalBytes(){const directory=path.join(root,'backend/data');return fs.readdirSync(directory).filter(n=>/^groupdeal(?:\.sqlite(?:-wal|-shm)?|_db\.json(?:\.tmp)?)$/.test(n)).sort().map(name=>({name,sha256:sha(fs.readFileSync(path.join(directory,name)))}));}
function main(){assert.ok(store.isIsolated);const before=originalBytes(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-entrypoint-')),entry=path.join(directory,'outside.ts'),storeModule=path.join(root,'backend/src/db/store.ts');
 fs.writeFileSync(entry,`const {store}=require(${JSON.stringify(storeModule)});try{store.db;process.exitCode=1;}catch(error){if(error.message!=='TEST_STORAGE_ENTRYPOINT_REQUIRED')process.exitCode=1;else console.log('TEST_STORAGE_ENTRYPOINT_REQUIRED');}\n`);
 const child=spawnSync(process.execPath,[path.join(root,'backend/node_modules/tsx/dist/cli.mjs'),entry],{cwd:path.join(root,'backend'),env:{...process.env,NODE_ENV:'test'},encoding:'utf8',timeout:30000});
 assert.equal(child.status,0);assert.equal(child.signal,null);assert.equal(child.error,undefined);assert.equal(child.stdout.trim(),'TEST_STORAGE_ENTRYPOINT_REQUIRED');assert.deepEqual(originalBytes(),before);
 console.log('PASS test storage entrypoint guard before singleton construction; genuine test remains isolated and original SQLite/legacy bytes unchanged.');
}
try{main()}catch{console.error('FAIL test storage entrypoint guard; private values withheld');process.exitCode=1}finally{store.close()}
