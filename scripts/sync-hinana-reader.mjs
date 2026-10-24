import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const files = [
  ['../shared/core.mjs', '../../hinana.moe/src/shared/novel-reader.ts'],
  ['../shared/reader-runtime.mjs', '../../hinana.moe/src/shared/novel-reader-runtime.ts']
];
for (const [input, output] of files) {
  const target = new URL(output, import.meta.url);
  const source = '// Shared with HinanaStudioNovel. Synchronize using the Novel integration script.\n' + (await readFile(new URL(input, import.meta.url), 'utf8')).replace("'./reader-runtime.mjs'", "'./novel-reader-runtime'");
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== source) throw new Error('hinana.moe의 Novel 렌더러를 동기화해 주세요.');
  } else await writeFile(target, source);
}
console.log(process.argv.includes('--check') ? 'Novel reader contract matches hinana.moe.' : 'Synchronized Novel reader and runtime.');
