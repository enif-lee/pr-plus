# PR detail Diff key-hold 성능 분석 및 개선 리포트

작성일: 2026-08-11
대상: `pr+` 1.9.9, `enif-lee/pr-plus` PR #14
범위: Diff page scrolling, file navigation, change-region/selection navigation의 키 홀드 반복

## 결론

PR detail 페이지의 embed가 PR list의 modal보다 느렸던 원인은 단일 이벤트 핸들러가 아니라, 같은 키 반복마다 아래 비용이 겹쳤기 때문이다.

1. `activeFilePath` 변경이 `PrModalShell` 조합 루트와 `VirtualDiff`를 다시 렌더했다.
2. 파일 이동마다 `scrollIntoView()`가 embed의 큰 GitHub 문서까지 레이아웃/스크롤 계산에 참여시켰다.
3. Diff 스크롤 위치를 DOM과 Zustand에 매번 함께 쓰면서 `DiffWorkspace` 렌더를 추가했다.
4. Alt 키 홀드 중 active file이 바뀔 때 body portal인 shortcut hint가 반복해서 이동했다.
5. host의 progressive detail paint와 selection URI 갱신이 입력 프레임과 경쟁했다.
6. detail embed는 modal과 달리 GitHub 원문 DOM을 같은 문서에 유지하므로 React commit 뒤의 layout 범위와 비용이 더 컸다.
7. 초기 side fetch가 계속 갱신되면 open-progress watchdog의 10초 기한도 계속 재설정돼, 입력 중 host paint가 예상보다 오래 지속될 수 있었다.

수정 후 동일 PR의 modal/embed 비교에서 세 동작의 p95가 모두 약 18ms로 수렴했다. 특히 embed file navigation은 종전 66.7~83.3ms에서 17.6ms로, change-region 이동은 50~66.7ms에서 18.1ms로 개선됐다.

## 재현 및 측정 조건

- 브라우저: 프로젝트 E2E shared Chrome 세션, headed mode
- 확장: workspace build 후 `chrome.runtime.reload()`로 reload
- viewport: 1728 × 941
- 대상 PR: `enif-lee/pr-plus#14`, 355 files
- 비교 화면
  - PR list `/pulls`에서 연 modal
  - PR detail `/pull/14/changes`의 embed
- 입력: 40ms repeat 간격, 800ms key hold
- 측정
  - `requestAnimationFrame` 간격의 p50/p95/max
  - `PerformanceObserver` long-task
  - 실제 전달된 shortcut event 수
  - Chrome performance trace의 React scheduler/commit 및 Layout 구간

PR #14 최종 DOM 규모는 다음과 같았다.

| 화면 | 전체 노드 | GitHub native 영역 노드 | pr+ 노드 | 파일 행 |
|---|---:|---:|---:|---:|
| list modal | 6,037 | 759 | 3,687 | 383 |
| detail embed | 10,994 | 5,591 | 3,718 | 383 |

pr+ 자체 노드 수는 비슷하지만 embed는 같은 document에 약 4,800개의 GitHub 노드를 더 유지한다. 따라서 같은 React update라도 레이아웃 경계가 없으면 detail 쪽의 후속 스타일/layout 비용이 훨씬 커진다.

## 수정 전 증상

여러 반복 run에서 관찰한 범위다. 수치는 브라우저 상태와 progressive load의 겹침에 따라 달라졌지만 방향은 일관됐다.

| 800ms hold | list modal p95 | detail embed p95 | modal event | embed event |
|---|---:|---:|---:|---:|
| page scroll | 약 17.6ms | 50~166.8ms | 14~19 | 9~12 |
| file navigation | 25.9~41.8ms | 66.7~83.3ms | 14~18 | 9~12 |
| change-region / selection | 17~24ms | 50~66.7ms | 14~19 | 9~12 |

Chrome trace에서는 embed의 Layout 합계가 348.7ms, 평균 9.96ms였고 modal은 합계 116.6ms, 평균 2.29ms였다. 느린 프레임은 React scheduler/commit 뒤에 document layout이 이어지는 형태였다. 즉 키 이벤트 자체의 분기 비용보다, 이벤트가 만든 상태 변경과 레이아웃 파급이 병목이었다.

## 원인별 분석

### 1. 조합 루트의 `activeFilePath` 구독

기존 `PrModalShell`은 `activeFilePath`를 직접 구독했고, 이 값이 `DiffWorkspace`, `FolderFileTree`, `VirtualDiff`로 전달됐다. 파일 키 한 번마다 큰 조합 루트가 다시 실행되고 virtual row 계층도 갱신됐다.

modal에서도 같은 코드는 실행되지만, embed에서는 React commit 후 레이아웃할 같은-document DOM이 훨씬 커서 차이가 증폭됐다. 이것이 file navigation과 파일 경계를 넘는 selection navigation에서 공통으로 나타난 가장 큰 React 병목이다.

