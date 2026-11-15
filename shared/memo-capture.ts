import {z} from 'zod';
export const attachmentLimit=2_000_000;
export const memoByteLimit=2_800_000;
export const attachmentCountLimit=4;
export const attachmentKinds=['FILE','AUDIO','SCAN','SKETCH'] as const;
export const attachmentMimes=['application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','audio/aac','image/jpeg','image/png'] as const;
export const memoChecklist=z.array(z.object({id:z.uuid(),text:z.string().trim().min(1).max(240),done:z.boolean()}).strict()).max(50).refine(items=>new Set(items.map(item=>item.id)).size===items.length);
export type ChecklistItem=z.infer<typeof memoChecklist>[number];
export const memoCaptureFields={notebook:z.string().trim().max(40).optional(),bodyFormat:z.enum(['PLAIN','MARKDOWN']).optional(),checklist:memoChecklist.optional()};
export const attachmentMetadata=z.object({name:z.string().trim().min(1).max(120).refine(v=>!/[\x00-\x1f\x7f/\\]/.test(v)),mime:z.enum(attachmentMimes),kind:z.enum(attachmentKinds),size:z.number().int().positive().max(attachmentLimit)}).strict();
export type MemoAttachment=z.infer<typeof attachmentMetadata>&{id:string};
export type MemoAttachmentInput=MemoAttachment|Omit<MemoAttachment,'id'>&{data:string};
export const emptyCapture={notebook:'',bodyFormat:'PLAIN' as const,checklist:[],attachments:[]};
export function base64Bytes(data:string){return Math.floor(data.length*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0);}
export function captureBytes(photos:{id?:string;data?:string}[],attachments:{data?:string;size?:number}[]){return photos.reduce((n,p)=>n+(p.data?base64Bytes(p.data):350000),0)+attachments.reduce((n,a)=>n+(a.size||0),0);}
export function mediaPermissionError(error:unknown,device:'카메라'|'마이크'){
 const name=(error as {name?:string})?.name;
 if(name==='NotAllowedError'||name==='SecurityError')return `${device} 권한이 허용되지 않았어요. 브라우저·앱 설정에서 허용한 뒤 다시 시도하거나 파일을 첨부해 주세요.`;
 if(name==='NotFoundError'||name==='DevicesNotFoundError')return `사용할 수 있는 ${device}가 없어요. 파일을 첨부해 주세요.`;
 if(name==='NotReadableError'||name==='TrackStartError')return `${device}를 다른 앱에서 사용 중이거나 기기에서 열지 못했어요. 잠시 후 다시 시도해 주세요.`;
 return `${device}를 시작하지 못했어요. 다시 시도하거나 파일을 첨부해 주세요.`;
}
export const memoTemplates=[
 {id:'daily',label:'하루 기록',title:'오늘의 기록',body:'## 기억하고 싶은 순간\n\n\n## 감사한 일\n\n\n## 내일 하고 싶은 일\n',tasks:[]},
 {id:'learning',label:'배움 노트',title:'오늘 배운 것',body:'## 새로 알게 된 것\n\n\n## 기억할 내용\n\n\n## 궁금한 점\n',tasks:['다시 읽어보기','직접 해보기']},
 {id:'outing',label:'나들이 준비',title:'우리의 나들이',body:'## 가고 싶은 곳\n\n\n## 함께할 사람\n\n\n## 남길 추억\n',tasks:['준비물 확인','이동 시간 확인','사진 남기기']},
 {id:'meeting',label:'가족 회의',title:'함께 정한 약속',body:'## 이야기할 내용\n\n\n## 함께 정한 내용\n\n\n## 다음에 확인할 일\n',tasks:['우리의 약속 확인하기']},
];
