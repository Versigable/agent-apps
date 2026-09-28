import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { listBuilds, downloadBuild } from '../scripts/game-build-store.mjs';

async function assertRoundTrip(zip, game, version, platform, notes) {
 const builds = await listBuilds(game);
 const meta = builds.find(build => build.version === version && build.platform === platform);
 assert.ok(meta, `published ${version} must be listed`);
 assert.equal(meta.notes, notes);
 const chunks = [];
 const res = new Writable({write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); }});
 res.writeHead = (status, headers) => { res.statusCode = status; res.headers = headers; };
 await downloadBuild({method:'GET'}, res, game, version, platform);
 assert.equal(res.statusCode, 200);
 assert.equal(res.headers['content-type'], 'application/zip');
 assert.deepEqual(Buffer.concat(chunks), await fs.readFile(zip));
}

test('Unicode notes use the same code-point boundary for publish, list and download', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-unicode-fixture-'));
 const previousStore = process.env.GAME_BUILD_STORE;
 const store = path.join(tmp, 'store'); process.env.GAME_BUILD_STORE = store;
 try {
  const zip = path.join(tmp, 'fixture.zip');
  const fixture = spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("FIXTURE.txt","Unicode release test fixture only")', zip]);
  assert.equal(fixture.status, 0, fixture.stderr?.toString());
  for (const [label, char] of [['ascii','a'],['bmp','界'],['astral','😀']]) {
   for (const count of [3999,4000,4001]) {
    const version = `${label}-${count}`, notes = char.repeat(count);
    const result = run(['--store',store,'--game','fixture','--version',version,'--platform','linux-x64','--zip',zip,'--notes',notes]);
    if (count <= 4000) {
     assert.equal(result.status, 0, result.stderr);
     await assertRoundTrip(zip, 'fixture', version, 'linux-x64', notes);
    } else {
     assert.notEqual(result.status, 0, `${label} code-point overflow rejected`);
     await assert.rejects(fs.stat(path.join(store,`fixture--${version}--linux-x64`)), {code:'ENOENT'});
     assert.ok(!(await listBuilds('fixture')).some(build => build.version === version));
     await assert.rejects(downloadBuild({method:'GET'}, {}, 'fixture', version, 'linux-x64'));
    }
   }
  }
 } finally {
  if (previousStore === undefined) delete process.env.GAME_BUILD_STORE; else process.env.GAME_BUILD_STORE = previousStore;
  spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true});
 }
});
test('serialized metadata byte budget includes every field before immutable commit', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-budget-fixture-'));
 const previousStore = process.env.GAME_BUILD_STORE;
 const store = path.join(tmp, 'store'); process.env.GAME_BUILD_STORE = store;
 try {
  const zip = path.join(tmp, 'fixture.zip'), game = 'g'.repeat(64), platform = 'p'.repeat(64);
  const versionFor = prefix => prefix + 'v'.repeat(63) + '.' + 'v'.repeat(15);
  const fixture = spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("FIXTURE.txt","Serialized metadata budget fixture only")', zip]);
  assert.equal(fixture.status, 0, fixture.stderr?.toString());
  const publish = (version, notes) => run(['--store',store,'--game',game,'--version',version,'--platform',platform,'--zip',zip,'--notes',notes]);
  const base = versionFor('b');
  const seed = publish(base, ''); assert.equal(seed.status, 0, seed.stderr);
  await assertRoundTrip(zip, game, base, platform, '');
  const overhead = (await fs.stat(path.join(store,`${game}--${base}--${platform}`,'metadata.json'))).size;
  for (const [prefix, size] of [['u',16383],['e',16384],['o',16385]]) {
   const budget = size - overhead, version = versionFor(prefix);
   const notes = '😀'.repeat(Math.floor(budget/4)) + 'a'.repeat(budget%4);
   assert.ok([...notes].length <= 4000, 'byte boundary is independent of code-point limit');
   const result = publish(version, notes);
   const identity = path.join(store,`${game}--${version}--${platform}`);
   if (size <= 16384) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await fs.stat(path.join(identity,'metadata.json'))).size, size);
    await assertRoundTrip(zip, game, version, platform, notes);
   } else {
    assert.notEqual(result.status, 0, 'metadata byte overflow must be rejected before commit');
    assert.match(result.stderr, /metadata.*16384/i);
    await assert.rejects(fs.stat(identity), {code:'ENOENT'});
    assert.ok(!(await listBuilds(game)).some(build => build.version === version));
    await assert.rejects(downloadBuild({method:'GET'}, {}, game, version, platform));
    assert.ok(!(await fs.readdir(store)).some(name => name.startsWith('.publish-')));
    const retry = publish(version, 'Shorter fixture notes after rejection');
    assert.equal(retry.status, 0, retry.stderr);
    await assertRoundTrip(zip, game, version, platform, 'Shorter fixture notes after rejection');
   }
  }
 } finally {
  if (previousStore === undefined) delete process.env.GAME_BUILD_STORE; else process.env.GAME_BUILD_STORE = previousStore;
  spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true});
 }
});

