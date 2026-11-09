import type {Page,Locator} from '@playwright/test';
export async function setEntryTime(root:Page|Locator,label:'시작 시간'|'종료 시간',time:string){
 const [hour,minute]=time.split(':').map(Number);
 await root.getByLabel(`${label} 오전·오후`,{exact:true}).selectOption(hour>=12?'PM':'AM');
 await root.getByLabel(`${label} 시`,{exact:true}).selectOption(String(hour%12||12));
 await root.getByLabel(`${label} 분`,{exact:true}).selectOption(String(minute));
}
