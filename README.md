<p align="center">
  <img src="assets/logo.jpg" alt="pr+ logo" width="96" height="96" />
</p>

<h1 align="center">pr+</h1>

<p align="center">
  GitHub Pull Request 목록을 <strong>스택 트리</strong>로 보고,<br />
  브랜치·리뷰·매직 링크 메타를 한눈에 정리하는 Chrome 확장 프로그램
</p>

<p align="center">
  <a href="https://github.com/enif-lee/pr-plus"><img alt="repo" src="https://img.shields.io/badge/github-enif--lee%2Fpr--plus-181717?logo=github" /></a>
  <img alt="manifest" src="https://img.shields.io/badge/manifest-v3-blue" />
  <img alt="version" src="https://img.shields.io/badge/version-1.0.2-informational" />
</p>

---

## 개요

GitHub의 PR 리스트는 기본적으로 **정렬된 평면 목록**이라, stacked PR(한 브랜치 위에 또 다른 PR) 관계를 파악하기 어렵습니다.

**pr+** 는 open PR의 `base` / `head` 브랜치 관계를 읽어:

- 리스트를 **스택 깊이(indent) 트리**로 재배치하고
- 각 행 2번째 줄 메타를 **읽기 좋은 뱃지 UI**로 재구성합니다

네이티브 GitHub 리스트 UI는 유지한 채, 최소한의 오버레이로 동작합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **스택 트리 뷰** | `baseRef === 다른 PR의 headRef` 관계로 부모–자식 연결, 왼쪽 indent로 깊이 표시 |
| **Tree / Default 토글** | 스택 순서와 GitHub 기본 정렬을 버튼으로 전환 |
| **2행 메타 재구성** | 기본 “opened by …” 줄을 숨기고 정보 밀도를 높인 한 줄로 재구성 |
| **PR 번호** | `#123` 형태, 파란색 강조 |
| **Author · 상대 시간** | 네이티브 author 링크·`<relative-time>` 유지 (hovercard 가능) |
| **Draft 뱃지** | Draft PR을 pill 뱃지로 표시 |
| **Review 뱃지** | `Review required`(빨강), `Changes requested`, `Approved` 등 |
| **브랜치 뱃지** | `base ← head` 단일 회색 칩 (낮은 강조) |
| **Magic link** | 저장소 Autolink 규칙과 title/branch가 맞으면 외부 티켓 바로가기 |
| **Private repo** | 확장 팝업에 GitHub PAT 저장 시 API로 안정 조회 |
| **SPA 대응** | Turbo/soft navigation·DOM 갱신 후에도 트리·메타 재적용 |

### 2행 메타 예시

```text
#13927  opened 2 hours ago by alice  ·  Review required  ·  ENG-42  ·  trunk ← feat/foo
```

---

## 설치

### 개발자 모드 (로컬)

1. 이 저장소를 클론합니다.
2. Chrome → `chrome://extensions`
3. **개발자 모드** ON
4. **압축해제된 확장 프로그램을 로드합니다**
5. 이 저장소 루트(`manifest.json`이 있는 폴더) 선택

### 패키지 ZIP

릴리스용 ZIP을 쓰는 경우:

```bash
# 로컬에서 패키징 예
mkdir -p dist/pr-plus && cp manifest.json dist/pr-plus/ && cp -R src dist/pr-plus/
cd dist && zip -r pr-plus.zip pr-plus
```

압축 해제한 폴더를 동일하게 **Load unpacked** 합니다.  
(`dist/` 는 git에 포함되지 않습니다.)

---

## PAT (Personal Access Token)

Private repo 또는 Autolink 조회가 필요할 때 사용합니다.

1. 툴바 **pr+** 아이콘 클릭  
2. GitHub PAT 입력 후 **Save**  
3. pulls 페이지 새로고침  

| 항목 | 내용 |
|------|------|
| 저장 위치 | `chrome.storage.local` (확장 전용, 동기화 안 함) |
| 접근 | **Service Worker만** 원문 토큰 사용 — content script에는 전달되지 않음 |
| UI | 저장 후 마스킹만 표시 (`••••` + 끝 4자) |
| 권장 스코프 | 해당 repo **Pull requests 읽기** (fine-grained 권장) |

토큰이 없어도 **public repo** open PR 목록 API는 동작합니다.

---

## 사용 방법

1. 확장 설치 후 아무 저장소의 **Pull requests** 목록으로 이동  
   (`https://github.com/{owner}/{repo}/pulls`)
2. 리스트가 스택 순서로 정렬·indent 됩니다
3. 헤더 근처 **Show default order / Show stack tree** 로 전환
4. (선택) 팝업에서 PAT 설정

---

## 권한

| 권한 | 용도 |
|------|------|
| `storage` | PAT 로컬 저장 |
| `https://github.com/*` | PR 목록 DOM 조작 |
| `https://api.github.com/*` | open PR·단건 PR·autolink API |

---

## 개발

```bash
npm install   # 테스트용 jsdom 등
npm test      # node tests/run-all.js
```

### 구조 (요약)

```text
src/
  background.js          # PAT + GitHub API (service worker)
  content-bridge.js      # content ↔ background 메시지 (토큰 미노출)
  content-bootstrap.js   # 부트스트랩 / SPA watch
  content.js             # content script 엔트리
  dom.js                 # 행 탐색, indent, 메타 UI
  fetch-pulls.js         # list / dangling / autolink
  storage.js             # chrome.storage.local 헬퍼
  tree.js                # pure 트리 빌더
  popup.html / popup.js  # PAT 설정 UI
  styles.css
```

---

## 라이선스

개인/팀 사용 목적의 프로젝트입니다. 라이선스 파일을 추가하면 이 절을 갱신하세요.
