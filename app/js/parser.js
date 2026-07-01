/**
 * 정간보 에디터 텍스트 파서
 *
 * 문법(기본 틀):
 *   |   → 다음 정간(칸)
 *   ||  → 다음 각(세로줄)
 *
 * 각 안의 심볼/시김새 내부 인코딩은 이후 단계에서 확장한다.
 */

/**
 * 에디터 텍스트를 각(gak)들의 배열로 파싱한다.
 * 각각의 각은 정간(cell) 문자열 배열이다.
 *
 * @param {string} text - 에디터 원본 텍스트
 * @param {number} jeongganCount - 각 하나에 들어갈 정간 수(설정값)
 * @returns {string[][]} 각 배열. 각 원소는 길이 jeongganCount 의 정간 배열
 */
function parseScore(text, jeongganCount) {
  const source = typeof text === "string" ? text : "";
  const size = Number.isInteger(jeongganCount) && jeongganCount > 0 ? jeongganCount : 1;

  const rawGaks = source
    .split("||")
    .map((gak) => gak.trim())
    .filter((gak, index, arr) => gak.length > 0 || arr.length === 1);

  return rawGaks.map((gak) => normalizeGak(gak, size));
}

/**
 * 하나의 각 문자열을 정간 배열로 변환한다.
 * 설정된 정간 수에 맞게 빈 칸을 채우거나 잘라낸다(불변).
 */
function normalizeGak(gakText, size) {
  const cells = gakText.split("|").map((cell) => cell.trim());
  const filled = Array.from({ length: size }, (_, i) => cells[i] ?? "");
  return filled;
}

/**
 * "3,2,3" 형태의 대강 구분 문자열을 정간 인덱스(경계) 집합으로 변환한다.
 * 각 그룹의 시작 정간 인덱스(0-base)에 굵은 선을 넣기 위해 사용한다.
 *
 * @param {string} spec - 예: "3,2,3"
 * @param {number} jeongganCount - 각 하나의 정간 수
 * @returns {Set<number>} 굵은 상단선을 그릴 정간 인덱스 집합
 */
function parseDaegang(spec, jeongganCount) {
  const boundaries = new Set();
  if (typeof spec !== "string" || spec.trim() === "") {
    return boundaries;
  }

  const groups = spec
    .split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  let cursor = 0;
  for (const groupSize of groups) {
    if (cursor > 0 && cursor < jeongganCount) {
      boundaries.add(cursor);
    }
    cursor += groupSize;
  }

  return boundaries;
}

window.JGBParser = { parseScore, parseDaegang };
