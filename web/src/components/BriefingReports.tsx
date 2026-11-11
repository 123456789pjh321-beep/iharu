import {useEffect, useRef, useState} from 'react';
import {
  briefingReportReasonNames, type BriefingReport, type BriefingReviewDecision,
} from '../../../shared/briefing';
import {briefingRequest} from '../briefing-api';
import {AdminReauthentication} from './AdminReauthentication';
import {FormNotice} from './AuthLayout';

type Review = {report: BriefingReport; decision: BriefingReviewDecision};
const reportedAt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short',
});

export function BriefingReports({beforeSocial}: {beforeSocial: () => void}) {
  const [reports, setReports] = useState<BriefingReport[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const refresh = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setError('');
    briefingRequest<{reports: BriefingReport[]}>('admin.reports')
      .then(result => { if (active) setReports(result.reports); })
      .catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [revision]);

  function closeReview() {
    setReview(null);
    refresh.current?.focus();
  }

  function reviewed(result: string) {
    if (review) setReports(current => current?.filter(report => report.id !== review.report.id) ?? null);
    closeReview();
    setNotice(result);
    setRevision(value => value + 1);
  }

  return <section className="admin-briefing-operations" aria-labelledby="briefing-reports-title">
    <div className="briefing-reports-heading">
      <h3 id="briefing-reports-title">브리핑 신고 검토</h3>
      <button ref={refresh} className="button" type="button" onClick={() => setRevision(value => value + 1)}>목록 새로고침</button>
    </div>
    <FormNotice error={error} message={notice}/>
    {reports === null && !error && <p role="status">접수된 신고를 확인하고 있어요.</p>}
    {reports?.length === 0 && <p>검토할 신고가 없어요.</p>}
    {reports && reports.length > 0 && <ul className="briefing-reports-list">
      {reports.map(report => <li key={report.id}>
        <p className="account-caption">{briefingReportReasonNames[report.reason]} · {reportedAt.format(new Date(report.createdAt))}</p>
        <h4>{report.title}</h4>
        <p>{report.summary}</p>
        <p className="account-caption">적용 기간 {report.validFrom} ~ {report.validUntil}</p>
        <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          {report.sourceName} 원문 열기
        </a>
        <div className="briefing-review-actions">
          <button className="button" type="button" onClick={() => { setNotice(''); setReview({report, decision: 'DISMISS'}); }}>게시 유지</button>
          <button className="button danger" type="button" onClick={() => { setNotice(''); setReview({report, decision: 'WITHDRAW'}); }}>주제 철회</button>
        </div>
      </li>)}
    </ul>}
    {review && <BriefingReviewDialog review={review} beforeSocial={beforeSocial} close={closeReview} reviewed={reviewed}/>}
  </section>;
}

function BriefingReviewDialog({review, beforeSocial, close, reviewed}: {
  review: Review;
  beforeSocial: () => void;
  close: () => void;
  reviewed: (result: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const withdrawing = review.decision === 'WITHDRAW';

  useEffect(() => { dialog.current?.showModal(); }, []);

  function dismiss() {
    dialog.current?.close();
    close();
  }

  async function submit() {
    if (busy || reauth) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await briefingRequest('admin.report.resolve', {reportId: review.report.id, decision: review.decision});
      dialog.current?.close();
      reviewed(withdrawing ? '해당 근거를 사용한 주제를 철회했어요.' : '게시를 유지하고 신고 검토를 마쳤어요.');
    } catch (cause) {
      const failure = cause as Error & {code?: string};
      if (failure.code === 'REPORT_RESOLVED' || failure.code === 'NOT_FOUND') {
        dialog.current?.close();
        reviewed(failure.message);
        return;
      }
      setError(failure.message);
      if (failure.code === 'REAUTH_REQUIRED') setReauth(true);
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="personal-editor" aria-labelledby="briefing-review-title"
    onCancel={event => { event.preventDefault(); if (!busy) dismiss(); }}>
    <header><h2 id="briefing-review-title">{withdrawing ? '이 주제를 철회할까요?' : '게시를 유지할까요?'}</h2></header>
    <p><strong>{review.report.title}</strong></p>
    <p className="account-caption">{withdrawing
      ? '같은 원문과 근거 버전이 사용된 주제를 전체 브리핑에서 내립니다.'
      : '이 주제를 그대로 게시하고 이 신고의 검토를 마칩니다.'}</p>
    <FormNotice error={error} message={notice}/>
    {reauth && <AdminReauthentication returnTo="/admin?section=ai" disabled={busy} redirecting={beforeSocial}
      verified={() => { setReauth(false); setError(''); setNotice('본인 확인을 마쳤어요. 처리 버튼을 다시 눌러 주세요.'); }}/>}
    <footer>
      <button type="button" className="button" disabled={busy} onClick={dismiss}>취소</button>
      <button type="button" className={'button ' + (withdrawing ? 'danger' : 'primary')} disabled={busy || reauth}
        onClick={() => void submit()}>{busy ? '처리 중…' : withdrawing ? '철회 확정' : '게시 유지 확정'}</button>
    </footer>
  </dialog>;
}
