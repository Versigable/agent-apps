#!/usr/bin/env node
// Offline exporter only; never installed in the public runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publicFiles, readPublicFile } from './playable-service.mjs';
import { exportPlayableDownloads } from './export-playable-downloads.mjs';
import { downloadRecords, openDownloadFile } from './playable-downloads.mjs';

export async function stagePlayable({ root, registry, destination, runtimeRoot, downloadExport }) {
  const files = publicFiles(registry);
  const downloads = downloadRecords(registry.downloads);
  // Exclusive new directory: a partial export must never be activated.
  await fs.mkdir(destination, { mode: 0o700 });
  try {
    if (downloads.length) {
      if (!downloadExport) throw new Error('Missing deliberate download export');
      const manifest = await openDownloadFile(downloadExport,'records.json',16*1024*1024);
      try {
        const selected = downloadRecords(JSON.parse(await manifest.readFile('utf8')));
        if (JSON.stringify(selected)!==JSON.stringify(downloads)) throw new Error('Invalid download export');
      } finally { await manifest.close(); }
      await exportPlayableDownloads({store:downloadExport,records:downloads,destination:path.join(destination,'downloads')});
    }
    for (const file of files) {
      const isRuntime = file.startsWith('node_modules/three/build/');
      const body = await readPublicFile(isRuntime && runtimeRoot ? runtimeRoot : root, isRuntime && runtimeRoot ? path.basename(file) : file);
      const target = path.join(destination, 'public', file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body, { flag: 'wx', mode: 0o644 });
    }
    await fs.writeFile(path.join(destination, 'registry.json'), JSON.stringify(registry, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    await fs.copyFile(fileURLToPath(new URL('./playable-service.mjs', import.meta.url)), path.join(destination, 'playable-service.mjs'), fs.constants.COPYFILE_EXCL);
    await fs.copyFile(fileURLToPath(new URL('./playable-downloads.mjs', import.meta.url)), path.join(destination, 'playable-downloads.mjs'), fs.constants.COPYFILE_EXCL);
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [root, registryPath, destination, runtimeRoot, downloadExport] = process.argv.slice(2);
    if (!root || !registryPath || !destination) throw new Error();
    await stagePlayable({ root, registry: JSON.parse(await fs.readFile(registryPath, 'utf8')), destination, runtimeRoot, downloadExport });
    console.log('Public staging complete; not deployed');
  } catch { console.error('Public staging failed'); process.exitCode = 1; }
}