test('publisher rejects dangerous ZIP members, linked inputs/store and repository storage', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-bad-fixture-'));
 try {
  const zip = path.join(tmp, 'bad.zip');
  const args = ['--store', path.join(tmp, 'store'), '--game', 'fixture', '--version', 'v1', '--platform', 'linux-x64', '--zip', zip];
  for (const name of ['../secret', '/absolute', 'C:/drive', 'a\\\\b', '.hidden', 'safe/../../escape']) {
   spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr(sys.argv[2],"Explicit malicious ZIP fixture")', zip, name]);
   assert.notEqual(run(args).status, 0, `reject ${name}`);
  }
  spawnSync('python3', ['-c', 'import zipfile,sys\ni=zipfile.ZipInfo("link"); i.create_system=3; i.external_attr=0o120777<<16\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr(i,"/etc/passwd")', zip]);
  assert.notEqual(run(args).status, 0, 'reject archive symlink');
  spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("FIXTURE.txt","test")', zip]);
  for(const [field,value] of [['--game','bad.game'],['--game','a'.repeat(65)],['--platform','linux.x64']]) {
   const invalid=[...args];invalid[invalid.indexOf(field)+1]=value;assert.notEqual(run(invalid).status,0,`reject unroutable ${field}`);
  }
  const link = path.join(tmp, 'link.zip'); await fs.symlink(zip, link);
  assert.notEqual(run([...args.slice(0,-1), link]).status, 0, 'reject symlink input');
  const linkedStore = path.join(tmp, 'linked-store'); await fs.symlink(tmp, linkedStore);
  assert.notEqual(run(['--store',linkedStore,...args.slice(2)]).status, 0, 'reject linked store');
  assert.notEqual(run(['--store',path.join(tmp,'agent-brain','builds'),...args.slice(2)]).status,0,'reject agent-brain storage');
  assert.notEqual(run(['--store', path.join(repo,'forbidden-fixture-store'),...args.slice(2)]).status, 0, 'reject store inside repo');
 } finally { spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true}); }
});
const repo = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
test('publisher rejects raw ZIP name controls and parser discrepancies before committing an identity', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-raw-name-fixture-'));
 try {
  const zip = path.join(tmp, 'raw.zip'), store = path.join(tmp, 'store');
  // Patch bytes AFTER writing: ZipInfo itself truncates literal NUL names.
  for (const [label, central, local] of [
   ['nul', 'safe\0/../../escape', 'safe\0/../../escape'],
   ['control', 'safe\x1f/fixture.txt', 'safe\x1f/fixture.txt'],
   ['del', 'safe\x7f/fixture.txt', 'safe\x7f/fixture.txt'],
   ['c1', 'safe\u0085/fixture.txt', 'safe\u0085/fixture.txt'],
   ['local-mismatch', 'safeX/fixture.txt', 'safeY/fixture.txt'],
   ['local-nul', 'safeX/fixture.txt', 'safe\0/fixture.txt'],
   ['double-slash', 'safe//', 'safe//'],
  ]) {
   const fixture = spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr(sys.argv[2],"Explicit raw-header test fixture only")', zip, central.replace(/[\x00-\x1f\x7f]/g, 'X')]);
   assert.equal(fixture.status, 0, fixture.stderr?.toString());
   const bytes = await fs.readFile(zip);
   const l = bytes.indexOf(Buffer.from('504b0304','hex')), c = bytes.indexOf(Buffer.from('504b0102','hex'));
   assert.ok(l >= 0 && c > l);
   assert.equal(bytes.readUInt16LE(l+26), Buffer.byteLength(local));
   assert.equal(bytes.readUInt16LE(c+28), Buffer.byteLength(central));
   bytes.write(local, l+30); bytes.write(central, c+46);
   await fs.writeFile(zip, bytes);
   const result = run(['--store',store,'--game','fixture','--version',label,'--platform','linux-x64','--zip',zip]);
   assert.notEqual(result.status, 0, `reject raw ${label}: ${result.stdout}`);
   await assert.rejects(fs.stat(path.join(store,`fixture--${label}--linux-x64`)), {code:'ENOENT'});
   assert.deepEqual(await fs.readdir(store), [], 'no staging or final identity remains');
  }
 } finally { spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true}); }
});
// Build distinct local/central extras without asking a ZIP reader to interpret them.
function extraField(id, payload) {
 const header = Buffer.alloc(4); header.writeUInt16LE(id); header.writeUInt16LE(payload.length, 2);
 return Buffer.concat([header, payload]);
}
async function extraFixture(zip, central, local, name = 'SAFE-FIXTURE.txt', forceZip64 = false) {
 const result = spawnSync('python3', ['-c', `import sys,zipfile,struct,zlib
p,c,l,name,zip64=sys.argv[1:]
c,l=bytes.fromhex(c),bytes.fromhex(l)
i=zipfile.ZipInfo(name); i.extra=l
with zipfile.ZipFile(p,'w') as z:
 with z.open(i,'w',force_zip64=zip64=='true') as f: f.write(b'Explicit extra-field fixture only; never extract or execute')
b=bytearray(open(p,'rb').read()); e=len(b)-22; start=struct.unpack_from('<I',b,e+16)[0]
n,x=struct.unpack_from('<HH',b,start+28); pos=start+46+n
b[pos:pos+x]=c; struct.pack_into('<H',b,start+30,len(c))
e=len(b)-22; size=struct.unpack_from('<I',b,e+12)[0]; struct.pack_into('<I',b,e+12,size+len(c)-x)
open(p,'wb').write(b)
print(zlib.crc32(name.encode('utf8')))
`, zip, central.toString('hex'), local.toString('hex'), name, String(forceZip64)], {encoding:'utf8'});
 assert.equal(result.status, 0, result.stderr);
 return Number(result.stdout.trim());
}
function unicodePath(crc, alternate) {
 const prefix = Buffer.alloc(5); prefix[0] = 1; prefix.writeUInt32LE(crc, 1);
 return extraField(0x7075, Buffer.concat([prefix, Buffer.from(alternate)]));
}
test('publisher rejects Unicode Path overrides in either ZIP header', async t => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-upath-fixture-'));
 try {
  const zip = path.join(tmp, 'fixture.zip'), empty = Buffer.alloc(0);
  const crc = await extraFixture(zip, empty, empty);
  for (const [label, alternate] of [['traversal','../ESCAPE.txt'],['absolute','/ABSOLUTE.txt'],['nul','safe\0/../../escape'],['safe','OTHER.txt']]) {
   for (const location of ['central','local','both']) await t.test(`${label}-${location}`, async () => {
    const field = unicodePath(crc, alternate), store = path.join(tmp, `${label}-${location}`);
    await extraFixture(zip, location === 'local' ? empty : field, location === 'central' ? empty : field);
    // Independent reader, listing ONLY. Local-only extras are not used by -Z1.
    const listing = spawnSync('unzip', ['-Z1', zip], {encoding:'utf8'});
    assert.equal(listing.status, 0, listing.stderr);
    assert.equal(listing.stdout.trim(), location === 'local' ? 'SAFE-FIXTURE.txt' : alternate.split('\0')[0]);
    const result = run(['--store',store,'--game','fixture','--version','v1','--platform','linux-x64','--zip',zip]);
    assert.notEqual(result.status, 0, `reject ${label}-${location}: ${result.stdout}`);
    await assert.rejects(fs.stat(path.join(store,'fixture--v1--linux-x64')), {code:'ENOENT'});
    assert.deepEqual(await fs.readdir(store), [], 'no staging or final identity remains');
   });
  }
 } finally { spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true}); }
});
test('publisher rejects malformed extra framing and malformed Unicode Path metadata', async t => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-extra-framing-'));
 try {
  const zip = path.join(tmp, 'fixture.zip'), empty = Buffer.alloc(0);
  const crc = await extraFixture(zip, empty, empty), valid = unicodePath(crc, 'OTHER.txt');
  const standard = extraField(0x5455, Buffer.from('0100000000','hex'));
  const fields = [
   ['trailing-one',Buffer.from('75','hex')], ['trailing-two',Buffer.from('7570','hex')],
   ['trailing-three',Buffer.from('757000','hex')],
   ['after-standard',Buffer.concat([standard,Buffer.from('75','hex')])],
   ['length-overrun',Buffer.from('feca050001','hex')],
   ['upath-overrun',Buffer.from('75700a0001','hex')],
   ['empty-upath',extraField(0x7075,empty)],
   ['short-upath',extraField(0x7075,Buffer.from('0100','hex'))],
   ['unknown-version',Buffer.from(valid).fill(2,4,5)],
   ['bad-crc',unicodePath((crc ^ 1) >>> 0,'OTHER.txt')],
   ['invalid-utf8',extraField(0x7075,Buffer.concat([valid.subarray(4,9),Buffer.from('ff','hex')]))],
   ['duplicate',Buffer.concat([valid,valid])],
  ];
  for (const [label, field] of fields) for (const location of ['central','local','both']) {
   await t.test(`${label}-${location}`, async () => {
    const store = path.join(tmp, `${label}-${location}`);
    await extraFixture(zip, location === 'local' ? empty : field, location === 'central' ? empty : field);
    const result = run(['--store',store,'--game','fixture','--version','v1','--platform','linux-x64','--zip',zip]);
    assert.notEqual(result.status, 0, `reject malformed ${label}-${location}`);
    await assert.rejects(fs.stat(path.join(store,'fixture--v1--linux-x64')), {code:'ENOENT'});
    assert.deepEqual(await fs.readdir(store), [], 'no staging or final identity remains');
   });
  }
 } finally { spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true}); }
});
test('ordinary Unicode ZIP names and standard extra metadata round trip unchanged', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-standard-extra-'));
 const previousStore = process.env.GAME_BUILD_STORE;
 try {
  const zip = path.join(tmp, 'fixture.zip'); process.env.GAME_BUILD_STORE = path.join(tmp, 'store');
  // Timestamp, Unix UID/GID, and a well-framed unknown opaque field remain supported.
  const fields = Buffer.concat([extraField(0x5455,Buffer.from('0100000000','hex')),
   extraField(0x7875,Buffer.from('0101000100','hex')),extraField(0xcafe,Buffer.from('fixture'))]);
  for (const [version, extras, zip64] of [['plain',Buffer.alloc(0),false],['standard',fields,false],['zip64',fields,true]]) {
   await extraFixture(zip, extras, extras, '資料/café-😀.txt', zip64);
   const result = run(['--store',process.env.GAME_BUILD_STORE,'--game','fixture','--version',version,'--platform','linux-x64','--zip',zip]);
   assert.equal(result.status, 0, result.stderr);
   await assertRoundTrip(zip, 'fixture', version, 'linux-x64', '');
  }
 } finally {
  if (previousStore === undefined) delete process.env.GAME_BUILD_STORE; else process.env.GAME_BUILD_STORE = previousStore;
  spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true});
 }
});
function run(args) { return spawnSync('python3', [path.join(repo, 'scripts/publish-game-build.py'), ...args], { encoding: 'utf8' }); }
test('local publisher stores a labeled ZIP fixture immutably with exact metadata', async () => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'game-build-fixture-'));
 try {
  const zip = path.join(tmp, 'fixture.zip');
  spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("FIXTURE-NOT-A-GAME.txt","Explicit test fixture, not a production build")', zip]);
  const args = ['--store', path.join(tmp, 'store'), '--game', 'fixture-game', '--version', '1.0.0-test', '--platform', 'linux-x64', '--notes', 'Explicit ZIP fixture only', '--zip', zip];
  const result = run(args); assert.equal(result.status, 0, result.stderr);
  const meta = JSON.parse(result.stdout); assert.equal(meta.version, '1.0.0-test'); assert.equal(meta.platform, 'linux-x64'); assert.match(meta.sha256, /^[a-f0-9]{64}$/); assert.ok(meta.size > 0); assert.ok(Date.parse(meta.date));
  assert.notEqual(run(args).status, 0, 'same identity cannot be overwritten');
 } finally { spawnSync('chmod', ['-R', 'u+w', tmp]); await fs.rm(tmp, {recursive:true, force:true}); }
});
