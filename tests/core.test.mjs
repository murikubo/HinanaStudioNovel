import test from 'node:test';
import { createHash } from 'node:crypto';
import { READER_SCRIPT, READER_SCRIPT_HASH } from '../shared/reader-runtime.mjs';
import assert from 'node:assert/strict';
import { createProject, parseProject, readerHTML, readerPolicy } from '../shared/core.mjs';
test('project round-trip preserves the full manuscript and reading settings', () => {
  const p = createProject(true); p.author = '히나나'; p.settings.writing = 'vertical'; p.settings.fontSize = 24;
  p.chapters.push({ id: 'second', title: '두 번째 글', text: '다음 페이지\n\n다음 문단' });
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
});
test('imported project rejects invalid settings, duplicate IDs, and unsupported versions', () => {
  for (const mutate of [p => p.version = 2, p => p.settings.fontSize = 0, p => p.settings.font = '__proto__', p => p.settings.padding = null, p => p.chapters.push(p.chapters[0]), p => p.settings.font = 'custom']) {
    const p = createProject(); mutate(p); assert.throws(() => parseProject(JSON.stringify(p)));
  }
  assert.throws(() => parseProject('broken JSON'));
});
test('export treats manuscript and titles as text rather than executable markup', () => {
  const p = createProject(); p.title = '<script>alert(1)</script>'; p.author = '<img src=x onerror=alert(2)>';
  p.chapters[0].title = '</h1><script>alert(3)</script>'; p.chapters[0].text = '<iframe src="https://evil.example"></iframe>\n\n& "한글"';
  const html = readerHTML(p);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('<iframe'));
  assert.ok(html.includes('&lt;iframe')); assert.ok(html.includes('&amp; &quot;한글&quot;'));
  assert.ok(html.includes(readerPolicy()));
  assert.equal((html.match(/<script data-novel-runtime>/g) || []).length, 1);
});
test('all chapters export in order with safe table-of-contents anchors', () => {
  const p = createProject(); p.chapters = [{ id: '" unsafe id', title: '첫 글', text: '첫 문단\n\n둘째 문단' }, { id: 'b', title: '다음 글', text: '끝 문단' }];
  const html = readerHTML(p);
  assert.ok(html.indexOf('<h1>첫 글') < html.indexOf('<h1>다음 글'));
  assert.ok(html.includes('href="#chapter-1"')); assert.ok(html.includes('<p>첫 문단</p><p>둘째 문단</p>'));
  const selected = readerHTML(p, 'b'); assert.ok(!selected.includes('첫 문단')); assert.ok(selected.includes('끝 문단'));
});
test('export embeds a custom font and does not depend on external resources', () => {
  const p = createProject(); p.settings.font = 'custom'; p.customFont = { name: 'test.woff2', data: 'data:font/woff2;base64,AAECAw==' };
  const html = readerHTML(p); assert.ok(html.includes("url('data:font/woff2;base64,AAECAw==')"));
  assert.ok(!html.includes('https://')); assert.ok(!html.includes('src="/'));
  p.customFont.data = 'javascript:alert(1)'; assert.throws(() => readerHTML(p));
});
test('vertical mode preserves selected typography and horizontal scrolling', () => {
  const p = createProject(); p.settings.writing = 'vertical'; p.settings.theme = 'night'; p.settings.fontSize = 26;
  const html = readerHTML(p); assert.ok(html.includes('writing-mode:vertical-rl')); assert.ok(html.includes('font-size:26px')); assert.ok(html.includes('.scroll{direction:rtl}')); assert.ok(html.includes('content="dark"'));
});
test('publication identity and introduction survive saving and legacy migration', () => {
  const p = createProject(true); p.description = '서가에 남기는 작품 소개';
  const restored = parseProject(JSON.stringify(p)); assert.equal(restored.id, p.id); assert.equal(restored.description, p.description);
  const legacy = { ...p }; delete legacy.id; delete legacy.description;
  const migrated = parseProject(JSON.stringify(legacy)); assert.equal(migrated.id, legacy.chapters[0].id); assert.equal(migrated.description, '');
  assert.deepEqual(parseProject(JSON.stringify(migrated)), migrated);
});

test('reader permits only the exact bundled runtime and migrates legacy reading settings', () => {
  assert.equal(createHash('sha256').update(READER_SCRIPT).digest('base64'), READER_SCRIPT_HASH);
  const p = createProject(); delete p.settings.reading; delete p.settings.spread;
  const migrated = parseProject(JSON.stringify(p)); assert.equal(migrated.settings.reading, 'scroll'); assert.equal(migrated.settings.spread, 'auto');
  migrated.settings.reading = 'pages'; migrated.settings.spread = 'double';
  assert.deepEqual(parseProject(JSON.stringify(migrated)), migrated);
  assert.ok(readerHTML(migrated).includes('data-reading="pages"'));
  for (const invalid of [{reading:'javascript'}, {spread:'triple'}]) assert.throws(() => parseProject(JSON.stringify({...migrated,settings:{...migrated.settings,...invalid}})));
});
