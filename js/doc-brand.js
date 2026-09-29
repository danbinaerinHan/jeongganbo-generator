// 공적 문서 페이지(policy.html · notices.html)의 문패와 화면 설정.
//
// 문패 그림·워드마크는 index.html에서 **한 벌만** 관리한다 — 여기 또 박으면 로고를 바꿀 때
// 고칠 곳이 늘어난다. 읽는 페이지라 조금 늦게 채워져도 상관없으므로 가져와 꽂는다.
// 못 가져와도 글 읽기는 그대로다(이름 글씨만 안 보인다).
(function () {
  "use strict";
  fetch("index.html").then(function (r) { return r.text(); }).then(function (h) {
    const doc = new DOMParser().parseFromString(h, "text/html");
    const img = doc.getElementById("brandLogo");
    const word = doc.getElementById("brandWord");
    const me = document.getElementById("brandLogo");
    if (img && me) { me.src = img.src; me.hidden = false; }
    const slot = document.querySelector(".brand-word");
    if (word && slot) slot.appendChild(word);
  }).catch(function () {});

  // 색상 테마·다크는 편집기와 같은 열쇠를 쓴다 — 페이지를 오갈 때 화면이 바뀌면
  // 딴 사이트처럼 보인다. 여기서 바꾸지는 않고 따라가기만 한다.
  try {
    if (localStorage.getItem("jgb_dark_v1") === "1") document.body.classList.add("dark");
    const th = localStorage.getItem("jgb_theme_v1");
    if (th === "crystal") document.body.classList.add("theme-crystal");
    else if (th === "celadon") document.body.classList.add("theme-celadon");
  } catch (e) {}
})();
