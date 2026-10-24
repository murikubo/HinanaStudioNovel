const { shell } = require('electron');
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const productionOrigin = 'https://hinana.moe';
function serverOrigin() {
  const url = new URL(process.env.HINANA_NOVEL_SERVER || productionOrigin);
  if (url.origin !== productionOrigin && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('hinana.moe 또는 로컬 개발 서버만 연결할 수 있습니다.');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('서버 주소 형식이 올바르지 않습니다.');
  return url.origin;
}
function hinanaPublisher({ core, openExternal = url => shell.openExternal(url) }) {
  const origin = serverOrigin(); let pending = null;
  const escape = core.escapeHTML;
  async function publish(raw, description) {
    if (pending) throw new Error('브라우저에서 진행 중인 게시를 먼저 완료하거나 취소해 주세요.');
    const project = core.parseProject(raw);
    if (typeof description !== 'string' || description.length > 500) throw new Error('작품 소개는 500자 이하여야 합니다.');
    if (!project.title.trim() || !project.chapters.some(c => c.text.trim())) throw new Error('작품명과 원고를 입력해 주세요.');
    project.description = description;
    const payload = JSON.stringify(project);
    if (Buffer.byteLength(payload) > 28 * 1024 * 1024) throw new Error('프로젝트는 28MB 이하여야 합니다.');
    const nonce = randomBytes(32).toString('base64url'), basePath = `/novel/${nonce}`;
    let ticket = null, timer, localOrigin, settled = false, finish;
    const result = new Promise((resolve, reject) => { finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); pending = null;
      server.close(); server.closeIdleConnections();
      if (error) reject(error); else resolve(value);
    }; });
    const server = http.createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'origin'); res.setHeader('X-Content-Type-Options', 'nosniff');
      const html = (status, body, script = '', formOrigin = "'none'") => {
        const scriptNonce = randomBytes(16).toString('base64');
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'; form-action ${formOrigin}; base-uri 'none'; frame-ancestors 'none'` });
        res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>Hinana Studio Novel</title><style>body{font:16px/1.8 system-ui;max-width:650px;margin:15vh auto;padding:24px;color:#344866;background:#f7f9fc}button{padding:12px 20px}input{display:none}</style>${body}${script ? `<script nonce="${scriptNonce}">${script}</script>` : ''}</html>`);
      };
      if (req.headers.host !== new URL(localOrigin).host) return html(403, '<h1>허용되지 않은 요청입니다.</h1>');
      const url = new URL(req.url, localOrigin);
      if (url.pathname === basePath + '/transfer' && req.method === 'GET') {
        const received = url.searchParams.get('ticket');
        if (!received || !/^[A-Za-z0-9_-]{43}$/.test(received) || (ticket && ticket !== received)) return html(400, '<h1>게시 요청을 확인할 수 없습니다.</h1>');
        ticket = received;
        return html(200, `<h1>승인한 원고를 전달하고 있습니다.</h1><p>이 창을 잠시 유지해 주세요.</p><form id="handoff" method="post" enctype="multipart/form-data" action="${origin}/hinana/works/desktop-publish?ticket=${escape(ticket)}"><input type="hidden" name="project" value="${escape(payload)}"><button type="submit">원고 전달 계속</button></form>`, "document.getElementById('handoff').requestSubmit()", origin);
      }
      if (url.pathname === basePath + '/cancel' && req.method === 'GET') { html(200, '<h1>게시를 취소했습니다.</h1><p>Novel로 돌아가 주세요.</p>'); finish(null, null); return; }
      if (url.pathname === basePath + '/result' && req.method === 'POST') {
        if (req.headers.origin !== origin || !ticket || !String(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) return html(403, '<h1>허용되지 않은 결과입니다.</h1>');
        try {
          const chunks = []; let size = 0;
          for await (const chunk of req) { size += chunk.length; if (size > 16384) { html(413, '<h1>결과 크기가 올바르지 않습니다.</h1>'); return; } chunks.push(chunk); }
          const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          if (fields.get('ticket') !== ticket) return html(403, '<h1>게시 요청이 일치하지 않습니다.</h1>');
          const data = JSON.parse(fields.get('result') || '{}');
          if (data.success !== true) { const message = typeof data.error === 'string' ? data.error.slice(0, 500) : '게시하지 못했습니다.'; html(200, '<h1>게시를 완료하지 못했습니다.</h1><p>Novel에서 오류를 확인해 주세요.</p>'); finish(new Error(message)); return; }
          const work = data.work;
          if (!work || typeof work.id !== 'string' || !/^[0-9a-f-]{36}$/.test(work.id) || work.url !== `/hinana/works/${work.id}` || typeof work.title !== 'string' || typeof work.updatedAt !== 'string') return html(400, '<h1>게시 결과가 올바르지 않습니다.</h1>');
          const publication = { id: work.id, title: work.title, url: origin + work.url, updatedAt: work.updatedAt };
          html(200, `<h1>작품을 게시했습니다.</h1><p>Novel에 게시 결과를 전달했습니다. 이 탭을 닫아도 됩니다.</p><a href="${escape(publication.url)}">게시한 작품 읽기 →</a>`);
          finish(null, publication); return;
        } catch { return html(400, '<h1>게시 결과를 읽을 수 없습니다.</h1>'); }
      }
      html(404, '<h1>만료되었거나 올바르지 않은 요청입니다.</h1>');
    });
    server.requestTimeout = 30000; server.headersTimeout = 10000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    localOrigin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(origin + '/hinana/works/connect');
    url.searchParams.set('callback', localOrigin + basePath + '/result');
    url.searchParams.set('digest', createHash('sha256').update(payload).digest('hex'));
    url.searchParams.set('title', project.title); url.searchParams.set('author', project.author);
    url.searchParams.set('chapters', String(project.chapters.length));
    const characters = project.chapters.reduce((sum, c) => sum + Array.from(c.text).length, 0); url.searchParams.set('characters', String(characters));
    pending = { url: url.href, cancel: () => finish(null, null) };
    timer = setTimeout(() => finish(new Error('브라우저 게시 대기 시간이 만료되었습니다. 다시 시작해 주세요.')), 10 * 60 * 1000); timer.unref();
    // Attach rejection handling before launching the browser; the app makes no server requests.
    const completed = result.then(value => ({ value }), error => ({ error }));
    try { await openExternal(url.href); } catch { finish(new Error('외부 브라우저를 열지 못했습니다. 기본 브라우저 설정을 확인해 주세요.')); }
    const outcome = await completed; if (outcome.error) throw outcome.error; return outcome.value;
  }
  async function cancel() { pending?.cancel(); }
  async function reopen() { if (pending) await openExternal(pending.url); }
  async function open(id) { if (id !== undefined && (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) throw new Error('작품 주소가 올바르지 않습니다.'); await openExternal(origin + '/hinana/works' + (id ? '/' + id : '')); }
  return { publish, cancel, reopen, open };
}
module.exports = { hinanaPublisher, serverOrigin };
