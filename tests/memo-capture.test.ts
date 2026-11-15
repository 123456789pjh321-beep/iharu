import {describe,it,expect} from 'vitest';
import {memoSpecs} from '../server/workspace/memos';
import {validAttachmentBytes} from '../server/workspace/memo-attachments';
import {base64Bytes,captureBytes,mediaPermissionError,memoChecklist} from '../shared/memo-capture';
describe('capture validation',()=>{
 it('counts padded and unpadded base64 bytes and includes retained photo upper bounds',()=>{for(const value of ['a','ab','abc','abcd'])expect(base64Bytes(Buffer.from(value).toString('base64'))).toBe(value.length);expect(captureBytes([{id:'saved'},{data:'YQ=='}],[{size:10}])).toBe(350011);});
 it('validates real byte signatures and rejects mismatched media',()=>{expect(validAttachmentBytes('application/pdf',Buffer.from('%PDF-1.7'))).toBe(true);expect(validAttachmentBytes('application/pdf',Buffer.from('<script>'))).toBe(false);expect(validAttachmentBytes('audio/webm',Buffer.from('1a45dfa300','hex'))).toBe(true);expect(validAttachmentBytes('text/plain',Buffer.from([0,1]))).toBe(false);expect(validAttachmentBytes('text/plain',Buffer.from([255]))).toBe(false);});
 it('requires valid unique checklist ids, limits content and rejects unexpected request fields',()=>{const item={id:crypto.randomUUID(),text:'준비하기',done:false};expect(memoChecklist.safeParse([item,item]).success).toBe(false);expect(memoChecklist.safeParse([{...item,text:' '}]).success).toBe(false);expect(memoSpecs['memos.attachment'].safeParse({id:crypto.randomUUID(),ownerId:'forged'}).success).toBe(false);});
 it('gives recovery paths for denial, missing devices and busy devices',()=>{expect(mediaPermissionError({name:'NotAllowedError'},'마이크')).toContain('허용');expect(mediaPermissionError({name:'NotFoundError'},'카메라')).toContain('파일');expect(mediaPermissionError({name:'NotReadableError'},'카메라')).toContain('다른 앱');});
});
