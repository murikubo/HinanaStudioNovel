// Only this fixed script may execute in reader documents. Manuscripts stay escaped text.
export const READER_SCRIPT_HASH = "vX5TyP30pvN0ZdmCT2UYD4E0zev3WSzHXDX/4CSlJ7g=";
export const READER_SCRIPT = String.raw`(() => {
  'use strict';
  const source = document.querySelector('.book');
  const scrolling = document.querySelector('.scroll');
  const stage = document.getElementById('page-stage');
  const spread = document.getElementById('page-spread');
  const status = document.getElementById('page-status');
  const previous = document.getElementById('page-prev');
  const next = document.getElementById('page-next');
  const modeButton = document.getElementById('reading-mode');
  const spreadSelect = document.getElementById('page-layout');
  const progress = document.getElementById('reading-progress');
  const vertical = document.body.dataset.writing === 'vertical';
  const key = 'hinana-novel-position:' + document.body.dataset.book;
  const blocks = [];
  let offset = 0;
  source.querySelectorAll('section').forEach((section, chapter) => {
    Array.from(section.children).forEach((node, index) => {
      const text = node.textContent || '';
      blocks.push({ tag: node.tagName, className: node.className, text, start: offset, chapter, first: index === 0 });
      offset += text.length;
    });
  });
  const end = source.querySelector('.end');
  if (end) blocks.push({ tag: 'DIV', className: 'end', text: end.textContent || '', start: offset, chapter: Math.max(0, source.querySelectorAll('section').length - 1), first: false });
  let mode = document.body.dataset.reading;
  let pages = [], pageIndex = 0, columns = 1, anchor = 0, generation = 0, cache = null, ready = false, resizeTimer;
  let pendingAnchor = null;
  const clamp = n => Math.max(0, Math.min(offset, Number(n) || 0));
  function savePosition(value) {
    anchor = clamp(value);
    try { localStorage.setItem(key, JSON.stringify({ anchor })); } catch {}
    if (window.parent !== window) window.parent.postMessage({ type: 'novel:position:save', anchor }, '*');
  }
  try { const stored = JSON.parse(localStorage.getItem(key) || 'null'); if (stored && Number.isFinite(stored.anchor)) anchor = clamp(stored.anchor); } catch {}
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'novel:position:restore' || !Number.isFinite(event.data.anchor)) return;
    anchor = clamp(event.data.anchor);
    if (mode === 'pages' && ready) showPage(pageFor(anchor));
    else { pendingAnchor = anchor; if (mode === 'scroll') requestAnimationFrame(() => scrollToAnchor(anchor)); }
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'novel:position:load' }, '*');
  function pageFor(value) { let found = 0; for (let i = 0; i < pages.length; i++) { if (pages[i].start <= value) found = i; else break; } return found; }
  function updateButtons() {
    previous.disabled = !ready || pageIndex === 0;
    next.disabled = !ready || pageIndex + columns >= pages.length;
    previous.textContent = vertical ? '이전 →' : '← 이전';
    next.textContent = vertical ? '← 다음' : '다음 →';
    previous.setAttribute('aria-label', '이전 페이지'); next.setAttribute('aria-label', '다음 페이지');
  }
  function showPage(index, remember = true) {
    if (!ready || !pages.length) return;
    pageIndex = Math.max(0, Math.min(pages.length - 1, index));
    pageIndex = Math.floor(pageIndex / columns) * columns;
    Array.from(spread.children).forEach(node => cache.append(node));
    for (let i = pageIndex; i < Math.min(pageIndex + columns, pages.length); i++) spread.append(pages[i].element);
    const last = Math.min(pageIndex + columns, pages.length);
    status.textContent = (columns === 2 && last !== pageIndex + 1 ? (pageIndex + 1) + '–' + last : String(pageIndex + 1)) + ' / ' + pages.length;
    progress.value = last / pages.length;
    document.getElementById('reading-percent').textContent = Math.round(progress.value * 100) + '%';
    updateButtons();
    if (remember) savePosition(pages[pageIndex].start);
  }
  function changePage(delta) {
    if (!ready || mode !== 'pages') return;
    const target = pageIndex + delta * columns;
    if (target < 0 || target >= pages.length) return;
    showPage(target);
  }
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
  function nextPieces(text, at) {
    const sample = text.slice(at, at + 16448);
    if (segmenter) return Array.from(segmenter.segment(sample)).filter(value => value.index + value.segment.length <= 16384).map(value => value.segment);
    return Array.from(sample).slice(0, 8192);
  }
  async function paginate() {
    if (mode !== 'pages') return;
    const ticket = ++generation, wanted = pendingAnchor === null ? anchor : pendingAnchor; pendingAnchor = null;
    ready = false; stage.dataset.ready = 'false'; updateButtons(); status.textContent = '페이지 계산 중…';
    const rect = stage.getBoundingClientRect();
    columns = (spreadSelect.value === 'double' || (spreadSelect.value === 'auto' && rect.width >= 900)) && rect.width >= 700 ? 2 : 1;
    const paperWidth = rect.width / columns, paperHeight = rect.height;
    const requestedPadding = Number(document.body.dataset.padding) || 40;
    const padding = Math.min(requestedPadding, paperWidth < 480 ? 24 : requestedPadding, Math.max(12, paperHeight / 8));
    const bodyWidth = Math.max(100, Math.min(Number(document.body.dataset.width) || 640, paperWidth - padding * 2)), bodyHeight = Math.max(100, paperHeight - padding * 2);
    stage.style.setProperty('--paper-width', paperWidth + 'px'); stage.style.setProperty('--paper-height', paperHeight + 'px'); stage.style.setProperty('--page-padding', padding + 'px');
    const newCache = document.createElement('div'); newCache.className = 'page-cache'; document.body.append(newCache);
    const built = []; let current = null, units = 0;
    const fits = () => current.content.scrollHeight <= current.content.clientHeight + 1 && current.content.scrollWidth <= current.content.clientWidth + 1;
    function makePage(start, chapter) {
      const element = document.createElement('div'); element.className = 'reader-page'; element.dataset.pageIndex = String(built.length); element.dataset.start = String(start);
      element.style.width = paperWidth + 'px'; element.style.height = paperHeight + 'px'; element.style.padding = padding + 'px';
      const content = document.createElement('div'); content.className = 'page-content'; content.style.width = bodyWidth + 'px'; content.style.height = bodyHeight + 'px';
      element.append(content); newCache.append(element); current = { element, content, start, chapter }; built.push(current);
    }
    for (const block of blocks) {
      if (ticket !== generation) { newCache.remove(); return; }
      if (!current || (block.first && current.content.childNodes.length)) makePage(block.start, block.chapter);
      let at = 0;
      if (!block.text.length) { const blank = document.createElement('p'); blank.style.minBlockSize = '1em'; current.content.append(blank); if (!fits()) { blank.remove(); makePage(block.start, block.chapter); current.content.append(blank); } continue; }
      while (at < block.text.length) {
        if (ticket !== generation) { newCache.remove(); return; }
        const node = document.createElement(block.tag); node.className = block.className;
        if (at > 0) node.dataset.continued = 'true';
        current.content.append(node);
        const pieces = nextPieces(block.text, at);
        node.textContent = pieces.join('');
        let accepted = pieces.length;
        if (!fits()) {
          let low = 0, high = pieces.length;
          while (low < high) { const middle = Math.ceil((low + high) / 2); node.textContent = pieces.slice(0, middle).join(''); if (fits()) low = middle; else high = middle - 1; }
          accepted = low;
        }
        if (!accepted && current.content.childNodes.length > 1) { node.remove(); makePage(block.start + at, block.chapter); continue; }
        if (!accepted) accepted = 1;
        node.textContent = pieces.slice(0, accepted).join('');
        at += node.textContent.length;
        if (at < block.text.length) { makePage(block.start + at, block.chapter); }
        units++;
        if (units % 10 === 0) { status.textContent = built.length + '쪽 계산 중…'; await new Promise(resolve => requestAnimationFrame(resolve)); }
      }
    }
    if (ticket !== generation) { newCache.remove(); return; }
    if (!built.length) makePage(0, 0);
    Array.from(spread.children).forEach(node => node.remove());
    cache?.remove(); cache = newCache; pages = built; ready = true; stage.dataset.ready = 'true';
    const targetAnchor = pendingAnchor === null ? wanted : pendingAnchor; pendingAnchor = null;
    showPage(pageFor(targetAnchor), false);
    anchor = clamp(targetAnchor);
  }
  function scrollAnchor() {
    const main = scrolling.getBoundingClientRect(); let closest = 0, distance = Infinity;
    const nodes = source.querySelectorAll('section > *'); let position = 0;
    nodes.forEach(node => {
      const rect = node.getBoundingClientRect();
      const d = vertical ? Math.abs(main.right - rect.right) : Math.abs(main.top - rect.top);
      if (d < distance) { distance = d; closest = position; }
      position += (node.textContent || '').length;
    });
    return closest;
  }
  function scrollToAnchor(value) {
    let position = 0, target = source.querySelector('section');
    for (const node of source.querySelectorAll('section > *')) { if (position <= value) target = node; position += (node.textContent || '').length; if (position > value) break; }
    target?.scrollIntoView({ block: 'start', inline: 'start' });
  }
  function setMode(value) {
    if (mode === 'scroll' && value === 'pages') anchor = scrollAnchor();
    mode = value; document.body.dataset.reading = mode;
    const paged = mode === 'pages';
    stage.hidden = !paged; scrolling.hidden = paged; document.getElementById('page-controls').hidden = !paged; spreadSelect.hidden = !paged;
    modeButton.textContent = paged ? '스크롤 읽기' : '책처럼 읽기'; modeButton.setAttribute('aria-pressed', String(paged));
    if (paged) paginate(); else { generation++; ready = false; cache?.remove(); cache = null; spread.replaceChildren(); scrollToAnchor(anchor); }
  }
  previous.addEventListener('click', () => changePage(-1)); next.addEventListener('click', () => changePage(1));
  modeButton.addEventListener('click', () => setMode(mode === 'pages' ? 'scroll' : 'pages'));
  spreadSelect.addEventListener('change', () => paginate());
  document.addEventListener('keydown', event => {
    if (mode !== 'pages' || /INPUT|TEXTAREA|SELECT|SUMMARY/.test(event.target.tagName) || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.target.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
    let delta = 0;
    if (event.key === 'ArrowRight') delta = vertical ? -1 : 1;
    if (event.key === 'ArrowLeft') delta = vertical ? 1 : -1;
    if (event.key === 'PageDown' || event.key === ' ') delta = event.shiftKey ? -1 : 1;
    if (event.key === 'PageUp') delta = -1;
    if (event.key === 'Home') { event.preventDefault(); showPage(0); return; }
    if (event.key === 'End') { event.preventDefault(); showPage(pages.length - 1); return; }
    if (delta) { event.preventDefault(); changePage(delta); }
  });
  let touch = null;
  stage.addEventListener('touchstart', event => { if (event.touches.length === 1) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (!touch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y; touch = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) changePage((dx < 0 ? 1 : -1) * (vertical ? -1 : 1));
  }, { passive: true });
  stage.addEventListener('click', event => {
    if (window.getSelection()?.toString()) return;
    const rect = stage.getBoundingClientRect(), x = event.clientX - rect.left;
    if (x < rect.width * .18) changePage(vertical ? 1 : -1);
    else if (x > rect.width * .82) changePage(vertical ? -1 : 1);
  });
  document.querySelectorAll('nav a').forEach((link, chapter) => link.addEventListener('click', event => {
    document.querySelector('details').open = false;
    if (mode !== 'pages') return;
    event.preventDefault(); if (!ready) return;
    const target = pages.findIndex(page => page.chapter === chapter); if (target >= 0) showPage(target);
  }));
  let scrollTimer;
  scrolling.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => { if (mode === 'scroll') savePosition(scrollAnchor()); }, 150); }, { passive: true });
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (mode === 'pages') paginate(); }, 150); });
  window.addEventListener('pagehide', () => { if (mode === 'pages' && ready) savePosition(pages[pageIndex].start); });
  setMode(mode);
  document.fonts.ready.then(() => { if (mode === 'pages') paginate(); else scrollToAnchor(anchor); });
})();`;
