import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as core from '../shared/core.mjs';
import { randomBytes } from 'node:crypto';
const require=createRequire(import.meta.url);
const {hinanaPublisher,serverOrigin}=require('../electron/hinana-publish.cjs');
test('loopback handoff checks host, result origin and one-time value; cancel closes listener',async()=>{
  let opened,notify;const launched=new Promise(resolve=>notify=resolve);
  const publisher=hinanaPublisher({core,openExternal:async url=>{opened=url;notify();}});
  const result=publisher.publish(JSON.stringify(core.createProject(true)),'');await launched;
  const callback=new URL(opened).searchParams.get('callback');
  try {
  assert.equal((await fetch(callback,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/x-www-form-urlencoded'},body:''})).status,403);
  const badHost = await new Promise((resolve,reject) => { const req=httpRequest(callback,{headers:{Host:'evil.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(); });
  assert.equal(badHost,403);
  const ticket=randomBytes(32).toString('base64url');const transfer=callback.replace(/\/result$/,'/transfer')+'?ticket='+ticket;
  const document=await(await fetch(transfer)).text();assert.ok(document.includes('multipart/form-data'));assert.ok(!document.includes('type="file"'));
  assert.equal((await fetch(callback,{method:'POST',headers:{Origin:'https://hinana.moe','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ticket:'wrong',result:'{}'})})).status,403);
  } finally { await publisher.cancel(); }
  assert.equal(await result,null);await assert.rejects(fetch(callback));
});
test('publisher origin allows only production HTTPS and loopback development',()=>{
  const before=process.env.HINANA_NOVEL_SERVER;
  try {process.env.HINANA_NOVEL_SERVER='https://evil.example';assert.throws(serverOrigin);process.env.HINANA_NOVEL_SERVER='http://127.0.0.1:5000';assert.equal(serverOrigin(),'http://127.0.0.1:5000');}
  finally {if(before===undefined)delete process.env.HINANA_NOVEL_SERVER;else process.env.HINANA_NOVEL_SERVER=before;}
});
