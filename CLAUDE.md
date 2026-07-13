# 정간보 생성기 — 작업 안내 (Claude용 코드 맵)

목적: 매 세션 파일 전체를 다시 읽지 않고 바로 해당 위치로 가기 위한 지도.
큰 리팩토링 없이 빠른 수정을 우선한다.

## 파일 구조

폴더 정리됨 — 루트엔 진입점 `index.html`(마크업)·`CLAUDE.md`·`.gitignore`만 두고, 나머지는
기능별 폴더로 묶었다. **index.html이 `css/styles.css`·`js/*.js`를 상대경로로 로드**하므로 파일을
옮기면 이 script/link 태그도 같이 고쳐야 한다.

- `index.html` (~950줄, 루트) — 마크업 전부. 패널·버튼마다 "왜 이렇게 뒀는지" 주석이 붙어 있음.
- `js/app.js` (~4100줄) — 단일 IIFE. **섹션 마커로 탐색**: `grep -n "// ----------" js/app.js`
  가 목차 역할을 한다 (렌더/에디터/팔레트/재생/저장/되돌리기 등 30여 섹션).
- `js/analytics.js` — 익명 사용 통계 래퍼(쿠키·식별자 없음). app.js는 `track(name, {v})` 안전
  호출만 하고, 전송은 이 파일의 GoatCounter 어댑터가 담당(GOATCOUNTER_CODE 비면 대기 모드,
  로컬/DNT 제외). 검증은 `window.jgbTrack.recent`(메모리 링 20건). app.js보다 먼저 로드.
- `css/styles.css` (~940줄) — 위→아래 순서가 화면 구성 순서와 대체로 일치
  (상단바 → 사이드바 → 리본 → 독/팔레트 → 툴팁 → 인쇄).
- `js/notes-data.js`·`js/symbols-data.js`·`js/janggu-data.js` — 생성된 데이터(데이터 URL 포함).
  직접 수정 금지. `assets/symbol_svgs/` 원본을 바꿔도 앱은 `js/symbols-data.js`를 읽으므로 재생성 필요.
  `js/symbols-data.js`(window.SYM_DATA)는 `tools/gen-symbols-data.mjs`로 생성 —
  `assets/symbol_svgs/{symbols,tempo,special}` 세 폴더를 스캔한다(폴더 간 파일명 중복 금지).
  재생성: `node tools/gen-symbols-data.mjs` (리포 루트). 키 = 확장자 없는 파일명.
- `assets/symbol_svgs/`·`assets/janggu_svgs/` — 데이터 JS 생성용 SVG 원본(빌드 입력, 브라우저는 안 읽음).
- `tools/gen-symbols-data.mjs` — 위 생성기. `docs/기능-정리.md` — 사용자용 기능 설명서.
- `references/` — 참고 자료(가야금주법·장구 시김새·악보 예시·정악보·legacies, git 미추적/이미지 무시).
  `_보관/`은 gitignore. `paper/`는 논문(코드와 별개).

## 핵심 구조 요약

