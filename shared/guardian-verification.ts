import {z} from 'zod';
export const applicationInput=z.object({requestKey:z.uuid(),targetLabel:z.string().trim().min(1).max(24),relationship:z.enum(['PARENT','LEGAL_GUARDIAN'])}).strict();
const reviewBase={id:z.uuid(),expectedVersion:z.number().int().positive()};
const reference=z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/);
export const reviewInput=z.discriminatedUnion('state',[
 z.object({...reviewBase,state:z.literal('REVIEWING')}).strict(),
 z.object({...reviewBase,state:z.literal('REJECTED'),reason:z.string().trim().min(5).max(500)}).strict(),
 z.object({...reviewBase,state:z.literal('APPROVED'),targetId:z.uuid(),evidenceRef:reference,subjectRef:reference,evidenceChecked:z.literal(true)}).strict(),
]);
export const birthDateInput=z.object({id:z.uuid(),expectedVersion:z.number().int().positive(),targetId:z.uuid(),birthDate:z.iso.date(),evidenceChecked:z.literal(true)}).strict();
export const applicationsSchema=z.object({registrationEnabled:z.boolean().default(false),reviewer:z.boolean(),reviewAvailable:z.boolean(),applications:z.array(z.object({
 id:z.uuid(),consumed:z.boolean().default(false),birthDateVerified:z.boolean().default(false),targetId:z.uuid(),targetLabel:z.string(),relationship:z.enum(['PARENT','LEGAL_GUARDIAN']),
 state:z.enum(['RECEIVED','REVIEWING','APPROVED','REJECTED','EXPIRED']),version:z.number(),createdAt:z.string(),expiresAt:z.string(),reason:z.string().nullable(),canReview:z.boolean(),applicantEmail:z.string().nullable(),
}))});
export type GuardianApplication=z.infer<typeof applicationsSchema>['applications'][number];
export const guardianStateLabel={RECEIVED:'접수 완료',REVIEWING:'심사 중',APPROVED:'승인',REJECTED:'반려',EXPIRED:'만료'};


