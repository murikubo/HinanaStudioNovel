import { chromium, _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createProject, readerHTML } from '../shared/core.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),tmp=await mkdtemp(path.join(os.tmpdir(),'novel-pages-'));
const out=path.join(root,'test-results');await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});let app,fixture;
const sample=createProject();sample.title='책장을 넘기는 시간';sample.author='비나래';sample.settings.reading='pages';sample.settings.font='sans';
const paragraph='문장은 화면의 끝에서 끊기지 않고 다음 장으로 이어집니다. 👨‍👩‍👧‍👦 한글과 e\u0301, 작은 표정 🙂도 함께 읽습니다. ';
sample.chapters=[{id:'one',title:'첫 번째 장 · 오후의 문장',text:Array.from({length:6},(_,i)=>'문단 '+i+' — '+paragraph.repeat(10)).join('\n\n')},{id:'two',title:'두 번째 장 · 책장 너머',text:paragraph.repeat(12)+'\n\n마지막 문장입니다.'}];
const ready=async page=>{await page.locator('#page-stage[data-ready="true"]').waitFor();};
try{
  for(const writing of ['horizontal','vertical']) for(const [name,width,height] of [['phone',390,844],['tablet',744,1133],['wide',1280,800]]){
    const p=structuredClone(sample);p.settings.writing=writing;const file=path.join(tmp,writing+'-'+name+'.html');await writeFile(file,readerHTML(p));
    const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(file).href);await ready(page);
    const count=await page.locator('.reader-page').count();assert.ok(count>2);
    const metrics=await page.locator('.page-content').evaluateAll(nodes=>nodes.map(n=>({height:n.scrollHeight,h:n.clientHeight,width:n.scrollWidth,w:n.clientWidth})));
    assert.ok(metrics.every(m=>m.height<=m.h+1&&m.width<=m.w+1),'no clipped text '+writing+' '+name+' '+JSON.stringify(metrics.filter(m=>m.height>m.h+1||m.width>m.w+1)));
    const texts=await page.locator('.reader-page').evaluateAll(nodes=>nodes.sort((a,b)=>Number(a.dataset.pageIndex)-Number(b.dataset.pageIndex)).map(n=>n.textContent).join(''));
    assert.equal(texts,await page.locator('.book').evaluate(e=>e.textContent),'pagination preserves every character');
    assert.equal(await page.locator('#page-spread>.reader-page').count(),width>=900?2:1);
    await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
    const after=Number(await page.locator('#page-spread>.reader-page').first().getAttribute('data-start'));assert.ok(after>0);
    await page.keyboard.press(writing==='vertical'?'ArrowLeft':'ArrowRight');
    const further=Number(await page.locator('#page-spread>.reader-page').first().getAttribute('data-start'));assert.ok(further>after);
    await page.screenshot({path:path.join(out,'reader-'+writing+'-'+name+'.png')});
    await page.reload();await ready(page);const restored=Number(await page.locator('#page-spread>.reader-page').first().getAttribute('data-start'));assert.equal(restored,further);
    await page.setViewportSize({width:height,height:width});await page.waitForTimeout(200);await ready(page);
    const visible=await page.locator('#page-spread>.reader-page').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.pageIndex)));
    const starts=await page.locator('.reader-page').evaluateAll(nodes=>nodes.sort((a,b)=>Number(a.dataset.pageIndex)-Number(b.dataset.pageIndex)).map(n=>Number(n.dataset.start)));
    assert.ok(starts[visible[0]]<=further&&(starts[visible.at(-1)+1]===undefined||starts[visible.at(-1)+1]>further),'reflow retains reading position');
    await page.getByText('목차',{exact:true}).click();await page.getByRole('link',{name:'두 번째 장 · 책장 너머',exact:true}).click();
    assert.ok(await page.locator('#page-spread').innerText().then(text=>text.includes('두 번째 장')));
    await page.keyboard.press('End');assert.equal(await page.getByRole('button',{name:'다음 페이지',exact:true}).isDisabled(),true);
    await page.keyboard.press('Home');assert.equal(await page.getByRole('button',{name:'이전 페이지',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'스크롤 읽기',exact:true}).click();assert.equal(await page.locator('.scroll').isVisible(),true);
    await page.getByRole('button',{name:'책처럼 읽기',exact:true}).click();await ready(page);assert.deepEqual(errors,[]);await page.close();
  }
  // Touch interaction and embedded-font layout use actual browser input and font loading.
  const touchFile=path.join(tmp,'touch.html');await writeFile(touchFile,readerHTML(sample));
  const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const touch=await touchContext.newPage();await touch.goto(pathToFileURL(touchFile).href);await ready(touch);
  const cdp=await touchContext.newCDPSession(touch);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:400}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:400}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await touch.waitForFunction(()=>Number(document.querySelector('#page-spread>.reader-page').dataset.start)>0);await touchContext.close();
  if(process.platform==='darwin'){
    const custom=structuredClone(sample);custom.settings.font='custom';custom.customFont={name:'Arial.ttf',data:'data:font/ttf;base64,'+(await readFile('/System/Library/Fonts/Supplemental/Arial.ttf')).toString('base64')};
    const file=path.join(tmp,'embedded-font.html');await writeFile(file,readerHTML(custom));const fontPage=await browser.newPage({viewport:{width:390,height:844}});await fontPage.goto(pathToFileURL(file).href);await fontPage.evaluate(()=>document.fonts.ready);await ready(fontPage);
    assert.ok(await fontPage.evaluate(()=>document.fonts.check('18px NovelCustom')));
    assert.ok(await fontPage.locator('.page-content').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1&&n.scrollWidth<=n.clientWidth+1)));await fontPage.close();
  }
  // Actual editor iframe uses the fixed script hash under an opaque sandbox.
  const env={...process.env,HINANA_NOVEL_DATA_DIR:path.join(tmp,'app')};await mkdir(env.HINANA_NOVEL_DATA_DIR);delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:[root],env});const editor=await app.firstWindow();await editor.getByText('자동 복구 기록 완료',{exact:true}).waitFor();
  await editor.getByRole('button',{name:'미리보기',exact:true}).click();await editor.getByRole('button',{name:'책처럼 읽기',exact:true}).click();
  const frame=editor.frameLocator('iframe');await frame.locator('#page-stage[data-ready="true"]').waitFor();
  const isolation=await frame.locator('body').evaluate(()=>{try{return typeof window.parent.novel;}catch{return 'isolated';}});assert.equal(isolation,'isolated');
  await editor.screenshot({path:path.join(out,'13-book-preview.png')});await app.evaluate(({app})=>app.exit(0));await app.close();app=null;
  // Published reader stores bookmarks in its parent without exposing that parent's origin.
  const require=createRequire(import.meta.url);fixture=await require('../../hinana.moe/scripts/novel-test-server.cjs').startNovelTestServer();
  const work=require('../../hinana.moe/dist/services/novel.service').publishNovel(JSON.stringify(sample));
  const hostedContext=await browser.newContext({viewport:{width:744,height:1133}});const hosted=await hostedContext.newPage();await hosted.goto(fixture.origin+work.url);
  const child=hosted.frameLocator('iframe');await child.locator('#page-stage[data-ready="true"]').waitFor();await child.getByRole('button',{name:'다음 페이지',exact:true}).click();
  const saved=Number(await child.locator('#page-spread>.reader-page').first().getAttribute('data-start'));await hosted.waitForFunction(key=>!!localStorage.getItem(key),'hinana-novel-position:'+sample.id);
  await hosted.reload();await child.locator('#page-stage[data-ready="true"]').waitFor();await hosted.waitForTimeout(100);
  assert.equal(Number(await child.locator('#page-spread>.reader-page').first().getAttribute('data-start')),saved);
  assert.equal(await child.locator('body').evaluate(()=>{try{return typeof parent.document;}catch{return 'isolated';}}),'isolated');
  const separate=await hosted.context().newPage();const childSize=await hosted.locator('iframe').boundingBox();await separate.setViewportSize({width:Math.round(childSize.width),height:Math.round(childSize.height)});await separate.goto(fixture.origin+work.url+'/read');await ready(separate);
  assert.equal(Number(await separate.locator('#page-spread>.reader-page').first().getAttribute('data-start')),saved);await separate.close();
  await hostedContext.close();
  console.log('PASS: paginated horizontal/vertical reader at 3 viewports; exact text preservation, unclipped pages, spreads, keys, TOC, bookmark/reflow, Electron CSP/sandbox and hosted reader bookmark bridge.');
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await browser.close();await fixture?.close();await rm(tmp,{recursive:true,force:true});}