- 입력 방식 2가지: 에디터 / 직접 입력. `applyInputMode()`(app.js)가 전환하며
  `body.input-direct` 클래스 하나로 CSS가 갈라진다.
  - 직접 입력: 기능바(#melodyRibbon)가 #main 최상단으로 이동, 도구창(.direct-win)들이
    악보 위에 떠서 한 번에 하나만 열림(`activateDirectPanel`).
  - 에디터: 기능바가 #editorDock 맨 위로 이동, 레일 탭(선율/장단/가사/텍스트/셀 서식)으로 전환.
- 기능바(.ribbon)는 `flex-wrap: wrap` — 좁으면 줄바꿈, 스크롤 금지(항상 전부 보여야 함).
- 기능바 도킹(직접 입력 전용): #ribbonPosToggle이 위쪽 가로 ↔ 왼쪽 세로 전환
  (`ribbonPos` 상태 + `body.ribbon-left` 클래스, `applyRibbonPos()`). #leftDock 래퍼가
  위쪽 배치에선 display:contents(없는 셈), 왼쪽 도킹에선 세로 열이 된다. 왼쪽 도킹일 때
  `dockDirectWins()`가 열린 도구창(팔레트)을 #melodyRibbon **안**으로 넣고, CSS flex
  `order`(입력 그룹 뒤 형제 order:3, 도구창 order:2)로 '입력' 그룹 바로 아래에 오게 한다.
  도킹된 창은 카드 스타일을 벗고(배경·테두리 없음) 기능바와 한 몸처럼 보인다. 닫히거나
  위쪽 배치로 돌아가면 placeholder 주석 노드로 원위치 복원.
- 도구창 헤더는 창마다 클래스가 다름: 율명=`.pal-head`, 시김새·셀서식=`.pal-top`,
  장단·가사·텍스트=`.melody-head`. 닫기(X) 겹침 방지 padding-right는 이 세 클래스 모두 대상.
- 장단·가사 창의 초기화(+가사 글씨체)는 예전 상단 별도 리본 박스에 있었으나 X와 겹쳐
  머리줄(.melody-head) 오른쪽 끝(`.mh-right`/`.mh-reset`)으로 이전. 끌기 그립도 머리줄 안
  `.bar-grip.dock-panel-grip`으로 옮겨 플로팅 끌기 유지(attachBarDrag가 첫 .bar-grip 사용).
- 이름 미상 시김새 sigimsae-00~25는 팔레트에 s00~s08·s12~s16·s20~s25(임시 이름=파일번호)로 등록
  — 정식 이름이 정해지면 ORN_LIST의 `k`만 바꾸면 됨(토큰 `{s01}` 꼴도 같이 바뀜에 유의).
  파일 stem은 그대로, 표시 이름(k)·순서만 조정 가능. (파일 09·10·11·17·18·19는 없음.
  sigimsae-01은 표시명 s01 그대로 — 예전 s11 별칭은 폐기, s11이라는 별도 SVG는 존재한 적 없음.)
  이 SVG들은 원래 viewBox 안 여백이 커 잉크가 박스의 ~45%만 채워 작게 보였음 → assets/symbol_svgs
  원본의 viewBox를 잉크 경계로 크롭(여백 3%)해 다른 기호처럼 꽉 채우게 만듦(다시 다듬으려면
  같은 방식으로 재크롭 후 js/symbols-data.js 재생성). 그래서 크기 보정 코드는 없음.
- 빠르기(tempo) 시김새 5종(assets/symbol_svgs/tempo, 한글 stem)은 ORN_LIST에 `c:"tempo"`로 등록되고
  buildOrnPalette의 세 번째 그룹 "빠르기"에 나온다. **토큰에 공백 금지**(drawCell이 content를 공백으로
  분박 분할하므로 k=stem 그대로 공백 없이). 렌더는 숨표(<)처럼 칸 배치에서 빼고(rowToks 필터·
  buildAudioEvents 필터) 정간 **바깥 오른쪽**에 세로로 그린다 — `drawSymImageRect`(세로 박스, meet).
  가사가 켜져 있으면 가사 줄 폭(lyGap+lyW)만큼 더 바깥에 놓아 겹치지 않게 함(drawCell의 lyPad 인자,
  호출부에서 전달). 빠르기는 붙임표 시김새 아니라 숫자단축키(ORN_ADD_ALL=wo/both)에서 자연 제외.
- 가사 특수기호: assets/symbol_svgs/special 8종(가로막대·세로막대·늘임표·뜰·모지·장지·튕김·연튕김)을
  가사 도구창(#lyricsArea)의 팔레트 #lyricsSymRow(buildLyricSymPal, LYRIC_SYMS)에서 클릭 →
  `insertLyricToken`이 편집 중인 가사 칸/커서에 `{stem}` 토큰 삽입. drawLyricCell이 행 문자열이
  `{stem}`(공백 없어야 한 분박)이고 symURL 있으면 글자 대신 이미지로 그린다. setLyricText는 `{}`를
  안 지워서 토큰이 보존됨. special의 늘임표 stem은 시김새 늘임표(k)→fermata(s)와 별개 키.
- 색은 전부 styles.css `:root`의 역할별 변수(`--bg/--panel/--soft/--hover/--track/--line/
  --ink/--muted/--accent/--accent-soft/--accent-tint/--overlay/--danger*` 등)를 통한다.
  새 색을 하드코딩하지 말고 이 변수를 쓸 것 — 다크모드(`body.dark`, 파일 끝)가 변수 값만
  갈아끼워 동작한다. 예외: 피아노 건반·강조색 위 흰 글자(`color:#fff`)·말풍선은 테마 무관
  고정색. 악보(종이)는 별도 흰색 SVG라 다크에서도 흰 종이(인쇄·PNG 안 바뀜). 다크는
  상단바 #darkToggle 수동 토글(`jgb_dark_v1`), `@media print`는 항상 라이트로 강제.
- 리본/도구창 버튼 툴팁은 CSS ::after가 아니라 #ribbonTipFloat(JS 위치 계산) 하나를 공유.
- 세로 flex 도구창 안의 머리줄(.pal-top 등)은 `flex: 0 0 auto` 필수 — 없으면 max-height에
  눌려 짜부라지며 자식 버튼이 삐져나온다.
- 되돌리기는 전역 하나뿐(⌘/Ctrl+Z, render()마다 스냅샷·600ms 디바운스). 장단/가사
  전용 되돌리기는 제거했음 — 다시 만들지 말 것.
- 한글 IME keydown 핸들러엔 `e.isComposing || e.keyCode === 229` 가드 필수.
- 선율/가사 데이터에서 빈 정간은 반드시 `" | "` 꼴 (`||`는 옛 각-구분으로 파싱됨).
  가사는 각·줄 단위로 선율과 1:1 — 줄 넣고 뺄 때 같이 밀고 당겨야 함(insertGakBelow 참고).
- 도움말/둘러보기/환영 카드: 상단바 #btnHelp → #helpModal(4탭, 전용 .help-tab/.help-pane —
  전역 .tab/.tabpanel은 사이드바가 문서 전체를 토글하므로 절대 혼용 금지), 투어는 #tourLayer
  (TOUR_STEPS, app.js "도움말 센터" 섹션). 진짜 첫 방문(`jgb_welcome_v1`·`jgb_guide_seen_v1`·
  상태 전부 없음)에만 환영 카드 → 어떤 선택이든 새 문서 마법사로 수렴.

## 프리뷰 검증 (.claude/launch.json의 "jgb")

- iCloud 폴더라 프리뷰 서버 프로세스가 직접 못 읽음 — launch.json은 /tmp/jgb-mirror-wt를
  서빙하고, 파일 수정 후엔 Bash에서 rsync로 미러 갱신 + 리로드해야 반영됨:
  `rsync -a --delete --exclude .git --exclude .claude --exclude paper --exclude references --exclude _보관 "<워크트리>/" /tmp/jgb-mirror-wt/`
  (paper/ 안 일부 한글 파일명이 rsync에서 Illegal byte sequence를 내므로 반드시 제외. 앱은 index.html·
  css/·js/ 만 있으면 돌아가므로 references/·_보관/·assets/·tools/는 제외해도 무방)
- 첫 로드에 새 문서 모달이 뜸 → `document.getElementById('ndCancel').click()`.
  localStorage가 완전히 비어 있으면 대신 환영 카드(#welcomeModal)가 뜸 → `#wcSkip` 클릭.
- 직접 입력 전환: `const s=document.getElementById('melInputSelect'); s.value='direct'; s.dispatchEvent(new Event('change'))` (입력 방식은 #modeBox 안 드롭다운).
- preview_eval에서 DOMRect는 `{}`로 직렬화됨 — `[left,top,right,bottom]` 배열로 손수 변환.
- 뷰포트가 0×0으로 측정되면 preview_resize 후 다시 측정.
- requestAnimationFrame·scrollIntoView(smooth)는 실행 안 됨 — setTimeout 사용.
- 실제 클릭(preview_click)은 뷰포트 리사이즈 후 좌표가 어긋나 `<html>`에 떨어질 수 있음 —
  preview_eval에서 `.click()`으로 대신할 것.
- 테스트 후 `localStorage.clear()`로 원상복구(키: jgb_state_v1, jgb_guide_seen_v1, jgb_welcome_v1).

## 관례

- UI 문구는 -니다체, 여러 문장이면 `•` 글머리표.
- 커밋은 요청 시에만, 한국어 conventional(feat:/fix:/chore:).
- 레이아웃 기준은 `악보 예시/`의 취타·군악 이미지(전통 방식: 오른쪽→왼쪽).
