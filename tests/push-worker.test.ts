import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../web/public/sw.js',import.meta.url),'utf8');
function harness(profile='account-a'){
 const handlers:Record<string,(e:any)=>void>={},shown:any[]=[],opened:string[]=[],navigated:string[]=[];
 const context=vm.createContext({URL,Response,AbortController,setTimeout,clearTimeout,profile,Date,Set,
 self:{location:{origin:'https://myiharu.com'},registration:{showNotification:async(title:string,options:object)=>{shown.push({title,...options});},getNotifications:async()=>[]},clients:{matchAll:async()=>[{url:'https://myiharu.com/timetable',navigate:async(u:string)=>navigated.push(u),focus:async()=>{}}],openWindow:async(u:string)=>opened.push(u)},addEventListener:(name:string,fn:any)=>handlers[name]=fn}});
 vm.runInContext(source,context);vm.runInContext('pushProfile=async()=>profile;',context);
 const fire=async(name:string,extra:object)=>{let done:Promise<unknown>|undefined;handlers[name]({...extra,waitUntil:(p:Promise<unknown>)=>done=p});await done;};return{shown,opened,navigated,fire};
}
const payload={title:'아이하루 · 새 대화',body:'private family text',profileId:'account-a',url:'/chat',tag:'iharu-chat',expiresAt:new Date(Date.now()+60000).toISOString()};
it('shows background messages and routes clicks to the correct same-origin menu',async()=>{const h=harness();await h.fire('push',{data:{json:()=>payload}});expect(h.shown[0]).toMatchObject({title:payload.title,body:payload.body,icon:'/push-icon.png',tag:'iharu-chat'});let closed=false;await h.fire('notificationclick',{notification:{data:h.shown[0].data,close:()=>closed=true}});expect(closed).toBe(true);expect(h.navigated).toEqual(['https://myiharu.com/chat']);});
it('never reveals another signed-in account’s text and rejects expired or external destinations',async()=>{const h=harness('account-b');await h.fire('push',{data:{json:()=>payload}});expect(h.shown[0].body).not.toContain('private');expect(h.shown[0].data.url).toBe('/notification-settings');await h.fire('push',{data:{json:()=>({...payload,url:'https://evil.example'})}});await h.fire('push',{data:{json:()=>({...payload,expiresAt:'2000-01-01T00:00:00Z'})}});expect(h.shown).toHaveLength(1);await h.fire('notificationclick',{notification:{data:{url:'https://evil.example',profileId:'account-b'},close:()=>{}}});expect(h.navigated).toEqual(['https://myiharu.com/notification-settings']);});
