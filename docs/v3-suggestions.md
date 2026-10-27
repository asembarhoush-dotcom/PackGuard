# Stage 1 suggestions for v4: renamed and mangled known malware

Scope: **stage 1 only**. Stage 2 belongs to the AI-filter work and is out of scope here. v4 targets **known malware that has been renamed and mangled** — same family, changed package or file names, identifiers, strings, formatting, structure or encoding. It does not target malware from a new campaign; that is stage 2's problem.

Written 2026-10-27 from the v1 detailed test and the v3 stage-1 results ([`experiments/v1/`](../experiments/v1/README.md), `experiments/v3/` on branch `feature/v3-stage1`).

## What the existing data says

The v1 detailed test already separates the two cases that matter:

| v1 `mal_newver` + `mal_newname`, threshold 0.19 | Caught |
|---|---|
| A file identical to a v1 file, ignoring whitespace | 39/39 (100%) |
| No identical file | 16/31 (52%) |
| JavaScript under 256 bytes | 3/8 (38%) |
| 256 B to 1 KiB | 8/11 (73%) |
| 1 KiB to 4 KiB | 23/29 (79%) |
| Over 4 KiB | 21/22 (95%) |

The v3 frozen sets show the same split using the v2 code shape (strings, numbers, comments and `_0x…` names blanked, whitespace removed):

| v3 test packages | Caught at 0.19 |
|---|---|
| Package has a code shape seen in the references (`shape_seen`) | 19/22 (86.4%) |
| Package has no shape in the references (new campaign; contrast only, not a v4 target) | 35/478 (7.3%) |
| Benign `ben_general` false alarms | 1/400 at 0.19; 4/400 at 0.30 |

The three known-shape misses are a useful checklist for v4:

- `cbc97b7a` — all JavaScript chunks are tiny, so the package is `low_confidence`;
- `identitysecuretokenserv` — install-script score 0.4505, just above the 0.45 threshold;
- `model-poc-suhail` — JavaScript score 0.3441, above 0.19 and 0.30.

The conclusion is clean: stage 1 is already a very good **near-duplicate detector**. It catches every variant that still contains an identical file and most variants that keep the same code shape. The gap is the variant that changes enough to lose its identical file or its shape, and the tiny package that has too little text to compress. New-campaign recall is not a stage-1 failure; it is the wrong target for v4.

## Measure first: a mangling benchmark

Without this, none of the ideas below can be compared. Build `experiments/v4/scripts/mangle.py` (WSL only) and a `tests/`-style manifest of transformations.

**Transformations, in tiers.**

| Tier | Transformation | What it simulates |
|---|---|---|
| T1 | Remove or add whitespace, comments, semicolons; minify; pretty-print | A copied sample passed through a formatter or bundler |
| T2 | Rename package, folders, files; rename local identifiers and function arguments; change string values, URLs and domains; reorder object keys | A renamed or lightly edited sample |
| T3 | Reorder functions, split or merge files, insert dead code or padding, duplicate blocks | A structurally mangled sample |
| T4 | Base64/hex-encode strings or whole files, control-flow flattening, `_0x…` obfuscation | A deliberately obfuscated sample |

**Controls.**

- Hold the source family out of the references (the v1 leave-family-out method), so a detection is not memorisation of the original file.
- Keep an untouched copy of every sample as the control.
- Apply the same transformations to benign packages and measure false alarms; a normaliser that makes benign code look like malware is not a win.
- Use a fixed seed and record the transformation per file in the manifest. Split transformation seeds into validation and test so v4 is not tuned on its own test set.

**Metrics.**

- Recall per tier and per size bucket, at a fixed benign false-alarm rate.
- Score change against the untouched copy, and the matched package/group, so a miss can be attributed to the view, the chunking or the prefilter.
- The v1 `mal_newver`/`mal_newname` anchors and the 22 v3 known-shape packages are the regression checks, not the main test.

The benchmark is the chooser: if T2 dominates, take the normalisation route; if T3 dominates, take content-defined chunking; if both, take both.

## Ranking

