import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createPlayableServer } from '../scripts/playable-service.mjs';
import { stagePlayable } from '../scripts/stage-playable.mjs';
import { exportPlayableDownloads } from '../scripts/export-playable-downloads.mjs';
import { downloadKey, downloadRecords, verifiedDownload, sendDownload } from '../scripts/playable-downloads.mjs';
import { EventEmitter } from 'node:events';
import http from 'node:http';

// Gate the actual stream after its first chunk until the real server sees close.
// This controls scheduling, not bytes, validation, or the download implementation.
for (const method of ['GET','HEAD']) test(`${method} preheader abort cancels repeated hash work and closes pinned FDs`,async t=>{
  const {tmp,store,meta}=await fixture(t);
  const server=await createPlayableServer({root:tmp,downloadRoot:store,registry:{games:[],runtime:[],downloads:[meta]}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const originalOpen=fs.open;
  t.after(()=>{fs.open=originalOpen;});
  for (let attempt=0;attempt<3;attempt++) {
    let request,response,client,stream,handle,bytes=0,afterClose=0,lateHeaders=0;
    const closed=Promise.withResolvers(), settled=Promise.withResolvers();
    server.once('request',(req,res)=>{
      request=req; response=res; res.once('close',closed.resolve);
      const write=res.writeHead.bind(res);
      res.writeHead=(...args)=>{if(res.destroyed) lateHeaders++; return write(...args);};
    });
    fs.open=async(...args)=>{
      const file=await originalOpen(...args);
      if (String(args[0]).endsWith('/build.zip')) {
        handle=file;
        const read=file.createReadStream.bind(file);
        file.createReadStream=options=>{
          stream=read(options);
          const iterate=stream[Symbol.asyncIterator].bind(stream);
          stream[Symbol.asyncIterator]=async function* () {
            try {
              for await(const chunk of iterate()) {
                bytes+=chunk.length;
                if (response.destroyed) afterClose+=chunk.length;
                if (bytes===chunk.length) {
                  assert.equal(response.headersSent,false);
                  assert.equal(request.complete,true,'normal request completion precedes abort');
                  client.destroy(); await closed.promise;
                }
                yield chunk;
              }
            } finally {settled.resolve();}
          };
          return stream;
        };
      }
      return file;
    };
    client=http.request(`http://127.0.0.1:${server.address().port}`,{path:route,method,agent:false});
    client.on('error',()=>{}); client.end();
    await deadline(settled.promise);
    // Allow the verifier finally/catch to close the handle after iterator unwind.
    await deadline((async()=>{while(handle.fd!==-1) await new Promise(resolve=>setImmediate(resolve));})());
    assert.ok(bytes<=64*1024,`cancelled hash consumed ${bytes} of ${meta.size} bytes`);
    assert.equal(afterClose,0,'no further chunks after server response close');
    assert.equal(stream.destroyed,true);
    assert.ok(stream.bytesRead<=3*64*1024,'bounded in-flight read/prefetch, not a full archive');
    console.log(JSON.stringify({phase:'preheader-abort',method,attempt,bytes,afterClose,readBytes:stream.bytesRead}));
    assert.equal(response.listeners('close').length,0,'remove cancellation listener');
    assert.equal(await fixtureFDs(store),0,'no fixture descriptors remain');
    assert.equal(lateHeaders,0,'do not attempt a generic response to a disconnected client');
    assert.equal(request.socket.listeners('close').filter(fn=>fn.name==='cancelDownload').length,0);
    fs.open=originalOpen;
  }
  assert.equal((await raw(`http://127.0.0.1:${server.address().port}`,'/healthz')).status,200);
});

test('already disconnected downloads do not open files and remove their listeners',async t=>{
  const originalOpen=fs.open; let opens=0;
  fs.open=async(...args)=>{opens++; return originalOpen(...args);};
  t.after(()=>{fs.open=originalOpen;});
  for (const state of ['aborted','response','socket']) {
    const socket=new EventEmitter(), res=new EventEmitter();
    const req={method:'GET',socket,aborted:state==='aborted'};
    socket.destroyed=state==='socket'; res.destroyed=state==='response';
    const unrelated=()=>{}; socket.on('close',unrelated); res.on('close',unrelated);
    await assert.rejects(sendDownload(req,res,'/does-not-exist',{}),{name:'AbortError'});
    assert.deepEqual(socket.listeners('close'),[unrelated]);
    assert.deepEqual(res.listeners('close'),[unrelated]);
  }
  await assert.rejects(verifiedDownload('/does-not-exist',{},AbortSignal.abort()),{name:'AbortError'});
  assert.equal(opens,0);
});

test('cancellation during file open closes the acquired descriptor before hashing',async t=>{
  const {store,meta}=await fixture(t), controller=new AbortController();
  const originalOpen=fs.open; let handle,streams=0;
  t.after(()=>{fs.open=originalOpen;});
  fs.open=async(...args)=>{
    const file=await originalOpen(...args);
    if(String(args[0]).endsWith('/build.zip')) {
      handle=file; controller.abort();
      const read=file.createReadStream.bind(file);
      file.createReadStream=(...args)=>{streams++; return read(...args);};
    }
    return file;
  };
  await assert.rejects(verifiedDownload(store,meta,controller.signal),{name:'AbortError'});
  assert.equal(handle.fd,-1); assert.equal(streams,0);
  assert.equal(await fixtureFDs(store),0);
});

test('transfer abort stops the same pinned stream and releases FD and cancellation listeners',async t=>{
  const {tmp,store,meta}=await fixture(t);
  const server=await createPlayableServer({root:tmp,downloadRoot:store,registry:{games:[],runtime:[],downloads:[meta]}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const originalOpen=fs.open; let handle,request,response; const streams=[];
  t.after(()=>{fs.open=originalOpen;});
  fs.open=async(...args)=>{
    const file=await originalOpen(...args);
    if(String(args[0]).endsWith('/build.zip')) {
      handle=file; const read=file.createReadStream.bind(file);
      file.createReadStream=options=>{const stream=read(options); streams.push(stream); return stream;};
    }
    return file;
  };
  const closed=Promise.withResolvers();
  server.once('request',(req,res)=>{request=req;response=res;res.once('close',closed.resolve);});
  await deadline(new Promise((resolve,reject)=>{
    const client=http.get(`http://127.0.0.1:${server.address().port}${route}`,{agent:false},res=>{
      assert.equal(res.statusCode,200);
      res.once('data',()=>{res.destroy(); client.destroy(); resolve();});
      res.on('error',()=>{});
    }); client.on('error',reject);
  }));
  await deadline(closed.promise);
  await deadline((async()=>{while(handle.fd!==-1) await new Promise(resolve=>setImmediate(resolve));})());
  assert.equal(streams.length,2,'hash and transfer streams from one handle');
  assert.equal(streams[0].bytesRead,meta.size,'verify full digest before success');
  assert.ok(streams[1].bytesRead<meta.size,'transfer stopped before EOF');
  assert.equal(streams[1].destroyed,true);
  assert.equal(await fixtureFDs(store),0);
  for(const emitter of [response,request.socket]) assert.equal(emitter.listeners('close').filter(fn=>fn.name==='cancelDownload').length,0);
  fs.open=originalOpen;
  assert.equal((await raw(`http://127.0.0.1:${server.address().port}`,'/healthz')).status,200);
  console.log(JSON.stringify({phase:'transfer-abort',readBytes:streams[1].bytesRead,size:meta.size}));
});

async function deadline(promise) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('cleanup deadline exceeded')),3000);})]);}
  finally {clearTimeout(timer);}
}
async function fixtureFDs(root) {
  const targets=await Promise.all((await fs.readdir('/proc/self/fd')).map(fd=>fs.readlink(`/proc/self/fd/${fd}`).catch(()=>'')));
  return targets.filter(target=>target.startsWith(root+'/')).length;
}

