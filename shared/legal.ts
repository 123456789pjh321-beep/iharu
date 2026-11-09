import {z} from 'zod';
import {legalReviewedText} from './legal-review.js';
export const legalDraftSchema=z.object({
 operatorName:z.string().trim().max(100),privacyOfficer:z.string().trim().max(100),contactEmail:z.union([z.literal(''),z.email().max(254)]),address:z.string().trim().max(200),businessNumber:z.string().trim().max(40),
 terms:z.string().trim().max(30000),privacy:z.string().trim().max(30000),children:z.string().trim().max(10000),processors:z.string().trim().max(10000),transfers:z.string().trim().max(10000),retention:z.string().trim().max(10000),reviewNotes:z.string().trim().max(10000)
}).strict();
export type LegalDraft=z.infer<typeof legalDraftSchema>;
export type LegalPublication={id:string;version:number;document:LegalDraft;publishedAt:string};
export type LegalRequest={id:string;kind:string;detail:string;status:string;response:string;version:number;createdAt:string;updatedAt:string;requesterName?:string};
export type LegalState={publication:LegalPublication|null;accepted:boolean;role:'PARENT'|'CHILD';requests:LegalRequest[];consents:{version:number;acceptedAt:string;withdrawnAt:string|null}[]};
export const privacyKinds={ACCESS:'열람 요청',CORRECTION:'정정 요청',DELETE:'삭제·회원 탈퇴 요청',STOP:'처리 정지 요청',WITHDRAW:'동의 철회 요청',GUARDIAN:'법정대리인 확인 요청',COMPLAINT:'개인정보 문의·신고'} as const;
export const legacyLegalDraft:LegalDraft={operatorName:'',privacyOfficer:'',contactEmail:'',address:'',businessNumber:'',
terms:`아이하루 이용약관 검토 초안\n1. 서비스: 가족 일정·시간표·대화·메모·학원비 기록을 제공합니다. 실제 결제나 위치 추적은 제공하지 않습니다.\n2. 계정: 본인의 로그인 수단을 사용하고 비밀번호와 가족 승인번호를 다른 사람에게 공개하지 않습니다. 가족 참여는 허용된 구성원에게만 승인합니다.\n3. 가족 공유: 가족에 연결하면 해당 가족의 공유 자료가 표시됩니다. 본인이 작성한 자료는 수정·삭제할 수 있습니다. 공유에서 벗어나기 전에 공유 자료와 연결 상태를 확인합니다.\n4. 이용 제한: 타인의 개인정보 침해, 불법 콘텐츠 게시, 계정 도용 및 서비스 공격을 금지합니다. 제한 사유와 이의 제기 방법은 운영자가 안내합니다.\n5. 권리 행사: 개인정보 관리에서 열람·정정·삭제·처리 정지·철회 요청과 처리 결과를 확인할 수 있습니다. 요청 접수와 실제 데이터 삭제 완료는 구별됩니다.\n6. 변경: 변경 내용과 시행 시점을 고지하고 필요한 경우 다시 동의를 받습니다.\n7. 책임: 서비스 장애·일정 알림 누락 가능성이 있으므로 안전과 긴급 구조 목적의 서비스로 이용하지 않습니다. 법령상 이용자 권리를 배제하지 않습니다.`,
privacy:`개인정보처리방침 검토 초안\n계정 식별·인증과 가족 서비스 제공을 위해 이름 또는 별명, 이메일, 해시 처리된 비밀번호, 연결한 로그인 제공자의 식별값을 처리합니다. 휴대폰 로그인을 사용하는 경우 휴대폰 번호와 인증 결과가 추가됩니다.\n회원이 입력한 가족 연결, 일정·시간·메모·대화, 학원비 금액·결제자 정보를 서비스 제공에 사용합니다. 학원비는 기록 기능이며 카드번호·은행 계좌번호를 수집하지 않습니다.\n보안과 권리 행사 처리를 위해 로그인 세션, 요청 경로·결과, 변경 이력, 동의 문서 버전·시각, 개인정보 요청과 처리 기록을 처리합니다. 비밀번호와 인증 토큰을 관리 로그에 기록하지 않습니다.\n현재 실시간 위치와 GPS 좌표를 수집하지 않으며 광고 추적 기능과 마케팅 발송 동의를 도입하지 않았습니다. 가족 공유는 연결된 가족에게 공개되므로 메모·대화에 주민등록번호, 금융 인증정보, 건강정보 등 불필요한 정보를 입력하지 마세요.\n처리 목적·법적 근거·보유 기간·수탁자·국외 이전·파기 방식은 아래 운영자가 확정한 항목을 따릅니다. 계정과 자료의 삭제·정정 등은 개인정보 관리 화면에서 요청할 수 있습니다.\n접근 권한 통제, 로그인 확인, 암호화 통신, 비밀번호 해시, 요청 제한, 변경 이력 및 인증정보 비노출 조치를 적용합니다. 침해 사고 발생 시 적용 법령의 통지·신고 기준에 따라 대응합니다.`,
children:`아이하루는 가족이 일정을 함께 보고 대화하는 서비스예요. 이름 대신 별명을 사용할 수 있어요. 가족에게 보여도 괜찮은 내용만 적어 주세요. 위치를 따라다니며 수집하지 않아요. 모르는 사람에게 비밀번호나 가족 승인번호를 알려주지 마세요. 내 정보를 보고 바꾸거나 지우고 싶을 때는 개인정보 관리에서 도움을 요청할 수 있어요. 만 14세 미만 아동의 정보 처리에는 법정대리인 동의와 확인이 필요해요. 가족 승인번호만으로 법정대리인 확인을 완료한 것으로 보지 않아요.`,
processors:'',transfers:'',retention:'',reviewNotes:'게시 전 검토: 실제 운영자·책임자·연락처, 처리 항목별 목적/법적 근거/기간, Vercel·Supabase·메일/SMS 제공자 위탁계약과 국외 처리, 만 14세 미만 법정대리인 동의 확인, 접근기록 보관/점검, 파기·탈퇴 실처리, 유출 대응 담당/절차를 확인하세요. 현행 기능에서 확인되지 않은 조치는 완료로 표시하지 마세요.'};
export const legalInitialDraft:LegalDraft={...legacyLegalDraft,...legalReviewedText};
export const legalFieldLabels:Record<keyof LegalDraft,string>={operatorName:'운영자명',privacyOfficer:'개인정보 보호책임자',contactEmail:'공개 문의 이메일',address:'사업장 주소',businessNumber:'사업자 등록번호',terms:'이용약관',privacy:'개인정보처리방침',children:'어린이를 위한 안내',processors:'처리 위탁',transfers:'국외 이전',retention:'보유 기간과 파기',reviewNotes:'내부 검토 메모'};
export const legalRequiredFields:ReadonlyArray<keyof LegalDraft>=['operatorName','privacyOfficer','contactEmail','terms','privacy','children','processors','transfers','retention'];
export function legalPublicationGaps(draft:Partial<LegalDraft>){return legalRequiredFields.flatMap(field=>{const value=draft[field]?.trim()||'';const issue=value.length<3?'내용 입력 필요':/\[확인 필요|\bTODO\b|\bTBD\b/i.test(value)?'운영 사실 확인 필요':field==='contactEmail'&&!z.email().safeParse(value).success?'이메일 형식 확인 필요':'';return issue?[{field,label:legalFieldLabels[field],issue}]:[];});}
// Stable key ordering and trimming make dirty checks match what the API actually saves.
export function normalizeLegalDraft(value:Partial<LegalDraft>):LegalDraft{return Object.fromEntries(Object.keys(legalInitialDraft).map(key=>[key,(value[key as keyof LegalDraft]??legalInitialDraft[key as keyof LegalDraft]).trim()])) as LegalDraft;}
export const serviceIntroSchema=z.object({title:z.string().trim().max(120),body:z.string().trim().max(20000)}).strict();
export type ServiceIntro=z.infer<typeof serviceIntroSchema>;
export type ServiceIntroPublication={version:number;document:ServiceIntro;publishedAt:string};
export type ServiceIntroConfig={draft:ServiceIntro;version:number;updatedAt:string;publication:ServiceIntroPublication|null};
export const serviceIntroDefault:ServiceIntro={title:'가족의 하루를 함께 챙기는 아이하루',body:'아이하루는 가족의 시간표·달력·대화·메모와 학원비 기록을 한곳에서 관리하는 서비스입니다.\n\n학교·학원처럼 매주 반복되는 일정은 시간표에, 가족 행사와 기념일은 달력에 등록하세요. 구성원 이름을 선택하면 필요한 사람의 일정을 함께 볼 수 있습니다.\n\n가족 대화에서는 글과 그림으로 소식을 나누고, 준비물과 전달 사항은 메모로 남길 수 있습니다. 학부모는 학원비 금액과 납부 내역을 기록할 수 있습니다. 실제 결제·송금은 이루어지지 않습니다.\n\n브라우저를 통해 휴대폰·태블릿·PC에서 이용할 수 있습니다. 가족 연결 상태와 공유 범위를 확인하고 본인에게 허용된 자료를 이용하세요. 현재 GPS 위치 추적과 긴급 구조 기능은 제공하지 않습니다.'};
