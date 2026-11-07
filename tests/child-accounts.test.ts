import {it,expect} from 'vitest';
import {createApp} from '../server/app';
import {childPasswordHash,childPasswordMatches} from '../server/child-accounts/routes';
it('retires child-issued family approval numbers',async()=>{const app=createApp({environment:'local',demoEnabled:false},()=>null,async()=>null);for(const op of ['register','renew','resolve','approve','finish']){const r=await app.request('http://localhost/api/v1/child-accounts/'+op,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:'{}'});expect(r.status).toBe(410);}});
it('uses salted password hashes and rejects wrong passwords',async()=>{const a=await childPasswordHash('fixture-only-password'),b=await childPasswordHash('fixture-only-password');expect(a).not.toBe(b);expect(await childPasswordMatches('fixture-only-password',a)).toBe(true);expect(await childPasswordMatches('wrong',a)).toBe(false);});
