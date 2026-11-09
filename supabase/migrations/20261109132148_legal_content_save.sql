-- UI126: distinguish private saves from immutable publications; independent service introduction.
-- Reuse the existing least-privilege policy role and session checks; no runtime table grants.
ALTER TABLE app_private.legal_settings
 ADD COLUMN service_version integer NOT NULL DEFAULT 0,
 ADD COLUMN service_draft jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN service_publication jsonb,
 ADD COLUMN service_updated_at timestamptz NOT NULL DEFAULT now();

GRANT CREATE ON SCHEMA app_private TO iharu_policy;
SET LOCAL ROLE iharu_policy;
ALTER FUNCTION app_private.legal_command(text,jsonb) RENAME TO legal_command_v125;
CREATE FUNCTION app_private.legal_command(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE config app_private.legal_settings%ROWTYPE; result jsonb; entry record; field text;
 why text:=btrim(coalesce(p->>'reason','')); gaps jsonb:='[]';
 required text[]:=ARRAY['operatorName','privacyOfficer','contactEmail','terms','privacy','children','processors','transfers','retention'];
BEGIN
 IF op='legal.service.public' THEN
  RETURN jsonb_build_object('publication',(SELECT service_publication FROM app_private.legal_settings WHERE singleton));
 END IF;
 IF op IN ('legal.admin.read','legal.admin.save','legal.admin.publish','legal.admin.service.save','legal.admin.service.publish') THEN
  IF NOT app_private.system_is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT * INTO config FROM app_private.legal_settings WHERE singleton FOR UPDATE;
  IF op<>'legal.admin.read' THEN
   IF length(why) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   IF (p->>'version')::integer IS DISTINCT FROM
    (CASE WHEN op LIKE 'legal.admin.service.%' THEN config.service_version ELSE config.version END)
    THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  END IF;
  IF op='legal.admin.save' THEN
   IF jsonb_typeof(p->'draft') IS DISTINCT FROM 'object' OR octet_length((p->'draft')::text)>500000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   FOR entry IN SELECT key,value FROM jsonb_each(p->'draft') LOOP
    IF entry.key NOT IN ('operatorName','privacyOfficer','contactEmail','address','businessNumber','terms','privacy','children','processors','transfers','retention','reviewNotes')
     OR jsonb_typeof(entry.value)<>'string'
     OR length(entry.value #>> '{}')>(CASE WHEN entry.key IN ('terms','privacy') THEN 30000 WHEN entry.key IN ('operatorName','privacyOfficer') THEN 100 WHEN entry.key='contactEmail' THEN 254 WHEN entry.key='address' THEN 200 WHEN entry.key='businessNumber' THEN 40 ELSE 10000 END)
     THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   END LOOP;
   IF coalesce(p->'draft'->>'contactEmail','')<>'' AND p->'draft'->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   UPDATE app_private.legal_settings SET draft=p->'draft',version=version+1,updated_at=now() WHERE singleton;
   INSERT INTO app_private.system_events(category,action,actor_id,request_id,reason,details)
    VALUES('ADMIN',op,app_private.actor(),nullif(current_setting('iharu.request_id',true),'')::uuid,why,jsonb_build_object('draftVersion',config.version+1));
  ELSIF op='legal.admin.publish' THEN
   IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
   FOREACH field IN ARRAY required LOOP
    IF length(btrim(coalesce(config.draft->>field,'')))<3
     OR coalesce(config.draft->>field,'') ~* '\[확인 필요|\mTODO\M|\mTBD\M'
     OR (field='contactEmail' AND config.draft->>field !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     THEN gaps=gaps||jsonb_build_array(field); END IF;
   END LOOP;
   IF jsonb_array_length(gaps)>0 THEN RAISE EXCEPTION 'POLICY_INCOMPLETE' USING DETAIL=gaps::text; END IF;
   PERFORM app_private.legal_command_v125(op,p);
  ELSIF op IN ('legal.admin.service.save','legal.admin.service.publish') THEN
   IF op='legal.admin.service.save' THEN
    IF jsonb_typeof(p->'draft') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p->'draft'->'title') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p->'draft'->'body') IS DISTINCT FROM 'string'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(p->'draft') k WHERE k NOT IN ('title','body'))
     OR length(p->'draft'->>'title')>120 OR length(p->'draft'->>'body')>20000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    UPDATE app_private.legal_settings SET service_draft=p->'draft',service_version=service_version+1,service_updated_at=now() WHERE singleton;
   ELSE
    IF NOT app_private.account_verified(true) THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
    IF p->>'reviewed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    IF length(btrim(coalesce(config.service_draft->>'title','')))<3 OR length(btrim(coalesce(config.service_draft->>'body','')))<20
     OR config.service_draft::text ~* '\[확인 필요|\mTODO\M|\mTBD\M' THEN RAISE EXCEPTION 'SERVICE_INCOMPLETE'; END IF;
    UPDATE app_private.legal_settings SET service_publication=jsonb_build_object('version',coalesce((service_publication->>'version')::integer,0)+1,'document',service_draft,'publishedAt',now()),service_version=service_version+1,service_updated_at=now() WHERE singleton;
   END IF;
   INSERT INTO app_private.system_events(category,action,actor_id,request_id,reason,details)
    VALUES('ADMIN',op,app_private.actor(),nullif(current_setting('iharu.request_id',true),'')::uuid,why,jsonb_build_object('serviceDraftVersion',config.service_version+1));
  END IF;
  SELECT * INTO config FROM app_private.legal_settings WHERE singleton;
  result=app_private.legal_command_v125('legal.admin.read','{}')||jsonb_build_object('updatedAt',config.updated_at,'service',jsonb_build_object('draft',config.service_draft,'version',config.service_version,'updatedAt',config.service_updated_at,'publication',config.service_publication));
  IF op='legal.admin.read' THEN RETURN result; END IF;
  RETURN jsonb_build_object('status',CASE WHEN op LIKE '%.publish' THEN 'PUBLISHED' ELSE 'SAVED' END,'config',result);
 END IF;
 RETURN app_private.legal_command_v125(op,p);
