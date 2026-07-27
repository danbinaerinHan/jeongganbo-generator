# 우물사이 (Umulsai)

웹 브라우저만으로 동작하는 **정간보(井間譜) 편집기**입니다. 설치·계정·서버
없이 정적 페이지 하나로 돌아가며, 악보는 평문 텍스트 형식으로 편집하고
인쇄 품질(PDF·PNG)로 출력합니다.

- 사용: <https://www.umulsai.com>
- 문서 교환 형식: `.jgb.json` (설정·선율·곁줄·서식을 담은 JSON 파일 하나)

## 실행

빌드 과정이 없습니다. 저장소를 받아 `index.html`을 브라우저로 열거나,
아무 정적 서버로 서빙하면 됩니다.

```bash
python3 -m http.server 8000
```

## 구조

| 경로 | 내용 |
| --- | --- |
| `index.html` | 마크업 전부 (진입점) |
| `js/app.js` | 앱 로직 (단일 IIFE) |
| `js/symbols-registry.js` | 기호 사전 (사람이 직접 관리) |
| `js/*-data.js` | 생성된 그림 데이터 (직접 수정 금지) |
| `css/styles.css` | 스타일 전부 |
| `assets/` | 기호 SVG 원본 등 빌드 입력 |
| `tools/` | 데이터 재생성 스크립트 (Node/Python) |
| `docs/` | 사용자용 기능 설명서 |

## 라이선스

코드는 [MIT 라이선스](LICENSE)입니다.

그림 자산은 다음을 참고하세요.

- 시김새·기호 SVG(`assets/symbol_svgs/` 등)는 국립국악원 정악보 시리즈에
  쓰이는 기호 자형을 참고하여 새로 그린 벡터입니다.
- 상단바 워드마크는 EBS훈민정음 SB 서체로 만든 아웃라인 패스(SVG)로, 폰트
  파일 자체는 포함·재배포하지 않습니다.
- 로고(까치·井)는 이 프로젝트를 위해 생성한 이미지입니다.

## 인용

이 시스템을 연구에서 인용하려면 테크니컬 리포트를 인용해 주세요.

> Danbinaerin Han. *Umulsai: A Plain-Text Format and In-Browser Engraving
> System for Jeongganbo, Korean Mensural Notation.* Technical
> Report, v2026-07.

- 소스 스냅샷 DOI: [10.5281/zenodo.21616981](https://doi.org/10.5281/zenodo.21616981)
- 저장소: <https://github.com/danbinaerinHan/jeongganbo-generator>
