// 게시 서버(Supabase) 연결값 — 여기만 채우면 게시 기능이 켜진다.
//
//   url : Settings › Data API 맨 위의 Project URL (뒤에 /rest/v1 이 붙어 있어도 된다)
//   key : Settings › API Keys 의 **Publishable key** (`sb_publishable_…`)
//         2025년 이전 프로젝트라면 Legacy 탭의 anon 키(`eyJ…`)도 그대로 쓸 수 있다.
//         ★ Secret key(`sb_secret_…`)·service_role 키는 **절대 넣지 말 것** —
//           그건 모든 빗장을 무시하는 열쇠라 브라우저에 실리면 아무나 남의 악보를 지운다.
//
// 비어 있으면 게시 기능이 통째로 꺼진다(오른쪽 레일의 [게시]도 안 보인다) —
// js/analytics.js의 GOATCOUNTER_CODE와 같은 '대기 모드'라, 서버를 안 붙인 채로도
// 앱은 예전 그대로 돌아간다. file:// 로 열었을 때도 저절로 꺼진다(주소를 나눠 줄 수
// 없는 자리에서 게시 버튼만 보이면 헷갈리므로).
//
// key는 **공개 키**다. 정적 파일에 박혀 브라우저에 그대로 보이는 것이 정상이며,
// 진짜 빗장은 server/schema.sql 쪽에 있다(테이블 직접 접근 차단 + RPC 넷만 개방).
// browse — 공유마당(공개 목록)를 열어 둘지. **false면 간판을 내린다**:
//   · 상단바 [공유마당] 버튼이 사라지고
//   · browse.html에 들어와도 목록을 부르지 않고 '준비 중' 안내만 뜨고
//   · 게시 창의 [공유마당 목록에 올리기]가 숨고 모든 게시가 '주소를 아는 사람만'이 된다
// 악보 게시 자체(주소로 나눠 보기)는 그대로 돌아간다 — 목록만 닫는 것이다.
//
// 이건 기술이 아니라 **운영** 스위치다. 남이 올린 악보를 목록으로 내보이는 순간
// 저작권법 제102·103조가 요구하는 것들(신고 담당자 공지·즉시 삭제 절차·반복 위반자
// 조치)이 갖춰져 있어야 하므로, 그 준비가 끝나기 전에는 닫아 둔다.
// 주의: 이건 화면을 닫는 것이지 서버를 닫는 것이 아니다. 완전히 막으려면
// list_scores의 실행 권한을 거두어야 한다(server/schema.sql 맨 아래 grant 참고).
// accounts — 이용자 계정(전자우편 매직 링크)을 열어 둘지. **false면 문을 안 낸다**:
//   · 오른쪽 레일의 [계정] 버튼이 사라지고
//   · login.html에 들어와도 '준비 중' 안내만 뜬다
// 악보를 만들고 올리는 일은 계정과 무관하게 그대로 돌아간다 — 계정은 뺏는 것이 아니라
// 더 주는 것이라, 이 스위치가 꺼져 있어도 없어지는 기능이 없다.
//
// ★ SMTP를 붙이기 전에는 켜지 말 것. 매직 링크는 메일이 안 가면 **아무도 못 들어온다** —
//   문만 열려 있으면 그건 고장이다. 순서는 (1) 메일 업체 + DNS SPF·DKIM,
//   (2) Supabase Authentication의 Custom SMTP·Rate Limits·URL Configuration
//       (Redirect URLs에 https://www.umulsai.com/login.html),
//   (3) 본인 주소로 받아 **스팸함이 아니라 받은편지함에** 오는지 확인, (4) 여기를 true로.
//
// ★ 약관·개인정보처리방침의 개정도 **같은 날에** 나간다. 계정이 없는데 '전자우편을
//   수집한다'고 적으면 그 자체가 사실과 다르다(policy.html·privacy.html의 【 】 자리).
window.JGB_CLOUD = {
  url: "https://uszzhreidfdopvgdzzqs.supabase.co",
  key: "sb_publishable_wMhSNubRaoeSchqunxVN2w_9Ib5XpiC",
  browse: true,
  accounts: false,
};
