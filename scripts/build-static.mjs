import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const runtimeDirectories = ['bgm', 'vendor', 'coop'];
const runtimeExtensions = new Set(['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.mp3']);
const excludedRootFiles = new Set(['server.js', 'package.json', 'package-lock.json', 'vercel.json']);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isFile() || excludedRootFiles.has(entry.name)) continue;
  if (!runtimeExtensions.has(path.extname(entry.name).toLowerCase())) continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name));
}

for (const directory of runtimeDirectories) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}

console.log(`Static deployment built at ${output}`);
