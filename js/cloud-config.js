// 게시 서버(Supabase) 연결값 — 여기만 채우면 게시 기능이 켜진다.
//
//   url : Settings › Data API 맨 위의 Project URL (뒤에 /rest/v1 이 붙어 있어도 된다)
//   key : Settings › API Keys 의 **Publishable key** (`sb_publishable_…`)
//         2025년 이전 프로젝트라면 Legacy 탭의 anon 키(`eyJ…`)도 그대로 쓸 수 있다.
//         ★ Secret key(`sb_secret_…`)·service_role 키는 **절대 넣지 말 것** —
//           그건 모든 빗장을 무시하는 열쇠라 브라우저에 실리면 아무나 남의 악보를 지운다.
//
// 비어 있으면 게시 기능이 통째로 꺼진다(파일 메뉴의 [악보 게시]도 안 보인다) —
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
window.JGB_CLOUD = {
  url: "https://uszzhreidfdopvgdzzqs.supabase.co",
  key: "sb_publishable_wMhSNubRaoeSchqunxVN2w_9Ib5XpiC",
  browse: true,
};
