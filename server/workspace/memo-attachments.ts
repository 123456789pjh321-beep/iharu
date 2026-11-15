import {z} from 'zod';
import {attachmentMetadata,attachmentLimit} from '../../shared/memo-capture.js';
const extensions:Record<string,string[]>={
 'application/pdf':['pdf'],'text/plain':['txt','md'],'text/csv':['csv'],
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx'],
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['xlsx'],
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':['pptx'],
 'audio/webm':['webm'],'audio/mp4':['m4a','mp4'],'audio/mpeg':['mp3'],'audio/wav':['wav'],'audio/ogg':['ogg'],'audio/aac':['aac'],
 'image/jpeg':['jpg','jpeg'],'image/png':['png'],
};
export function validAttachmentBytes(mime:string,data:Buffer){
 const hex=data.subarray(0,12).toString('hex');
 if(mime==='application/pdf')return data.subarray(0,5).toString()==='%PDF-';
 if(mime==='image/jpeg')return hex.startsWith('ffd8')&&data.subarray(-2).toString('hex')==='ffd9';
 if(mime==='image/png')return hex.startsWith('89504e470d0a1a0a');
 if(mime==='audio/webm')return hex.startsWith('1a45dfa3');
 if(mime==='audio/ogg')return data.subarray(0,4).toString()==='OggS';
 if(mime==='audio/wav')return data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WAVE';
 if(mime==='audio/mp4')return data.subarray(4,8).toString()==='ftyp';
 if(mime==='audio/mpeg')return data.subarray(0,3).toString()==='ID3'||data[0]===255&&(data[1]&224)===224;
 if(mime==='audio/aac')return data[0]===255&&(data[1]&246)===240;
 if(mime.startsWith('application/vnd.openxmlformats'))return hex.startsWith('504b0304');
 if(mime==='text/plain'||mime==='text/csv'){try{new TextDecoder('utf-8',{fatal:true}).decode(data);return !data.includes(0);}catch{return false;}}
 return false;
}
const newAttachment=attachmentMetadata.extend({data:z.string().max(Math.ceil(attachmentLimit/3)*4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict().superRefine((a,ctx)=>{
 const bytes=Buffer.from(a.data,'base64');
 if(bytes.length!==a.size||bytes.length<1||bytes.length>attachmentLimit||!validAttachmentBytes(a.mime,bytes)||!extensions[a.mime]?.includes(a.name.split('.').at(-1)!.toLowerCase())||a.kind==='AUDIO'&&!a.mime.startsWith('audio/')||(a.kind==='SCAN'||a.kind==='SKETCH')&&!a.mime.startsWith('image/'))ctx.addIssue({code:'custom',message:'첨부파일의 형식과 크기를 확인해 주세요.'});
});
export const memoAttachmentInput=z.union([z.object({id:z.uuid()}).strict(),newAttachment]);
