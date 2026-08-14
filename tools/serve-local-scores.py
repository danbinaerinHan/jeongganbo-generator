#!/usr/bin/env python3
"""로컬 전용 게시 서버 — browse.html을 서버 없이 진짜처럼 돌려 보는 자리.

    python3 tools/serve-local-scores.py <정적 루트> <악보 폴더> [--port 4174]

무엇이냐: 모아보기(browse.html)는 폴더를 훑는 게 아니라 **서버에 list_scores를 물어서**
받아온 것만 그린다(js/browse.js). 그래서 손에 있는 .jgb.json 뭉치를 모아보기로 확인하려면
그 물음에 답해 줄 무언가가 있어야 한다. 이 스크립트가 Supabase 자리를 대신 서는 **가짜
서버**이고, 정적 파일도 같이 내주므로 페이지와 API가 같은 출처(origin)가 되어 CORS를 안 탄다.

왜 굳이: 진짜 서버에 올리는 것은 밖으로 나가는 일이라 되돌리기 어렵고, CC BY-NC-SA 자료면
게시물마다 출처·조건 표기를 먼저 정해야 한다. 확인만 하려는 자리에서 그 값을 치르지 않으려는
것이다.

**127.0.0.1에만 묶는다** — 이 컴퓨터 밖에서는 안 보인다. 같은 그물에 있는 남의 기기에
악보가 새는 것을 막으려는 것이니 0.0.0.0으로 열지 말 것.

읽기(list_scores·fetch_score)만 답하고 **쓰기(publish·update·delete)는 400으로 막는다** —
확인용 서버에서 누른 [악보 게시]가 진짜로 무언가를 만들면 안 되고, 조용히 실패해도 안 된다.

미리보기 그림은 서버가 못 그린다(악보를 그리려면 브라우저가 있어야 한다). 번들 페이지의
[미리보기 그림 만들기]가 뜬 그림을 `POST /_thumb/<id>`로 보내면 여기 받아 두었다가
list_scores에 실어 준다 — 진짜 서버에서 브라우저가 그림을 떠 보내는 것과 같은 짜임이다.
"""

import argparse, hashlib, json, os, re, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote

AP = argparse.ArgumentParser()
AP.add_argument("root")                       # 정적 파일 루트(미러)
AP.add_argument("scores")                     # .jgb.json 폴더
AP.add_argument("--port", type=int, default=4174)
AP.add_argument("--thumbs", default=None)     # 그림 보관 폴더(기본: 악보 폴더 옆 _thumbs)
A = AP.parse_args()

THUMBS = A.thumbs or os.path.join(os.path.dirname(A.scores.rstrip("/")), "_thumbs")
os.makedirs(THUMBS, exist_ok=True)

# 게시물 id — 진짜 서버의 8자 id와 같은 꼴로, 파일 이름에서 늘 같은 값이 나오게 뜬다.
# ★ NFC로 정규화하고 해시 — 맥 파일 시스템은 이름을 NFD로 돌려주는데 _thumbs의 그림은
#   NFC 이름의 해시로 저장돼 있다(tools/publish-ngc-omr.mjs와 같은 셈이어야 그림이 얹힌다).
def sid(name):
    import unicodedata
    return hashlib.sha1(unicodedata.normalize("NFC", name).encode("utf-8")).hexdigest()[:8]


def load():
    out = []
    for f in sorted(os.listdir(A.scores)):
        if not f.endswith(".jgb.json"):
            continue
        p = os.path.join(A.scores, f)
        with open(p, encoding="utf-8") as fp:
            doc = json.load(fp)
        c = doc.get("controls", {})
        i = sid(f)
        th = os.path.join(THUMBS, i + ".txt")
        out.append({
            "id": i,
            "title": (c.get("title") or f[:-9]),
            "author": "국립국악원 (OMR)",
            # LICENSE_KO에 없는 값은 browse.js가 글자 그대로 보여 준다 — 그래서 읽을 수 있게 적는다
            "license": "CC BY-NC-SA 4.0",
            "created_at": "2026-08-14T00:00:00Z",
            "view_count": 0,
            "fork_of": None,
            "thumb": open(th, encoding="utf-8").read() if os.path.exists(th) else None,
            "_path": p,
        })
    return out


SCORES = load()
print(f"악보 {len(SCORES)}건 · 그림 {sum(1 for s in SCORES if s['thumb'])}장")


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=A.root, **kw)

    def log_message(self, *a):
        pass                                   # 조용히

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        path = self.path.split("?")[0]

        # 브라우저가 떠 보낸 미리보기 그림 받기
        m = re.match(r"^/_thumb/([A-Za-z0-9_-]{1,32})$", path)
        if m:
            with open(os.path.join(THUMBS, m.group(1) + ".txt"), "w", encoding="utf-8") as fp:
                fp.write(raw.decode("utf-8"))
            for s in SCORES:
                if s["id"] == m.group(1):
                    s["thumb"] = raw.decode("utf-8")
            return self._json({"ok": True})

        if not path.startswith("/rest/v1/rpc/"):
            return self._json({"message": "그런 자리는 없습니다"}, 404)
        fn = path[len("/rest/v1/rpc/"):]
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {}

        if fn == "list_scores":
            q = (body.get("p_q") or "").strip()
            items = [s for s in SCORES if not q or q in s["title"]]
            # 모아보기 탭이 쓰는 지은이 필터 — 진짜 서버(list_scores)와 같은 정확 일치
            if body.get("p_author") is not None:
                items = [s for s in items if s["author"] == body["p_author"]]
            if body.get("p_author_not") is not None:
                items = [s for s in items if s["author"] != body["p_author_not"]]
            if body.get("p_sort") == "popular":
                items = sorted(items, key=lambda s: -s["view_count"])
            off = int(body.get("p_offset") or 0)
            lim = int(body.get("p_limit") or 24)
            page = [{k: v for k, v in s.items() if k != "_path"} for s in items[off:off + lim]]
            return self._json({"total": len(items), "items": page})

        if fn == "fetch_score":
            for s in SCORES:
                if s["id"] == body.get("p_id"):
                    with open(s["_path"], encoding="utf-8") as fp:
                        doc = json.load(fp)
                    r = {k: v for k, v in s.items() if k != "_path"}
                    r["doc"] = doc
                    return self._json(r)
            # 진짜 서버와 같은 태도 — 없는 id와 틀린 토큰은 같은 말을 준다
            return self._json({"message": "악보를 찾을 수 없습니다"}, 404)

        if fn in ("publish_score", "update_score", "delete_score"):
            return self._json({"message": "여기는 확인용 로컬 서버라 게시·수정·삭제는 하지 않습니다."}, 400)

        return self._json({"message": f"모르는 요청입니다: {fn}"}, 404)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", A.port), H)     # ← 이 컴퓨터에서만
    print(f"http://localhost:{A.port}/browse.html  (127.0.0.1 전용 · Ctrl+C로 멈춤)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
