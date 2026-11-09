import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
// Auth, legacy APIs and versioned APIs use different error envelopes.
const responseErrorSchema = z.union([
  z.object({error:z.object({code:z.string(),message:z.string()})}).transform(v=>v.error),
  z.object({code:z.string(),message:z.string().optional()}),
]);
export function useApi<T>(path: string, schema: z.ZodType<T>, actor?: 'child', enabled=true) {
  const [state, setState] = useState<{ data?:T; error?:string; errorCode?:string; loading:boolean }>({ loading:true });
  const [revision, setRevision] = useState({number:0,background:false});
  const previousRequest = useRef('');
  const retry = useCallback(() => setRevision(v => ({number:v.number+1,background:false})), []);
  const refresh = useCallback(() => setRevision(v => ({number:v.number+1,background:true})), []);
  useEffect(() => {
    if(!enabled)return;
    const controller = new AbortController();
    const identity=JSON.stringify([path,actor]);
    const preserve=previousRequest.current===identity;
    previousRequest.current=identity;
    // A successful session recheck must not unmount an in-progress form.
    // Changed resources and every error still clear the prior response.
    setState(old=>preserve&&old.data?{...old,loading:false}:{loading:true});
    (async () => {
      try {
        const response = await fetch(path, { signal:controller.signal, credentials:'same-origin', cache:'no-store', ...(actor?{headers:{'X-Iharu-Actor':actor}}:{}) });
        const json: unknown = await response.json();
        if (!response.ok) {
          const parsed = responseErrorSchema.safeParse(json);
          const code = parsed.success ? parsed.data.code : undefined;
          const fallback = response.status === 401 ? '로그인 시간이 만료되었어요. 다시 로그인해 주세요.' : '잠시 후 다시 시도해 주세요.';
          throw Object.assign(new Error(parsed.success ? parsed.data.message || fallback : fallback), {code});
        }
        const data = schema.parse(json);
        if (!controller.signal.aborted) setState({ data, loading:false });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading:false, error:error instanceof z.ZodError ? '화면 정보를 확인하지 못했어요. 다시 불러와 주세요.' : error instanceof Error ? error.message : '연결을 확인해 주세요.', errorCode:error instanceof Error && 'code' in error ? String(error.code) : undefined });
      }
    })();
    return () => controller.abort();
  }, [path, schema, revision, actor, enabled]);
  return { ...state, retry, refresh };
}

