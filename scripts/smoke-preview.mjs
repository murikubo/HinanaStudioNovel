import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await mkdtemp(path.join(os.tmpdir(),'novel-preview-'));
const env={...process.env,HINANA_NOVEL_DATA_DIR:tmp};delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app=await electron.launch(process.argv.includes('--packaged')?{executablePath:path.join(root,'release/mac-arm64/Hinana Studio Novel.app/Contents/MacOS/Hinana Studio Novel'),env}:{args:[root],env});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.getByText('자동 복구 기록 완료',{exact:true}).waitFor();
  await page.getByLabel('원고',{exact:true}).fill(('문장이 잘리지 않고 기기 화면에 맞춰 표시되는지 확인합니다. '.repeat(20)+'\n\n').repeat(10));
  await page.getByRole('button',{name:'미리보기',exact:true}).click();
  await page.getByRole('button',{name:'책처럼 읽기',exact:true}).click();
  const check=async label=>{
    await page.waitForTimeout(250);
    for(const frame of page.frames().filter(f=>f.parentFrame())) await frame.locator('#page-stage[data-ready="true"]').waitFor();
    const metrics=await page.locator('.device-shell').evaluateAll(nodes=>nodes.map(shell=>{
      const iframe=shell.querySelector('iframe'),s=shell.getBoundingClientRect(),f=iframe.getBoundingClientRect();
      return {scrollLeft:shell.scrollLeft,scrollTop:shell.scrollTop,left:f.left-s.left,top:f.top-s.top,right:s.right-f.right,bottom:s.bottom-f.bottom};
    }));
    console.log(label,metrics);
    for(const m of metrics){assert.equal(m.scrollLeft,0,label+' horizontal frame scroll');assert.equal(m.scrollTop,0,label+' vertical frame scroll');for(const edge of ['left','top','right','bottom'])assert.ok(Math.abs(m[edge]-8)<1,label+' '+edge+' '+m[edge]);}
  };
  await check('initial');
  const child=()=>page.frameLocator('iframe').first();
  // Playwright's cross-frame click coordinates omit the outer CSS transform.
  // Send real mouse input using the reader's local rect and the rendered scale.
  const clickReader=async name=>{
    const button=child().getByRole('button',{name,exact:true});await button.waitFor();
    await button.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
    const rect=await button.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    const iframe=page.locator('iframe').first();const box=await iframe.boundingBox();const width=await iframe.evaluate(el=>el.clientWidth);
    await page.mouse.click(box.x+rect.x*box.width/width,box.y+rect.y*box.width/width);
  };
  await clickReader('다음 페이지');
  await child().locator('#page-prev').isEnabled().then(value=>assert.ok(value,'real mouse advances the page')); await check('next button');
  for(const device of ['phone','tablet','mini','desktop']){await page.getByLabel('미리보기 기기',{exact:true}).selectOption(device);await check(device);}
  await clickReader('스크롤 읽기');
  await child().locator('body[data-reading=scroll]').waitFor();
  await clickReader('책처럼 읽기');await check('mode toggle');
  await page.getByLabel('화면 가로·세로 전환',{exact:true}).click();await check('landscape');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1180,800));await check('resize');
  await page.getByRole('button',{name:'환경 비교',exact:true}).click();await check('compare');
  await page.getByRole('button',{name:'세로쓰기',exact:true}).click();await check('vertical writing');
  await mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/preview-frame-fixed.png')});
  console.log('PASS: scaled reader stays aligned inside the device frame after clicks, reading-mode changes, rotation, resizing and comparison.');
} finally {if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await rm(tmp,{recursive:true,force:true});}
