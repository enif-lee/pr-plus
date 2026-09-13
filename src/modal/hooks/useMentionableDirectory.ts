/**
 * Query-scoped GitHub mentionableUsers for comment/description @ typeahead.
 * Does not use the collaborator-only reviewer directory.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeMentionCandidates } from '../lib/markdown-composer';
import { useDomainDetail } from '../app/domain-detail-context';

export function useMentionableDirectory(localCandidates: any[] = []) {
  const detail = useDomainDetail();
  const [remote, setRemote] = useState<any[]>([]);
  const queryRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const search = useCallback(
    (query: string) => {
      const q = String(query || '');
      queryRef.current = q;
      if (timerRef.current) clearTimeout(timerRef.current);
      const owner = detail?.owner;
      const repo = detail?.repo;
      const api = (globalThis as any).PRTreeFetch;
      if (typeof api?.searchRepoPeople !== 'function' || !owner || !repo) {
        return;
      }
      const seq = ++seqRef.current;
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        try {
          const users = await api.searchRepoPeople(owner, repo, {
            query: q,
            kind: 'mentionable',
          });
          if (seq !== seqRef.current || queryRef.current !== q) return;
          setRemote(Array.isArray(users) ? users : []);
        } catch {
          if (seq !== seqRef.current) return;
          setRemote([]);
        }
      }, 180);
    },
    [detail?.owner, detail?.repo]
  );

  useEffect(() => {
    seqRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRemote([]);
  }, [detail?.owner, detail?.repo]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const candidates = useMemo(
    () => mergeMentionCandidates(remote, localCandidates),
    [remote, localCandidates]
  );

  return { candidates, search, remote };
}