function raw(base, route, method='GET') {
  return new Promise((resolve,reject) => {
    const req=http.request(base,{path:route,method,agent:false},res=>{
      const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
    }); req.on('error',reject); req.end();
  });
}

test('standalone CLI refuses linked registry before opening a listener',async t=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'public-registry-links-'));
  t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
  const original=path.join(tmp,'original.json');
  await fs.writeFile(original,JSON.stringify({games:[],runtime:[]}));
  for (const kind of ['symlink','link']) {
    const registry=path.join(tmp,`${kind}.json`); await fs[kind](original,registry);
    const result=spawnSync(process.execPath,['scripts/playable-service.mjs'],{env:{PATH:process.env.PATH,PLAYABLE_ROOT:tmp,PLAYABLE_REGISTRY:registry,PLAYABLE_PORT:'0'},timeout:1000,encoding:'utf8'});
    assert.equal(result.status,1,`${kind} must fail configuration, not listen`);
    assert.equal(result.stderr.trim(),'Invalid playable configuration');
    await fs.unlink(registry);
  }
});

test('writable download files and writable selected directories are rejected',async t=>{
  const {tmp,store,meta}=await fixture(t);
  const exported=path.join(tmp,'export');
  await exportPlayableDownloads({store,records:[meta],destination:exported});
  const base=await listen(t,{root:tmp,downloadRoot:exported,registry:{games:[],runtime:[],downloads:[meta]}});
  const file=path.join(exported,downloadKey(meta),'build.zip');
  await fs.chmod(file,0o644);
  assert.equal((await raw(base,route)).status,404);
  await fs.chmod(file,0o444); await fs.chmod(path.dirname(file),0o777);
  assert.equal((await raw(base,route)).status,404);
});

