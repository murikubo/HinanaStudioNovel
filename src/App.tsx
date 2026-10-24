import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronRight, Columns2, Download, FilePlus2, FileText, FolderOpen, Info, Monitor, Plus, RotateCw, Save, Settings2, Trash2, Type, Upload, X } from 'lucide-react';
import { createProject, parseProject, readerHTML, type Project, type Settings } from '../shared/core.mjs';
import Preview, { devices } from './Preview';
import About from './About';
import type { Publication } from './bridge';
const bridge = window.novel;
const count = (text: string) => Array.from(text).length.toLocaleString();
function download(name: string, text: string, type: string) { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default function App() {
  const [project, setProject] = useState<Project>(() => createProject(true));
  const [selected, setSelected] = useState('');
  const [saved, setSaved] = useState('');
  const [filePath, setFilePath] = useState('');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''), [recoveryStatus, setRecoveryStatus] = useState('자동 복구 준비 중');
  const [mode, setMode] = useState<'edit'|'preview'|'compare'>('edit');
  const [device, setDevice] = useState('mini'), [compareDevice, setCompareDevice] = useState('phone');
  const [landscape, setLandscape] = useState(false), [exportDialog, setExportDialog] = useState(false), [about, setAbout] = useState(false), [help, setHelp] = useState(false);
  const [exportTarget, setExportTarget] = useState<'html'|'hinana'>('html');
  const description = project.description;
  const setDescription = (description: string) => setProject(p => ({ ...p, description }));
  const [publication, setPublication] = useState<Publication|null>(null);
  const [publishError, setPublishError] = useState('');
  const [publishPending, setPublishPending] = useState(false);
  const [previewProject, setPreviewProject] = useState(project);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const publishingRef = useRef(false), closeAfterPublish = useRef(false);
  const projectRef = useRef(project), savedRef = useRef(saved), lock = useRef(false);
  projectRef.current = project; savedRef.current = saved;
  const raw = JSON.stringify(project), dirty = raw !== saved;
  const chapter = project.chapters.find(c => c.id === selected) || project.chapters[0];
  const total = project.chapters.reduce((n, c) => n + Array.from(c.text).length, 0);
  const error = (e: unknown) => setNotice(e instanceof Error ? e.message : String(e));
  const update = (fn: (p: Project) => Project) => setProject(p => fn(p));
  const settings = (patch: Partial<Settings>) => update(p => ({ ...p, settings: { ...p.settings, ...patch } }));
  const patchChapter = (patch: Partial<typeof chapter>) => update(p => ({ ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, ...patch } : c) }));
  const run = useCallback(async (action: () => Promise<void>) => { if (lock.current) return; lock.current = true; setBusy(true); try { await action(); } catch (e) { error(e); } finally { lock.current = false; setBusy(false); if (closeAfterPublish.current) { closeAfterPublish.current = false; queueMicrotask(() => void commandRef.current('close')); } } }, []);
  const save = async (saveAs = false): Promise<boolean> => {
    const current = JSON.stringify(projectRef.current); parseProject(current);
    if (bridge) { const path = await bridge.save(current, saveAs); if (!path) return false; setFilePath(path); }
    else download(`${projectRef.current.title || 'novel'}.hinananovel`, current, 'application/json');
    setSaved(current); savedRef.current = current; setNotice('프로젝트를 저장했습니다.'); return true;
  };
  const guard = async () => {
    if (JSON.stringify(projectRef.current) === savedRef.current) return true;
    if (bridge) { const result = await bridge.confirmUnsaved(); return result === 0 ? save() : result === 2; }
    return window.confirm('저장하지 않은 변경 사항을 버리고 계속하시겠습니까?');
  };
  const replace = (p: Project, path = '', isSaved = true) => { setPublication(null); projectRef.current = p; setProject(p); setSelected(p.chapters[0].id); setFilePath(path); setSaved(isSaved ? JSON.stringify(p) : ''); savedRef.current = isSaved ? JSON.stringify(p) : ''; };
  const command = async (name: string) => {
    if (name === 'close' && publishingRef.current) { closeAfterPublish.current = true; await bridge?.hinanaCancel(); return; }
    if (name === 'about') { setAbout(true); return; }
    if (name === 'export') { setExportDialog(true); return; }
    await run(async () => {
      if (name === 'save' || name === 'saveAs') { await save(name === 'saveAs'); return; }
      if (name === 'new' && await guard()) { if (bridge) await bridge.resetPath(); replace(createProject(), '', false); setNotice('새 작품을 만들었습니다.'); }
      if (name === 'open' && await guard()) {
        if (bridge) { const result = await bridge.open(); if (result) { replace(result.project, result.path); setNotice('프로젝트를 열었습니다.'); } }
        else setNotice('프로젝트 열기는 Electron 앱에서 사용해 주세요.');
      }
      if (name === 'close' && await guard()) { if (bridge) { await bridge.autosave(JSON.stringify(projectRef.current)); await bridge.close(); } }
    });
  };
  const commandRef = useRef(command); commandRef.current = command;
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const recovered = bridge ? await bridge.recover() : (localStorage.getItem('novel-recovery') ? parseProject(localStorage.getItem('novel-recovery')!) : null);
        if (!active) return;
        if (recovered) { replace(recovered, '', false); setNotice('이전 작업을 복구했습니다. 저장할 프로젝트 파일을 선택해 주세요.'); }
        else { setSaved(JSON.stringify(projectRef.current)); savedRef.current = JSON.stringify(projectRef.current); }
      } catch (e) { if (active) error(e); }
      if (active) { setReady(true); setRecoveryStatus('자동 복구 준비 완료'); }
    })();
    const offClose = bridge?.onClose(() => void commandRef.current('close'));
    const offCommand = bridge?.onCommand(name => void commandRef.current(name));
    return () => { active = false; offClose?.(); offCommand?.(); };
  }, []);
  useEffect(() => { if (ready) void bridge?.ready(); }, [ready]);
  useEffect(() => {
    if (!ready) return;
    setRecoveryStatus('변경 사항 기록 중…');
    const timer = setTimeout(() => {
      const task = bridge ? bridge.autosave(raw) : Promise.resolve().then(() => { localStorage.setItem('novel-recovery', raw); });
      task.then(() => setRecoveryStatus('자동 복구 기록 완료')).catch(() => setRecoveryStatus('자동 복구 실패 · 프로젝트를 저장해 주세요'));
    }, 700);
    return () => clearTimeout(timer);
  }, [raw, ready]);
  useEffect(() => { const timer = setTimeout(() => setPreviewProject(project), 250); return () => clearTimeout(timer); }, [project]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if (!bridge && dirty) { e.preventDefault(); } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  const publishHinana = () => void run(async () => {
    setPublishError(''); setPublishPending(true); publishingRef.current = true;
    try { const result = await bridge!.hinanaPublish(JSON.stringify(projectRef.current), description); if (result) { setPublication(result); setNotice('hinana.moe 작품 일람에 게시했습니다.'); } else setNotice('브라우저 게시를 취소했습니다.'); }
    catch (e) { const message = e instanceof Error ? e.message : String(e); setPublishError(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { publishingRef.current = false; setPublishPending(false); }
  });
  const html = useMemo(() => { try { return readerHTML(previewProject, mode === 'compare' ? undefined : chapter.id); } catch { return '<p>미리보기를 만들 수 없습니다. 작품 분량과 설정을 확인해 주세요.</p>'; } }, [previewProject, chapter.id, mode]);
  const add = () => { const c = { id: crypto.randomUUID(), title: `새로운 글 ${project.chapters.length + 1}`, text: '' }; update(p => ({ ...p, chapters: [...p.chapters, c] })); setSelected(c.id); };
  const move = (delta: number) => { const index = project.chapters.findIndex(c => c.id === chapter.id); if (index + delta < 0 || index + delta >= project.chapters.length) return; const chapters = [...project.chapters]; [chapters[index], chapters[index + delta]] = [chapters[index + delta], chapters[index]]; update(p => ({ ...p, chapters })); };
  const importText = () => void run(async () => { if (!bridge) { setNotice('글 가져오기는 Electron 앱에서 사용해 주세요.'); return; } const chapters = await bridge.importText(); if (chapters?.length) { const p = { ...projectRef.current, chapters: [...projectRef.current.chapters, ...chapters] }; parseProject(JSON.stringify(p)); setProject(p); setSelected(chapters[0].id); setNotice(`${chapters.length}개의 글을 가져왔습니다.`); } });
  const exportWeb = () => void run(async () => { const p = projectRef.current; if (bridge) { const path = await bridge.export(JSON.stringify(p)); if (!path) return; setNotice(`웹 독서 파일을 내보냈습니다: ${path}`); } else { download(`${p.title || 'novel'}.html`, readerHTML(p), 'text/html'); setNotice('웹 독서 파일을 다운로드했습니다.'); } setExportDialog(false); });
  return <div className="app">
    <header className="app-header"><div className="brand"><img src="./novel-icon-source.png" alt=""/><div>Hinana Studio <strong>Novel</strong><small>문장을 위한 독서 작업실</small></div></div><nav className="workflow-tabs" aria-label="작업 모드">{([['edit', '글 작업', FileText], ['preview', '미리보기', BookOpen], ['compare', '환경 비교', Columns2]] as const).map(([id, label, Icon], index) => <button key={id} aria-label={label} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}><small>0{index + 1}</small><Icon size={16}/>{label}</button>)}</nav><div className="header-actions"><button onClick={() => void command('open')} disabled={busy} title="프로젝트 열기 (⌘/Ctrl+O)"><FolderOpen size={16}/>열기</button><button onClick={() => void command('save')} disabled={busy} title="프로젝트 저장 (⌘/Ctrl+S)"><Save size={16}/>저장</button><button className="primary" onClick={() => setExportDialog(true)} disabled={busy}><Upload size={16}/>웹으로 내보내기</button></div></header>
    <div className={`workspace workspace-${mode}`}>
    <aside className="library"><div className="panel-heading">내 원고<button className="icon" title="새 작품" onClick={() => void command('new')} disabled={busy}><FilePlus2 size={16}/></button></div><div className="project-card"><BookOpen size={25}/><div><strong>{project.title || '이름 없는 작품'}</strong><small>{project.chapters.length}개의 글 · {total.toLocaleString()}자</small></div></div><label className="field">작품명<input aria-label="작품명" value={project.title} maxLength={300} onChange={e => update(p => ({ ...p, title: e.target.value }))}/></label><label className="field">지은이<input aria-label="지은이" value={project.author} placeholder="이름 또는 필명" maxLength={300} onChange={e => update(p => ({ ...p, author: e.target.value }))}/></label><div className="section-heading">글 목록<span>{String(project.chapters.length).padStart(2, '0')}</span></div><div className="chapter-list">{project.chapters.map((c, i) => <button className={`chapter ${chapter.id === c.id ? 'selected' : ''}`} key={c.id} onClick={() => setSelected(c.id)}><span className="chapter-number">{String(i + 1).padStart(2, '0')}</span><div><strong>{c.title || '제목 없는 글'}</strong><small>{count(c.text)}자</small></div><ChevronRight size={13}/></button>)}</div><button className="add-chapter" onClick={add} disabled={project.chapters.length >= 500}><Plus size={15}/>글 추가</button><button className="import-text" onClick={importText} disabled={busy}><Download size={15}/>텍스트 파일 가져오기</button><div className="library-bottom"><button onClick={() => setHelp(true)}><Info size={14}/>사용 안내</button><button onClick={() => setAbout(true)}><img src="./novel-icon-source.png" alt=""/>프로그램 정보</button></div></aside>
    <main className={`main mode-${mode}`}><div className="editor-heading"><div><div className="breadcrumb">{project.title || '이름 없는 작품'}<ChevronRight size={12}/>{mode === 'edit' ? '원고 작성' : mode === 'preview' ? '독서 미리보기' : '화면 크기 비교'}</div><h1>{mode === 'edit' ? chapter.title || '제목 없는 글' : mode === 'compare' ? '두 화면에서 읽어보기' : '읽는 모습 다듬기'}</h1></div><div className="project-status"><span className={dirty ? 'dot' : 'dot green'}/>{dirty ? '저장하지 않은 변경' : filePath ? '저장됨' : '변경 없음'}</div></div>
      <div className="work-toolbar"><div className="workspace-context">{mode === 'edit' ? <><FileText size={14}/><span>원고에 집중하세요. 읽는 모습은 미리보기에서 확인합니다.</span></> : <><span className="dot green"/><span>{mode === 'compare' ? '같은 글 · 같은 독서 설정 · 다른 화면 크기' : '선택한 글에 독서 설정을 실시간으로 적용합니다.'}</span></>}</div>{mode !== 'edit' && <div className="device-controls"><Monitor size={14}/><select aria-label="미리보기 기기" value={device} onChange={e => setDevice(e.target.value)}>{Object.entries(devices).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><button className={landscape ? 'active' : ''} onClick={() => setLandscape(!landscape)} title="화면 가로·세로 전환" aria-label="화면 가로·세로 전환"><RotateCw size={15}/>{landscape ? '가로' : '세로'}</button></div>}</div>
      <div className="canvas">{mode === 'edit' && <section className="manuscript"><div className="manuscript-bar"><span><FileText size={14}/>원고</span><div><button className="icon" title="글 위로 이동" aria-label="글 위로 이동" disabled={chapter.id === project.chapters[0].id} onClick={() => move(-1)}><ArrowUp size={14}/></button><button className="icon" title="글 아래로 이동" aria-label="글 아래로 이동" disabled={chapter.id === project.chapters.at(-1)!.id} onClick={() => move(1)}><ArrowDown size={14}/></button><button className="icon" title="글 삭제" aria-label="글 삭제" disabled={project.chapters.length === 1} onClick={() => setDeleteId(chapter.id)}><Trash2 size={14}/></button></div></div><input className="chapter-title" aria-label="글 제목" maxLength={300} value={chapter.title} placeholder="글 제목" onChange={e => patchChapter({ title: e.target.value })}/><textarea key={chapter.id} aria-label="원고" value={chapter.text} maxLength={2_000_000} placeholder="이곳에 글을 쓰거나 붙여 넣으세요.\n\n빈 줄을 넣으면 문단이 나뉩니다." onChange={e => patchChapter({ text: e.target.value })} spellCheck={false}/><div className="manuscript-footer"><span>{count(chapter.text)}자 · 공백 포함</span><span>일반 텍스트</span></div></section>}
      {mode !== 'edit' && <div className="preview-pane"><Preview html={html} device={device} landscape={landscape}/>{mode === 'compare' && <div className="comparison"><div className="comparison-select"><select aria-label="비교 기기" value={compareDevice} onChange={e => setCompareDevice(e.target.value)}>{Object.entries(devices).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></div><Preview html={html} device={compareDevice} landscape={landscape}/></div>}</div>}</div><div className="canvas-note"><Info size={12}/>{mode === 'edit' ? '빈 줄로 문단을 나눌 수 있습니다. 글 순서는 왼쪽 목록에 반영됩니다.' : `${mode === 'compare' ? '전체 작품' : '선택한 글'}을 축소 표시합니다. 실제 기기에서는 브라우저 화면 크기를 따릅니다.`}</div>
    </main>
    {mode !== 'edit' && <aside className="inspector"><div className="panel-heading"><span><Settings2 size={16}/>독서 설정</span><span className="tiny-label">READING</span></div><div className="inspector-scroll"><div className="settings-section"><h2><Type size={14}/>글꼴과 문장</h2><label className="field">글꼴<select aria-label="글꼴" value={project.settings.font} onChange={e => settings({ font: e.target.value as Settings['font'] })}><option value="serif">명조 · Serif</option><option value="sans">고딕 · Sans serif</option><option value="mono">고정폭 · Monospace</option>{project.customFont && <option value="custom">{project.customFont.name}</option>}</select></label><button className="font-import" disabled={busy} onClick={() => void run(async () => { if (!bridge) { setNotice('글꼴 가져오기는 Electron 앱에서 사용해 주세요.'); return; } const customFont = await bridge.font(); if (customFont) update(p => ({ ...p, customFont, settings: { ...p.settings, font: 'custom' } })); })}><Plus size={13}/>글꼴 파일 포함하기</button><p className="help">기본 글꼴은 운영체제에 따라 달라집니다. 같은 글꼴로 비교하려면 파일을 포함해 주세요.</p><Range label="글자 크기" value={project.settings.fontSize} unit="px" min={12} max={40} onChange={fontSize => settings({ fontSize })}/><Range label="줄 간격" value={project.settings.lineHeight} unit="배" min={1.2} max={2.8} step={0.1} onChange={lineHeight => settings({ lineHeight })}/><Range label="자간" value={project.settings.letterSpacing} unit="px" min={-1} max={3} step={0.1} onChange={letterSpacing => settings({ letterSpacing })}/></div>
    <div className="settings-section"><h2><BookOpen size={14}/>페이지</h2><label className="field">읽기 방식</label><div className="segmented full"><button className={project.settings.reading === 'scroll' ? 'active' : ''} onClick={() => settings({ reading: 'scroll' })}>스크롤</button><button className={project.settings.reading === 'pages' ? 'active' : ''} onClick={() => settings({ reading: 'pages' })}>책처럼 읽기</button></div>{project.settings.reading === 'pages' && <label className="field">페이지 펼침<select aria-label="페이지 펼침" value={project.settings.spread} onChange={e => settings({ spread: e.target.value as Settings['spread'] })}><option value="auto">화면에 맞춰 자동</option><option value="single">한 쪽 보기</option><option value="double">두 쪽 보기</option></select></label>}<label className="field">글 방향</label><div className="segmented full"><button className={project.settings.writing === 'horizontal' ? 'active' : ''} onClick={() => settings({ writing: 'horizontal' })}>가로쓰기</button><button className={project.settings.writing === 'vertical' ? 'active' : ''} onClick={() => settings({ writing: 'vertical' })}>세로쓰기</button></div><Range label="본문 최대 너비" value={project.settings.width} unit="px" min={320} max={1000} step={20} onChange={width => settings({ width })}/><Range label="페이지 여백" value={project.settings.padding} unit="px" min={16} max={80} step={4} onChange={padding => settings({ padding })}/><label className="field">문장 정렬<select aria-label="문장 정렬" value={project.settings.align} onChange={e => settings({ align: e.target.value as Settings['align'] })}><option value="left">왼쪽 정렬</option><option value="justify">양쪽 정렬</option></select></label><label className="check-field"><input type="checkbox" checked={project.settings.indent} onChange={e => settings({ indent: e.target.checked })}/>문단 첫 줄 들여쓰기</label></div>
    <div className="settings-section"><h2>종이의 색</h2><div className="theme-options">{([['paper', '종이'], ['sepia', '세피아'], ['night', '밤']] as const).map(([id, label]) => <button className={project.settings.theme === id ? 'selected' : ''} key={id} aria-label={label} onClick={() => settings({ theme: id })}><span className={`swatch ${id}`}>가{project.settings.theme === id && <Check size={12}/>}</span>{label}</button>)}</div></div><div className="preset-card"><span>처음의 읽기 설정</span><p>18px 명조, 넉넉한 줄 간격,<br/>따뜻한 종이색으로 돌아갑니다.</p><button onClick={() => update(p => ({ ...p, settings: createProject().settings }))}>기본 설정으로 복원</button></div></div></aside>}</div>
    <footer className="statusbar"><span><span className="dot green"/>{recoveryStatus}</span><span className="file-path" title={filePath}>{filePath || '프로젝트 파일로 저장해 보관하세요'}</span><span>{project.chapters.length}개의 글 · {total.toLocaleString()}자</span></footer>
    {notice && <div className="toast" role="status"><Info size={17}/><span>{notice}</span><button aria-label="알림 닫기" onClick={() => setNotice('')}><X size={14}/></button></div>}
    {exportDialog && <div className="overlay"><section role="dialog" aria-modal="true" aria-labelledby="export-title" className="modal export-modal"><button className="modal-close" aria-label="내보내기 닫기" onClick={() => setExportDialog(false)} disabled={busy}><X size={18}/></button><span className="modal-icon"><Upload size={25}/></span><div className="eyebrow">TAKE YOUR WORDS ANYWHERE</div><h2 id="export-title">당신의 글을, 어디서든.</h2><div className="export-targets" aria-label="내보내기 대상"><button className={exportTarget === 'html' ? 'selected' : ''} disabled={busy} onClick={() => setExportTarget('html')}><FileText size={17}/><strong>HTML 파일</strong><small>어느 서버에서나 자유롭게</small></button><button aria-label="hinana.moe로 내보내기" className={exportTarget === 'hinana' ? 'selected' : ''} disabled={busy} onClick={() => setExportTarget('hinana')}><BookOpen size={17}/><strong>hinana.moe</strong><small>비나래 라운지 작품 일람</small></button></div><div className="export-summary"><BookOpen size={23}/><div><strong>{project.title || '이름 없는 작품'}</strong><small>{project.chapters.length}개의 글 · {total.toLocaleString()}자 · {project.settings.writing === 'vertical' ? '세로쓰기' : '가로쓰기'} · {project.settings.fontSize}px</small></div><span>{exportTarget === 'html' ? '.html' : 'WEB'}</span></div>
    {exportTarget === 'html' ? <><p>모든 글과 현재 독서 설정을 하나의 HTML 파일에 담습니다.<br/>파일을 브라우저에서 열거나 정적 웹 서버에 올려 주세요.</p><ul className="export-notes"><li>외부 라이브러리 없이 동작하며, 목차가 포함됩니다.</li><li>{project.customFont ? `사용자 글꼴 ${project.customFont.name}이 포함됩니다.` : '시스템 글꼴은 기기별로 다르게 표시될 수 있습니다.'}</li><li>서버 업로드는 직접 진행합니다. index.html로 올리면 첫 화면으로 열립니다.</li></ul><button className="primary export-button" disabled={busy} onClick={exportWeb}><Download size={17}/>{busy ? '내보내는 중…' : 'HTML 파일로 내보내기'}</button></> : <div className="hinana-export"><p>비나래 라운지의 <strong>작품 일람</strong>에 모든 글과 독서 설정을 게시합니다. 게시한 작품은 누구나 읽을 수 있습니다. 같은 프로젝트를 다시 게시하면 기존 주소의 내용이 갱신됩니다.</p><div className="connection-card browser-flow"><BookOpen size={18}/><div><strong>기본 브라우저에서 확인</strong><span>사이트 로그인과 게시 승인은 브라우저에서 진행합니다.</span></div></div><label className="field">작품 소개<textarea aria-label="작품 소개" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="독자에게 전할 짧은 소개 (선택)" disabled={busy}/></label>{!bridge && <p className="publish-error">hinana.moe 연동은 Electron 데스크톱 앱에서 사용할 수 있습니다.</p>}{publishError && <p className="publish-error" role="alert">{publishError}</p>}{publication?.id && <div className="publication-result" role="status"><strong>작품이 게시되었습니다.</strong><span>{publication.url}</span><button onClick={() => void run(async () => { await bridge!.hinanaOpen(publication.id); })}>게시한 작품 열기 ↗</button></div>}<button className="primary export-button" disabled={busy || !bridge} onClick={publishHinana}><Upload size={17}/>{publishPending ? '브라우저에서 승인 대기 중…' : publication ? '외부 브라우저에서 다시 게시' : '외부 브라우저에서 게시'}</button>{publishPending && <div className="browser-pending" role="status"><p>열린 브라우저에서 로그인한 뒤 게시를 승인해 주세요. 완료 결과는 자동으로 돌아옵니다.</p><div><button onClick={() => void bridge!.hinanaReopen().catch(error)}>브라우저 다시 열기</button><button onClick={() => void bridge!.hinanaCancel().catch(error)}>게시 취소</button></div></div>}<button className="works-link" disabled={busy || !bridge} onClick={() => void run(async () => { await bridge!.hinanaOpen(); })}>작품 일람 열기 ↗</button></div>}
    </section></div>}
    {deleteId && <div className="overlay"><section role="dialog" aria-modal="true" className="modal small-modal"><h2>이 글을 삭제하시겠습니까?</h2><p>‘{project.chapters.find(c => c.id === deleteId)?.title}’의 원고가 삭제됩니다.</p><div className="dialog-actions"><button onClick={() => setDeleteId(null)}>취소</button><button className="danger" onClick={() => { update(p => ({ ...p, chapters: p.chapters.filter(c => c.id !== deleteId) })); setDeleteId(null); }}>삭제</button></div></section></div>}
    {help && <div className="overlay"><section className="modal" role="dialog" aria-modal="true"><button className="modal-close" aria-label="안내 닫기" onClick={() => setHelp(false)}><X size={18}/></button><span className="modal-icon"><BookOpen size={25}/></span><h2>사용 안내</h2><p>같은 글을 여러 환경에서 읽어 보기 위한 독서 스튜디오입니다.</p><ul className="export-notes"><li>글을 입력하거나 UTF-8 .txt / .md 파일을 가져오세요. Markdown은 일반 텍스트로 표시됩니다.</li><li>독서 설정에서 글꼴, 크기, 줄 간격과 글 방향을 조절하세요.</li><li>환경 비교는 화면 크기 프리셋을 사용합니다. 실제 기기의 글꼴 렌더링과 색을 재현하는 시뮬레이터는 아닙니다.</li><li>⌘/Ctrl+S로 .hinananovel 프로젝트를 저장하고, HTML로 내보내 다른 기기에서 확인하세요.</li><li>자동 복구는 마지막 작업 한 개를 보관합니다. 중요한 글은 프로젝트 파일로 저장해 주세요.</li><li>글꼴을 배포할 때는 해당 글꼴의 웹 임베딩 허용 여부를 확인해 주세요.</li></ul><small className="muted">Version 0.1.0 · Hinana Studio</small></section></div>}
    {about && <About onClose={() => setAbout(false)}/>}
    {(!ready || busy) && <div className="busy-indicator" role="status">{ready ? publishPending ? '브라우저에서 게시 확인 중…' : '파일 작업 중…' : '작업 공간을 준비하고 있습니다…'}</div>}
  </div>;
}
function Range({ label, value, unit, min, max, step = 1, onChange }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (value: number) => void }) { return <label className="range-field"><span>{label}<b>{value}<small>{unit}</small></b></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
