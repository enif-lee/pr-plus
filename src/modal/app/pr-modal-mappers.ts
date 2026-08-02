/** Pure mappers extracted from PrModalApp */

export function mapRequestedReviewersFromApi(result: any, fallback: string[] = []) {
  // POST/DELETE requested_reviewers → { users: User[], teams: Team[] }
  const users = Array.isArray(result?.users)
    ? result.users
    : Array.isArray(result?.requested_reviewers)
      ? result.requested_reviewers
      : Array.isArray(result)
        ? result
        : null;
  if (!users) return fallback;
  return users
    .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
    .map((s: string) => String(s).trim())
    .filter(Boolean);
}

export function mapAssigneesFromApi(result: any, fallback: string[] = []) {
  if (Array.isArray(result?.assignees)) {
    return result.assignees
      .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
      .map((s: string) => String(s).trim())
      .filter(Boolean);
  }
  if (Array.isArray(result) && result.every((x) => typeof x === 'string' || x?.login)) {
    return result
      .map((u: any) => (typeof u === 'string' ? u : u?.login || ''))
      .map((s: string) => String(s).trim())
      .filter(Boolean);
  }
  return fallback;
}

export function mapLabelsFromApi(result: any, fallback: any[] = []) {
  // PUT labels returns Label[] directly
  const list = Array.isArray(result)
    ? result
    : Array.isArray(result?.labels)
      ? result.labels
      : null;
  if (!list) return fallback;
  return list
    .map((l: any) => {
      if (typeof l === 'string') return { name: l, color: '' };
      const name = String(l?.name || '').trim();
      if (!name) return null;
      return {
        name,
        color: l.color || '',
        description: l.description || '',
      };
    })
    .filter(Boolean);
}

export function mergeAvatarUrls(prev: any, result: any, logins: string[] = []) {
  const map = {
    ...(prev?.avatarUrls && typeof prev.avatarUrls === 'object' ? prev.avatarUrls : {}),
  };
  for (const u of result?.assignees || []) {
    const login = u?.login || '';
    if (login && u?.avatar_url) map[String(login).toLowerCase()] = u.avatar_url;
  }
  for (const u of result?.users || []) {
    const login = u?.login || '';
    if (login && u?.avatar_url) map[String(login).toLowerCase()] = u.avatar_url;
  }
  for (const login of logins) {
    const key = String(login).toLowerCase();
    if (!map[key] && prev?.avatarUrls?.[key]) map[key] = prev.avatarUrls[key];
  }
  return map;
}
