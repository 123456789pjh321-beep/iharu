import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {
  briefingReportReasonNames, briefingReportReasons,
  type BriefingItem, type BriefingReportReason,
} from '../../../shared/briefing';
import {briefingRequest} from '../briefing-api';
import {FormNotice} from './AuthLayout';
import {Icon} from './Icon';

export function BriefingReportDialog({postId, item, close, submitted}: {
  postId: string;
  item: BriefingItem;
  close: () => void;
  submitted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState<BriefingReportReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !reason) return;
    setBusy(true);
    setError('');
    try {
      await briefingRequest('report', {
        postId, fingerprint: item.fingerprint, contentHash: item.contentHash, sourceUrl: item.sourceUrl, reason,
      });
      dialog.current?.close();
      submitted();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    dialog.current?.close();
    close();
  }

  return <dialog ref={dialog} className="personal-editor briefing-report-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) dismiss(); }}>
    <header>
      <h2 id={titleId}>잘못된 정보 신고</h2>
      <button className="icon-button" type="button" aria-label="신고 닫기" disabled={busy} onClick={dismiss}><Icon name="close"/></button>
    </header>
    <p><strong>{item.title}</strong></p>
    <p className="account-caption">신고 사유와 이 주제의 제목, 요약, 적용 기간, 출처를 관리자에게 전달해요.</p>
    <form className="auth-form" onSubmit={submit}>
      <label className="form-field">신고 사유
        <select required value={reason} disabled={busy} onChange={event => setReason(event.target.value as BriefingReportReason | '')}>
          <option value="">사유를 선택해 주세요</option>
          {briefingReportReasons.map(value => <option key={value} value={value}>{briefingReportReasonNames[value]}</option>)}
        </select>
      </label>
      <FormNotice error={error}/>
      <button type="submit" className="button primary" disabled={busy || !reason}>{busy ? '접수 중…' : '신고 접수'}</button>
    </form>
  </dialog>;
}
