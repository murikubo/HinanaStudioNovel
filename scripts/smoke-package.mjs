import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const executablePath = process.argv[2] || path.join(root, 'release/mac-arm64/Hinana Studio Novel.app/Contents/MacOS/Hinana Studio Novel');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hinana-novel-package-'));
const env = { ...process.env, HINANA_NOVEL_DATA_DIR: tmp }; delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ executablePath, args: [], env });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByText('자동 복구 기록 완료', { exact: true }).waitFor();
  await page.getByLabel('작품명', { exact: true }).fill('패키지 실행 검증');
  const file = path.join(tmp, 'packaged.hinananovel');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, file);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('프로젝트를 저장했습니다.', { exact: true }).waitFor();
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).title, '패키지 실행 검증');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, path.join(tmp, 'index.html'));
  await page.getByRole('button', { name: '웹으로 내보내기', exact: true }).click();
  await page.getByRole('button', { name: 'HTML 파일로 내보내기', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-labelledby="export-title"]'));
  assert.ok((await fs.readFile(path.join(tmp, 'index.html'), 'utf8')).includes('패키지 실행 검증'));
  await page.getByLabel('작품명', { exact: true }).fill('종료 확인');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await page.waitForTimeout(200); assert.equal(page.isClosed(), false);
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  const closed = page.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).title, '종료 확인');
  assert.deepEqual(errors, []);
  console.log('PASS: Packaged app launches, saves and exports from ASAR, cancels close, saves changes before closing.');
} finally {
  if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); }
  await fs.rm(tmp, { recursive: true, force: true });
}