test('malicious raw routes, methods and unregistered ZIPs never resolve',async t=>{
  const {tmp,store,meta}=await fixture(t);
  const base=await listen(t,{root:tmp,downloadRoot:store,registry:{games:[],runtime:[],downloads:[meta]}});
  for (const value of [route+'?path=/etc/passwd',route+'/',route.replace('1.0','latest'),route.replace('fixture','%66ixture'),route.replace('/1.0/','/../1.0/'),'/downloads/%2e%2e/%2fetc/passwd','/downloads/fixture/1.0/linux-x64.zip%00','/downloads/fixture/1.0/linux-x64.zip%0d%0aX:evil','//downloads/fixture/1.0/linux-x64.zip','/downloads/fixture/1.0/other.zip','/api/game-dev/games/fixture/builds','/games/dev/','/records.json','/metadata.json','/scripts/publish-game-build.py']) {
    const result=await raw(base,value); assert.equal(result.status,404,value); assert.equal(result.body,'Not found');
  }
  for (const method of ['POST','PUT','DELETE','PATCH','OPTIONS']) {
    const r=await raw(base,route,method); assert.equal(r.status,405); assert.equal(r.headers.allow,'GET, HEAD');
  }
});

test('invalid registry records are fail-closed configuration errors',async t=>{
  const {meta}=await fixture(t);
  for (const patch of [{game:'../private'},{version:'a--b'},{platform:'linux\r\nx:evil'},{sha256:'0'.repeat(63)},{size:0},{size:2*1024**3+1},{size:1.5},{notes:'x'.repeat(4001)},{notes:'\0'},{date:'bad'},{file:'/etc/passwd'},{game:null}]) {
    assert.throws(()=>downloadRecords([{...meta,...patch}]),/Download unavailable/);
  }
  assert.throws(()=>downloadRecords([meta,meta]));
  assert.throws(()=>downloadRecords({}));
  assert.throws(()=>downloadRecords([{...meta,notes:'😀'.repeat(4000),date:meta.date+' '.repeat(1000)}]));
});

test('missing corrupt linked nonregular and replaced files are generic 404; pinned fd survives rename',async t=>{
  const {tmp,store,meta}=await fixture(t);
  const key=downloadKey(meta), file=path.join(store,key,'build.zip');
  const base=await listen(t,{root:tmp,downloadRoot:store,registry:{games:[],runtime:[],downloads:[meta]}});
  await fs.chmod(path.dirname(file),0o700);
  const saved=path.join(tmp,'saved.zip'); await fs.rename(file,saved);
  const denied=async()=>{for(const method of ['GET','HEAD']) {const r=await raw(base,route,method); assert.equal(r.status,404); assert.equal(r.body,method==='HEAD'?'':'Not found'); assert.equal(r.headers['content-disposition'],undefined);}};
  await denied();
  await fs.symlink(saved,file); await denied(); await fs.unlink(file);
  await fs.link(saved,file); await denied(); await fs.unlink(file);
  await fs.mkdir(file); await denied(); await fs.rmdir(file);
  assert.equal(spawnSync('mkfifo',[file]).status,0); await denied(); await fs.unlink(file);
  await fs.writeFile(file,'bad'); await fs.chmod(file,0o444); await denied(); await fs.unlink(file);
  await fs.copyFile(saved,file); await fs.chmod(file,0o644);
  const corrupt=await fs.open(file,'r+'); await corrupt.write(Buffer.from('BAD'),0,3,0); await corrupt.close(); await fs.chmod(file,0o444); await denied(); await fs.unlink(file);
  await fs.rename(saved,file);
  const pinned=await verifiedDownload(store,meta);
  try {
    await fs.rename(file,saved); await fs.writeFile(file,'REPLACED');
    const h=createHash('sha256'); for await(const c of pinned.createReadStream({autoClose:false,start:0})) h.update(c);
    assert.equal(h.digest('hex'),meta.sha256);
  } finally {await pinned.close();}
  const link=path.join(tmp,'linked-root'); await fs.symlink(store,link);
  await assert.rejects(verifiedDownload(link,meta));
});

