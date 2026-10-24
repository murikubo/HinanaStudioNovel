import { _electron as electron, chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hinana-novel-test-'));
const out = path.join(root, 'test-results'); await fs.mkdir(out, { recursive: true });
const projectFile = path.join(tmp, 'sample.hinananovel'), exportFile = path.join(tmp, 'index.html'), textFile = path.join(tmp, '새 원고.txt');
await fs.writeFile(textFile, '가져온 문장입니다.\n\n두 번째 문단입니다.');
let app, browser;
const env = { ...process.env, HINANA_NOVEL_DATA_DIR: tmp }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ args: [root], env });
try {
  app = await launch();
  const page = await app.firstWindow(); page.setDefaultTimeout(15000); console.log('Opened Electron');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByText('자동 복구 기록 완료', { exact: true }).waitFor();
  assert.equal(await page.title(), 'Hinana Studio Novel');
  await page.screenshot({ path: path.join(out, '01-workspace.png') }); console.log('Initial workspace ready');
  assert.equal(await page.locator('iframe').count(), 0, 'writing mode dedicates the canvas to the manuscript');
  await page.getByRole('button', { name: '프로그램 정보', exact: true }).click();
  const about = page.getByRole('dialog', { name: 'HINANA STUDIO NOVEL', exact: true });
  await about.waitFor(); assert.equal(await about.locator('dd').nth(1).innerText(), '비나래');
  assert.equal(await about.locator('dd').nth(2).innerText(), 'Ver. 0.1.0');
  assert.ok((await about.locator('img').getAttribute('src')).endsWith('novel-icon-source.png'));
  await page.screenshot({ path: path.join(out, '04-about.png') });
  await page.keyboard.press('Escape'); await about.waitFor({ state: 'detached' });
  await app.evaluate(({ Menu }) => {
    const menus = Menu.getApplicationMenu().items;
    const info = menus.flatMap(menu => menu.submenu?.items || []).find(item => item.label === 'Hinana Studio Novel 정보' || item.label === '프로그램 정보');
    info.click();
  });
  await about.waitFor(); await page.getByRole('button', { name: '프로그램 정보 닫기', exact: true }).click();
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await page.locator('iframe').waitFor();
  await page.screenshot({ path: path.join(out, '05-reading-workspace.png') });
  await page.getByRole('button', { name: '글 작업', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1120, 740));
  await page.screenshot({ path: path.join(out, '06-compact-workspace.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 980));

  await page.getByLabel('작품명', { exact: true }).fill('화면 너머의 문장');
  await page.getByLabel('지은이', { exact: true }).fill('히나나');
  await page.getByLabel('원고', { exact: true }).fill('같은 문장을 읽습니다.\n\n작은 화면과 큰 화면에서 만나는 글입니다.');
  await page.getByRole('button', { name: '글 추가', exact: true }).click();
  await page.getByLabel('글 제목', { exact: true }).fill('두 번째 글');
  await page.getByLabel('원고', { exact: true }).fill('끝에 남은 문장.');
  await app.evaluate(({ dialog }, textFile) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [textFile] }); }, textFile);
  await page.getByRole('button', { name: '텍스트 파일 가져오기', exact: true }).click();
  await page.getByLabel('원고', { exact: true }).filter({ hasText: '' }).waitFor();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('가져온 문장')); console.log('Imported text');
  await page.getByRole('button', { name: '글 위로 이동', exact: true }).click();
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  const fontPath = '/System/Library/Fonts/Supplemental/Arial.ttf';
  if (process.platform === 'darwin') {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, fontPath);
    await page.getByRole('button', { name: '글꼴 파일 포함하기', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="글꼴"]').value === 'custom');
    console.log('Embedded a real font');
  }
  await page.getByRole('button', { name: '환경 비교', exact: true }).first().click();
  await page.locator('iframe').nth(1).waitFor();
  await page.getByRole('button', { name: '세로쓰기', exact: true }).click();
  await page.getByRole('button', { name: '밤', exact: true }).click();
  console.log('Changed reading settings'); await Promise.all(page.frames().filter(frame => frame !== page.mainFrame()).map(frame => frame.waitForFunction(() => document.querySelector('.book') && getComputedStyle(document.querySelector('.book')).writingMode === 'vertical-rl')));
  await page.screenshot({ path: path.join(out, '02-compare-vertical.png') }); console.log('Vertical preview ready');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, projectFile);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('프로젝트를 저장했습니다.', { exact: true }).waitFor();
  const saved = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  assert.equal(saved.title, '화면 너머의 문장'); assert.equal(saved.chapters.length, 3); assert.equal(saved.chapters[1].title, '새 원고');
  assert.equal(saved.settings.writing, 'vertical'); assert.equal(saved.settings.theme, 'night');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, exportFile);
  await page.getByRole('button', { name: '웹으로 내보내기', exact: true }).click();
  await page.getByRole('button', { name: 'HTML 파일로 내보내기', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-labelledby="export-title"]'));
  const html = await fs.readFile(exportFile, 'utf8'); if (process.platform === 'darwin') assert.ok(html.includes('data:font/ttf;base64,')); assert.ok(html.includes('가져온 문장')); assert.ok(html.includes('끝에 남은 문장'));
  await page.getByRole('button', { name: '글 작업', exact: true }).click();
  await page.getByLabel('작품명', { exact: true }).fill('저장하지 않은 수정');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await page.getByRole('button', { name: '열기', exact: true }).click();
  assert.equal(await page.getByLabel('작품명', { exact: true }).inputValue(), '저장하지 않은 수정');
  await app.evaluate(({ dialog }, file) => { dialog.showMessageBox = async () => ({ response: 2 }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, projectFile);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="작품명"]').value === '화면 너머의 문장');
  await page.getByLabel('원고', { exact: true }).fill('자동 복구 확인용 문장');
  await page.getByText('자동 복구 기록 완료', { exact: true }).waitFor();
  await page.waitForTimeout(900);
  assert.deepEqual(errors, []);
  await app.evaluate(({ app }) => app.exit(0)); await app.close(); app = null;
  app = await launch();
  const restored = await app.firstWindow(); await restored.getByText('이전 작업을 복구했습니다. 저장할 프로젝트 파일을 선택해 주세요.', { exact: true }).waitFor();
  assert.equal(await restored.getByLabel('원고', { exact: true }).inputValue(), '자동 복구 확인용 문장');
  await app.evaluate(({ app }) => app.exit(0)); await app.close(); app = null;
  browser = await chromium.launch({ headless: true });
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 744, 1133], ['desktop', 1280, 800]]) {
    const reader = await browser.newPage({ viewport: { width, height } });
    reader.setDefaultTimeout(15000); const requests = []; reader.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    await reader.goto(pathToFileURL(exportFile).href);
    assert.equal(await reader.locator('section').count(), 3);
    assert.equal(await reader.locator('.book').evaluate(e => getComputedStyle(e).writingMode), 'vertical-rl');
    const scroll = await reader.locator('.scroll').evaluate(e => ({ x: e.scrollLeft, width: e.scrollWidth, visible: e.clientWidth, doc: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(scroll.doc <= scroll.viewport, `outer horizontal overflow on ${name}`);
    await reader.getByText('목차', { exact: true }).click();
    await reader.getByRole('link', { name: '두 번째 글', exact: true }).click();
    await reader.waitForFunction(() => {
      const e = document.querySelector('#chapter-2 h1').getBoundingClientRect();
      return e.left >= 0 && e.right <= innerWidth + 1;
    });
    await reader.getByText('목차', { exact: true }).click();
    if (process.platform === 'darwin') { await reader.evaluate(() => document.fonts.ready); assert.ok(await reader.evaluate(() => document.fonts.check('18px NovelCustom'))); }
    await reader.screenshot({ path: path.join(out, `03-reader-${name}.png`) });
    assert.deepEqual(requests, []); await reader.close();
  }
  const horizontal = { ...saved, settings: { ...saved.settings, writing: 'horizontal', theme: 'paper' } };
  horizontal.chapters[0].text = ('긴 문장도 끊김 없이 읽을 수 있습니다. '.repeat(20) + '\n\n').repeat(20);
  const { readerHTML } = await import('../shared/core.mjs');
  const horizontalFile = path.join(tmp, 'horizontal.html'); await fs.writeFile(horizontalFile, readerHTML(horizontal));
  for (const width of [390, 744, 1280]) {
    const reader = await browser.newPage({ viewport: { width, height: 844 } });
    await reader.goto(pathToFileURL(horizontalFile).href);
    assert.ok(await reader.locator('.scroll').evaluate(e => e.scrollHeight > e.clientHeight));
    assert.ok(await reader.locator('.scroll').evaluate(e => e.scrollWidth <= e.clientWidth));
    await reader.close();
  }
  const vertical = { ...horizontal, settings: { ...horizontal.settings, writing: 'vertical' } };
  const verticalFile = path.join(tmp, 'vertical-long.html'); await fs.writeFile(verticalFile, readerHTML(vertical));
  const longReader = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await longReader.goto(pathToFileURL(verticalFile).href);
  assert.ok(await longReader.locator('.scroll').evaluate(e => e.scrollWidth > e.clientWidth));
  assert.ok(await longReader.locator('section h1').first().evaluate(e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }));
  await longReader.getByText('목차', { exact: true }).click(); await longReader.getByRole('link', { name: '두 번째 글', exact: true }).click();
  await longReader.waitForFunction(() => { const r = document.querySelector('#chapter-2 h1').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
  await longReader.close();
  console.log('PASS: Electron editing, text import, reorder, save/open, cancellation, export, crash recovery; standalone reader at 3 viewport sizes.');
} catch (error) { if (app) { const p = await app.firstWindow(); await p.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); console.error(await p.locator('body').innerText()); } throw error; } finally {
  if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); }
  await browser?.close(); await fs.rm(tmp, { recursive: true, force: true });
}
