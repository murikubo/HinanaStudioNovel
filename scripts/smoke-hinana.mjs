import { _electron as electron, chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const {startNovelTestServer}=require('../../hinana.moe/scripts/novel-test-server.cjs');
const fixture=await startNovelTestServer(),data=await fs.mkdtemp(path.join(os.tmpdir(),'novel-browser-publish-'));
const out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});let app,browser;
try {
  const env={...process.env,HINANA_NOVEL_SERVER:fixture.origin,HINANA_NOVEL_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
  const options=process.argv.includes('--packaged')?{executablePath:path.join(root,'release/mac-arm64/Hinana Studio Novel.app/Contents/MacOS/Hinana Studio Novel'),args:[]}:{args:[root]};
  app=await electron.launch({...options,env});const page=await app.firstWindow();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({shell,net})=>{
    globalThis.__external=[];globalThis.__networkCalls=0;
    shell.openExternal=async url=>{globalThis.__external.push(url);};
    globalThis.fetch=async()=>{globalThis.__networkCalls++;throw new Error('Native server requests are prohibited in this flow.');};
    net.fetch=globalThis.fetch;
  });
  const nextURL=async()=>{for(let i=0;i<100;i++){const url=await app.evaluate(()=>globalThis.__external.shift());if(url)return url;await new Promise(r=>setTimeout(r,100));}throw new Error('No external browser handoff.');};
  await page.getByText('자동 복구 기록 완료',{exact:true}).waitFor();
  await page.getByLabel('작품명',{exact:true}).fill('외부 브라우저에서 펼치는 글');await page.getByLabel('지은이',{exact:true}).fill('비나래');
  await page.getByRole('button',{name:'웹으로 내보내기',exact:true}).click();await page.getByRole('button',{name:'hinana.moe로 내보내기',exact:true}).click();
  await page.getByLabel('작품 소개',{exact:true}).fill('로그인과 게시 승인은 평소 쓰던 브라우저에서.');
  await page.getByRole('button',{name:'외부 브라우저에서 게시',exact:true}).click();const firstURL=await nextURL();
  assert.equal(new URL(firstURL).pathname,'/hinana/works/connect');assert.ok(!firstURL.includes('원고를'));
  assert.equal((await app.windows()).length,1,'Electron never opens an embedded account browser');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:960}});const external=await context.newPage();external.setDefaultTimeout(20000);
  await external.goto(firstURL);await external.getByLabel('아이디',{exact:true}).fill('비나래');await external.getByLabel('비밀번호',{exact:true}).fill('novel-integration-only');await external.getByRole('button',{name:'로그인',exact:true}).click();
  await external.getByRole('button',{name:'확인하고 게시',exact:true}).waitFor();
  await external.screenshot({path:path.join(out,'11-external-browser-approval.png')});
  assert.equal(await external.locator('input[type=file]').count(),0);
  await external.getByRole('button',{name:'확인하고 게시',exact:true}).click();
  await page.getByText('작품이 게시되었습니다.',{exact:true}).waitFor();
  const publicationURL=await page.locator('.publication-result>span').innerText();
  const service=require('../../hinana.moe/dist/services/novel.service');assert.equal(service.listNovelWorks().length,1);
  await page.screenshot({path:path.join(out,'12-browser-result-in-novel.png')});
  await page.getByRole('button',{name:'내보내기 닫기',exact:true}).click();await page.getByLabel('원고',{exact:true}).fill('외부 브라우저로 수정한 문장입니다.');
  await page.getByRole('button',{name:'웹으로 내보내기',exact:true}).click();await page.getByRole('button',{name:'외부 브라우저에서 다시 게시',exact:true}).click();await external.goto(await nextURL());
  // Existing external browser session signs in without passing cookies back to Electron.
  await external.getByRole('button',{name:'확인하고 게시',exact:true}).click();await external.getByRole('heading',{name:'작품을 게시했습니다.',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.export-button').disabled);
  assert.equal(await page.locator('.publication-result>span').innerText(),publicationURL);assert.equal(service.listNovelWorks().length,1);
  const visitor=await browser.newPage({viewport:{width:390,height:844}});await visitor.goto(publicationURL);await visitor.frameLocator('iframe').getByText('외부 브라우저로 수정한 문장입니다.',{exact:true}).waitFor();await visitor.close();
  // Native cancellation cleans up the loopback listener and preserves the manuscript.
  await page.getByRole('button',{name:'외부 브라우저에서 다시 게시',exact:true}).click();const cancelURL=await nextURL();await page.getByRole('button',{name:'게시 취소',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.browser-pending'));
  const callback=new URL(cancelURL).searchParams.get('callback');await assert.rejects(fetch(callback));
  // User can also cancel from the browser before approving.
  await page.getByRole('button',{name:'외부 브라우저에서 다시 게시',exact:true}).click();await external.goto(await nextURL());await external.getByRole('link',{name:'취소하고 Novel로 돌아가기',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.browser-pending'));
  assert.equal(service.listNovelWorks().length,1);assert.equal(await app.evaluate(()=>globalThis.__networkCalls),0);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'외부 브라우저에서 다시 게시',exact:true}).click();
  const closingURL = await nextURL();
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2});});
  const closed=page.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;
  await assert.rejects(fetch(new URL(closingURL).searchParams.get('callback')));
  console.log('PASS: external-browser login + explicit approval + manuscript transfer + loopback result; stable URL update; browser/app cancellation. No Electron server requests, embedded login windows, live writes or web file inputs.');
} catch(error){if(browser){for(const context of browser.contexts()){for(const page of context.pages()){console.error('External browser:',page.url(),await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:path.join(out,'external-browser-failure.png')}).catch(()=>{});}}}if(app){const page=await app.firstWindow();await page.screenshot({path:path.join(out,'hinana-failure.png')}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}throw error;}
finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await browser?.close();await fixture.close();await fs.rm(data,{recursive:true,force:true});}
