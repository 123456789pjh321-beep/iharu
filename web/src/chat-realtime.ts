import {z} from 'zod';
import type {RealtimeClient} from '@supabase/realtime-js';
export type ChatConnectionState='CONNECTING'|'LIVE'|'POLLING'|'PAUSED';
const ready=z.object({state:z.literal('AVAILABLE'),url:z.url(),publishableKey:z.string().min(1),topic:z.string(),token:z.string(),expiresAt:z.iso.datetime()});
const response=z.object({data:z.union([z.object({state:z.literal('POLLING')}),ready])});
const event=z.object({message_event_id:z.uuid(),version:z.number().int().nonnegative()}).strict();
export type ClientFactory=(url:string,key:string)=>Promise<RealtimeClient>;
const factory:ClientFactory=async(url,key)=>{const {RealtimeClient}=await import('@supabase/realtime-js');return new RealtimeClient(url+'/realtime/v1',{params:{apikey:key},timeout:8000});};
// This controller owns exactly one open room; no token or conversation is persisted.
export function startChatRealtime(options:{loadToken:()=>Promise<unknown>;change:()=>void;status:(s:ChatConnectionState)=>void;denied:(e:unknown)=>void},createClient:ClientFactory=factory){
 let generation=0,active=false,client:RealtimeClient|undefined,timer:ReturnType<typeof setTimeout>|undefined,coalesce:ReturnType<typeof setTimeout>|undefined;
 const clear=()=>{clearTimeout(timer);clearTimeout(coalesce);if(client){client.disconnect();client=undefined;}};
 const later=(n:number,g:number)=>{clearTimeout(timer);timer=setTimeout(()=>{if(active&&g===generation)void connect();},n);};
 async function connect(){
  const g=++generation;clear();options.status('CONNECTING');
  try{
   const token=response.parse(await options.loadToken()).data;if(!active||g!==generation)return;
   if(token.state==='POLLING'){options.status('POLLING');later(60000,g);return;}
   const created=await createClient(token.url,token.publishableKey);
   if(!active||g!==generation){created.disconnect();return;}client=created;
   await created.setAuth(token.token);if(!active||g!==generation)return;
   const renewIn=Date.parse(token.expiresAt)-Date.now()-30000;if(renewIn<=0)throw new Error('EXPIRED_TOKEN');
   // Re-authorize before expiry even if a socket reconnect succeeds on its own.
   later(renewIn,g);
   created.channel(token.topic,{config:{private:true,broadcast:{self:false}}})
    .on('broadcast',{event:'change'},({payload})=>{
     if(!active||g!==generation||!event.safeParse(payload).success)return;
     clearTimeout(coalesce);coalesce=setTimeout(()=>{if(active&&g===generation)options.change();},80);
    }).subscribe(state=>{
     if(!active||g!==generation)return;
     if(state==='SUBSCRIBED'){options.status('LIVE');options.change();}
     else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(state)){options.status('POLLING');later(15000,g);}
    });
  }catch(e){
   if(!active||g!==generation)return;
   if(['AUTH_REQUIRED','ACCESS_NOT_READY','DEVICE_REQUIRED','NOT_FOUND','FORBIDDEN'].includes((e as {code?:string}).code||'')){
    active=false;generation++;clear();options.status('PAUSED');options.denied(e);
   }else{options.status('POLLING');later(15000,g);}
  }
 }
 return {refresh(){if(active)void connect();},setActive(value:boolean){if(value===active)return;active=value;generation++;clear();if(value)void connect();else options.status('PAUSED');},close(){active=false;generation++;clear();}};
}