test('export rejects changed receipts, linked metadata and corrupt ZIP without partial destination',async t=>{
  const {tmp,store,meta}=await fixture(t);
  let n=0;
  const rejected=async(records=[meta])=>{const dest=path.join(tmp,`bad-${n++}`); await assert.rejects(exportPlayableDownloads({store,records,destination:dest})); assert.equal(await fs.stat(dest).catch(()=>null),null);};
  await rejected([{...meta,notes:'not publisher receipt'}]);
  const metadata=path.join(store,downloadKey(meta),'metadata.json'), backup=path.join(tmp,'metadata');
  await fs.chmod(path.dirname(metadata),0o700); await fs.rename(metadata,backup);
  await fs.symlink(backup,metadata); await rejected(); await fs.unlink(metadata);
  await fs.link(backup,metadata); await rejected(); await fs.unlink(metadata);
  await fs.writeFile(metadata,' '.repeat(16385)); await rejected(); await fs.unlink(metadata);
  await fs.rename(backup,metadata);
  const file=path.join(path.dirname(metadata),'build.zip'); await fs.chmod(file,0o644); await fs.writeFile(file,'BAD'); await fs.chmod(file,0o444); await rejected();
});

async function fixture(t) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-public-download-'));
  t.after(async () => { spawnSync('chmod', ['-R','u+w',tmp]); await fs.rm(tmp,{recursive:true,force:true}); });
  const zip = path.join(tmp,'fixture.zip'), store = path.join(tmp,'private-store');
  const made = spawnSync('python3',['-c','import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("SYNTHETIC.txt",b"x"*(33*1024*1024))',zip]);
  assert.equal(made.status,0,made.stderr?.toString());
  const published = spawnSync('python3',['scripts/publish-game-build.py','--store',store,'--game','fixture','--version','1.0','--platform','linux-x64','--zip',zip,'--notes','SYNTHETIC TEST ONLY'],{encoding:'utf8'});
  assert.equal(published.status,0,published.stderr);
  return {tmp,store,meta:JSON.parse(published.stdout)};
}
async function listen(t, options) {
  const server = await createPlayableServer(options);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const route = '/downloads/fixture/1.0/linux-x64.zip';
test('stager refuses original private store lacking explicit export receipt manifest',async t => {
  const {tmp,store,meta}=await fixture(t);
  const dest=path.join(tmp,'release');
  await assert.rejects(stagePlayable({root:tmp,registry:{games:[],runtime:[],downloads:[meta]},destination:dest,downloadExport:store}));
  assert.equal(await fs.stat(dest).catch(()=>null),null);
});
test('synthetic real publisher → deliberate export → stage → HTTP large ZIP digest',async t => {
  const {tmp,store,meta} = await fixture(t);
  const helper = new URL('../scripts/export-playable-downloads.mjs',import.meta.url);
  assert.ok(await fs.stat(helper).catch(()=>false),'explicit read-only download exporter exists');
  const { exportPlayableDownloads } = await import(helper);
  const exported = path.join(tmp,'export');
  await exportPlayableDownloads({store, records:[meta], destination:exported});
  const registry = {games:[],runtime:[],downloads:[meta]};
  const dest = path.join(tmp,'release');
  await stagePlayable({root:tmp,registry,destination:dest,downloadExport:exported});
  const staged = await import(new URL(`file://${dest}/playable-service.mjs`));
  const server = await staged.createPlayableServer({root:path.join(dest,'public'),downloadRoot:path.join(dest,'downloads'),registry});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.deepEqual((await fs.readdir(dest)).sort(),['downloads','playable-downloads.mjs','playable-service.mjs','registry.json']);
  await assert.rejects(exportPlayableDownloads({store,records:[meta],destination:exported}));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(exported,'records.json'))),[meta]);
  const response = await fetch(base+route);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/zip');
  assert.equal(response.headers.get('content-length'),String(meta.size));
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="fixture-1.0-linux-x64.zip"');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('cache-control'),'private, max-age=31536000, immutable');
  const digest=createHash('sha256'); let size=0;
  for await (const chunk of response.body) {digest.update(chunk); size+=chunk.length;}
  assert.equal(size,meta.size); assert.equal(digest.digest('hex'),meta.sha256);
  const head = await fetch(base+route,{method:'HEAD'});
  assert.equal(head.status,200); assert.equal(head.headers.get('content-length'),String(size));
  assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal(await fs.stat(path.join(dest,'public/downloads')).catch(()=>null),null);
  console.log(JSON.stringify({synthetic:true,sha256:meta.sha256,size}));
});
