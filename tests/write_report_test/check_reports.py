import json, sys
d = sys.argv[1]
ok = True
def check(cond, msg):
    global ok
    print(("PASS " if cond else "FAIL ") + msg)
    ok &= bool(cond)

def load(name):
    raw = open(f"{d}/{name}", "rb").read()
    return json.loads(raw.decode("utf-8", errors="strict"))

a = load("all_chunks.json")
src = {n: open(f"{d}/{n}", "rb").read() for n in ["escapes.txt", "utf8_valid.txt", "utf8_cut_end.txt", "utf8_invalid.txt"]}
check(a["package"] == '@scope/pkg"q' and a["version"] == "1.0.0", "package/version escaped")
check(a["score"] == 0.0 and a["ignored_small_chunks"] == 2 and a["low_confidence"] is True,
      "score, ignored count, low confidence")
check(a["threshold"] == 0.5 and a["flagged"] is True, "threshold, flagged")
check(a["seconds"] == 1.5, "seconds written")
check(len(a["chunks"]) == 4, "four chunks")
c = {x["file"]: x for x in a["chunks"]}
check(c["escapes.txt"]["text"] == src["escapes.txt"].decode(), "escapes round-trip exactly")
check(c["utf8_valid.txt"]["text"] == src["utf8_valid.txt"].decode(), "valid UTF-8 round-trips exactly")
check(c["utf8_cut_end.txt"]["text"] == "ends mid emoji ��", "cut sequence -> two U+FFFD")
check(c["utf8_invalid.txt"]["text"] == "ff:� overlong:�� surrogate:��� above:���� lone_cont:� ok",
      "invalid bytes -> one U+FFFD each")
check(c["utf8_invalid.txt"]["match"] == {"file": 'ref"dir\\x.js', "start": 8192}, "match object without package")
check(c["escapes.txt"]["match"] == {"file": 'ref"dir\\x.js', "package": "pkg@1.0.0", "start": 8192}, "match object with package")
check(a["matched_packages"] == [{"package": "boby_parser@2.2.0", "group": "be8164d46ffb", "ncd": 0.3187, "chunks": 7},
                                {"package": 'x"y', "group": "g", "ncd": None, "chunks": 1}], "matched_packages list")
check([x["start"] for x in a["chunks"]] == [0, 4096, 8192, 12288], "chunk starts")
check([x["ncd"] for x in a["chunks"]] == [0.0, 0.25, 0.5, 0.75], "chunk ncd values")
check([x["kind"] for x in a["chunks"]] == ["install_script", "js", "js", "js"], "chunk kinds")
check([x.get("ignored", False) for x in a["chunks"]] == [False, False, False, True], "chunk ignored flags")
check([x["threshold"] for x in a["chunks"]] == [0.45, 0.5, 0.5, 0.5], "per-chunk thresholds")
check([x["flagged"] for x in a["chunks"]] == [True, False, False, False], "per-chunk flags")

e = load("no_chunks.json")
check(e["score"] is None and e["flagged"] is False and e["chunks"] == [], "no chunks: null score, not flagged")
n = load("non_finite.json")
check(n["score"] is None and n["chunks"][0]["ncd"] is None and "threshold" not in n and n["chunks"][0]["text"] == "", "non-finite -> null, no threshold keys")
check(n["seconds"] is None, "non-finite seconds -> null")
u = load("not_flagged.json")
check(u["flagged"] is False and u["score"] == 0.9, "score above threshold not flagged")
check("seconds" not in u and "seconds" not in e, "seconds omitted when not set")
check(e["matched_packages"] == [] and "matched_packages" not in u, "matched_packages empty or omitted")
print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
