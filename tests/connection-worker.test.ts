import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../web/public/sw.js',import.meta.url),'utf8');
function harness(network:()=>Promise<Response>){
 const handlers:Record<string,(event:any)=>void>={};
 vm.runInNewContext(code,{self:{location:{origin:'https://myiharu.com'},addEventListener:(name:string,fn:any)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},URL,Response,AbortController,setTimeout,clearTimeout,fetch:network});
 const run=(path:string,mode='navigate',method='GET')=>{
  let response:Promise<Response>|undefined;
  handlers.fetch({request:{url:'https://myiharu.com'+path,mode,method},respondWith:(r:Promise<Response>)=>response=r});
  return response;
 };
 return run;
}
describe('connection-only service worker',()=>{
 it('returns a retry page for network loss without exposing the requested URL',async()=>{
  const run=harness(async()=>{throw new Error('offline');});const r=await run('/login?token=private');
  expect(r?.status).toBe(200);expect(r?.headers.get('Cache-Control')).toBe('no-store');
  const html=await r!.text();expect(html).toContain('다시 연결');expect(html).toContain('href="/timetable">시간표로 이동');expect(html).not.toContain('private');
 });
 it('preserves successful live responses and redirects',async()=>{
  for(const status of [200,302,401]){const live=new Response('live',{status});expect(await harness(async()=>live)('/today')).toBe(live);}
 });
 it('offers recovery for a server outage',async()=>{expect(await (await harness(async()=>new Response('',{status:503}))('/today'))!.text()).toContain('잠시 연결할 수 없어요');});
 it('never intercepts API, writes, assets or domain verification',()=>{
  const run=harness(async()=>{throw new Error('must not be fetched');});
  for(const [p,m,verb] of [['/api','navigate','GET'],['/api/auth/callback/google','navigate','GET'],['/api/v1/workspace/me','cors','GET'],['/today','navigate','POST'],['/assets/main.js','cors','GET'],['/.well-known/assetlinks.json','navigate','GET']])expect(run(p,m,verb)).toBeUndefined();
 });
 it('has no cache storage for user data',()=>{expect(code).not.toMatch(/caches\.|cache\.put/);});
});