### 2. `scrollIntoView()`의 넓은 스크롤 체인

파일 이동은 active row에 `scrollIntoView({ block: 'nearest' })`를 호출했다. 이 API는 왼쪽 file tree만이 아니라 스크롤 가능한 조상과 문서 레이아웃까지 고려한다. modal은 배경 문서가 작고 overlay로 격리되어 있지만, embed는 GitHub PR 문서 안에 고정 shell이 존재하므로 계산 범위가 커졌다.

현재는 `.prp-filetree__list`의 `scrollTop`만 직접 조정하며, 키 홀드 동안에는 최종 경로 한 번에만 수행한다.

### 3. DOM scroll과 store scroll의 이중 커밋

page/file/selection 이동은 즉시 보이는 결과를 위해 DOM `scrollTop`을 바꾸면서 Zustand `scrollTop`도 갱신했다. store write는 `DiffWorkspace` 구독을 깨워 다음 frame의 React work를 추가했다.

키 홀드 중에는 DOM을 source of truth로 사용하고, burst가 140ms idle이 된 시점에 store snapshot을 한 번만 동기화하도록 변경했다.

### 4. active file chrome와 Opt hint portal

Alt 기반 파일 이동에서는 active file이 바뀔 때 row highlight뿐 아니라 `TipPopover`/Opt hint가 body portal에 mount 또는 reposition될 수 있었다. embed에서는 portal 위치 계산이 전체 문서 layout과 결합됐다.

active file 구독을 파일 row와 file header leaf로 내렸고, multi-file 키 홀드 중에는 최신 경로를 ref에만 보관한다. 키 입력이 끝나면 최종 active path만 Zustand/React에 커밋한다. 단일 파일 모드는 active path가 실제 virtual-row source를 바꾸므로 즉시 커밋한다. Opt hint는 입력 pressure 동안 끄고 idle event에서 다시 동기화한다.

### 5. host progressive paint와 URI write 경쟁

detail embed는 PR을 직접 열 때 core/detail side fetch가 진행되며 host가 새 props를 여러 차례 React root에 render한다. 사용자가 Diff로 들어가 키를 누르는 시점과 이 paint가 겹칠 수 있다. selection 이동의 route 반영도 `replaceState`와 route serialize를 반복했다.

`data-prp-diff-nav-active`를 cross-layer pressure signal로 추가했다.

- host render는 신호가 켜진 동안 80ms 단위로 coalesce하고, 마지막 snapshot을 보존한다.
- selection URI flush는 입력 중 실행하지 않고 idle 이후 재시도한다.
- scroll store, active path, Opt hint도 같은 idle 경계에서 최종 상태만 반영한다.

### 6. embed 레이아웃 경계 부재

outer embed shell은 viewport 고정/확장 geometry를 담당해 무조건적인 `contain` 적용이 위험했다. 실제로 outer containment만 적용한 실험은 file/selection 병목을 해결하지 못했다.

대신 실제 Diff body인 `.prp-body-panel--diff.prp-body-panel--active`에 `contain: layout style paint`를 적용했다. shell geometry는 유지하면서 React commit의 layout/paint 파급을 Diff 패널 안으로 제한한다.

### 7. open-progress watchdog의 상대 기한화

기존 watchdog은 side progress update마다 timer를 clear/re-arm했다. 지속적인 update가 들어오면 “10초 watchdog”이 실제로는 무기한 미뤄질 수 있었다. 또한 timer가 core loading 중 발화하면 그대로 종료돼 재확인하지 않았다.

현재는 첫 busy 시점부터 절대 10초 기한을 유지하고, core가 아직 loading이면 1초 뒤 재확인한다. 이는 직접적인 steady-state 키 핸들러 비용은 아니지만 detail에서 progressive render가 입력과 경쟁하는 시간을 제한한다.

## 반증 실험

### GitHub native DOM 제거

embed에서 숨겨진 GitHub native DOM을 임시 제거하면 초기/page scroll 일부는 개선됐지만 file navigation과 selection navigation의 큰 차이는 남았다. 따라서 “DOM 수가 많아서”만으로는 설명되지 않고, pr+의 상태 커밋과 layout-triggering API가 큰 DOM에 파급되는 조합이 원인이었다.

### outer containment만 적용

outer shell containment 한 줄만으로는 file/selection p95가 개선되지 않았다. 비용 발생 지점과 geometry 책임이 다른 탓이다. 최종 구현은 active Diff panel에만 내부 경계를 둔다.

### GitHub key listener 차단

기존 window capture listener의 `stopPropagation()`은 document/body로 내려가는 listener는 막지만 같은 window에 먼저 등록된 listener는 막을 수 없다. `stopImmediatePropagation()`은 pr+의 다른 window listener까지 차단할 위험이 있다. trace에서 GitHub JS 자체는 주 병목이 아니었으므로 더 강한 전역 차단은 적용하지 않았다. 대신 pr+가 만드는 React/layout/host 경쟁을 제거했다.