| Rank | Suggestion | What it fixes | Expected effect | Cost |
|---|---|---|---|---|
| 1 | Mangling benchmark with family-held-out and transformed-benign controls | Nothing by itself; makes every other idea measurable | Decides the v4 scope | Medium (Python, WSL) |
| 2 | Normalised second view plus a normalised hash index | Renamed identifiers, changed strings, whitespace and formatting (T1/T2) | High on renamed and lightly edited variants | Medium (JS lexer in C, dual index) |
| 3 | Content-defined chunking (CDC) | Insertions, dead code, reordered functions and split/merged files (T3) | High on structurally mangled variants | Medium (chunker in C, new tests) |
| 4 | Tiny-file path | Packages under 256 B, all-tiny packages, `low_confidence` cases | Medium: 3/8 tiny variants caught today | Low to medium |
| 5 | Reference augmentation with mangled variants | All tiers, by adding transformed examples to the reference set | High on the benchmark, but partly memorisation | Low code, higher memory/load |
| 6 | Known-benign references or a known-library margin | False alarms from copied libraries and from normalisation | Medium on false alarms; fixes `supertest` | Medium (load/memory) |
| 7 | Dual LZJD prefilter for the normalised view | The prefilter ranking the wrong references for normalised text | No accuracy by itself; protects idea 2 | Low |
| 8 | Install-script mangling | Script-only variants and the 0.4505 miss | Medium-low; the script channel is cheap | Low |
| 9 | Reference cache and report fields | Load time and attribution of per-view scores | None on accuracy; large on usability | Low to medium |
| 10 | Compressor, chunk-size and settings selectors | Little: v1/v2 measured low headroom | Low; defer | Medium |

## 1. Mangling benchmark

This is the v4 experiment. It should be built before any scanner change, and the unchanged v3 build should be measured on it first. The baseline is expected to be strong on T1 and weak on T3/T4; the exact numbers are the point of the benchmark.

The benchmark also needs a **benign mangled set**. Normalisation can collapse many benign files onto the same skeleton, and CDC can split them differently. Without transformed benign packages, the false-alarm cost of ideas 2 and 3 is invisible.

## 2. Normalised second view and normalised hash

The v2 code shape already blanks strings, numbers, comments and `_0x…` names. v4 can go further and score a normalised view directly.

- **View A:** the current raw text.
- **View B:** whitespace and comments removed, string literals replaced by `S`, numbers by `N`.
- **View C:** View B plus identifiers replaced by `I`, keeping keywords, built-ins and punctuation. This is the view that should survive a consistent rename.
- **Normalised hash:** a 128-bit hash of View B or C. If two variants normalise to the same token stream, an exact hash match is stronger and cheaper than NCD, and needs no compression.

Score View B/C with NCD against the same normalised references. Keep the views separate in the report; do not take a per-pair minimum across views, because that lowers benign scores too and the score scales differ. Run View B/C in addition to raw and choose the combination on validation.

**Encoded payloads.** T4 often wraps the payload in base64 or hex. Detect long base64/hex runs, decode them, and score the decoded text as a separate view; keep the raw view as well. Require a minimum length and a decode that is mostly printable text, so benign source maps, images and data tables do not become views. This is the one idea here that addresses whole-file encoding, and it should be reported separately on T4.

**Cost and risk.** A JavaScript lexer is needed to distinguish strings, comments, template literals, regular expressions and identifiers; the regex-versus-division ambiguity is the main trap. A conservative lexer is enough if it is tested on the corpus. The normalised view roughly doubles reference memory and NCD work unless candidate pruning is used. Removing identifiers can make unrelated code look similar, so transformed benign false alarms are the gate.

**Stretch:** AST canonicalisation with tree-sitter, which tolerates reordering and local rewrites better than a token skeleton. This is a larger C integration and should wait for the benchmark.

**Acceptance:** non-identical variant recall 52% → at least 70% at equal benign false alarms; no regression on the 39/39 identical-file cases; per-view scores reported.

## 3. Content-defined chunking

