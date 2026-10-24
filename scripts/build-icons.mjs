// Generate native icons from the user-provided PNG without redrawing the artwork.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source=await readFile(new URL('../public/novel-icon-source.png',import.meta.url));
const imageURL='data:image/png;base64,'+source.toString('base64');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({deviceScaleFactor:1});
 const images=new Map();
 for(const size of [16,32,48,64,128,256,512,1024]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:100vw;height:100vh}</style><img src="${imageURL}"/>`);
  await page.locator('img').evaluate(image => image.decode());
  images.set(size,await page.screenshot({omitBackground:true}));
 }
 const sizes=[16,32,48,64,128,256],header=Buffer.alloc(6+16*sizes.length);
 header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,index)=>{const at=6+index*16,png=images.get(size);header[at]=size%256;header[at+1]=size%256;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;});
 const chunks=[[16,'icp4'],[32,'icp5'],[64,'icp6'],[128,'ic07'],[256,'ic08'],[512,'ic09'],[1024,'ic10']].map(([size,type])=>{const data=images.get(size),chunk=Buffer.alloc(8);chunk.write(type);chunk.writeUInt32BE(data.length+8,4);return Buffer.concat([chunk,data]);});
 const icnsHeader=Buffer.alloc(8);icnsHeader.write('icns');icnsHeader.writeUInt32BE(8+chunks.reduce((n,b)=>n+b.length,0),4);
 const dir=new URL('../build/icons/',import.meta.url);await mkdir(dir,{recursive:true});
 await writeFile(new URL('novel.ico',dir),Buffer.concat([header,...sizes.map(size=>images.get(size))]));
 await writeFile(new URL('novel.icns',dir),Buffer.concat([icnsHeader,...chunks]));
 await writeFile(new URL('../public/novel-icon.png',import.meta.url),images.get(512));
 console.log('Generated provided Novel PNG → multi-resolution ICO/ICNS and runtime PNG.');
}finally{await browser.close();}
