# 정간보 생성기 — 작업 안내 (Claude용 코드 맵)

목적: 매 세션 파일 전체를 다시 읽지 않고 바로 해당 위치로 가기 위한 지도.
큰 리팩토링 없이 빠른 수정을 우선한다.

앱 이름(브랜드)은 **우물사이**(Umulsai) — 정간(井間)이 '우물 정(井) 자 사이 칸'이라는 데서 온 이름.
상단바 맨 왼쪽 #brandBox(로고+이름, 페이지 유일 h1)·탭 제목·meta description·환영 카드에 쓰인다.
로고 원본은 `assets/Gemini_Generated_Logo.png`(까치+井 붓글씨), 웹용 가공본(투명화·크롭·축소)은
`assets/brand/`이며 index.html에는 **데이터 URL로 인라인**(파비콘 포함) — 프리뷰 미러가
assets/를 제외해도 보이게. 상단바 로고는 **위쪽 크롭본**(umulsai-top-64: 까치+맨 윗 가로획,
전체 井은 작게 그리면 새가 안 보임), 파비콘은 전체 로고(favicon-64, 흰 배경). 로고를 다시
가공하면 데이터 URL도 갈아끼워야 한다. 다크모드 로고는 CSS invert(body.dark #brandBox img).
워드마크(#brandWord)는 **EBS훈민정음 SB를 아웃라인 패스로 뜬 인라인 SVG** — 폰트 파일은
안 싣는다. EBS 라이선스가 웹 임베딩·BI/CI는 허용하나 폰트 자체의 변형(서브셋 포함)·재배포는
사전 서면승인 대상이라, '폰트로 만든 로고'인 패스 방식이 그 조항을 안 건드린다(2.6KB, 모든
OS 동일). 다시 뜨려면 `python3 tools/gen-wordmark.py` → 출력을 index.html #brandWord 자리에
교체(fontTools + ~/Library/Fonts/EBS훈민정음SB.otf 필요, 폰트는 리포에 없음).
자간은 패스에 구워져 있어 CSS letter-spacing으로 못 벌린다. 잉크 경계로 크롭해서 SVG 아래끝이
글자 밑선이 아니므로 `transform: translateY(13.66%)`로 내려야 옆 "Umulsai" 글줄과 밑선이 맞는다
(음수 margin·position:top의 %는 안 먹는다 — styles.css 주석 참고). 색은 fill=currentColor라
다크모드 자동(로고 img의 invert와 무관).
문패는 로고 옆 **두 줄**(위=이름, 아래=작은 "정간보 편집기") — 위/아래 자리가 곧 위계라 부제가
부제로 읽힌다(한 줄로 옆에 붙이면 이름의 꼬리처럼 보였다). 두 줄이어도 텍스트 열이 29px라
로고(32px) 안에 들어가 상단바는 49px 그대로 — "두 줄은 답답하다"는 궁서 20px 시절 판단이니
되살리지 말 것. 부제의 `letter-spacing:.47em` + `margin-right:-.47em`은 두 줄의 **오른쪽 끝까지**
맞춘 값이다(자간이 마지막 글자 뒤에도 붙어 잉크 폭 = 박스 폭 − 자간 1개 → 박스만 맞추면 오른쪽이
4px 뜬다. 음수 마진은 그 꼬리 여백을 레이아웃에서 걷는 용). svg height나 부제 문구를 바꾸면
다시 풀어야 한다 — 계산은 styles.css 주석 참고. 로마자 "Umulsai"는 문패에서 뺐다 — 이름의 로마자와
'뭐 하는 앱인지'는 성격이 달라 `·`로 묶으면 둘 다 흐려진다(탭 제목·meta·#brandBox 툴팁엔 남음).
상단바 그룹 구분은 세로 구분선 없이 #topBar gap(16px)만으로 — 구분선
(.topbar-sep)은 제거했고 되살리지 말 것. 사이드바 머리글은 '설정'(h2.side-title).

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

- **명령은 상단바, 설정·관리는 사이드바** — 출력 명령의 집을 정한 선. 예전엔 사이드바 '출력'
  탭에 진짜 버튼이 있고 상단바 '더보기'의 m* 항목이 그걸 `.click()`으로 대신 눌러주는 위임
  구조라 같은 명령이 두 군데 있었는데, 상단바로 일원화했다(위임·중복 없음, 배선은 app.js 한 곳).
  - #btnPrint(인쇄)는 **1급 버튼**. 빈도(곡 하나에 한 번)만 보면 아래 규칙상 메뉴행이지만,
    이 앱의 최종 목적지고 위험하지도 않아 '찾기 쉬움'을 빈도보다 앞에 뒀다 — **의도된 예외**니
    규칙대로 메뉴에 도로 넣지 말 것.
  - 파일 메뉴(#fileToggle ⋯ → #filePop): #btnNewDoc · ── · #btnPng·#btnExport·#btnImport
    (+숨은 #fileImport) · ── · #btnResetContent. 이름이 '더보기'였을 땐 열기 전엔 뭐가 든지 모르는 잡동사니 서랍이라
    뜻 있는 '파일'로 바꿨다. 전체 초기화는 위험하지만 resetAllContent가 confirm()으로 한 번
    더 묻고 ⌘Z도 먹어 안전장치가 둘이라 여기 둔다.
  - 사이드바 '보관' 탭(**data-tab은 "out"인 채로 둘 것** — 저장된 상태의 activeTab에 이 문자열이
    들어 있어 바꾸면 그 탭 보던 사람이 '문서'로 튕긴다)엔 임시 저장만 남는다. 목록을 띄워놓고
    고르는 관리 UI라 드롭다운에 못 넣어서. #readout(각 너비·페이지 수·A4 맞춤 배율)은
    레이아웃 설정의 결과 보고라 '레이아웃' 탭 맨 위로 옮겼다.
- 배율 숫자(#zoomVal ▾ → #zoomPop: 100%·세로/가로 맞춤)와 위 파일 메뉴는 `.tb-menu` +
  `wireTopMenu()`(app.js, 재생 설정 팝오버 아래)로 열고닫는다.
  자주 안 쓰는·위험한 명령은 상단바에 늘어놓지 말고 메뉴로 접을 것(빈도×위험도).
  #zoomBar 버튼 규칙은 직계(>)만 — 메뉴 항목은 .tb-menu 문법을 따라야 해서.
- 브랜드(#brandBox)는 margin-right 28px로 도구 무리와 떨어뜨린다(+#topBar gap 16 = 44px).
  바짝 붙으면 문패가 버튼 무리의 첫 항목처럼 읽힌다.
- 상단바 순서는 **같은 일끼리 짝지어** 왼→오른쪽으로 성격이 옮겨간다. 새 버튼을 끼울 땐
  이 짝 안으로 넣을 것(짝 사이를 가르지 말 것 — 예전엔 도움말이 다크와 인쇄 사이에 끼어
  '보기'와 '내보내기'를 갈라놨다):
  문패 │ 입력 방식+? │ 재생·정지·재생설정(듣기) │ 배율·다크(화면을 어떻게 볼지)
  │ #outBox = 인쇄·파일(내보내기) │ 도움말·설정(앱 자체)
- **문패 옆은 비워 둔다** — 브랜드가 살아야 해서. 예전엔 새 문서·실행취소·다시실행이 문패
  바로 옆에 줄지어 있었는데 다 치웠다. 왼쪽에 남는 건 곡을 쓰기 전에 정하는 '입력 방식'뿐.
  새 명령을 문패 옆에 새로 놓지 말 것.
  - 실행 취소/다시 실행은 **버튼이 없다**. ⌘/Ctrl+Z·⇧Z 단축키뿐(단축키 배선은 '되돌리기'
    절에 그대로 있고 도움말 '단축키' 탭이 안내한다). 빈도로만 보면 1급 버튼감이지만
    문패 옆을 비우는 쪽을 골랐다 — 되살리려면 문패 옆이 아닌 오른쪽에 붙일 것.
  - 새 문서(#btnNewDoc)는 파일 메뉴 맨 위(File > New 자리).
- 상단바 컨트롤은 **예외 없이 .topbar-cmd 한 꼴**(기호 + 아래 작은 글씨). 값이 있는 것(배율,
  입력 방식)은 글씨 자리에 **지금 값**을 보여주고 .tb-menu로 고른다. `<select>`나 세그먼트
  버튼을 새로 들이지 말 것 — 입력 방식이 <select>였을 때 혼자 딴 물건처럼 튀었다.
  기호가 상태를 말해야 하면 다크 토글(.sun/.moon)처럼 CSS로 바꿔치기(#modeToggle의
  .ic-direct/.ic-editor ← body.input-direct). 켜짐/눌림은 `.on` 클래스 + var(--hover) 배경.
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
- 각/장(#gakNameArea, 입력 그룹 '章 각/장' — 코드 식별자는 gakName* 그대로):
  특정 각 '위'에 붙는 라벨(대여음·1장 등). 한자 표시는 #gakNameHanja 체크(기본 켬).
  데이터는 gakNames(각 번호 0부터 → 원문), 표기만 한자 변환(gakNameDisplay: N장→N章 +
  GAK_NAME_HANJA 사전). 각 삽입/삭제 시 shiftGakNames로 같이 밀림(가사 밀기와 같은 규칙).
  악보에서 각 위 빈 곳 클릭 → 입력 카드(openGakNameCard), 도구창엔 번호+이름 목록.
  위 공간이 좁으면 글자 자동 축소(ascent 포함). 인쇄·PNG에 포함(악보 내용, no-print 아님).
  - 템포 표기(一分・N井, #wantTempo)는 같은 자리에 붙지만 각에 소속된 이름이 아니라 곡에
    하나뿐이라 목록 맨 위 **#tempoItem**에 따로 세운다(body.want-tempo로 보임/숨김).
    **크기·간격 모두 각/장 이름과 따로 논다** — 이름은 여럿을 머리줄
    '크기'·'간격'으로 한꺼번에 맞추고 템포는 제 항목(#tempoSize·#tempoGap)에서 조절.
    #tempoGap은 높이 예약(tempoH)과 그리기(drawTempoLabel)가 **같이 쓴다** — 예전엔 예약이
    tempoFont*0.45, 그리기가 gakNameGap이라 서로 어긋나 있었다.
    #tempoItem은 꺼져 있어도 **마크업에서 지우지 말 것** — collectState가 CTRL_IDS를 돌며
    `$(id).value`를 널 검사 없이 읽어 #tempoSize가 없으면 저장이 통째로 터진다.
    높이 예약(tempoFont = cell*0.42*tempoMul)과 그리기(drawTempoLabel)가 **같은 배율**을
    써야 키운 만큼 진짜 커진다(예약을 안 늘리면 avail에 걸려 잘림). 템포를 키우면 위
    공간을 먹어 cell이 줄어드는 되먹임이 있어 배율만큼 정비례로 커지진 않는다(정상).
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
- 가사 특수기호: assets/symbol_svgs/special 8종(가로표·세로표·늘임표·뜰·모지·장지·튕김·연튕김)을
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
- 직접 입력 전환: `document.getElementById('modeDirect').click()` (에디터는 `modeEditor`).
  예전 `melInputSelect` <select>는 없어졌다 — 지금은 #modeToggle ⋯ #modePop 메뉴.
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