The current chunker cuts files over 16 KiB into 8 KiB windows every 4 KiB at fixed offsets. One inserted line shifts every later boundary, so a lightly padded sample stops matching its own family. CDC chooses boundaries from a rolling hash of the content, so unchanged regions keep their boundaries after an insertion, deletion or block move.

- Use a gear or Rabin rolling hash with a minimum, average and maximum chunk size (for example 2/8/16 KiB), and keep the 64 KiB LZMA dictionary large enough for the maximum chunk.
- Chunk offsets are already in the report; the reference index already handles variable chunk lengths.
- For short files the file remains a single chunk, so the tiny-file path (idea 4) still matters.
- This is the direct fix for T3: dead code, reordering, split/merge and padding.

An alternative in the same family is winnowing/fuzzy hashing over a sliding window. It is less faithful to the NCD score but can find local matches across boundaries; compare it with CDC on the benchmark before adding a second mechanism.

**Acceptance:** at least +10 points recall on T3 at equal false alarms; no score change on unchanged files; load and scan time reported; the dictionary compile-time check still holds.

## 4. Tiny-file path

v3 ignores JavaScript under 256 bytes for scoring. The all-tiny package still gets a score and `low_confidence`, but the v1 data shows the cost: only 3 of 8 variants under 256 B are caught, and all three missed renamed clones are tiny or nearly so.

Options, cheapest first:

1. For a package whose only chunks are ignored, score the largest chunk with the normalised hash and a character n-gram similarity (for example 4-gram Jaccard or MinHash) against a tiny-reference index, and keep `low_confidence`.
2. Add a tiny-reference index with a stricter threshold, used only for all-tiny packages. Do not lower the global threshold: at 0.40 the benign false alarms rise from 4 to 12 of 400.
3. Leave the global `-m` at 256 and report the tiny score separately, so the tiny case stays measurable. This is the fallback if the false alarms are too high.

**Acceptance:** tiny (<256 B) known-variant recall 3/8 → at least 6/8 at no more than 1/400 benign false alarms; every all-tiny package still has a score.

## 5. Reference augmentation with mangled variants

Generate T1–T3 variants of the reference malware and add them to a separate variant index (or to the references). Score a target against both the raw and variant references and take the best match per view.

- This is the simplest way to raise measured recall on the benchmark: if the mangling is anticipated, an example of it is in the index.
- It is also the easiest to overfit. Use a held-out transformation type or seed and report the gain on unseen mangling. A gain that only appears on the exact transformation used to build the references is not a detector improvement.
- Measure reference count, load time and memory; the v2 ratio experiment showed that extra references are cheap in accuracy but not free in time.

**Acceptance:** compare directly with ideas 2 and 3 on the same benchmark; report the unseen-transformation gain separately; state the memory/load cost. If augmentation matches normalisation, prefer the cheaper option for deployment.

## 6. Known-benign references

Normalisation increases the chance that benign code matches something. The remaining v3 false alarm at 0.19 is `supertest` matching a renamed copy of its own library, and v1 had `body-parser` matching the typosquat `boby_parser`.

- An exact match to a known-benign chunk should clear that chunk, or at least suppress it.
- For near matches, compare the best malware NCD with the best benign NCD and require a margin before flagging.
- The exact-hash part can be a Bloom filter; the NCD part can run only for packages in the grey band, not for every package.
- This is also the foundation for the `compromised_lib` category: compare an infected library with its clean upstream version.

**Acceptance:** `supertest` and `body-parser` stop being flagged; no loss on the known-malware anchors; transformed benign false alarms do not rise.

## 7. Dual LZJD prefilter for the normalised view

The current prefilter indexes the raw LZJD digests. If the scanner scores View B/C against normalised references, the candidate list must be built from the same view, or the right reference may never reach NCD.

- Build a second digest index on the normalised chunks, or index the normalised view alone when scoring it.
- Compare prefilter and brute force on the mangling benchmark: the top-256 list should contain the brute-force match for every malicious variant, or the score difference must be below a stated margin.
- This is a correctness guard for idea 2, not a new accuracy idea.