## 구현 내용

### 입력 critical path

- `PrModalShell`의 multi-file active-path 루트 구독 제거
- key-hold 최신 active path를 ref에 보관하고 idle에 한 번 커밋
- file tree `scrollIntoView()` 제거, local scroller `scrollTop` 사용
- page/file/selection scroll의 per-hop Zustand write 제거
- file/page/region/selection 작업별 성능 sample 기록

### 렌더 경계

- file tree active 상태를 memoized row leaf selector로 이동
- Diff file header active 상태를 header leaf selector로 이동
- `VirtualDiff`와 `DiffWorkspace`의 active-path prop chain 제거
- active Diff panel에 layout/style/paint containment 적용

### cross-layer scheduling

- Diff navigation pressure marker 추가
- host progressive render coalescing
- URI route write와 Opt hint를 idle 이후 동기화
- open-progress watchdog 절대 기한 보장

### 계측과 회귀 방지

- `diff-nav-perf` snapshot에 `operation` 및 `byOperation` 추가
- 동일 PR #14 modal/embed parity E2E 추가
- heavy PR 예산을 p95 400ms에서 80ms로 강화
- modal 대비 embed p95는 `max(50ms, modal + 25ms)` 이하, event 수는 modal보다 4개 이상 적지 않도록 검증
- architecture gate로 루트 구독, leaf 구독, local scroll, idle commit, host/URI yield, containment을 고정

## 수정 후 결과

최종 build/reload 후 같은 브라우저 run에서 얻은 결과다.

| 800ms hold | list modal p95 | detail embed p95 | modal event | embed event |
|---|---:|---:|---:|---:|
| page down | 17.9ms | 18.5ms | 19 | 18 |
| page up | 17.6ms | 18.2ms | 18 | 19 |
| file next | 17.5ms | 17.6ms | 17 | 16 |
| change-region next | 18.2ms | 18.1ms | 19 | 16 |

embed의 최종 p95 차이는 page down +0.6ms, page up +0.6ms, file +0.1ms, change-region -0.1ms다. 키 반복 처리량도 modal 대비 0~3 event 차이로 parity 예산 안에 들어왔다.

### long-task 관측 주의점

최종 ad-hoc 비교 프로브의 embed file 구간에서 `PerformanceObserver`가 167ms entry 하나를 보고했지만 같은 구간 rAF max는 18.5ms였고 16회 입력이 처리됐다. observer가 측정 시작 경계 이전에 시작한 task를 뒤늦게 전달했을 가능성을 배제할 수 없어 이 entry만으로 사용자 가시 stall로 귀속하지 않았다. 별도의 정식 perf E2E에서는 max long-task 120ms 예산을 포함한 8개 테스트가 모두 통과했다. 향후에는 task start/end가 측정 창 안에 완전히 포함된 entry만 집계하도록 probe를 보강할 가치가 있다.

## 검증 결과

- `npm run build`: 통과
- `npm run typecheck`: 통과
- 관련 unit/architecture: 34/34 통과
- 전체 unit: 1,245/1,245 통과
- perf E2E: 8/8 통과
- 동일 PR modal/embed manual probe: 세 동작 모두 약 18ms p95
- `git diff --check`: 통과

`npm run check`의 최초 실행은 사용자가 보관 중인 미추적 `.tmp-release-strip/fetch-pulls.dev-backup.js`의 기존 ESLint 오류 3개 때문에 lint 단계에서 중단됐다. 해당 파일은 수정하지 않았다. 추적 파일만 대상으로 한 ESLint는 오류 0개였고, typecheck와 전체 unit은 별도로 모두 통과했다.

## 남은 위험과 권고

1. embed는 여전히 modal보다 같은 document의 DOM이 크므로 GitHub DOM 구조가 크게 바뀌면 layout 비용이 다시 늘 수 있다. 새 동일-PR parity E2E가 이를 감지한다.
2. 키 홀드 중 file tree active highlight는 의도적으로 최종 경로 커밋까지 최대 140ms 늦게 settle될 수 있다. 본문은 즉시 이동하며, 이 지연이 per-hop React/layout을 없애는 핵심 trade-off다.
3. host render coalescing은 최신 snapshot을 버리지 않는다. 다만 향후 navigation marker를 추가하는 경우 unmount cleanup과 최종 flush 계약을 같은 gate에 포함해야 한다.
4. ad-hoc long-task probe의 측정 경계 문제는 정식 계측으로 승격할 때 보정하는 것이 좋다.

종합하면, detail embed가 구조적으로 느릴 수밖에 있었던 것이 아니라 동일한 per-key 상태/스크롤 작업이 더 큰 document layout에 전파되던 문제였다. critical path를 DOM-first·leaf subscription·idle final commit으로 바꾸고 Diff 내부 containment를 추가함으로써 modal과 실질적으로 같은 반응성에 도달했다.
