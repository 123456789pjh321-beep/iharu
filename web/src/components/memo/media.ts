import {attachmentLimit,type MemoAttachmentInput,type MemoAttachment,attachmentMimes} from '../../../../shared/memo-capture';
export function blobBase64(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 읽지 못했어요. 다시 선택해 주세요.'));reader.readAsDataURL(blob);});}
const extensionMime:Record<string,string>={pdf:'application/pdf',txt:'text/plain',md:'text/plain',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',webm:'audio/webm',aac:'audio/aac',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
export const fileAccept='.pdf,.txt,.md,.csv,.docx,.xlsx,.pptx,.mp3,.m4a,.wav,.ogg,.webm,.aac,.jpg,.jpeg,.png';
export async function prepareAttachment(file:File,kind:MemoAttachment['kind']='FILE'):Promise<MemoAttachmentInput>{
 if(['image/jpeg','image/png'].includes(file.type)){const canvas=await imageCanvas(file);file=await canvasFile(canvas,file.name.replace(/\.[^.]+$/,'.jpg'));}
 if(!file.size||file.size>attachmentLimit)throw new Error('빈 파일은 첨부할 수 없어요. 파일 하나는 2MB까지 가능해요.');
 const ext=file.name.split('.').at(-1)!.toLowerCase(),mime=extensionMime[ext];
 if(!mime||!attachmentMimes.includes(mime as typeof attachmentMimes[number]))throw new Error('PDF·텍스트·문서·사진·오디오 파일을 선택해 주세요.');
 const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_');
 if(name.length>120)throw new Error('파일 이름을 120자 이내로 줄여 주세요.');
 return {name,mime:mime as MemoAttachment['mime'],kind:kind==='FILE'&&mime.startsWith('audio/')?'AUDIO':kind,size:file.size,data:await blobBase64(file)};
}
export function dataBlob(data:string,mime:string){const binary=atob(data);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:mime});}
export function releaseStream(stream:MediaStream|null){stream?.getTracks().forEach(track=>track.stop());}
export function recordingMime(){return ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));}
export async function canvasFile(canvas:HTMLCanvasElement,name:string){
 const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
 if(!blob)throw new Error('이미지를 만들지 못했어요. 다시 시도해 주세요.');
 return new File([blob],name,{type:'image/jpeg'});
}
export async function imageCanvas(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('20MB 이하 JPG·PNG·WebP 사진을 선택해 주세요.');
 const bitmap=await createImageBitmap(file);try{
  if(bitmap.width*bitmap.height>60000000)throw new Error('사진 해상도가 너무 높아요. 크기를 줄여 주세요.');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('이 기기에서 이미지를 처리할 수 없어요.');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas;
 }finally{bitmap.close();}
}
