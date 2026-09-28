#!/usr/bin/env node
// Offline deliberate export only. Never install in the public service.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { downloadRecords, downloadKey, openDownloadFile, verifiedDownload } from './playable-downloads.mjs';

export async function exportPlayableDownloads({store,records,destination}) {
  records=downloadRecords(records);
  await fs.mkdir(destination,{mode:0o700});
  try {
    for (const meta of records) {
      const key=downloadKey(meta);
      const metadata=await openDownloadFile(store,`${key}/metadata.json`,16384);
      let actual;
      try { actual=downloadRecords([JSON.parse(await metadata.readFile('utf8'))])[0]; }
      finally { await metadata.close(); }
      if (JSON.stringify(actual)!==JSON.stringify(meta)) throw new Error();
      const file=await verifiedDownload(store,meta);
      try {
        const dir=path.join(destination,key); await fs.mkdir(dir,{mode:0o700});
        const target=await fs.open(path.join(dir,'build.zip'),'wx',0o444);
        try { await pipeline(file.createReadStream({autoClose:false,start:0,end:meta.size-1,highWaterMark:65536}),target.createWriteStream({autoClose:true})); }
        finally { await target.close(); }
        // Validate the actual copied bytes as well (source mutation fails closed).
        const copied=await verifiedDownload(destination,meta); await copied.close();
        await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(meta),{flag:'wx',mode:0o444});
      } finally { await file.close(); }
    }
    await fs.writeFile(path.join(destination,'records.json'),JSON.stringify(records),{flag:'wx',mode:0o444});
  } catch {
    await fs.rm(destination,{recursive:true,force:true});
    throw new Error('Download export failed');
  }
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [store,receipts,destination]=process.argv.slice(2);
    if (!store || !receipts || !destination) throw new Error();
    await exportPlayableDownloads({store,records:JSON.parse(await fs.readFile(receipts,'utf8')),destination});
    console.log('Selected downloads exported; not deployed');
  } catch { console.error('Download export failed'); process.exitCode=1; }
}
