/**
 * 파싱된 각 배열 + 설정을 받아 미리보기 DOM(페이지들)을 생성한다.
 *
 * 배치 규칙:
 *   - 각(세로줄)은 한 밴드(각 행) 안에서 오른쪽 → 왼쪽으로 채운다(CSS row-reverse).
 *   - gakPerRow 만큼 채워지면 다음 밴드로 넘어간다.
 *   - bandsPerPage 만큼 채워지면 다음 페이지로 넘어간다.
 */

/**
 * @param {string[][]} gaks - parseScore 결과
 * @param {object} settings
 * @param {"portrait"|"landscape"} settings.orientation
 * @param {number} settings.gakPerRow
 * @param {number} settings.jeongganCount
 * @param {Set<number>} settings.daegang - 굵은 상단선 정간 인덱스
 * @param {number} settings.bandsPerPage
 * @returns {HTMLElement[]} page 엘리먼트 배열
 */
function renderPages(gaks, settings) {
  const { gakPerRow, bandsPerPage } = settings;
  const perPage = gakPerRow * bandsPerPage;

  const pages = [];
  const totalPages = Math.max(1, Math.ceil(gaks.length / perPage));

  for (let p = 0; p < totalPages; p++) {
    const pageGaks = gaks.slice(p * perPage, (p + 1) * perPage);
    pages.push(buildPage(pageGaks, settings));
  }

  return pages;
}

function buildPage(pageGaks, settings) {
  const { orientation, gakPerRow, bandsPerPage } = settings;

  const page = el("div", `page ${orientation}`);

  for (let b = 0; b < bandsPerPage; b++) {
    const bandGaks = pageGaks.slice(b * gakPerRow, (b + 1) * gakPerRow);
    // 밴드가 비어도 빈 격자 골격을 유지해 예시 이미지처럼 채워진 틀을 보여준다.
    page.appendChild(buildBand(bandGaks, settings));
  }

  return page;
}

function buildBand(bandGaks, settings) {
  const { gakPerRow, jeongganCount, daegang } = settings;
  const band = el("div", "band");

  for (let g = 0; g < gakPerRow; g++) {
    const cells = bandGaks[g] ?? emptyGak(jeongganCount);
    band.appendChild(buildGak(cells, daegang));
  }

  return band;
}

function buildGak(cells, daegang) {
  const gak = el("div", "gak");

  cells.forEach((content, index) => {
    const cellClass = daegang.has(index) ? "jeonggan daegang-top" : "jeonggan";
    const cell = el("div", cellClass);
    cell.textContent = content;
    gak.appendChild(cell);
  });

  return gak;
}

function emptyGak(jeongganCount) {
  return Array.from({ length: jeongganCount }, () => "");
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

window.JGBRender = { renderPages };
