import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { READER_SCRIPT } from '../shared/reader-runtime.mjs';
const url = new URL('../shared/reader-runtime.mjs', import.meta.url);
const hash = createHash('sha256').update(READER_SCRIPT).digest('base64');
await writeFile(url, (await readFile(url,'utf8')).replace(/READER_SCRIPT_HASH = (['"])[^'"]+\1/,'READER_SCRIPT_HASH = '+JSON.stringify(hash)));
console.log('Updated trusted reader script hash.');
