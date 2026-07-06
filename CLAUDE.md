# 정간보 생성기 — 작업 안내 (Claude용 코드 맵)

목적: 매 세션 파일 전체를 다시 읽지 않고 바로 해당 위치로 가기 위한 지도.
큰 리팩토링 없이 빠른 수정을 우선한다.

## 파일 구조

- `index.html` (~950줄) — 마크업 전부. 패널·버튼마다 "왜 이렇게 뒀는지" 주석이 붙어 있음.
- `app.js` (~4100줄) — 단일 IIFE. **섹션 마커로 탐색**: `grep -n "// ----------" app.js`
  가 목차 역할을 한다 (렌더/에디터/팔레트/재생/저장/되돌리기 등 30여 섹션).
- `styles.css` (~940줄) — 위→아래 순서가 화면 구성 순서와 대체로 일치
  (상단바 → 사이드바 → 리본 → 독/팔레트 → 툴팁 → 인쇄).
- `notes-data.js`·`symbols-data.js`·`janggu-data.js` — 생성된 데이터(데이터 URL 포함).
  직접 수정 금지. symbol_svgs/ 원본을 바꿔도 앱은 symbols-data.js를 읽으므로 재생성 필요.
- `기능-정리.md` — 사용자용 기능 설명서.

## 핵심 구조 요약

- 입력 방식 2가지: 에디터 / 직접 입력. `applyInputMode()`(app.js)가 전환하며
  `body.input-direct` 클래스 하나로 CSS가 갈라진다.
  - 직접 입력: 기능바(#melodyRibbon)가 #main 최상단으로 이동, 도구창(.direct-win)들이
    악보 위에 떠서 한 번에 하나만 열림(`activateDirectPanel`).
  - 에디터: 기능바가 #editorDock 맨 위로 이동, 레일 탭(선율/장단/가사/텍스트/셀 서식)으로 전환.
- 기능바(.ribbon)는 `flex-wrap: wrap` — 좁으면 줄바꿈, 스크롤 금지(항상 전부 보여야 함).
- 리본/도구창 버튼 툴팁은 CSS ::after가 아니라 #ribbonTipFloat(JS 위치 계산) 하나를 공유.
- 세로 flex 도구창 안의 머리줄(.pal-top 등)은 `flex: 0 0 auto` 필수 — 없으면 max-height에
  눌려 짜부라지며 자식 버튼이 삐져나온다.
- 되돌리기는 전역 하나뿐(⌘/Ctrl+Z, render()마다 스냅샷·600ms 디바운스). 장단/가사
  전용 되돌리기는 제거했음 — 다시 만들지 말 것.
- 한글 IME keydown 핸들러엔 `e.isComposing || e.keyCode === 229` 가드 필수.
- 선율/가사 데이터에서 빈 정간은 반드시 `" | "` 꼴 (`||`는 옛 각-구분으로 파싱됨).
  가사는 각·줄 단위로 선율과 1:1 — 줄 넣고 뺄 때 같이 밀고 당겨야 함(insertGakBelow 참고).

## 프리뷰 검증 (.claude/launch.json의 "jgb")

- 첫 로드에 새 문서 모달이 뜸 → `document.getElementById('ndCancel').click()`.
- 직접 입력 전환: `document.querySelector('#melInputSeg .seg-btn[data-mode="direct"]').click()`.
- preview_eval에서 DOMRect는 `{}`로 직렬화됨 — `[left,top,right,bottom]` 배열로 손수 변환.
- 뷰포트가 0×0으로 측정되면 preview_resize 후 다시 측정.
- requestAnimationFrame·scrollIntoView(smooth)는 실행 안 됨 — setTimeout 사용.
- 테스트 후 `localStorage.clear()`로 원상복구(키: jgb_state_v1, jgb_guide_seen_v1).

## 관례

- UI 문구는 -니다체, 여러 문장이면 `•` 글머리표.
- 커밋은 요청 시에만, 한국어 conventional(feat:/fix:/chore:).
- 레이아웃 기준은 `악보 예시/`의 취타·군악 이미지(전통 방식: 오른쪽→왼쪽).
