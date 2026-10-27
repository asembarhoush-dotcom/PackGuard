import argparse
import csv
import json
import os
import statistics

CATEGORIES = ("mal_known", "mal_newver", "mal_newname", "ben_popular", "ben_longtail")
MALWARE = ("mal_known", "mal_newver", "mal_newname")
BENIGN = ("ben_popular", "ben_longtail")
TIERS = ("T1", "T2", "T3", "T4")
THRESHOLDS = (0.19, 0.30, 0.50)


def read_reports(work, tag):
    """Reads every report of one tag and returns rows keyed by tier and category."""
    folder = os.path.join(os.path.expanduser(work), "reports", tag)
    rows = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json") or name.endswith(".run.json"):
            continue
        key = name[:-5]
        parts = key.split("__", 2)
        if len(parts) != 3:
            continue
        tier, category, package = parts
        if tier not in TIERS or category not in CATEGORIES:
            continue
        with open(os.path.join(folder, name), encoding="utf-8") as handle:
            report = json.load(handle)
        rows.append({
            "tag": tag,
            "tier": tier,
            "category": category,
            "package": package,
            "score": report.get("score"),
            "score_raw": report.get("score_raw"),
            "score_normalized": report.get("score_normalized"),
            "score_view": report.get("score_view"),
        })
    return rows


def rate(rows, threshold):
    """Returns the fraction of rows scored at or below threshold."""
    if not rows:
        return None
    hits = sum(1 for row in rows
               if row["score"] is not None and row["score"] <= threshold)
    return hits / len(rows)


def medians(rows):
    """Returns the median and mean of the valid scores, or None."""
    values = [row["score"] for row in rows if row["score"] is not None]
    if not values:
        return None, None
    return statistics.median(values), statistics.mean(values)


def select(rows, tag, tier, categories):
    """Selects rows for one tag, one tier (or every tier) and a category set."""
    return [row for row in rows if row["tag"] == tag
            and (tier == "ALL" or row["tier"] == tier)
            and row["category"] in categories]


def summarize(rows):
    """Builds one summary row per tag, tier and category, plus overall rows."""
    out = []
    for tag in sorted({row["tag"] for row in rows}):
        for tier in TIERS + ("ALL",):
            for category in CATEGORIES + ("ALL_MAL", "ALL_BEN"):
                if category == "ALL_MAL":
                    selected = select(rows, tag, tier, MALWARE)
                elif category == "ALL_BEN":
                    selected = select(rows, tag, tier, BENIGN)
                else:
                    selected = select(rows, tag, tier, (category,))
                if not selected:
                    continue
                median, mean = medians(selected)
                entry = {"tag": tag, "tier": tier, "category": category, "n": len(selected),
                         "median": median, "mean": mean}
                for threshold in THRESHOLDS:
                    entry["rate_%.2f" % threshold] = rate(selected, threshold)
                if category in ("ALL_MAL", "ALL_BEN"):
                    entry["kind"] = "malware" if category == "ALL_MAL" else "benign"
                else:
                    entry["kind"] = "malware" if category in MALWARE else "benign"
                if category == "ALL_MAL":
                    entry["normalized_wins"] = sum(1 for row in selected
                                                   if row["score_view"] == "normalized")
                    entry["exact_normalized"] = sum(1 for row in selected
                                                    if row["score_normalized"] == 0)
                out.append(entry)
    return out


def write_csv(path, rows, fields):
    """Writes rows to path with the given fields."""
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field) for field in fields})


def compare(summary, tags):
    """Builds candidate-minus-baseline rate changes for every tier and kind."""
    index = {(row["tag"], row["tier"], row["category"]): row for row in summary}
    baseline, candidate = tags[0], tags[-1]
    out = []
    for tier in TIERS + ("ALL",):
        for category in ("ALL_MAL", "ALL_BEN"):
            old = index.get((baseline, tier, category))
            new = index.get((candidate, tier, category))
            if old is None or new is None:
                continue
            entry = {"tier": tier, "category": category}
            for threshold in THRESHOLDS:
                key = "rate_%.2f" % threshold
                entry[key + "_v3"] = old[key]
                entry[key + "_v4"] = new[key]
                entry[key + "_delta"] = (new[key] - old[key]) if old[key] is not None and new[key] is not None else None
            out.append(entry)
    return out


def show(summary):
    """Prints the overall rows for every tag and tier."""
    print("%-4s %-4s %-9s %4s %8s %8s %8s %8s" %
          ("tag", "tier", "kind", "n", "<=0.19", "<=0.30", "<=0.50", "median"))
    for row in summary:
        if row["category"] not in ("ALL_MAL", "ALL_BEN"):
            continue
        print("%-4s %-4s %-9s %4d %8.1f%% %8.1f%% %8.1f%% %8.4f" %
              (row["tag"], row["tier"], row["kind"], row["n"],
               100 * row["rate_0.19"], 100 * row["rate_0.30"], 100 * row["rate_0.50"],
               row["median"] if row["median"] is not None else float("nan")))


def main():
    """Reads the reports, writes the CSVs and prints the comparison."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", default=os.path.expanduser("~/pg-v4"))
    parser.add_argument("--out", default=os.path.join("experiments", "v4", "results"))
    parser.add_argument("--tags", default="v3,v4")
    args = parser.parse_args()
    rows = []
    tags = args.tags.split(",")
    for tag in tags:
        rows.extend(read_reports(args.work, tag))
    summary = summarize(rows)
    os.makedirs(args.out, exist_ok=True)
    write_csv(os.path.join(args.out, "summary.csv"), summary,
              ["tag", "tier", "category", "kind", "n", "median", "mean",
               "rate_0.19", "rate_0.30", "rate_0.50", "normalized_wins", "exact_normalized"])
    write_csv(os.path.join(args.out, "packages.csv"), rows,
              ["tag", "tier", "category", "package", "score", "score_raw",
               "score_normalized", "score_view"])
    result = {"work": os.path.expanduser(args.work), "tags": args.tags,
              "summary": summary, "comparison": compare(summary, tags)}
    with open(os.path.join(args.out, "summary.json"), "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=1)
    show(summary)
    print(json.dumps(compare(summary, tags), indent=1))


if __name__ == "__main__":
    main()
