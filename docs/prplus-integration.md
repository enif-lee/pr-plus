# pr+ 페이지 API — 서드파티 연동 가이드

이슈 트래커, 배포 보드, 내부 어드민처럼 **GitHub이 아닌 사이트**에서 pr+ 리뷰 모달을 열고 닫는 방법입니다. 페이지에 `window.PRPlus`가 주입되면, 여러분의 툴은 GitHub으로 나가지 않고 같은 탭 오버레이로 Conversation / Diff를 띄울 수 있습니다.

대상 독자: 자체 웹앱에 pr+를 붙이려는 제품 개발자.  
구현 계약 SoT: [`src/page-api/types.ts`](../src/page-api/types.ts).

---

## 1. 한 줄 요약

1. 사용자가 pr+를 설치하고 **github.com PAT**를 저장한다.
2. 팝업 **Connected sites**에 **여러분의 HTTPS 호스트**를 등록하고 Chrome 권한을 허용한다.
3. 해당 탭을 새로고침하면 `window.PRPlus`가 생긴다.
4. `PRPlus.open({ owner, repo, number, target: 'opener-embed' })`로 오버레이를 연다.

GitHub PR 링크(`https://github.com/{owner}/{repo}/pull/{n}`)를 클릭하면, 등록된 사이트에서는 기본으로 오버레이가 열립니다. `⌘/Ctrl+클릭`은 그대로 GitHub로 갑니다.

---

## 2. 전제

