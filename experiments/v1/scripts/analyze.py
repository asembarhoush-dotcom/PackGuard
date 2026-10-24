import argparse, csv, json, math, os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
GRID = "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
RNG = np.random.default_rng(20261024)

LABELS = {
    "mal_known": "Known malware (in v1)",
    "mal_newver": "New version of a v1 package",
    "mal_newname": "New name, not in v1",
    "ben_popular": "Benign: popular",
    "ben_longtail": "Benign: long tail",
}


def num(v):
    return None if v in ("", None) else float(v)


def load(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def auc(pos, neg):
    pos, neg = np.asarray(pos), np.asarray(neg)
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    lower = (pos[:, None] < neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return float(lower / (len(pos) * len(neg)))


def auc_ci(pos, neg, n=2000):
    pos, neg = np.asarray(pos), np.asarray(neg)
    vals = [auc(RNG.choice(pos, len(pos)), RNG.choice(neg, len(neg))) for _ in range(n)]
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def wilson(k, n, z=1.96):
    if n == 0:
        return float("nan"), float("nan")
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def roc(pos, neg):
    ts = np.unique(np.concatenate([pos, neg, [-1.0, 2.0]]))
    tpr = np.array([(np.asarray(pos) <= t).mean() for t in ts])
    fpr = np.array([(np.asarray(neg) <= t).mean() for t in ts])
    return fpr, tpr


def at_threshold(pos, neg, t):
    tp = int((np.asarray(pos) <= t).sum())
    fp = int((np.asarray(neg) <= t).sum())
    return tp, fp


def scenario(name, pos, neg):
    pos, neg = np.asarray(sorted(pos)), np.asarray(sorted(neg))
    lo, hi = auc_ci(pos, neg)
    out = {"scenario": name, "malicious": len(pos), "benign": len(neg),
           "auc": auc(pos, neg), "auc_ci95": [lo, hi]}
    t0 = float(neg.min()) - 1e-9
    tp, _ = at_threshold(pos, neg, t0)
    out["recall_at_zero_false_alarms"] = tp / len(pos)
    out["recall_at_zero_false_alarms_ci95"] = wilson(tp, len(pos))
    out["threshold_zero_false_alarms"] = float(neg.min())
    t99 = float(np.quantile(pos, 0.99, method="higher"))
    tp, fp = at_threshold(pos, neg, t99)
    out["threshold_99_recall"] = t99
    out["recall_at_t99"] = tp / len(pos)
    out["false_alarm_rate_at_t99"] = fp / len(neg)
    out["false_alarm_rate_at_t99_ci95"] = wilson(fp, len(neg))
    best = None
    for t in np.unique(np.concatenate([pos, neg])):
        tp, fp = at_threshold(pos, neg, t)
        fn = len(pos) - tp
        f1 = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
        if best is None or f1 > best[0]:
            best = (f1, float(t), tp, fp)
    out["best_f1"], out["best_f1_threshold"], tp, fp = best
    out["best_f1_recall"] = tp / len(pos)
    out["best_f1_false_alarm_rate"] = fp / len(neg)
    return out


def style(ax, title, xlabel, ylabel):
    ax.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", color=INK, fontsize=12, pad=12)
    ax.set_xlabel(xlabel, color=INK2, fontsize=10)
    ax.set_ylabel(ylabel, color=INK2, fontsize=10)
    ax.tick_params(colors=INK2, labelsize=9, length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def fig(w=8, h=4.8):
    f, ax = plt.subplots(figsize=(w, h), dpi=150)
    f.patch.set_facecolor(SURFACE)
    return f, ax


def strip_plot(rows, path, line):
    series = [
        ("mal_known", "score", LABELS["mal_known"], ORANGE),
        ("mal_known", "score_leave_family_out", "Known malware, family left out", ORANGE),
        ("mal_newver", "score", LABELS["mal_newver"], ORANGE),
        ("mal_newver", "score_leave_name_out", "New version, earlier versions left out", ORANGE),
        ("mal_newname", "score", LABELS["mal_newname"], ORANGE),
        ("ben_popular", "score", LABELS["ben_popular"], BLUE),
        ("ben_longtail", "score", LABELS["ben_longtail"], BLUE),
    ]
    f, ax = fig(9, 5.2)
    style(ax, "Package scores against v1 (lower = closer to known malware)", "Package score (minimum NCD)", "")
    for i, (cat, col, label, color) in enumerate(series):
        y0 = len(series) - 1 - i
        vals = [num(r[col]) for r in rows if r["category"] == cat and num(r[col]) is not None]
        jit = RNG.uniform(-0.18, 0.18, len(vals))
        ax.scatter(vals, y0 + jit, s=34, color=color, edgecolors=SURFACE, linewidths=1.2, zorder=3)
        if vals:
            ax.plot([np.median(vals)] * 2, [y0 - 0.3, y0 + 0.3], color=INK, linewidth=2, zorder=4)
    ax.set_yticks(range(len(series)))
    ax.set_yticklabels([s[2] for s in reversed(series)], color=INK)
    ax.set_xlim(-0.02, 1.02)
    ax.grid(False, axis="y")
    ax.axvline(line, color=INK2, linewidth=1, zorder=2)
    ax.text(line, len(series) - 0.45, f" lowest benign score {line:.3f}", color=INK2, fontsize=8, va="bottom")
    ax.scatter([], [], s=34, color=ORANGE, label="malicious")
    ax.scatter([], [], s=34, color=BLUE, label="benign")
    ax.plot([], [], color=INK, linewidth=2, label="median")
    ax.legend(loc="lower left", frameon=False, fontsize=9, labelcolor=INK2)
    f.tight_layout()
    f.savefig(path, facecolor=SURFACE)
    plt.close(f)


def roc_plot(curves, path):
    f, ax = fig(6.4, 5.6)
    style(ax, "ROC: malicious vs benign packages", "False alarm rate", "Malware recall")
    for (label, pos, neg), color in zip(curves, (BLUE, ORANGE, AQUA)):
        fpr, tpr = roc(pos, neg)
        a = auc(pos, neg)
        ax.step(fpr, tpr, where="post", color=color, linewidth=2, label=f"{label} (AUC {a:.3f})")
    ax.plot([0, 1], [0, 1], color=GRID, linewidth=1)
    ax.set_xlim(-0.01, 1.01)
    ax.set_ylim(-0.01, 1.02)
    ax.legend(loc="lower right", frameon=False, fontsize=9, labelcolor=INK)
    f.tight_layout()
    f.savefig(path, facecolor=SURFACE)
    plt.close(f)


def size_plot(rows, path):
    f, ax = fig(8, 4.8)
    style(ax, "Package score vs. JavaScript size", "JavaScript in the package (bytes, log scale)", "Package score")
    for truth, color in (("malicious", ORANGE), ("benign", BLUE)):
        xs = [float(r["js_bytes"]) for r in rows if r["truth"] == truth]
        ys = [float(r["score"]) for r in rows if r["truth"] == truth]
        ax.scatter(xs, ys, s=34, color=color, edgecolors=SURFACE, linewidths=1.2, label=truth, zorder=3)
    ax.set_xscale("log")
    ax.set_ylim(-0.02, 1.02)
    ax.legend(loc="lower left", frameon=False, fontsize=9, labelcolor=INK2)
    f.tight_layout()
    f.savefig(path, facecolor=SURFACE)
    plt.close(f)


def time_plot(rows, path):
    f, ax = fig(8, 4.8)
    style(ax, "Scan time of single-chunk packages against v1 (LZJD prefilter, 256 candidates, 4 threads)",
          "Chunk size (bytes)", "Seconds")
    one = [r for r in rows if int(r["chunks"]) == 1]
    xs = [float(r["js_bytes"]) for r in one]
    ys = [float(r["seconds"]) for r in one]
    ax.scatter(xs, ys, s=34, color=BLUE, edgecolors=SURFACE, linewidths=1.2, zorder=3)
    f.tight_layout()
    f.savefig(path, facecolor=SURFACE)
    plt.close(f)


def scaling_plot(scaling, path):
    f, ax = fig(6.4, 4.4)
    style(ax, "Thread scaling, native Windows build (i3-1315U)", "Worker threads", "Speed-up over 1 thread")
    th = [int(r["threads"]) for r in scaling]
    base = float(scaling[0]["seconds"])
    sp = [base / float(r["seconds"]) for r in scaling]
    ax.plot(th, th, color=GRID, linewidth=1.5, label="ideal")
    ax.plot(th, sp, color=BLUE, linewidth=2, marker="o", markersize=7, markeredgecolor=SURFACE,
            markeredgewidth=1.5, label="measured")
    for x, y in zip(th, sp):
        ax.text(x, y + 0.25, f"{y:.2f}×", ha="center", color=INK2, fontsize=8)
    ax.set_xticks(th)
    ax.set_ylim(0, max(th) + 0.5)
    ax.legend(loc="upper left", frameon=False, fontsize=9, labelcolor=INK2)
    f.tight_layout()
    f.savefig(path, facecolor=SURFACE)
    plt.close(f)


def summarize(vals):
    a = np.asarray(vals)
    if len(a) == 0:
        return {"n": 0}
    return {"n": int(len(a)), "median": float(np.median(a)), "q1": float(np.percentile(a, 25)),
            "q3": float(np.percentile(a, 75)), "min": float(a.min()), "max": float(a.max())}


def spearman(x, y):
    rx = np.argsort(np.argsort(x))
    ry = np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    args = ap.parse_args()
    res = args.results
    figs = os.path.join(res, "figures")
    os.makedirs(figs, exist_ok=True)
    rows = load(os.path.join(res, "packages.csv"))
    chunks = load(os.path.join(res, "chunks.csv"))
    scaling = load(os.path.join(res, "scaling.csv"))

    def col(cat, c):
        return [num(r[c]) for r in rows if r["category"] == cat and num(r[c]) is not None]

    benign = [float(r["score"]) for r in rows if r["truth"] == "benign"]
    mal_all = [float(r["score"]) for r in rows if r["truth"] == "malicious"]
    unseen = col("mal_known", "score_leave_family_out")
    no_prev = col("mal_newver", "score_leave_name_out")
    novel = col("mal_newver", "score_novel_files") + col("mal_newname", "score_novel_files")

    m = {"categories": {}, "scenarios": []}
    for cat in LABELS:
        m["categories"][cat] = {"score": summarize(col(cat, "score"))}
    m["categories"]["mal_known"]["score_leave_family_out"] = summarize(unseen)
    m["categories"]["mal_newver"]["score_leave_name_out"] = summarize(no_prev)
    m["categories"]["novel_files"] = {"score": summarize(novel)}
    m["censored"] = {
        "leave_family_out": sum(int(r["leave_family_out_censored"]) for r in rows if r["category"] == "mal_known"),
        "leave_name_out": sum(int(r["leave_name_out_censored"]) for r in rows if r["category"] == "mal_newver"),
    }

    sc = [
        ("All malware as scanned", mal_all),
        ("Known malware (in v1)", col("mal_known", "score")),
        ("New version of a v1 package", col("mal_newver", "score")),
        ("New name, not in v1", col("mal_newname", "score")),
        ("Novel files only (not in v1)", novel),
        ("New version, earlier versions left out", no_prev),
        ("Unseen family (known, family left out)", unseen),
    ]
    for name, pos in sc:
        m["scenarios"].append(scenario(name, pos, benign))

    m["matches"] = {}
    for cat in ("mal_known", "mal_newver", "mal_newname"):
        rs = [r for r in rows if r["category"] == cat]
        m["matches"][cat] = {"same_name_group": sum(int(r["match_same_name"]) for r in rs),
                             "own_group": sum(int(r["match_own_group"]) for r in rs),
                             "packages": len(rs),
                             "with_files_identical_to_v1": sum(1 for r in rs if int(r["files_identical_to_v1"]) > 0)}
    m["lowest_benign"] = sorted(({"package": r["package"], "version": r["version"], "category": r["category"],
                                  "score": float(r["score"]), "match_file": r["match_file"]}
                                 for r in rows if r["truth"] == "benign"), key=lambda x: x["score"])[:10]
    m["highest_malicious"] = sorted(({"package": r["package"], "version": r["version"], "category": r["category"],
                                      "score": float(r["score"]), "js_bytes": int(r["js_bytes"]),
                                      "match_file": r["match_file"]}
                                     for r in rows if r["truth"] == "malicious"), key=lambda x: -x["score"])[:10]
    m["size_vs_score_spearman"] = {
        t: spearman([float(r["js_bytes"]) for r in rows if r["truth"] == t],
                    [float(r["score"]) for r in rows if r["truth"] == t]) for t in ("malicious", "benign")}
    tiny = [r for r in rows if r["category"] == "mal_known" and int(r["js_bytes"]) < 512]
    m["tiny_known_malware_scores"] = sorted(float(r["score"]) for r in tiny)
    secs = [float(r["seconds"]) for r in rows]
    nch = [int(r["chunks"]) for r in rows]
    per_chunk = {(r["package"], r["version"]): float(r["seconds"]) / int(r["chunks"]) for r in rows}
    single = [c for c in chunks if sum(1 for d in chunks if (d["package"], d["version"]) == (c["package"], c["version"])) == 1]
    m["timing"] = {"packages": len(rows), "chunks": int(sum(nch)), "scan_seconds_total": float(sum(secs)),
                   "seconds_per_chunk_median": float(np.median([s / c for s, c in zip(secs, nch)])),
                   "seconds_per_package_median": float(np.median(secs)),
                   "single_chunk_packages": len(single),
                   "chunk_bytes_vs_seconds_spearman_single_chunk": spearman(
                       [float(c["length"]) for c in single],
                       [per_chunk[(c["package"], c["version"])] for c in single])}
    with open(os.path.join(res, "metrics.json"), "w") as f:
        json.dump(m, f, indent=1)

    strip_plot(rows, os.path.join(figs, "scores_by_category.png"), min(benign))
    roc_plot([("All malware as scanned", mal_all, benign),
              ("Unseen family", unseen, benign),
              ("Novel files only", novel, benign)], os.path.join(figs, "roc.png"))
    size_plot(rows, os.path.join(figs, "score_vs_size.png"))
    time_plot(rows, os.path.join(figs, "time_per_chunk.png"))
    scaling_plot(scaling, os.path.join(figs, "thread_scaling.png"))
    for s in m["scenarios"]:
        print(f"{s['scenario']:42} n={s['malicious']:3} AUC={s['auc']:.3f} "
              f"[{s['auc_ci95'][0]:.3f},{s['auc_ci95'][1]:.3f}]  recall@0FA={s['recall_at_zero_false_alarms']:.2f}  "
              f"FAR@99%recall={s['false_alarm_rate_at_t99']:.2f} (t={s['threshold_99_recall']:.3f})  "
              f"bestF1={s['best_f1']:.3f}@{s['best_f1_threshold']:.3f}")


if __name__ == "__main__":
    main()
