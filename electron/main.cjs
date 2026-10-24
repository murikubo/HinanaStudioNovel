const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
if (process.env.HINANA_NOVEL_DATA_DIR) app.setPath('userData', process.env.HINANA_NOVEL_DATA_DIR);
app.setName('Hinana Studio Novel');
let win, projectPath = null, allowClose = false, rendererReady = false, core;
let recoveryQueue = Promise.resolve();
const dev = process.argv.includes('--dev');
const MAX = 28 * 1024 * 1024;
async function atomicWrite(file, text) {
  const temporary = `${file}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, text, 'utf8'); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('허용되지 않은 요청입니다.');
}
function handle(channel, fn) { ipcMain.handle(channel, async (event, ...args) => { trusted(event); return fn(...args); }); }
function project(raw) { return core.parseProject(raw); }
async function readLimited(file, max = MAX) {
  if ((await fs.stat(file)).size > max) throw new Error(`파일 크기는 ${Math.round(max / 1024 / 1024)}MB 이하여야 합니다.`);
  return fs.readFile(file);
}
function requestClose() { if (rendererReady) win.webContents.send('novel:close-request'); else win.close(); }
app.whenReady().then(async () => {
  core = await import(pathToFileURL(path.join(__dirname, '../shared/core.mjs')).href);
  const recovery = path.join(app.getPath('userData'), 'recovery.hinananovel');
  const icon = path.join(__dirname, dev ? '../public/novel-icon.png' : '../dist/novel-icon.png');
  if (process.platform === 'darwin') app.dock?.setIcon(icon);
  win = new BrowserWindow({ icon, width: 1500, height: 980, minWidth: 1120, minHeight: 740, title: 'Hinana Studio Novel', backgroundColor: '#15161d', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('close', event => { if (!allowClose && rendererReady) { event.preventDefault(); requestClose(); } });
  const menu = [{ label: '파일', submenu: [{ label: '새 작품', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('novel:command', 'new') }, { label: '프로젝트 열기…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('novel:command', 'open') }, { label: '저장', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('novel:command', 'save') }, { label: '다른 이름으로 저장…', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('novel:command', 'saveAs') }, { type: 'separator' }, { label: '웹으로 내보내기…', accelerator: 'CmdOrCtrl+E', click: () => win.webContents.send('novel:command', 'export') }, { type: 'separator' }, { role: 'close' }] }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }, { label: '도움말', submenu: [{ label: '프로그램 정보', click: () => win.webContents.send('novel:command', 'about') }] }];
  if (process.platform === 'darwin') menu.unshift({ label: app.name, submenu: [{ label: 'Hinana Studio Novel 정보', click: () => win.webContents.send('novel:command', 'about') }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  const publisher = require('./hinana-publish.cjs').hinanaPublisher({ core });
  handle('novel:hinana-publish', publisher.publish);
  handle('novel:hinana-cancel', publisher.cancel);
  handle('novel:hinana-reopen', publisher.reopen);
  handle('novel:hinana-open', publisher.open);
  handle('novel:ready', () => { rendererReady = true; });
  handle('novel:recover', async () => { try { return project((await readLimited(recovery)).toString('utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('자동 복구 파일을 읽을 수 없습니다. 프로젝트 파일을 직접 열어 주세요.'); } });
  handle('novel:autosave', raw => { const p = project(raw); recoveryQueue = recoveryQueue.catch(() => {}).then(() => atomicWrite(recovery, JSON.stringify(p))); return recoveryQueue; });
  handle('novel:reset-path', () => { projectPath = null; });
  handle('novel:open', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Novel 프로젝트 열기', filters: [{ name: 'Hinana Studio Novel', extensions: ['hinananovel', 'json'] }], properties: ['openFile'] });
    if (result.canceled) return null;
    const p = project((await readLimited(result.filePaths[0])).toString('utf8'));
    projectPath = result.filePaths[0]; return { project: p, path: projectPath };
  });
  handle('novel:save', async (raw, saveAs = false) => {
    const p = project(raw); let file = projectPath;
    if (!file || saveAs) {
      const result = await dialog.showSaveDialog(win, { title: 'Novel 프로젝트 저장', defaultPath: file || `${safeName(p.title)}.hinananovel`, filters: [{ name: 'Hinana Studio Novel', extensions: ['hinananovel'] }] });
      if (result.canceled) return null; file = result.filePath;
    }
    await atomicWrite(file, JSON.stringify(p, null, 2)); projectPath = file; return file;
  });
  handle('novel:import-text', async () => {
    const result = await dialog.showOpenDialog(win, { title: '글 가져오기 (UTF-8)', properties: ['openFile', 'multiSelections'], filters: [{ name: '텍스트 / Markdown (일반 텍스트로 가져오기)', extensions: ['txt', 'md'] }] });
    if (result.canceled) return null;
    if (result.filePaths.length > 100) throw new Error('한 번에 100개까지 가져올 수 있습니다.');
    return Promise.all(result.filePaths.map(async file => ({ id: require('node:crypto').randomUUID(), title: path.basename(file, path.extname(file)).slice(0, 300), text: new TextDecoder('utf-8', { fatal: true }).decode(await readLimited(file, 2 * 1024 * 1024)).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') })));
  });
  handle('novel:font', async () => {
    const result = await dialog.showOpenDialog(win, { title: '사용자 글꼴 가져오기', properties: ['openFile'], filters: [{ name: '글꼴', extensions: ['woff2', 'woff', 'ttf', 'otf'] }] });
    if (result.canceled) return null;
    const file = result.filePaths[0], ext = path.extname(file).slice(1).toLowerCase();
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) throw new Error('지원하지 않는 글꼴 형식입니다.');
    return { name: path.basename(file).slice(0, 300), data: `data:font/${ext};base64,${(await readLimited(file, 10 * 1024 * 1024)).toString('base64')}` };
  });
  handle('novel:export', async raw => {
    const p = project(raw);
    const result = await dialog.showSaveDialog(win, { title: '웹 독서 파일 내보내기', defaultPath: `${safeName(p.title)}.html`, filters: [{ name: '독립 실행 HTML', extensions: ['html'] }] });
    if (result.canceled) return null;
    await atomicWrite(result.filePath, core.readerHTML(p)); return result.filePath;
  });
  handle('novel:confirm-unsaved', async () => (await dialog.showMessageBox(win, { type: 'question', title: '저장하지 않은 변경 사항', message: '작품의 변경 사항을 저장하시겠습니까?', detail: '저장하지 않고 계속하면 현재 변경 사항이 사라질 수 있습니다.', buttons: ['저장', '취소', '저장하지 않고 계속'], defaultId: 0, cancelId: 1, noLink: true })).response);
  handle('novel:close', async () => { await publisher.cancel(); await recoveryQueue.catch(() => {}); allowClose = true; win.close(); });
  if (dev) await win.loadURL('http://127.0.0.1:5175'); else await win.loadFile(path.join(__dirname, '../dist/index.html'));
});
function safeName(name) { return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 100) || 'novel'; }
app.on('window-all-closed', () => app.quit());
