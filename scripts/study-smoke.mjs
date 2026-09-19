import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const url=process.argv[2]||'http://127.0.0.1:3001/paper/study-abroad/index.html';
const profile=`${process.cwd()}/artifacts/study-profile-${process.pid}`;
await mkdir(profile,{recursive:true});
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;const errors=[];
try{
 let port;for(let i=0;i<100&&!port;i++){await sleep(100);try{port=(await readFile(`${profile}/DevToolsActivePort`,'utf8')).split('\n')[0];}catch{}}
 assert.ok(port,'Chrome started');
 const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(d.error):p.resolve(d.result);}if(d.method==='Runtime.exceptionThrown')errors.push(d.params);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error(method)),12000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
 const js=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url});
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.pin').length>0"))break;await sleep(100);}
 assert.equal(await js("document.querySelectorAll('.school-item').length"),24);
 assert.ok(await js("document.querySelectorAll('.state').length>=50 && document.querySelector('#map-error').hidden"));
 assert.ok(await js("places.every(s=>projection([s.lon,s.lat])?.every(Number.isFinite))"));
 assert.equal(await js("document.querySelectorAll('.school-item.company').length"),12);
 assert.ok(await js("[...document.querySelectorAll('.pin.cluster text')].every(el=>!/^\\d+$/.test(el.textContent) && el.textContent.length>0)"));
 await js("document.querySelector('[data-place=stanford]').click()");await sleep(700);
 assert.ok(await js("document.querySelector('#detail h2').textContent.includes('Stanford') && transform.k===5"));
 await js("document.querySelector('#save-school').click();document.querySelector('#saved').click()");
 assert.equal(await js("document.querySelectorAll('.school-item').length"),1);
 await call('Page.reload');await sleep(1200);await js("document.querySelector('#saved').click()");assert.equal(await js("document.querySelectorAll('.school-item').length"),1);
 await js("document.querySelector('#saved').click();document.querySelector('#search').value='CMU';document.querySelector('#search').dispatchEvent(new Event('input'))");assert.equal(await js("document.querySelectorAll('.school-item').length"),1);
 await js("document.querySelector('#search').value='zzzzz';document.querySelector('#search').dispatchEvent(new Event('input'))");assert.equal(await js("document.querySelectorAll('.pin').length"),0);
 await js("document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('#region').value='west';document.querySelector('#region').dispatchEvent(new Event('change'))");assert.equal(await js("document.querySelectorAll('.school-item').length"),13);
 await js("document.querySelector('[data-kind=company]').click()");assert.equal(await js("document.querySelectorAll('.school-item').length"),8);
 await js("document.querySelector('[data-place=waymo]').click()");await sleep(700);assert.ok(await js("document.querySelector('#detail h2').textContent==='Waymo' && document.querySelector('#detail').textContent.includes('Autonomous driving')"));
 await js("document.querySelector('[data-kind=all]').click()");
 await js("document.querySelector('#region').value='all';document.querySelector('#region').dispatchEvent(new Event('change'));document.querySelector('#cities').click()");assert.ok(await js("[...document.querySelectorAll('.city')].every(el=>getComputedStyle(el).display==='none')"));
 await js("document.querySelector('#cities').click();document.querySelector('#valley').click()");await sleep(700);assert.equal(await js('transform.k'),16);
 await js("document.querySelector('#reset').click()");await sleep(700);assert.equal(await js('transform.k'),1);
 assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'));
 let shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('artifacts/study-desktop.png',Buffer.from(shot.data,'base64'));
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
 assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'));
 shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('artifacts/study-mobile.png',Buffer.from(shot.data,'base64'));
 assert.equal(errors.length,0);console.log('PASS: map geometry, 12 universities, 12 companies, type filter, selection, persistence, search, empty state, region filter, city toggle, Silicon Valley, reset, desktop/mobile overflow, no runtime exceptions');
}finally{ws?.close();browser.kill();}
