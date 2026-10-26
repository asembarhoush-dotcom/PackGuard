# Stage 1 suggestions

Open ideas for improving stage 1 (the NCD compression scanner), ranked by their expected effect on accuracy and time. Written 2026-10-25 from the v1 detailed test ([`experiments/v1/`](../experiments/v1/README.md)). Updated 2026-10-26 with the v2 ratio experiment ([`experiments/v2/`](../experiments/v2/README.md)) and with the finished items removed: the v2 malware set with a tuned ratio, install-script scanning, and the thread pool with the 64 KiB dictionary and the inverted LZJD index.

## What v1 and v2 showed

| Result | Number |
|---|---|
| Known malware flagged at 0.19 (v1) | 50/50, with 0/75 benign false alarms |
| Malware from a family missing from the references (v1, family left out) | 12/50 (24%) |
| Malware published after the reference cutoff (v2, mostly new campaigns) | 10–12% at 0.19 |
| Benign false alarms at 0.19 (v2, 400 popular packages) | 10, from tiny compiled-TypeScript stubs and libraries copied by typosquats |
| Benign false alarms with JavaScript chunks under 256 bytes ignored (v2) | 5 |
| Lowest benign install-script score (v2, 64 packages) | 0.462; about 10 malicious scripts score below it |
| Prefilter against brute force | v1: 36/36 malicious scores exact; v2: 22/24 packages exact, the other two off by at most 0.0105 and far above any threshold |

NCD finds code that the references share. Keeping the references up to date with every new attack is what catches new malware; the ideas below improve accuracy and speed with that given.

## Ranking

| Rank | Suggestion | Effect | What it changes |
|---|---|---|---|
| 1 | Ignore JavaScript chunks under 256 bytes when scoring a package | High on false alarms, cheapest of all | Measured on v2 with the chosen references: benign false alarms at 0.19 fall from 10 to 5 of 400, and at 0.30 from 24 to 8. Recall at 0.19 drops slightly (`mal_shape` 10.3% → 9.0%, `mal_stream` 12.0% → 11.5%), because a few malicious packages are tiny too. Install-script chunks are kept whatever their size. A package whose files are all under 256 bytes still needs a score, so either score it on its largest chunk or leave it to stage 2. It can be a scanner option first, so both ways stay measurable. |
| 2 | Drop boilerplate reference chunks | Medium on false alarms | Compiled-TypeScript stubs (`"use strict"; Object.defineProperty(exports, "__esModule", …)`) sit inside malware packages and match the same stubs in benign code (the `isexe` and the 44–200 byte v2 false alarms). Removing them from the references fixes this at the source. |
| 3 | A separate threshold for install-script text | Medium on recall | Script texts are short (28–450 bytes), so NCD scores them high. No benign script scored below 0.462, while about 10 malicious ones did. A threshold of about 0.45 for the `package.json` chunk would catch them. |
| 4 | Benign references or a known-library check | Medium on false alarms | Removes false alarms from copied libraries (`supertest` matched `eslint-supertest` at 0.030; `body-parser` matched `boby_parser` at 0.319). Also needed for `compromised_lib` samples. |
| 5 | Normalise code before compressing (whitespace, comments, identifiers, `_0x…` names) | Medium | New versions and renamed clones that change names or layout would score closer to their family. |
| 6 | Grow the benign set | Medium (makes everything else measurable) | 464 benign packages so far, kept in WSL only and at most 64 KiB each. Large packages are needed to test chunking and to tune thresholds. |
| 7 | Compressor selector (xz, zstd, PPMd), one global choice | Medium-low | May help small files, where PPMd usually models text better. It can't create similarity that isn't there. |
| 8 | Save the reference cache (C(x), the LZJD index) to disk | None on accuracy, large on usability | Load now takes 28–43 s, about 10 s of it building the index. Loading a saved cache would take seconds, which matters for daily reference updates and the live scan. |
| 9 | Chunk-size selector, one global choice | Low now, medium later | Almost every test file is 16 KiB or less and never split. A bigger chunk size must also raise the LZMA dictionary (a compile-time check enforces dictionary ≥ 2 × the split threshold). |
| 10 | Compression-settings selector | Low | Extreme mode gave 0.211 vs 0.212 NCD and was about 10% slower; the dictionary is already as small as it can usefully be. |
| 11 | Better prefilter or a small ML ranker | About zero on accuracy | The prefilter is close to exact and the inverted index made ranking cheap; LZMA is now most of the scan time. |

## How to tune the selectors

- **Choose one global value per selector on validation data.** Don't choose per pair of files. The lowest NCD over several chunk sizes, compressors or settings pulls benign scores down as well, and NCDs from different compressors are on different scales, so one threshold stops working. Every option would also need its own cached C(x) and LZJD index.
- **Compare every step with the previous version** on accuracy and on time.
- **Never tune on the test split.**

## Order

1. Ignore tiny JavaScript chunks, drop boilerplate reference chunks and add the install-script threshold (1, 2, 3).
2. Add benign references or the known-library check and grow the benign set (4, 6).
3. Normalise code (5).
4. The reference cache on disk before the live scan and daily updates (8).
5. Compressor, then chunk size, then settings, one at a time (7, 9, 10).