**Acceptance:** transformed malicious variants get the same closest reference and score as brute force, or a difference no larger than the current prefilter's v1/v2 misses (0.0074 and 0.0105).

## 8. Install-script mangling

The script channel is separate and cheap. The 0.4505 miss shows that the 0.45 threshold is close to the decision boundary; URL rotation, base64, split commands and `curl | sh` variations are the script-side mangling.

- Validate 0.45 on an expanded benign script set first; the current 64 packages are too few to tune on.
- Add script-level features or a small character n-gram classifier: URLs and IPs, `curl`/`wget` to a shell, `child_process`, base64, environment reads, host names in DNS queries.
- Include script text in the normalised view where it makes sense; do not apply JavaScript identifier normalisation to shell commands.

**Acceptance:** script-only known-variant recall improves (including the 0.4505 case) with no benign script false alarms on at least 500 benign scripts.

## 9. Reference cache and report fields

These are enablers, not detection ideas.

- Cache the raw and normalised C(x), LZJD digests, inverted indexes and metadata; key the cache on the reference set, dictionary, chunker and view options. Load is 43–47 s today.
- Report per-view scores, chunk `bytes`, a chunk hash, `ignored`/`low_confidence`, and the matched package/group. The benchmark needs these to attribute a miss.
- Keep a schema version so the Python analyzer and the C writer stay in agreement.

**Acceptance:** cached and cold loads give identical reports; load under 5 s for the v2 reference set; the benchmark can attribute every miss.

## 10. Deferred

- **Compressor selector (xz, zstd, PPMd).** v1 measured little difference; it cannot create similarity.
- **Chunk-size and compression-settings selectors.** Almost no test file is split; extreme mode was slightly worse and slower.
- **Better prefilter or a learned ranker.** The prefilter is close to exact and is not the bottleneck.
- **More examples per code shape.** The v2 ratio experiment showed no detection gain, only load time and memory.
- **Hard aggregation rules.** Requiring two suspicious chunks or two reference packages was measured on the v3 reports and roughly halves recall at 0.19. Keep the minimum score.
- **New-campaign detection and stage 2.** Out of scope for v4.

## Choose a v4 scope

The benchmark decides, but the three sensible packages are:

| Option | Contents | When to take it |
|---|---|---|
| **A. Full mangling package (recommended)** | Benchmark + normalised view/hash + encoded-payload view + dual prefilter + tiny-file path + CDC | If both T2 and T3 show losses, or if time allows the full experiment |
| **B. Cheapest credible package** | Benchmark + normalised view/hash + encoded-payload view + dual prefilter + tiny-file path | If T2 dominates and T3 is small; no chunker change |
| **C. Data-first package** | Benchmark + reference augmentation | If the benchmark shows a large gain from simply adding transformed examples, and memory/load allow it |

Do the benchmark and the unchanged v3 baseline first. If normalisation alone reaches the target, do not add CDC in the same version; if it does not, CDC is the next lever.

## Order

1. Mangling benchmark, transformed-benign controls and the v3 baseline (1).
2. Normalised view, normalised hash and the dual prefilter (2, 7).
3. Tiny-file path (4).
4. Content-defined chunking (3).
5. Reference augmentation as a comparison, not a default (5).
6. Known-benign references, script mangling, cache and report fields as time allows (6, 8, 9).

## Acceptance for v4

- On the mangling benchmark, known-family recall at least 90% on T1–T3 at no more than 1/400 benign false alarms, with T4 reported separately, with and without the encoded-payload view.
- Non-identical variants improve from 16/31 (52%) to at least 22/31 (71%); tiny variants from 3/8 to at least 6/8.
- No regression on the v1 anchors: known malware 50/50, renamed clones 32/35, new versions 23/35, 0/75 benign false alarms.
- No regression on the 22 v3 known-shape packages (19/22 at 0.19), and the three named misses are explained.
- The prefilter matches brute force on the transformed variants, and the time and memory cost is reported.
- New-campaign recall is not used to tune or judge v4; that is stage 2's evaluation.
- No sample is executed; malware stays inside WSL and encrypted archives.
