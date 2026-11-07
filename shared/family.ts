import { z } from 'zod';
export const id = z.uuid();
export const version = z.number().int().nonnegative();
export const familyName = z.string().trim().min(1).max(40);
export const grantsInput = z.object({ daily:z.boolean(),chat:z.boolean(),location:z.boolean(),tuitionRead:z.boolean(),tuitionWrite:z.boolean(),expectedVersion:version }).strict().refine(p=>!p.tuitionWrite||p.tuitionRead,'비용 수정은 조회 권한이 필요해요.');
export const childInput = z.object({ draftId:id,proofId:id,nickname:z.string().trim().min(1).max(24),birthDate:z.iso.date() }).strict();
export const familySchema=z.object({id,name:z.string(),owner:z.boolean(),version});
export const familiesSchema=z.object({families:z.array(familySchema),pending:z.array(z.object({id,name:z.string()})).default([])});
export const childrenSchema=z.object({children:z.array(z.object({id,nickname:z.string(),version,canManage:z.boolean(),locationConsent:z.boolean()}))});
export const membersSchema=z.object({members:z.array(z.object({id,memberId:id,name:z.string(),status:z.enum(['ACTIVE','PENDING']),owner:z.boolean(),version}))});
export const grantsSchema=z.object({grants:z.array(z.object({memberId:id,name:z.string(),consenter:z.boolean(),daily:z.boolean(),chat:z.boolean(),location:z.boolean(),tuitionRead:z.boolean(),tuitionWrite:z.boolean(),version}))});
export const devicesSchema=z.object({devices:z.array(z.object({id,label:z.string(),status:z.string(),lastSeenAt:z.string()}))});
export const draftSchema=z.object({id,state:z.enum(['DRAFT','PENDING','VERIFIED','REJECTED','ACTIVATED']),expiresAt:z.string(),birthDate:z.string().nullable().optional()});
export const childSessionSchema=z.object({id,childId:id,nickname:z.string(),familyName:z.string().optional(),locationAllowed:z.boolean()});
export const setupSchema=z.object({accountReady:z.boolean(),emailVerified:z.boolean().default(false),emailDeliveryAvailable:z.boolean().default(false),databaseReady:z.boolean(),relationshipVerification:z.enum(['NOT_CONNECTED','MANUAL_REVIEW']),realChildRegistrationEnabled:z.boolean(),canCreateFamily:z.boolean().default(false),reviewAvailable:z.boolean().default(false),registrationBlocker:z.enum(['DELETION_NOT_READY']).nullable().default(null)});
export type Family=z.infer<typeof familySchema>;
export type Grant=z.infer<typeof grantsSchema>['grants'][number];

export const pairingSchema=z.object({id,code:z.string().regex(/^\d{6}$/),expiresAt:z.string(),serverNow:z.string(),receivedAt:z.number(),exchangeKey:id});
export const pairingStatusSchema=z.object({status:z.enum(['WAITING','APPROVED','EXCHANGED','EXPIRED','REVOKED']),expiresAt:z.string(),serverNow:z.string(),child:z.object({id,nickname:z.string(),familyName:z.string()}).optional()});
export type Pairing=z.infer<typeof pairingSchema>;
export type PairingStatus=z.infer<typeof pairingStatusSchema>;

