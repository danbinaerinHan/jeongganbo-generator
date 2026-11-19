# 시김새 다듬기 — 대상 목록(사람이 고친다).
# 행 하나 = 기호 하나. targets는 그 그림이 실제로 놓이는 파일(assets/symbol_svgs/ 아래)이고,
# 후보 파일은 assets/symbol_svgs/_다듬기/<안>/<stem>.svg 이다.
#   A = 가장자리 다듬기(흐림+재추적 — 모양은 그대로, 잔물결만 걷음)
#   B = 새로 그리기(도형) / 정해체 글자 + 굵기 맞춤(한자)
#   C = 정해체 글자 원래 굵기(한자만)
#   B2·B3·B4… = 한 기호에 B안을 여럿 둘 때(labels로 칸 이름을 준다)
#   R = 사용자 메모를 반영해 다시 그린 안(2026-11-19, 원본 획은 src/*-R.svg)
# rec = 추천안. note = 원본의 문제와 후보가 하는 일.

GROUPS = [
    ("도형 기호", "원래 반듯한 도형이어야 할 것을 손글씨 그림에서 따 와 테두리가 울퉁불퉁한 기호들입니다. "
     "B안은 원본의 잉크 상자·획 굵기를 재서 원·선·호로 다시 그린 것입니다(그림 크기와 자리는 원본과 같습니다).", [
        dict(stem="튕김", ko="튕김", targets=["special/튕김"], at="곁줄", rec="B",
             note="고리가 각지게 일그러지고 테두리가 물결칩니다. B: 같은 굵기의 원."),
        dict(stem="연튕김", ko="연튕김", targets=["special/연튕김"], at="곁줄", rec="B",
             note="두 고리의 바깥선이 울퉁불퉁합니다. B: 같은 크기의 원 두 개를 허리에서 맞붙임."),
        dict(stem="늘임표", ko="늘임표", targets=["special/늘임표", "symbols/fermata"], at="곁줄 · 선율",
             rec="B", note="아래 그릇이 한쪽으로 처지고 굵기가 고르지 않습니다(선율 fermata와 같은 그림이라 함께 바뀝니다). "
             "B: 기둥 둘 + 가로획 + 둥근 그릇."),
        dict(stem="뜰", ko="뜰(곁줄)", targets=["special/뜰"], at="곁줄", rec="B",
             note="양 날개 끝이 머리카락처럼 갈라지고 안쪽 가장자리가 톱니입니다. B: 끝이 가늘고 아래로 굵어지는 좌우 대칭 V."),
        dict(stem="sigimsae-00", ko="뜰(선율)", targets=["symbols/sigimsae-00"], at="선율", rec="B",
             note="뜰(곁줄)과 같은 꼴인데 끝에 갈고리가 붙어 있습니다. B: 뜰(곁줄) B안과 같은 꼴."),
        dict(stem="staccato", ko="끊는표", targets=["symbols/staccato"], at="선율", rec="B",
             note="빗변이 부풀었다 꺼졌다 합니다. B: 모서리를 둥글린 역삼각형."),
        dict(stem="neunareunani", ko="느나르나니", targets=["symbols/neunareunani"], at="선율", rec="B3",
             note="두 고리의 바깥선이 각지고 울퉁불퉁합니다. B: 같은 타원 둘을 맞붙임 · B2·B3: 맞닿은 자리를 "
                  "허리로 둥글게 메움(B3이 원본만큼 굵은 허리) · B4: 한 획으로 꼬아 그린 ∞.",
             labels={"B": "B · 맞닿기만", "B2": "B2 · 허리 가늘게", "B3": "B3 · 허리 굵게", "B4": "B4 · ∞ 한 획"}),
        dict(stem="naneuna", ko="나느나", targets=["symbols/naneuna"], at="선율", rec="R",
             note="꺾인 획의 굵기가 들쭉날쭉하고 끝이 뭉툭합니다. B: 같은 굵기의 꺾은선 + 가로획. R: 가운데 꼭짓점을 안쪽으로 당겨 나니나처럼 예각으로, 그 위에 가로획.",
             labels={"R": "B′ · 메모 반영"}),
        dict(stem="nanina", ko="나니나", targets=["symbols/nanina"], at="선율", rec="B",
             note="나느나와 같은 문제. B: 같은 굵기의 꺾은선."),
        dict(stem="naniro", ko="나니로", targets=["symbols/naniro"], at="선율", rec="R",
             note="획 끝이 비스듬히 잘리고 두께가 조금씩 다릅니다. B: 둥근 모서리의 ㄷ자. R: 둥근 모서리를 없앤 직각 ㄷ자.",
             labels={"R": "B′ · 메모 반영"}),
        dict(stem="neunira", ko="느니라", targets=["symbols/neunira"], at="선율", rec="R",
             note="왼쪽 위 삐침이 덩어리로 뭉개져 있습니다. B: ㄷ자 + 곧은 삐침(삐침 꼴이 조금 달라집니다). R: 삐침이 위가 아니라 아래(오른쪽)로 처지게 휨.",
             labels={"R": "B′ · 메모 반영"}),
        dict(stem="flow", ko="흘림표", targets=["symbols/flow"], at="선율(붙임)", rec="B",
             note="바깥 곡선이 울퉁불퉁합니다. 자주 쓰는 기호라 눈에 잘 띕니다. B: 매끈한 초승달."),
        dict(stem="sigimsae-24", ko="s24", targets=["symbols/sigimsae-24"], at="선율", rec="B",
             note="아래 고리가 팔각형처럼 각집니다. B: 가로획 + 기둥 + 타원 고리."),
    ]),
    ("한자 기호", "s01~s18은 붓글씨를 낮은 해상도로 따 와 획이 계단처럼 깎이고(六·三·四), 기호마다 굵기가 "
     "0.068~0.121(잉크 긴 변 대비)로 크게 다릅니다. B안은 율명 기본 서체인 정해체(TW-Kai)의 글자를 "
     "굵기 0.088로 맞춘 것, C안은 정해체 원래 굵기입니다. 글자 꼴이 바뀌므로 가로세로 비율이 조금 달라질 수 있습니다.", [
        dict(stem=f"sigimsae-{k}", ko=f"s{k} {ch}", targets=[f"symbols/sigimsae-{k}"], at="선율", rec="B",
             note=n)
        for k, ch, n in [
            ("01", "一", "끝이 뭉툭하게 뜯겨 있습니다."),
            ("02", "二", "획 끝이 깎인 다각형입니다."),
            ("03", "三", "획이 유난히 굵고 아래 획 끝이 각진 덩어리입니다."),
            ("04", "四", "가장 굵습니다(0.121). 속 공간이 좁아 작게 그리면 뭉칩니다."),
            ("05", "五", "윤곽이 다각형으로 깎여 있습니다."),
            ("06", "六", "점 획과 아래 두 획이 계단처럼 깎였습니다. 가장 거칩니다."),
            ("07", "七", "굵고 획 끝이 깎여 있습니다."),
            ("08", "八", "삐침 끝이 깎여 있습니다."),
            ("10", "十", "비교적 깨끗합니다. 굵기만 맞춰집니다."),
            ("11", "文", "획 끝이 뭉개져 있습니다."),
            ("12", "子", "갈고리 끝이 각진 덩어리입니다."),
            ("13", "大", "삐침·파임 끝이 깎여 있습니다."),
            ("14", "上", "파임 끝이 덩어리로 뭉쳐 있습니다."),
            ("15", "中", "윤곽이 각지고 굵습니다."),
            ("16", "下", "비교적 깨끗합니다."),
            ("17", "小", "점 획이 뭉툭합니다."),
            ("18", "左", "획 끝이 뭉개져 있습니다."),
        ]
    ]),
    ("붓 획 기호", "붓 획 꼴 자체가 기호의 얼굴이라 다시 그리지 않고, 가장자리 잔물결만 걷었습니다(A). "
     "차이가 작으니 '원본 겹쳐 보기'를 켜고 보십시오.", [
        dict(stem="push", ko="미는표", targets=["symbols/push"], at="선율(붙임)", rec="A",
             note="바깥 곡선에 잔물결이 있습니다."),
        dict(stem="noraneuni", ko="노라느니", targets=["symbols/noraneuni"], at="선율", rec="A",
             note="획 가장자리가 조금씩 떱니다."),
        dict(stem="pizzicato", ko="자출", targets=["symbols/pizzicato"], at="선율", rec="A",
             note="고리 테두리가 울퉁불퉁합니다."),
        dict(stem="roll-str", ko="전성", targets=["symbols/roll-str"], at="선율", rec="A",
             note="고리 테두리가 울퉁불퉁합니다."),
        dict(stem="none", ko="노네", targets=["symbols/none"], at="선율", rec="R",
             note="굵은 붓 획 가장자리가 거칩니다. R: 깎여 나간 오른쪽 위 모서리를 둥글게 메움.",
             labels={"R": "A′ · 메모 반영"}),
        dict(stem="bend-down", ko="퇴성", targets=["symbols/bend-down"], at="선율", rec="A",
             note="파임 끝과 아래 획 가장자리가 거칩니다."),
    ]),
]