END $$;
REVOKE ALL ON FUNCTION app_private.legal_command_v125(text,jsonb),app_private.legal_command(text,jsonb) FROM PUBLIC,app_runtime;
GRANT EXECUTE ON FUNCTION app_private.legal_command(text,jsonb) TO app_runtime;
RESET ROLE;
REVOKE CREATE ON SCHEMA app_private FROM iharu_policy;

-- Upgrade only untouched legacy defaults; preserve operator/contact and every customized field.
DO $upgrade$
DECLARE previous jsonb; next_draft jsonb; field text; old_defaults jsonb:='{"operatorName":"","privacyOfficer":"","contactEmail":"","address":"","businessNumber":"","terms":"아이하루 이용약관 검토 초안\n1. 서비스: 가족 일정·시간표·대화·메모·학원비 기록을 제공합니다. 실제 결제나 위치 추적은 제공하지 않습니다.\n2. 계정: 본인의 로그인 수단을 사용하고 비밀번호와 가족 승인번호를 다른 사람에게 공개하지 않습니다. 가족 참여는 허용된 구성원에게만 승인합니다.\n3. 가족 공유: 가족에 연결하면 해당 가족의 공유 자료가 표시됩니다. 본인이 작성한 자료는 수정·삭제할 수 있습니다. 공유에서 벗어나기 전에 공유 자료와 연결 상태를 확인합니다.\n4. 이용 제한: 타인의 개인정보 침해, 불법 콘텐츠 게시, 계정 도용 및 서비스 공격을 금지합니다. 제한 사유와 이의 제기 방법은 운영자가 안내합니다.\n5. 권리 행사: 개인정보 관리에서 열람·정정·삭제·처리 정지·철회 요청과 처리 결과를 확인할 수 있습니다. 요청 접수와 실제 데이터 삭제 완료는 구별됩니다.\n6. 변경: 변경 내용과 시행 시점을 고지하고 필요한 경우 다시 동의를 받습니다.\n7. 책임: 서비스 장애·일정 알림 누락 가능성이 있으므로 안전과 긴급 구조 목적의 서비스로 이용하지 않습니다. 법령상 이용자 권리를 배제하지 않습니다.","privacy":"개인정보처리방침 검토 초안\n계정 식별·인증과 가족 서비스 제공을 위해 이름 또는 별명, 이메일, 해시 처리된 비밀번호, 연결한 로그인 제공자의 식별값을 처리합니다. 휴대폰 로그인을 사용하는 경우 휴대폰 번호와 인증 결과가 추가됩니다.\n회원이 입력한 가족 연결, 일정·시간·메모·대화, 학원비 금액·결제자 정보를 서비스 제공에 사용합니다. 학원비는 기록 기능이며 카드번호·은행 계좌번호를 수집하지 않습니다.\n보안과 권리 행사 처리를 위해 로그인 세션, 요청 경로·결과, 변경 이력, 동의 문서 버전·시각, 개인정보 요청과 처리 기록을 처리합니다. 비밀번호와 인증 토큰을 관리 로그에 기록하지 않습니다.\n현재 실시간 위치와 GPS 좌표를 수집하지 않으며 광고 추적 기능과 마케팅 발송 동의를 도입하지 않았습니다. 가족 공유는 연결된 가족에게 공개되므로 메모·대화에 주민등록번호, 금융 인증정보, 건강정보 등 불필요한 정보를 입력하지 마세요.\n처리 목적·법적 근거·보유 기간·수탁자·국외 이전·파기 방식은 아래 운영자가 확정한 항목을 따릅니다. 계정과 자료의 삭제·정정 등은 개인정보 관리 화면에서 요청할 수 있습니다.\n접근 권한 통제, 로그인 확인, 암호화 통신, 비밀번호 해시, 요청 제한, 변경 이력 및 인증정보 비노출 조치를 적용합니다. 침해 사고 발생 시 적용 법령의 통지·신고 기준에 따라 대응합니다.","children":"아이하루는 가족이 일정을 함께 보고 대화하는 서비스예요. 이름 대신 별명을 사용할 수 있어요. 가족에게 보여도 괜찮은 내용만 적어 주세요. 위치를 따라다니며 수집하지 않아요. 모르는 사람에게 비밀번호나 가족 승인번호를 알려주지 마세요. 내 정보를 보고 바꾸거나 지우고 싶을 때는 개인정보 관리에서 도움을 요청할 수 있어요. 만 14세 미만 아동의 정보 처리에는 법정대리인 동의와 확인이 필요해요. 가족 승인번호만으로 법정대리인 확인을 완료한 것으로 보지 않아요.","processors":"","transfers":"","retention":"","reviewNotes":"게시 전 검토: 실제 운영자·책임자·연락처, 처리 항목별 목적/법적 근거/기간, Vercel·Supabase·메일/SMS 제공자 위탁계약과 국외 처리, 만 14세 미만 법정대리인 동의 확인, 접근기록 보관/점검, 파기·탈퇴 실처리, 유출 대응 담당/절차를 확인하세요. 현행 기능에서 확인되지 않은 조치는 완료로 표시하지 마세요."}'::jsonb; new_defaults jsonb:='{"operatorName":"","privacyOfficer":"","contactEmail":"","address":"","businessNumber":"","terms":"아이하루 이용약관\n\n제1조 목적과 운영자\n이 약관은 아이하루와 회원 사이의 서비스 이용 조건을 정합니다. 운영자와 문의 연락처는 이 문서 상단에 표시합니다. 중요한 이용 조건은 가입·변경 시 알기 쉽게 안내합니다.\n\n제2조 제공하는 서비스\n아이하루는 가족의 시간표, 달력, 대화, 메모, 학원비 기록과 알림 설정 기능을 제공합니다. 학원비는 납부 내역을 정리하는 기록이며 결제·송금·자동 출금 서비스가 아닙니다. 현재 GPS 위치 추적이나 긴급 구조 서비스를 제공하지 않습니다. 알림은 네트워크·브라우저·기기 설정에 따라 지연되거나 누락될 수 있습니다.\n\n제3조 가입과 계정 관리\n회원은 본인이 이용할 권한이 있는 로그인 수단을 사용하고 계정 정보를 정확하게 관리합니다. 비밀번호·인증 링크·가족 승인번호를 다른 사람에게 공개하지 않습니다. 도용이 의심되면 즉시 로그인 수단과 연결 기기를 확인하고 운영자에게 알립니다. 미성년자의 계약 및 개인정보 처리에는 법령상 필요한 법정대리인 동의와 확인 절차를 적용합니다. 가족 초대와 법정대리인 확인은 서로 다른 절차입니다.\n\n제4조 가족 공유와 게시물\n가족 연결 상태와 공유 대상을 확인한 후 자료를 등록하세요. 연결된 가족은 권한에 따라 공유 자료를 볼 수 있습니다. 회원은 자신의 게시물에 관한 권리를 유지하며, 운영자는 서비스 제공·저장·표시·백업에 필요한 범위에서만 이를 처리합니다. 광고나 외부 판매를 위한 사용 권한을 포괄적으로 취득하지 않습니다. 타인의 개인정보나 저작물을 올릴 때에는 적법한 권한이 있어야 합니다.\n\n제5조 금지 행위와 이용 제한\n계정 도용, 타인의 개인정보 침해, 불법·권리 침해 자료 등록, 무단 접근과 서비스 방해를 금지합니다. 운영자는 위반의 내용과 정도에 맞게 필요한 범위에서 이용을 제한하며 사유·기간·이의 제기 방법을 안내합니다. 긴급한 보안 조치는 우선 시행한 후 사유를 안내할 수 있습니다. 이의 제기는 문서 상단 연락처로 접수합니다.\n\n제6조 개인정보와 탈퇴\n처리 항목·목적·법적 근거·보유 기간 및 권리 행사 방법은 개인정보처리방침에서 확인할 수 있습니다. 처리방침을 읽었다는 확인은 별도 동의가 필요한 개인정보 처리의 동의를 대신하지 않습니다. 개인정보 관리 화면 또는 공개 문의 연락처로 열람·정정·삭제·처리 정지·동의 철회와 탈퇴를 요청할 수 있습니다. 본인·대리인 확인 후 실제 조치 결과를 안내합니다. 접수나 상태 변경만으로 삭제가 완료되는 것은 아닙니다. 법령상 보존이 필요한 자료는 그 근거와 범위를 구분해 안내합니다.\n\n제7조 변경과 서비스 중단\n약관 변경 시 변경 내용·사유·시행일을 사전에 알리고 중요한 내용은 별도로 안내합니다. 회원에게 불리한 변경에는 충분한 검토·거절 기회를 제공하며 법령상 필요한 동의 절차를 따릅니다. 침묵이나 계속 이용만으로 별도 동의가 필요한 사항에 동의한 것으로 처리하지 않습니다. 점검·장애 또는 서비스 종료 시 가능한 범위에서 일정과 자료 처리 방법을 안내합니다. 유료 기능을 도입할 때에는 요금·청약 철회·환불 등 적용 조건을 별도로 제시합니다.\n\n제8조 책임과 분쟁\n운영자는 관계 법령에 따른 책임을 부담합니다. 고의·중과실이나 법령상 책임을 일괄 면제하지 않으며 회원에게 부당한 손해배상 의무를 지우지 않습니다. 일정과 알림은 생활 보조 수단이므로 안전 확인을 위한 유일한 수단으로 사용하지 마세요. 분쟁은 먼저 공개 문의 연락처를 통해 해결을 협의하며 해결되지 않으면 대한민국 법령과 적법한 관할 규정에 따릅니다.","privacy":"아이하루 개인정보처리방침\n\n1. 운영자와 책임자\n개인정보처리자·개인정보 보호책임자와 문의 연락처는 문서 상단에 표시합니다. 이 방침은 아이하루가 처리하는 개인정보와 이용자의 권리 행사 방법을 안내합니다.\n\n2. 처리 목적·항목·근거\n계정 가입·인증 및 서비스 제공: 이름 또는 별명, 이메일, 비밀번호 해시, 연결한 소셜 로그인 제공자의 식별값과 계정 연결 정보. 휴대폰 인증 기능을 이용하면 휴대폰 번호와 인증 결과를 처리합니다. 계약 체결·이행에 필요한 처리는 개인정보 보호법 제15조제1항제4호에 근거하며, 별도 동의가 필요한 처리는 항목·목적·기간·거부 시 영향을 구분해 알리고 동의를 받습니다.\n가족 서비스: 가족 연결·역할, 가족 구성원의 이름 또는 별명, 입력한 일정·시간표·메모·대화와 학원비 금액·납부 정보. 공유 기능을 제공하는 데 필요한 범위에서 처리합니다. 학원비 기록에 카드번호·계좌 비밀번호를 요구하지 않습니다.\n기기 알림: 알림을 켠 기기의 푸시 구독 주소·키와 알림 설정을 전송에 사용합니다. 브라우저·기기 설정에서 권한을 취소할 수 있습니다. 광고·마케팅 동의를 함께 받지 않습니다.\n보안·분쟁 및 권리 행사: 로그인 세션, 접속 IP·브라우저 정보, 요청 경로·결과·변경 이력, 약관·처리방침 버전 확인 시각, 법정대리인 확인과 개인정보 요청·처리 기록. 항목별 적용 근거와 기간은 아래 보유·파기 기준에서 구분합니다. 정당한 이익을 근거로 삼는 처리는 필요성과 정보주체 권리의 비교 검토가 선행되어야 합니다.\n\n3. 가족 공유와 외부 제공\n회원이 연결한 가족의 허용된 구성원에게 공유 자료가 표시됩니다. 가족 연결·초대 권한과 게시물의 공유 범위를 확인하고 타인의 정보는 적법한 권한이 있는 범위에서 입력하세요. 서비스 제공을 위한 처리 위탁과 독립된 목적의 제3자 제공은 구분합니다. 별도 외부 제공이 발생하면 제공받는 자·목적·항목·기간·거부 방법 및 근거를 먼저 알리고 필요한 절차를 진행합니다.\n현재 GPS 좌표와 실시간 위치를 수집하지 않고 광고 추적을 하지 않습니다. 주민등록번호·금융 인증정보·건강정보 등 불필요한 민감한 내용을 대화나 메모에 입력하지 마세요.\n\n4. 만 14세 미만 아동\n동의가 필요한 아동의 개인정보 처리는 법정대리인에게 처리 내용을 알리고 동의를 받은 뒤 동의 여부를 확인해야 합니다. 가족 승인번호나 보호자의 단순 체크만으로 적법한 확인을 마친 것으로 보지 않습니다. 아동과 법정대리인도 아래 권리 행사 창구를 이용할 수 있습니다. 실제 확인 수단·증빙 범위·보유 기간은 어린이 안내 및 보유 기준에 구체적으로 기재합니다.\n\n5. 권리 행사와 고충 처리\n본인과 정당한 대리인은 개인정보 관리 화면 또는 문서 상단 이메일로 열람, 정정·삭제, 처리 정지, 동의 철회, 탈퇴를 요청할 수 있습니다. 요청 범위와 본인·대리인 권한을 필요한 최소한의 방법으로 확인하고 법령이 정한 기한 내에 결과를 알립니다. 제한·연기·거절 시에는 적용 근거·사유와 이의 제기 방법을 안내합니다. 요청 접수와 실제 삭제 완료는 구별됩니다. 비밀번호나 신분증 전체를 공개 게시물·대화에 첨부하지 마세요. 분쟁 조정 및 신고는 개인정보 포털(privacy.go.kr)의 권리 행사·신고 안내를 이용할 수 있습니다.\n\n6. 쿠키와 안전조치\n로그인 유지·인증·가족 연결에 필요한 쿠키를 사용합니다. 브라우저 설정에서 쿠키를 차단하거나 삭제할 수 있으며 이 경우 로그인과 가족 서비스 이용이 제한될 수 있습니다. 광고 추적 쿠키를 사용하지 않습니다. 접근 권한 통제, 인증 확인, 암호화 통신, 비밀번호 해시, 요청 제한과 변경 이력 기록을 적용합니다. 개인정보 침해 사고에는 적용 법령의 통지·신고 기준에 따라 대응합니다.\n\n7. 보유·파기, 위탁과 국외 이전\n아래 항목별 표기에서 처리 항목·근거·기간, 수탁 업무, 실제 처리 국가·수령자·이전 근거·거부 방법을 확인할 수 있습니다. 국내 데이터베이스를 사용한다는 사실만으로 모든 처리가 국내에서만 이루어진다고 설명하지 않습니다. 동의가 필요한 국외 이전은 처리방침 확인만으로 동의한 것으로 간주하지 않습니다.\n\n8. 변경 안내\n이 방침의 게시일과 버전은 상단에 표시합니다. 중요한 변경은 내용·이유·시행일을 사전에 알리고 법령상 동의가 필요한 경우 별도 절차를 진행합니다. 이전 게시본과 확인 기록은 버전별로 관리합니다.","children":"어린이를 위한 개인정보 안내\n아이하루는 가족이 시간표와 달력을 함께 보고 대화하는 서비스예요. 이름 대신 별명을 쓸 수 있어요. 가족에게 보여도 괜찮은 내용만 적어 주세요. 위치를 따라다니며 수집하지 않아요.\n비밀번호, 인증 링크, 가족 승인번호는 다른 사람에게 알려주지 마세요. 모르는 사람이 정보를 달라고 하면 보호자에게 먼저 이야기하세요.\n내 정보를 보고 바꾸거나 지우고 싶으면 개인정보 관리에서 도움을 요청하거나 문서 상단 이메일로 연락할 수 있어요. 보호자도 대신 요청할 수 있어요.\n만 14세 미만 어린이의 개인정보를 동의를 받아 처리할 때에는 법정대리인에게 먼저 내용을 알리고 동의했는지 확인해야 해요. 가족 승인번호만으로 이 확인을 마친 것은 아니에요.\n[확인 필요: 실제 법정대리인 동의 확인 수단, 문의 절차와 증빙 보유 기간을 어린이가 알기 쉬운 말로 기재]","processors":"처리 위탁 현황 작성\nVercel: 웹앱 호스팅 및 서버 요청 처리.\nSupabase: 데이터베이스 운영. 현재 프로젝트의 기본 데이터베이스 지역은 서울입니다. 국내 저장과 지원·로그·하위 처리자의 처리 국가는 구별해 확인합니다.\nResend: 이메일 확인·비밀번호 재설정 메일 전송 시 수신 이메일과 인증 링크·메일 본문 처리.\nSMS·웹 푸시: 실제 활성화한 제공자와 재위탁자를 확인하여 추가합니다.\n[확인 필요: 각 계약 상대방의 정확한 법인명, 위탁 업무·처리 항목·기간, 재위탁 현황과 관리·감독 방식. 실제 사용하지 않는 업체는 제외]","transfers":"국외 이전 현황 작성\n호스팅, 인증 메일, 운영 로그·지원 과정에서 국외 처리가 발생하는지 각 제공자 계약과 설정을 확인합니다. 데이터베이스 서울 지역 선택은 모든 처리의 국내 한정을 뜻하지 않습니다. Resend 공식 자료는 저장 위치가 미국이며 발송 지역과 저장 지역이 다르다고 설명합니다.\n[확인 필요: 업체별 이전 항목 / 국가 / 시기와 방법 / 수령 법인명·연락처 / 이용 목적 / 보유·이용 기간 / 개인정보 보호법 제28조의8의 해당 근거 / 이전 거부 방법과 거부 시 영향. 재이전도 실제 계약에 따라 확인]\n계약 이행에 필요한 위탁·보관의 고지 근거와 별도 동의가 필요한 이전을 구분하고, 별도 동의는 필요한 항목을 개별 안내해 받습니다.","retention":"항목별 보유·파기 기준 작성\n1. 계정·가족 연결·일정·대화·메모·학원비 기록: [확인 필요: 처리 목적별 항목·근거, 탈퇴·연결 해제 시 범위와 삭제 기한]\n2. 인증 링크·인증번호·세션·푸시 구독: [확인 필요: 유효 기간과 별개의 실제 삭제 주기·기한]\n3. 접속·보안·변경 이력: [확인 필요: 필요한 항목, 법적 근거, 적용 보관 기간·접근 제한]\n4. 약관 확인·법정대리인 확인 증빙·권리 행사 기록: [확인 필요: 항목별 근거와 최소 보유 기간]\n5. 법령상 보존 예외: [확인 필요: 실제 적용 법령·조항·보존 항목·기간과 분리 보관 방식. 학원비 기록만으로 전자상거래 거래기록 보관 의무를 일괄 적용하지 않음]\n6. 파기·백업: [확인 필요: 담당자 검토, 전자 자료의 복구 불가 삭제 방법, 종이 자료 처리, 백업 보관·만료 주기와 복구 시 삭제 재적용 절차]\n처리 목적 달성 등으로 불필요해진 개인정보는 다른 법령상 보존 사유가 없다면 지체 없이 파기해야 합니다. 인증의 만료나 요청 상태 변경을 실제 파기 완료로 표시하지 않습니다.","reviewNotes":"2026-11-09 법령·기능 대조 초안. 운영자·책임자 실명/법인명과 연락처의 실제 권한을 확인하세요. [확인 필요] 표기는 실제 운영 사실로 확정한 뒤 제거하세요. 확인 전 공개 게시를 차단합니다.\n검토 근거: 개인정보 보호법 제15·21·22·22의2·26·28의8·30·35~38조 및 시행령, 약관의 규제에 관한 법률 제3·6·7조. 개인정보 포털 2026 처리방침 작성지침 공지(2026-04-24) 참조. 외부 법률전문가의 적합성 확인을 받은 문서는 아닙니다.\n보호자 동의 확인, 처리 항목별 법적 근거·실제 삭제/백업 주기, Vercel·Supabase·Resend·활성 SMS/푸시 계약, 재위탁 및 국외 이전을 최종 점검하세요. 처리방침 확인과 개인정보 수집·이용/제공/국외 이전 동의를 혼동하지 마세요."}'::jsonb;
BEGIN
 SELECT draft INTO previous FROM app_private.legal_settings WHERE singleton FOR UPDATE; next_draft=previous;
 FOREACH field IN ARRAY ARRAY['terms','privacy','children','processors','transfers','retention','reviewNotes'] LOOP
  IF previous->>field IS NULL OR btrim(previous->>field)=btrim(old_defaults->>field) THEN next_draft=jsonb_set(next_draft,ARRAY[field],new_defaults->field); END IF;
 END LOOP;
 IF next_draft IS DISTINCT FROM previous THEN UPDATE app_private.legal_settings SET draft=next_draft,version=version+CASE WHEN previous='{}'::jsonb THEN 0 ELSE 1 END,updated_at=now() WHERE singleton; END IF;
 UPDATE app_private.legal_settings SET service_draft='{"title":"가족의 하루를 함께 챙기는 아이하루","body":"아이하루는 가족의 시간표·달력·대화·메모와 학원비 기록을 한곳에서 관리하는 서비스입니다.\n\n학교·학원처럼 매주 반복되는 일정은 시간표에, 가족 행사와 기념일은 달력에 등록하세요. 구성원 이름을 선택하면 필요한 사람의 일정을 함께 볼 수 있습니다.\n\n가족 대화에서는 글과 그림으로 소식을 나누고, 준비물과 전달 사항은 메모로 남길 수 있습니다. 학부모는 학원비 금액과 납부 내역을 기록할 수 있습니다. 실제 결제·송금은 이루어지지 않습니다.\n\n브라우저를 통해 휴대폰·태블릿·PC에서 이용할 수 있습니다. 가족 연결 상태와 공유 범위를 확인하고 본인에게 허용된 자료를 이용하세요. 현재 GPS 위치 추적과 긴급 구조 기능은 제공하지 않습니다."}'::jsonb WHERE singleton AND service_draft='{}'::jsonb;
END $upgrade$;