| 항목 | 설명 |
|------|------|
| 브라우저 | Chromium MV3 (Chrome / Edge). 사용자가 확장 프로그램을 설치해야 합니다. |
| 설치 | [Chrome Web Store](https://chromewebstore.google.com/detail/pr+/iohbbnefenodmnlejjkjjkfkhifnabii) 또는 이 저장소 Load unpacked |
| PAT | 팝업 **Default PAT**(github.com) 또는 Enterprise 호스트 쌍. 토큰이 없으면 오버레이 호스트가 꺼져 `open`이 거절됩니다. |
| 사이트 허가 | `https://your.example.com/*` 를 Connected sites에 추가. HTTP는 `localhost` / `127.0.0.1`만. |
| 페이지 권한 | 페이지 JS는 `chrome.runtime`에 접근하지 않습니다. 공개 표면은 `window.PRPlus`뿐입니다. |

PAT와 PR 상세 캐시는 **확장 서비스 워커**가 소유합니다. 페이지 origin IndexedDB나 여러분 서버로 토큰이 내려가지 않습니다.

---

## 3. 호스트 등록 (사용자 1회)

제품이 할 일은 **도메인을 안내**하는 것입니다. 권한 대화는 Chrome이 띄웁니다.

1. 확장 아이콘 → pr+ 팝업 → **Connected sites**.
2. 프리셋 **Linear** / **Jira** / **Localhost**, 또는 입력칸에 호스트를 넣고 **Add**.
3. Chrome이 “이 사이트의 데이터를 읽고 변경”을 물으면 허용.
4. 해당 사이트 탭을 **새로고침**.

입력 규칙:

| 입력 | 등록되는 매치 |
|------|----------------|
| `app.example.com` | `https://app.example.com/*` |
| `*.example.com` | `https://*.example.com/*` (서브도메인) |
| `https://jira.corp.example/browse/X` | `https://jira.corp.example/*` |
| `github.com` | 거절 (이미 기본 포함) |
| `http://intranet` | 거절 (커스텀은 HTTPS만) |

등록된 모든 사이트는 Linear와 같이 **오버레이 호스트**를 받습니다 (`window.PRPlus` + GitHub PR 클릭 가로채기). GitHub 리스트/온보딩 스택은 주입되지 않습니다.

---

## 4. 페이지에서 사용 가능 여부

심은 `document_start`에 붙고, 오버레이 호스트는 `document_idle`에 붙습니다. 첫 페인트 직후 한 프레임은 `PRPlus`가 없거나 `ping`이 실패할 수 있습니다.

```js
async function waitForPRPlus(timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const api = window.PRPlus;
    if (api && typeof api.ping === 'function') {
      const p = await api.ping();
      if (p && p.ok) return api;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

const prplus = await waitForPRPlus();
if (!prplus) {
  // 확장이 없거나, Connected sites에 이 호스트가 없음, 또는 탭을 아직 새로고침하지 않음
}
```

런타임 힌트(선택):

- `document.documentElement.getAttribute('data-prp-runtime') === 'partner'` — 오버레이 호스트가 이 탭에서 돌고 있음
- `PRPlus.version` — 문자열, 예: `"1.10.2"`

`PRPlus`가 없으면 기능 플래그를 끄거나 “pr+에서 열기” 버튼을 숨기세요. 확장 미설치를 여러분의 장애로 취급하지 마세요.

---

## 5. `window.PRPlus` 계약

```ts
type PRPlus = {
  version: string;
  ping(): Promise<{ ok: true; version: string } | { ok: false; error: string }>;
  open(args: PrPlusOpenArgs): Promise<PrPlusOpenResult>;
  close(): Promise<{ ok: boolean; error?: string }>;
  status(): Promise<PrPlusStatus | { ok: false; error: string }>;
};
```

모든 메서드는 **Promise**입니다. `chrome.*`를 부르지 마세요.

### 5.1 `open(args)`

필수: `owner`, `repo`, `number`(양수).

```js
const out = await window.PRPlus.open({
  owner: 'rtzr',
  repo: 'iac',
  number: 1911,
  target: 'opener-embed', // 이 탭 오버레이 (권장)
  page: 'conversation',   // 또는 'diff'
});
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `owner` | string | GitHub owner / org |
| `repo` | string | 저장소 이름 |
| `number` | number | PR 번호 |
| `target` | string | 아래 표 |
| `page` | `'conversation' \| 'diff'` | 처음 보여줄 면 |
| `githubHost` | string | GHES 웹 호스트. 생략 시 팝업 **Active GitHub** (기본 `github.com`) |
| `position` | string | 딥링크 (`#issuecomment-…`, `#discussion_r…`) |
| `filePath` / `fileKey` | string | Diff 파일 |
| `startLine` / `endLine` / `side` | number / `'LEFT'\|'RIGHT'` | Diff 줄 선택 |
| `commitSha` / `commitEndSha` | string | 커밋 범위 Diff |
| `presentation` | `'modal' \| 'embed'` | 파트너 탭에서는 항상 오버레이로 강제됩니다 |

`target`:

| 값 | 동작 |
|----|------|
| `'opener-embed'` | **이 탭**에 모달/사이드 시트. Connected site에서 권장. |
| `'auto'` | 허가된 파트너 탭이면 오버레이, 아니면 기존 GitHub 탭 / 확장 셸 / 새 GitHub 탭 |
| `'github-tab'` | github.com(또는 `githubHost`) 탭에서 연다 |
| `'extension-shell'` | `chrome-extension://…/src/shell/shell.html` 탭 |

성공 예:

```json
{
  "ok": true,
  "status": {
    "ready": true,
    "open": true,
    "owner": "rtzr",
    "repo": "iac",
    "number": 1911,
    "presentation": "modal",
    "githubHost": "github.com",
    "renderTarget": "opener-embed",
    "callerOrigin": "https://app.example.com"
  }
}
```

실패 시 `{ ok: false, error }`입니다. 자주 보는 코드:

| `error` | 의미 |
|---------|------|
| `bridge-timeout` | 심이 isolated 브리지와 연결되지 않음. 탭 새로고침 / 사이트 재등록 |
| `invalid-args` | owner/repo/number 누락 |
| `not-supported` | `opener-embed`인데 이 origin이 Connected sites에 없음 |
| `host-disabled` | PAT 없음 또는 팝업에서 pr+ 꺼짐 |
| `rate-limited` | 같은 origin에서 분당 약 10회 초과 |
| `no-host-tab` | 셸/GitHub 탭을 만들지 못함 |

`status().callerOrigin`은 **이 페이지 origin이 연 세션**만 가리킵니다. 다른 탭의 모달을 훔쳐볼 수 없습니다.

### 5.2 `close()` / `status()` / `ping()`

```js
await window.PRPlus.status();
await window.PRPlus.close();
await window.PRPlus.ping(); // { ok: true, version }
```

`close`는 이 origin이 연 오버레이(또는 연결해 둔 셸)를 닫습니다.

---

## 6. 제품에 붙이는 패턴

### 6.1 버튼으로 열기

```html
<button type="button" id="open-pr">Review in pr+</button>
<script type="module">
  const btn = document.getElementById('open-pr');
  btn.addEventListener('click', async () => {
    const api = window.PRPlus;
    if (!api) {
      btn.title = 'Install pr+ and add this site under Connected sites';
      return;
    }
    await api.open({
      owner: 'acme',
      repo: 'payments',
      number: 42,
      target: 'opener-embed',
      page: 'diff',
    });
  });
</script>
```

### 6.2 이미 있는 GitHub 링크

등록된 사이트에서는 `<a href="https://github.com/acme/payments/pull/42">` 왼쪽 클릭이 오버레이로 바뀝니다. 링크 href만 유지하면 됩니다. 칩/버튼이 링크를 감싸도 됩니다.

가로채기를 피하려면:

- `⌘/Ctrl/Shift/Alt`와 함께 클릭
- `target`을 쓰되, 사용자가 modifier로 GitHub을 열게 안내

모달 안(닫기, Open on GitHub, 사이드 시트 토글)은 가로채지 않습니다.

### 6.3 React

```tsx
async function openPrPlus(pr: { owner: string; repo: string; number: number }) {
  const api = window.PRPlus;
  if (!api) return { ok: false as const, error: 'prplus-missing' };
  return api.open({ ...pr, target: 'opener-embed' });
}
```

`window.PRPlus` 타입은 아래를 복사해 쓰거나 [`src/page-api/types.ts`](../src/page-api/types.ts)를 참고하세요.

```ts
export type PrPlusOpenArgs = {
  owner: string;
  repo: string;
  number: number;
  page?: 'conversation' | 'diff' | null;
  position?: string | null;
  githubHost?: string | null;
  target?: 'auto' | 'extension-shell' | 'github-tab' | 'opener-embed';
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  side?: 'LEFT' | 'RIGHT' | null;
};

declare global {
  interface Window {
    PRPlus?: {
      version: string;
      ping: () => Promise<{ ok: boolean; version?: string; error?: string }>;
      open: (args: PrPlusOpenArgs) => Promise<{ ok: boolean; error?: string; status?: unknown }>;
      close: () => Promise<{ ok: boolean; error?: string }>;
      status: () => Promise<Record<string, unknown>>;
    };
  }
}
```

### 6.4 GitHub Enterprise

팝업에 GHES 호스트+PAT를 등록한 뒤:

```js
await PRPlus.open({
  owner: 'eng',
  repo: 'core',
  number: 88,
  githubHost: 'github.mycorp.com',
  target: 'opener-embed',
});
```

`githubHost`가 없으면 **Active GitHub** (보통 `github.com`) PAT/API를 씁니다. 미등록 GHES는 토큰이 없어 로드가 실패합니다.

### 6.5 로컬 개발

`Localhost` 칩 → `http://localhost/*`, `http://127.0.0.1/*`.  
커스텀 HTTP 인트라넷은 매니페스트상 허용되지 않습니다.

---

## 7. UX 권장

- **명시적 버튼**과 자동 링크 가로채기를 같이 쓰면 됩니다. 둘 다 같은 오버레이입니다.
- 오버레이가 열린 동안 Linear/보드 SPA가 라우트만 바꿔도 세션은 유지됩니다. 호스트 노드가 통째로 지워지면 remount됩니다.
- “GitHub에서 열기”는 모달 헤더에 있습니다. 제품에서 별도 `window.open(htmlUrl)`을 강제할 필요는 없습니다.
- 캐시는 확장 SW IndexedDB를 공유합니다. 같은 PR을 GitHub에서 한 번 열었으면 파트너 탭 재오픈이 빨라집니다.

---

## 8. 하지 말 것

- 페이지에서 `chrome.runtime.sendMessage`로 `PR_TREE_*`를 직접 보내기 (MAIN 월드에 `chrome` 없음. 우회해도 토큰 격리를 깨뜨림).
- 다른 확장 `id`로 연결하거나 `externally_connectable.ids`를 요구하기. 지원하지 않습니다.
- `PRPlus`를 뮤테이션 API로 쓰기. 열기/닫기/상태만 있습니다. 리뷰 작성은 모달 UI로 합니다.
- `file://` 또는 임의 HTTP 호스트에 주입을 기대하기.
- 설치 시 `https://*/*`가 이미 허용되어 있다고 가정하기. **사이트마다** 사용자 제스처로 허용해야 합니다.

---

## 9. 체크리스트

- [ ] 사용자 PAT 저장됨 (팝업에 마스크가 보임)
- [ ] Connected sites에 `https://your-app.example/*` 가 목록에 있음
- [ ] 해당 탭을 허가 **이후** 새로고침함
- [ ] `await PRPlus.ping()` → `{ ok: true }`
- [ ] `data-prp-runtime="partner"`
- [ ] `PRPlus.open({ …, target: 'opener-embed' })` 후 `#prp-modal-host` / `.prp-overlay`
- [ ] GitHub PR `<a href>` 왼쪽 클릭이 오버레이를 열고 사이트를 떠나지 않음

내부 설계·제약: [`docs/reachable-plugin-page-api-store.md`](./reachable-plugin-page-api-store.md).
