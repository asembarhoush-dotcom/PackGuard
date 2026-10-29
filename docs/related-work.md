# Related work: compression-based malware detection and npm

Goal: 95% recall at about 5% false alarms on known/mangled npm malware. This note records what has been published, what is closest, and where the gap is. Numbers are as reported in abstracts; read each paper for the exact split and metric (accuracy, recall, FPR and class balance are not interchangeable).

## Closest published result

**Alshahwan, Barr, Clark, Danezis and Menéndez, “Detecting Malware with Information Complexity,” Entropy 22(5):575, 2020** ([arXiv:1502.07661](https://arxiv.org/abs/1502.07661), [DOI](https://doi.org/10.3390/e22050575)).

- NCD against a **zoo of labelled malware and benign-ware**, not a one-class malware reference set.
- Combines NCD with **compressibility rates** and a decision forest.
- 97.4% accuracy at 3% false-positive rate; **95.2% accuracy at 5% false-positive rate** on malware collected over two years.
- Disk-resident binaries, not npm JavaScript.
- This is the recipe closest to the target: a **two-class compression model plus compression features plus a small classifier**, not a single NCD cutoff.

The 2015 preprint reports 97.1% accuracy at 3% FPR and the same 95.2% at 5% FPR. The 2020 journal version reports 97.4% at 3%.

## Compression as a model, not a distance

**Asadi and Varadharajan, “An MDL-Based Classifier for Transactional Datasets with Application in Malware Detection,” 2019** ([arXiv:1910.03751](https://arxiv.org/abs/1910.03751)).

- Builds one **code table for benign data** and one for malware data using minimum description length.
- Classifies a sample by which model compresses it better; interpretable and close to deep neural networks on 19,696 benign and 19,696 malware samples.
- PE API calls, not JavaScript, but the two-model MDL principle transfers directly.

**Lai, Liu, Yang and Liu, “Unknown Malicious Codes Detection Based on LZW Compression Algorithm,” Journal of Beijing University of Technology, 2012.**

- Builds a **normal-code dictionary** and a **malicious-code dictionary**, compresses the test file with both, and classifies by the better compression ratio under the MDL principle.
- This is the simplest two-dictionary version of the benign-versus-malware likelihood ratio.

**“An Introduction to Compression-Based Machine Learning,” 2026 preprint** ([arXiv:2609.21309](https://arxiv.org/abs/2609.21309)).

- Survey of compression-as-similarity (NCD) and compression-as-likelihood (MDL).
- Notes that compression-based ML benefits from tuning the compressor, the compression measure, the aggregation and the predictor; NCD/MDL are competitive for malware where handcrafted features are weak.
- Describes implicit-model MDL: compress `B_i x` for each class model `B_i` and predict the class minimizing `C(B_i x) - C(B_i)`. That is the two-model score this project should adopt.

## LZJD and JavaScript similarity

**Raff and Nicholas, “An Alternative to NCD for Large Sequences, Lempel-Ziv Jaccard Distance,” KDD 2017** ([DOI](https://doi.org/10.1145/3097983.3098111), [arXiv:1708.03346](https://arxiv.org/abs/1708.03346)).

- Replaces the expensive compressed concatenation with the Lempel-Ziv phrase set and Jaccard similarity.
- Comparable or better malware classification than NCD, orders of magnitude faster.
- The phrase set supports **containment** (how much of the reference set is present in the target), which is more padding-robust than whole-chunk NCD.

**Raff and Nicholas, “Malware Classification and Class Imbalance via Stochastic Hashed LZJD,” AISec 2017** ([DOI](https://doi.org/10.1145/3128572.3140446)).

- SHWeL: LZJD features with class-imbalance handling.
- Relevant because the benign set is much larger than the malware set in a real scan.

**“Malicious JavaScript detection using similarity measurement,” National Taiwan University of Science and Technology, 2020** ([record](https://ir.lib.ntust.edu.tw/handle/987654321/80105)).

- Adapts SHWeL/LZJD to malicious JavaScript.
- Reports a **7.21% false-negative rate** (about 92.8% recall); the false-positive rate is not in the abstract, so read the thesis for the complete operating point.
- This is the closest JS-specific similarity work found.

**Chen, Wang, Qin and Zhang, “ZipAST: Enhancing malicious JavaScript detection with sequence compression,” Computers & Security 153, 2025** ([DOI](https://doi.org/10.1016/j.cose.2025.104390)).

- AST-based sequence compression for malicious JavaScript.
- The title and abstract indicate the closest JavaScript-specific compression method; the full paper is paywalled, so compare its TPR/FPR before adopting it.
- This is the paper to read first for the T3/structural side, because AST sequence compression is designed to survive formatting and local edits.

## npm-specific detectors

These are not compression-only, but they show what a near-perfect npm result currently costs.

| Work | Method | Reported result |
|---|---|---|
| **ProfMal**, ASE 2025 ([DOI](https://doi.org/10.1109/ASE63991.2025.00042)) | Object-sensitive static behavior graphs plus dynamic analysis; graph classifier | F1 92.4%; 496 previously unknown malicious packages found |
| **ProfMalPlus**, 2026 ([arXiv:2607.13965](https://arxiv.org/abs/2607.13965)) | Behavior graphs, code slices and coordinated LLM judges; dynamic fallback | F1 98.1%; 597 previously unknown malicious packages found |
| **GENIE**, IEEE 2024 ([record](https://ieeexplore.ieee.org/abstract/document/10734052)) | CodeQL semantic signatures for malicious behavior | 125 previously unreported malicious packages, **zero false alarms**; recall over a fixed corpus is not the claim |
| **Korvyr**, 2026 ([Zenodo](https://zenodo.org/records/21796756)) | Code Property Graph + graph isomorphism network + manifest/metadata checks | 96.4% precision, **88.0% recall**, 10 false positives / 300 benign (3.3% FPR); calibration benchmark, not production |
| **Taint-based code slicing + LLM**, 2025/2026 ([arXiv:2512.12313](https://arxiv.org/abs/2512.12313)) | Taint slices from JavaScript sensitive APIs, then an LLM | 87.04% accuracy on 2,537 statically amenable packages; obfuscated packages need deobfuscation |
| **“How Effective Are NPM Malicious Package Detectors?”**, ASE 2026 ([DOI](https://doi.org/10.1145/3832783.3837427)) | Large-scale empirical evaluation of detectors | Read for realistic FPR/recall and dataset leakage; important before claiming a new state of the art |

## What is actually published vs the gap

- **Published and close:** Alshahwan et al. reach **95.2% accuracy at 5% FPR** on binaries with a two-class NCD + compressibility + decision-forest model. That is the strongest evidence that the target is not fantasy.
- **Published on JavaScript:** LZJD/SHWeL gives about 92.8% recall at an unspecified FPR; ZipAST uses AST sequence compression; neither reports the exact 95% recall / 5% FPR point on npm packages.
- **Published on npm:** the best reported points use static/dynamic graphs, CodeQL signatures or LLMs, not compression-only. Korvyr is 88% recall at 3.3% FPR; ProfMal and ProfMalPlus report F1 on their own benchmarks; GENIE emphasizes zero false alarms on discovered packages, not fixed-corpus recall.
- **The gap:** no paper found reports **95% recall at 5% false alarms on known/mangled npm packages using a compression-based stage 1**. That is the contribution available here: adapt the two-class NCD/MDL recipe to JavaScript/npm, add AST/function-level and encoded views, and evaluate at a fixed 5% FPR on a held-out npm split.

## Recommended recipe from the literature

1. **Two-class compression score.** Build `C(x|M)` and `C(x|B)` from malware and benign dictionaries; score `C(x|B) - C(x|M)` or the ratio. Use LZMA preset dictionaries or LZJD phrase sets. This is the Alshahwan/Asadi/Lai direction and directly addresses the benign-code overlap.
2. **Compressibility features.** Add `C(x)/len(x)` and related rates; Alshahwan reports that combining NCD with compressibility improves accuracy.
3. **LZJD containment / SHWeL features** for speed and padding robustness; use phrase-set containment, not only prefilter ranking.
4. **AST/function-level fingerprints** for T3 and new versions; ZipAST is the closest JS-specific reference.
5. **Encoded views** for T4 (recursive base64/hex/char-code/gzip).
6. **A small calibrated classifier** over these features, evaluated at a fixed 5% FPR. The literature uses decision forests and MDL code tables; a logistic regression or shallow tree is enough to start.
7. **Held-out validation and a benign set.** Do not tune on the test split; the current NCD-only ceiling is 82.7% all-known recall at 5% FPR, so the new score must be measured against that baseline.

## References

- N. Alshahwan, E. T. Barr, D. Clark, G. Danezis, H. D. Menéndez. Detecting Malware with Information Complexity. Entropy 22(5):575, 2020. https://arxiv.org/abs/1502.07661
- B. Asadi, V. Varadharajan. An MDL-Based Classifier for Transactional Datasets with Application in Malware Detection. 2019. https://arxiv.org/abs/1910.03751
- Y. Lai, H. Liu, Z. Yang, J. Liu. Unknown Malicious Codes Detection Based on LZW Compression Algorithm. Journal of Beijing University of Technology, 2012.
- E. Raff, C. Nicholas. An Alternative to NCD for Large Sequences, Lempel-Ziv Jaccard Distance. KDD 2017. https://doi.org/10.1145/3097983.3098111
- E. Raff, C. Nicholas. Malware Classification and Class Imbalance via Stochastic Hashed LZJD. AISec 2017. https://doi.org/10.1145/3128572.3140446
- Z. Chen, W. Wang, Y. Qin, S. Zhang. ZipAST: Enhancing malicious JavaScript detection with sequence compression. Computers & Security 153, 2025. https://doi.org/10.1016/j.cose.2025.104390
- Malicious JavaScript detection using similarity measurement. NTUST thesis, 2020. https://ir.lib.ntust.edu.tw/handle/987654321/80105
- Y. Huang et al. ProfMal: Detecting Malicious NPM Packages by the Synergy between Static and Dynamic Analysis. ASE 2025. https://doi.org/10.1109/ASE63991.2025.00042
- Y. Huang et al. ProfMalPlus. 2026. https://arxiv.org/abs/2607.13965
- GENIE: Guarding the npm Ecosystem with Semantic Malware Detection. IEEE 2024. https://ieeexplore.ieee.org/abstract/document/10734052
- Korvyr: A Hybrid Graph Neural Network and Static-Analysis Prototype for Pre-Install npm Package Screening. 2026. https://zenodo.org/records/21796756
- D.-K. Nguyen et al. Taint-Based Code Slicing for LLMs-based Malicious NPM Package Detection. 2025/2026. https://arxiv.org/abs/2512.12313
- How Effective Are NPM Malicious Package Detectors? ASE 2026. https://doi.org/10.1145/3832783.3837427
