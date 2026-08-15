// 기호 사전 — 시김새·가사 기호·장구 구음을 한 곳에 모은 손으로 고치는 데이터 파일.
// (js/symbols-data.js·js/janggu-data.js는 SVG에서 '생성'되는 그림 데이터. 이 파일은 그
//  그림들에 이름과 '어느 자리에 놓이나'를 붙이는 표라 사람이 직접 고친다.)
//
// 왜 한 사전인가: 예전엔 같은 기호가 팔레트마다 따로 등록됐다 — 시김새는 ORN_LIST,
// 가사줄은 LYRIC_SYMS + 별칭표, 장단줄은 JANGGU_NAMES. 그래서 '이 기호를 저 줄에도'가
// 생길 때마다 표와 별칭이 한 겹씩 늘었다. 기호가 가진 사실은 둘뿐인데(무엇인가 /
// 어디에 놓이나) 그 둘이 '어느 팔레트 소속인가'로 뭉쳐 있던 탓이다.
//
// ── 항목 하나 ──────────────────────────────────────────────────────────
//   { id, ko, at: { 자리: 크기 }, attKeep?, snd? }
//   id      그림 키. 시김새·가사 기호는 SYM_DATA(=assets/symbol_svgs 파일명),
//           장구 구음은 JANGGU_DATA 키. 사전 안에서 유일해야 한다.
//   ko      표시 이름. 악보 토큰({미는표}·{s01}·{덩})에 쓰는 이름이기도 하다.
//   at      이 기호가 놓일 수 있는 '자리' → 그 자리에서의 크기.
//   attKeep 붙임표 일괄 확대(1.2배)에서 빼는 표시. 원래 크기로 두는 몇 개만.
//   snd     이 기호가 '어떻게 울리나'. 없으면 소리가 없다(앞 음이 그대로 이어진다).
//
// ── snd: 시김새를 소리로 푸는 법 ───────────────────────────────────────
//   { seq: [...], pre: [...], post: [...] }   셋 다 없어도 되고 겹쳐도 된다.
//   seq   이 자리를 등분해 채울 음들. 자리를 통째로 쓴다.
//   pre   앞꾸밈(본음 앞에 짧게). post 뒷꾸밈(본음 뒤에 짧게).
//   값 하나는 **음계 칸수**(정수) 또는 **율명**(문자열).
//     정수 = 기준음에서 그 곡 음계로 몇 칸 위/아래인가. 0이면 기준음 그대로.
//            반음이 아니라 칸수인 것이 핵심이다 — '니'는 늘 음계의 바로 윗음이지
//            반음 위가 아니다. 그 곡의 음계는 조 프리셋(#joPreset)이 정해져 있으면
//            그것을, 아니면 악보에 많이 나온 율명 다섯을 세어 정한다(app.js 참고).
//     문자열 = 그 율명 자리를 그대로 짚는다(싸랭·슬기둥의 개방현 하배황처럼
//            음계와 무관하게 정해진 음).
//   기준음은 이 기호가 어느 자리에 놓였나로 갈린다:
//     cell 자리(제 칸을 차지) → **앞 음**. 붙임(att) 자리 → **제가 붙은 본음**.
//   그래서 붙임에 seq가 있으면(나니나·나느나) '본음의 자리를 이 꼴로 가른다'는 뜻이 된다.
//
//   표(表)류 시김새(흘림표·미는표·요성표·추성·퇴성…)에는 일부러 snd를 안 달았다.
//   음높이를 옮기는 게 아니라 '어떻게 눌러/떨어 내나'를 적는 주법 표시라, 사인파
//   재생으로 흉내 낼 것이 없기 때문이다(소리는 앞 음이 그대로 이어진다).
//   '추정'이라 적힌 값은 국악 쪽 확인이 아직 안 된 것이니 고치는 데 거리낌 없을 것.
//
// ── 자리(at의 키) 다섯 ─────────────────────────────────────────────────
//   att    음표 오른쪽에 작게 붙음      값 = 기호별 미세 배율(기본 1)
//   cell   정간 안에서 한 칸 차지        값 = 기호별 미세 배율(기본 1)
//   tempo  정간 바깥 오른쪽에 세로로     값 = 1(자리 표시만)
//   lyric  가사줄 한 분박               값 = 그리기 배율(대개 0.4, 막대류 0.8)
//   jd     장단줄 한 분박               값 = 그리기 배율(기본 1)
//   att와 cell을 둘 다 가지면 예전 c:"both"(퇴성·추성)와 같다.
//
// 새 기호를 들이려면 이 목록에 한 줄, '이 기호를 저 줄에도' 하려면 at에 키 하나.
// 팔레트에 보이는 순서는 사전 순서가 아니라 아래 lyricOrder·jangguOrder가 정한다
// (무엇이 있나 ≠ 어떤 차례로 보여주나 — 같은 기호가 줄마다 다른 자리에 놓이므로).
(function (root) {
  "use strict";

  // 사전 본체. 이 순서가 곧 시김새 팔레트(선율) 순서다.
  const LIST = [
    // ── 붙임표: 음표 오른쪽에 작게 ──
    { id: "push", ko: "미는표", at: { att: 1 }, attKeep: true },
    { id: "flow", ko: "흘림표", at: { att: 1 }, attKeep: true },
    { id: "flow-rep", ko: "겹흘림표", at: { att: 1 } },
    // 농음표·풀어내림표·잉어질표는 가늘고 길어 다른 붙임표와 같은 상자에 넣으면 안 보인다 → 2.5배
    { id: "vib", ko: "농음표", at: { att: 2.5 } },
    { id: "vib-long", ko: "풀어내림표", at: { att: 2.5 } },
    // 떠이어표 — 본음 앞에 본음과 한 음 위를 스친다(2026-08-16 사용자 지시). 꼴은 노니로와
    // 같다. 이웃한 농음표·풀어내림표가 '어떻게 떠는가'를 적는 표(表)류라 소리가 없는 것과 달리,
    // 이것은 짚는 음이 정해져 있어 소리로 풀린다.
    { id: "roll", ko: "떠이어표", at: { att: 1 }, snd: { pre: [0, 1] } },
    // 싸랭·슬기둥1~3은 130%(팔레트·악보 공통)
    // 거문고 술대법 — 본음 앞에 개방현(하배황)을 한 번 스친다. 음계 칸수가 아니라
    // 정해진 줄이라 율명을 그대로 적는다. 슬기둥3만 추정(1·2와 같은 계열).
    { id: "diff-str-fast", ko: "싸랭", at: { att: 1.3 }, snd: { pre: ["하배황"] } },
    { id: "diff-str-1", ko: "슬기둥1", at: { att: 1.3 }, snd: { pre: ["하배황"] } },
    { id: "diff-str-2", ko: "슬기둥2", at: { att: 1.3 }, snd: { pre: ["하배황"] } },
    { id: "diff-str-3", ko: "슬기둥3", at: { att: 1.3 }, snd: { pre: ["하배황"] } },   // 추정
    { id: "roll-str", ko: "전성", at: { att: 1, lyric: 0.4 } },
    { id: "pizzicato", ko: "자출", at: { att: 1 } },
    { id: "splash", ko: "잉어질표", at: { att: 2.5 } },
    { id: "between-up", ko: "루러표", at: { att: 1 } },
    { id: "between-down", ko: "시루표", at: { att: 1 } },
    { id: "down-pitched", ko: "낮게", at: { att: 1 } },
    { id: "tongue", ko: "서침표", at: { att: 1 } },
    // 나니나·나느나는 붙임표인데도 seq다 — 본음 앞에 스치는 게 아니라 본음의 자리를
    // 나-니-나(또는 나-느-나)로 고르게 가르는 시김새라서. 나느나는 나니나의 아래짝으로 추정.
    { id: "nanina", ko: "나니나", at: { att: 1 }, snd: { seq: [0, 1, 0] } },
    { id: "naneuna", ko: "나느나", at: { att: 1 }, snd: { seq: [0, -1, 0] } },   // 추정
    { id: "nire", ko: "니레", at: { att: 1 }, attKeep: true, snd: { pre: [1] } },
    // '니라'는 세종/MALerLab 자료의 '니나'(붙임)와 같은 기호로 보인다 — 그쪽 값을 옮겼다.
    // 이름이 정말 같은 것인지는 국악 쪽 확인이 필요하다(우리 '니나'는 아래 독립 기호 쪽).
    { id: "nina", ko: "니라", at: { att: 1 }, attKeep: true, snd: { pre: [2] } },
    { id: "niro", ko: "니로", at: { att: 1 }, attKeep: true, snd: { pre: [3] } },
    { id: "none", ko: "노네", at: { att: 1 }, snd: { pre: [-1] } },
    { id: "neonye", ko: "너녜", at: { att: 1 }, snd: { pre: [-2] } },
    { id: "noniro", ko: "노니로", at: { att: 1 }, snd: { pre: [0, 1] } },
    { id: "norino", ko: "노리노", at: { att: 1 }, snd: { pre: [0, 2] } },
    { id: "nerone", ko: "네로네", at: { att: 1 }, snd: { pre: [0, -1] } },
    { id: "neuneneu", ko: "느네느", at: { att: 1 }, snd: { pre: [0, 3] } },
    { id: "naniro", ko: "나니로", at: { att: 1 }, snd: { pre: [-1, 1] } },
    { id: "neunira", ko: "느니라", at: { att: 1 } },   // 소리 미상 — 확인되면 snd를 달 것
    { id: "neuronireu", ko: "느로니르", at: { att: 1 }, snd: { pre: [0, -1, 1] } },
    // 앞뒤로 한 번씩 감싸는 두 짝. 이름의 '-'가 본음 자리다(느니-르 / 니루-니).
    { id: "neunireu", ko: "느니르", at: { att: 1 }, snd: { pre: [-1], post: [-1] } },
    { id: "niruni", ko: "니루니", at: { att: 1 }, snd: { pre: [1], post: [1] } },
    { id: "nanireunonireu", ko: "나니르노니르", at: { att: 1 } },   // 소리 미상
    { id: "staccato", ko: "끊는표", at: { att: 1 }, attKeep: true },
    { id: "accent", ko: "특강표", at: { att: 1 }, attKeep: true },
    // 주의: 이 '늘임표'(fermata)와 아래 가사줄 '늘임표'(special/늘임표.svg)는
    // **그림까지 똑같다** — 두 폴더에 같은 파일이 이름만 달리 들어가 있는 것뿐이다
    // (symbols/fermata.svg 와 special/늘임표.svg 는 바이트까지 동일. 2026-07-26 확인).
    // 그러니 아래 '뜰'과 달리 고를 것이 없다: 한 항목으로 합치고(at에 att·lyric 둘 다)
    // 남는 파일 하나를 지우면 된다 — 모지가 이미 그 꼴이다(아래 참고).
    // 지금 당장 안 합치는 건 옛 문서 호환(토큰·별칭)을 같이 손봐야 해서일 뿐이다.
    { id: "fermata", ko: "늘임표", at: { att: 1 } },
    { id: "len-double", ko: "덧길이표", at: { att: 1 } },
    // 반길이표는 붙임표 일괄 확대(1.2배)의 절반 크기가 되게 0.5배 — 최종 0.6배
    { id: "len-half", ko: "반길이표", at: { att: 0.5 } },
    // 뜰(sigimsae-00)은 가사줄 '뜰'(special/뜰.svg)과 **이름만 같고 그림이 진짜 다르다**
    // — 위 늘임표와 달리 합칠 수 없고, 둘 중 하나는 이름을 바꿔야 한다. 어느 쪽이 '뜰'이고
    // 다른 쪽은 뭐라 불러야 하는지는 국악 쪽 판단이 필요해 손대지 않고 뒀다.
    // 80%로 줄여 그린다(팔레트·악보 공통).
    { id: "sigimsae-00", ko: "뜰", at: { att: 0.8 } },
    // 모지는 선율·가사줄이 special/모지.svg 한 그림을 같이 쓴다 — 바라는 꼴은 이쪽이다.
    { id: "모지", ko: "모지", at: { att: 1, lyric: 0.4 } },
    // 이름 미상 시김새(sigimsae-01~25) — 정식 이름을 알 때까지 파일 번호 그대로 s01·s10 꼴로
    // 부른다(토큰도 {s10}). 이름이 정해지면 ko만 바꾸면 된다. 순서는 파일 번호 순 유지.
    { id: "sigimsae-01", ko: "s01", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-02", ko: "s02", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-03", ko: "s03", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-04", ko: "s04", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-05", ko: "s05", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-06", ko: "s06", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-07", ko: "s07", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-08", ko: "s08", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-10", ko: "s10", at: { att: 1, lyric: 0.4 } },
    { id: "sigimsae-11", ko: "s11", at: { att: 1 } },
    { id: "sigimsae-12", ko: "s12", at: { att: 1 } },
    { id: "sigimsae-13", ko: "s13", at: { att: 1 } },
    { id: "sigimsae-14", ko: "s14", at: { att: 1 } },
    { id: "sigimsae-15", ko: "s15", at: { att: 1 } },
    { id: "sigimsae-16", ko: "s16", at: { att: 1 } },
    { id: "sigimsae-17", ko: "s17", at: { att: 1 } },
    { id: "sigimsae-18", ko: "s18", at: { att: 1 } },
    { id: "sigimsae-20", ko: "s20", at: { att: 1 } },
    { id: "sigimsae-21", ko: "s21", at: { att: 1 } },
    { id: "sigimsae-22", ko: "s22", at: { att: 1 } },
    { id: "sigimsae-23", ko: "s23", at: { att: 1 } },
    { id: "sigimsae-24", ko: "s24", at: { att: 1 } },
    { id: "sigimsae-25", ko: "s25", at: { att: 1 } },

    // ── 독립 기호: 정간 안에서 한 칸 차지 ──
    // 이쪽 snd의 기준음은 **앞 음**이다(제 칸을 차지하니 제 음높이가 따로 없다).
    // 이름이 곧 소리의 차례라 값을 읽기 쉽다: 니=위, 노=아래, 리=두 칸 위, 로=두 칸 아래.
    { id: "no", ko: "노", at: { cell: 0.8 }, snd: { seq: [-1] } },   // 유독 커 보이는 여섯은 조금 줄임
    { id: "ni", ko: "니", at: { cell: 0.8 }, snd: { seq: [1] } },
    { id: "ro", ko: "로", at: { cell: 0.8 }, snd: { seq: [-2] } },
    { id: "ri", ko: "리", at: { cell: 0.8 }, snd: { seq: [2] } },
    { id: "nina-dur", ko: "니나", at: { cell: 0.8 }, snd: { seq: [1, 0] } },
    { id: "neuna", ko: "느나", at: { cell: 0.8 }, snd: { seq: [-1, 0] } },
    { id: "nora", ko: "노라", at: { cell: 1 }, snd: { seq: [-1, -2] } },
    { id: "neuni", ko: "느니", at: { cell: 1 }, snd: { seq: [1, 2] } },
    // 노라 + 느니를 이어 붙인 것으로 읽었다(둘 다 앞 음 기준). 추정.
    { id: "noraneuni", ko: "노라느니", at: { cell: 1 }, snd: { seq: [-1, -2, 1, 2] } },   // 추정
    { id: "nirena", ko: "니레나", at: { cell: 1 }, snd: { seq: [2, 1, 0] } },
    { id: "nerona", ko: "네로나", at: { cell: 1 }, snd: { seq: [-1, -2, 0] } },
    { id: "nirona", ko: "니로나", at: { cell: 1 }, snd: { seq: [1, 0, -1] } },
    { id: "nineurani", ko: "니느라니", at: { cell: 1 }, snd: { seq: [1, 0, -1, 0] } },
    { id: "neunanina", ko: "느나니나", at: { cell: 1 }, snd: { seq: [-1, 0, 1, 0] } },
    { id: "neunareunani", ko: "느나르나니", at: { cell: 1 }, snd: { seq: [-1, 0, 1, 0, -1] } },
    // 요성·겹요성은 음높이를 옮기는 게 아니라 앞 음을 떨어 주는 표라 snd가 없다(위 머리말 참고).
    { id: "shake", ko: "요성표", at: { cell: 1 } },
    { id: "shake-rep", ko: "겹요성표", at: { cell: 1 } },
    { id: "repeat", ko: "같은음표", at: { cell: 1 }, snd: { seq: [0] } },

    // ── 붙임표 겸 독립 기호(예전 c:"both") ──
    { id: "bend-down", ko: "퇴성", at: { att: 1, cell: 1, lyric: 0.4 } },
    // 추성은 붙었을 때 기본이 작아 보여 120%
    { id: "bend-up", ko: "추성", at: { att: 1.2, cell: 1, lyric: 0.4 } },

    // ── 빠르기: 정간 바깥 오른쪽에 세로로 ──
    // 토큰에 공백이 들어가면 drawCell이 분박으로 쪼개므로 ko도 공백 없는 파일 이름 그대로.
    { id: "본래속도로", ko: "본래속도로", at: { tempo: 1 } },
    { id: "점점느리게", ko: "점점느리게", at: { tempo: 1 } },
    { id: "점점속하게", ko: "점점속하게", at: { tempo: 1 } },
    { id: "조금느리게", ko: "조금느리게", at: { tempo: 1 } },
    { id: "조금속하게", ko: "조금속하게", at: { tempo: 1 } },

    // ── 가사줄 전용 기호(assets/symbol_svgs/special) ──
    { id: "가로표", ko: "가로표", at: { lyric: 0.8 } },      // 막대류는 크게
    { id: "세로표", ko: "세로표", at: { lyric: 0.8 } },
    { id: "늘임표", ko: "늘임표", at: { lyric: 0.4 } },      // 위 fermata와 같은 그림, 별개 키(위 주석 참고)
    { id: "뜰", ko: "뜰", at: { lyric: 0.4 } },              // 위 sigimsae-00과 별개 그림
    { id: "장지", ko: "장지", at: { lyric: 0.4 } },
    { id: "튕김", ko: "튕김", at: { lyric: 0.4 } },
    { id: "연튕김", ko: "연튕김", at: { lyric: 0.4 } },

    // ── 장구 구음(assets/janggu_svgs → JANGGU_DATA) ──
    // 장단 텍스트는 스페이스를 분박 구분자로 쓰므로 이름에 공백을 넣지 않는다(예: '작은덩').
    // 가사줄(at.lyric)에도 놓을 수 있다 — 장단 줄이 없는 악보에서 구음을 정간 옆에 적거나,
    // 가락과 구음을 나란히 보이려는 쓰임. 장단 줄에서보다 작게(0.65) 그려 가사 글자·활 기호와
    // 비슷한 무게로 앉게 한다.
    // box:"square" — 가사줄 상자는 폭의 2.5배쯤 세로로 길어서, 그대로 두면 세로로 긴 구음
    // (기덕·덕·더러러러)만 높이를 꽉 채워 둥근 구음(덩·궁)보다 2.5배 커진다. 구음은 한 글자로
    // 읽히는 기호라 서로 키가 같아야 하므로 장단 줄과 같은 정사각 상자에 넣는다.
    // (가로표·세로표 같은 '표'류는 칸을 가로지르는 게 제 노릇이라 이걸 달면 안 된다.)
    { id: "덩", ko: "덩", cat: "장구", box: "square", at: { jd: 1, lyric: 0.65 } },
    { id: "작은덩", ko: "작은덩", cat: "장구", box: "square", at: { jd: 1, lyric: 0.65 } },
    { id: "기덕", ko: "기덕", cat: "장구", box: "square", at: { jd: 1, lyric: 0.65 } },
    { id: "궁", ko: "궁", cat: "장구", box: "square", at: { jd: 1, lyric: 0.65 } },
    { id: "덕", ko: "덕", cat: "장구", box: "square", at: { jd: 1, lyric: 0.65 } },
    // '다'는 작은 점 하나라 상자를 꽉 채우면 유독 커 보인다 — 장단 줄에선 0.15로 줄여 그린다
    // (2026-07-25 사용자 요청, 0.3의 절반). 더 줄이면 점이 안 보일 수 있으니 유의.
    // 가사줄 값은 **비율이 아니라 눈에 보이는 크기로** 잡았다: 가사줄은 장단 줄보다 좁아
    // 같은 0.15배를 쓰면 점이 실선 굵기까지 내려가 사라진다(실측 0.30 대 장단 0.74).
    // 0.18이 '겨우 보이는' 바닥이었고, 다른 구음을 0.5→0.65로 키우면서 같은 비율로 0.23.
    // chip = 팔레트 아이콘도 같은 이유로 줄인다(실물이 덩 원의 ~0.4배인 작은 점). 예전엔
    // 이 값이 #jangdanPalette 전용 CSS였는데, 같은 기호가 가사 팔레트에도 나오면서 거기선
    // 큰 원 덩어리로 보였다 — 창이 아니라 기호에 딸린 사실이라 사전으로 옮겼다.
    { id: "다", ko: "다", cat: "장구", box: "square", chip: 0.27, at: { jd: 0.15, lyric: 0.23 } },
    { id: "더러러러", ko: "더러러러", cat: "장구", box: "square", at: { jd: 1, lyric: 0.65 } }
  ];

  // 가사줄 팔레트에 올릴 기호와 그 차례. 사전 순서와 따로 두는 건 같은 기호가 선율
  // 팔레트에선 다른 자리에 놓이기 때문 — 줄마다 자연스러운 차례가 다르다.
  const LYRIC_ORDER = ["가로표", "세로표", "늘임표", "뜰", "모지", "장지", "튕김", "연튕김",
                       "roll-str", "bend-down", "bend-up",
                       "sigimsae-01", "sigimsae-02", "sigimsae-03", "sigimsae-04",
                       "sigimsae-05", "sigimsae-06", "sigimsae-07", "sigimsae-08",
                       "sigimsae-10",
                       // 장구 구음 — 팔레트에선 cat("장구")으로 갈려 따로 묶여 나온다
                       "덩", "작은덩", "기덕", "궁", "덕", "다", "더러러러"];

  // 장단줄 팔레트 차례
  const JANGGU_ORDER = ["덩", "작은덩", "기덕", "궁", "덕", "다", "더러러러"];

  // 옛 문서 호환(읽기 전용) — 개명 전 토큰이 그대로 열리게. 새로 늘리지 말 것.
  const LEGACY_ALIAS = { "가로막대": "가로표", "세로막대": "세로표" };

  // ── 파생 ────────────────────────────────────────────────────────────
  // app.js가 예전에 손으로 적어 두던 표들을 위 사전에서 그대로 만들어 낸다.
  // 값이 하나도 달라지지 않아야 한다(tools/check-symbols-registry.mjs가 검사).
  const has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  const byId = {};
  LIST.forEach(function (s) { byId[s.id] = s; });

  const at = function (id, lane) {
    const s = byId[id];
    return (s && has(s.at, lane)) ? s.at[lane] : null;
  };

  // 선율 자리에 놓이는 기호 = 예전 ORN_LIST. c는 자리 조합에서 나온다.
  const ornList = LIST
    .filter(function (s) { return has(s.at, "att") || has(s.at, "cell") || has(s.at, "tempo"); })
    .map(function (s) {
      const c = has(s.at, "tempo") ? "tempo"
        : (has(s.at, "att") && has(s.at, "cell")) ? "both"
        : has(s.at, "cell") ? "with" : "wo";
      return { s: s.id, k: s.ko, c: c };
    });

  const attKeep = new Set(LIST.filter(function (s) { return s.attKeep; })
    .map(function (s) { return s.id; }));

  // 미세 배율 표 — 1(기본)인 건 담지 않는다. 예전 표와 키까지 같아야 한다.
  const pick = function (lane) {
    const out = {};
    LIST.forEach(function (s) {
      if (has(s.at, lane) && s.at[lane] !== 1) out[s.id] = s.at[lane];
    });
    return out;
  };
  const attScale = pick("att");     // = 옛 ATT_SYM_SCALE
  const cellScale = pick("cell");   // = 옛 SYM_EXTRA_SCALE
  const jangguScale = pick("jd");   // = 옛 JANGGU_DRAW_SCALE

  // 가사줄 — 토큰·팔레트에 쓰는 이름은 표시 이름(ko)이고, 그림은 id로 찾는다.
  const lyricNames = LYRIC_ORDER.map(function (id) { return byId[id].ko; });
  const lyricAlias = {};
  LYRIC_ORDER.forEach(function (id) {
    const s = byId[id];
    if (s.ko !== s.id) lyricAlias[s.ko] = s.id;   // 전성→roll-str, s01→sigimsae-01 …
  });
  Object.keys(LEGACY_ALIAS).forEach(function (old) { lyricAlias[old] = LEGACY_ALIAS[old]; });
  // 그리기 배율은 표시 이름으로 찾는다(옛 이름도 같은 배율이라야 옛 문서가 안 변한다).
  const lyricScale = {};
  LYRIC_ORDER.forEach(function (id) { lyricScale[byId[id].ko] = byId[id].at.lyric; });
  Object.keys(LEGACY_ALIAS).forEach(function (old) {
    const tgt = byId[LEGACY_ALIAS[old]];
    if (tgt) lyricScale[old] = tgt.at.lyric;
  });

  const jangguNames = JANGGU_ORDER.map(function (id) { return byId[id].ko; });

  // 소리 나는 시김새만 모은 표(id → snd). 재생·내보내기가 'snd가 있나'만 보면 되게
  // 미리 걸러 둔다 — 없는 기호는 소리가 없다는 뜻이라 부르는 쪽에 조건이 하나로 준다.
  const sound = {};
  LIST.forEach(function (s) { if (s.snd) sound[s.id] = s.snd; });

  root.JGB_SYM = {
    list: LIST, byId: byId, at: at,
    ornList: ornList, attKeep: attKeep, attScale: attScale, cellScale: cellScale,
    lyricNames: lyricNames, lyricAlias: lyricAlias, lyricScale: lyricScale,
    jangguNames: jangguNames, jangguScale: jangguScale, sound: sound
  };
})(typeof window !== "undefined" ? window : globalThis);
