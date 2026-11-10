"""
PackGuard Stage 2 v5 — Standalone E2E Test Harness & Tier Runner.

A standalone, opaque-box test runner executing tests across all 4 Tiers:
  - Tier 1: Feature Coverage (F01–F18)
  - Tier 2: Boundary & Corner Cases (stress, malformed tokens, pathological inputs)
  - Tier 3: Cross-Feature Combinations (pairwise and multi-vector evasion)
  - Tier 4: Real-World Scenarios (Stage 1 false alarm elimination, wild malware)

Usage:
  python run_e2e_tests.py                    # Run all 4 tiers
  python run_e2e_tests.py --tier 1           # Run only Tier 1
  python run_e2e_tests.py --tier 4           # Run only Tier 4
  python run_e2e_tests.py --json-out res.json # Export results to JSON
"""

import argparse
import io
import json
import os
import sys
import time
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_tier1_features import TestTier1FeatureCoverage
from test_tier2_boundaries import TestTier2BoundaryAndCornerCases
from test_tier3_combinations import TestTier3CrossFeatureCombinations
from test_tier4_real_world import TestTier4RealWorldScenarios

TIER_CLASSES = {
    1: ("Tier 1: Feature Coverage (F01–F18)", TestTier1FeatureCoverage),
    2: ("Tier 2: Boundary & Corner Cases", TestTier2BoundaryAndCornerCases),
    3: ("Tier 3: Cross-Feature Combinations", TestTier3CrossFeatureCombinations),
    4: ("Tier 4: Real-World Scenarios", TestTier4RealWorldScenarios),
}


def run_tier(tier_num: int, name: str, test_cls: Any, verbosity: int = 1) -> Dict[str, Any]:
    """Execute a single test tier and collect structured metrics."""
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(test_cls)

    stream = io.StringIO()
    runner = unittest.TextTestRunner(stream=stream, verbosity=verbosity)

    t0 = time.perf_counter()
    result = runner.run(suite)
    elapsed = time.perf_counter() - t0

    total = result.testsRun
    failed = len(result.failures)
    errored = len(result.errors)
    passed = total - (failed + errored)

    failures_detail = []
    for test, trace in result.failures:
        failures_detail.append({"test": str(test), "type": "FAILURE", "trace": trace})
    for test, trace in result.errors:
        failures_detail.append({"test": str(test), "type": "ERROR", "trace": trace})

    return {
        "tier": tier_num,
        "name": name,
        "total": total,
        "passed": passed,
        "failed": failed,
        "errored": errored,
        "success": result.wasSuccessful(),
        "elapsed_sec": round(elapsed, 4),
        "failures_detail": failures_detail,
        "raw_output": stream.getvalue(),
    }


def print_banner() -> None:
    print("=" * 80)
    print("  PACKGUARD STAGE 2 v5 — OPAQUE-BOX E2E TEST RUNNER")
    print("  Ultra-Fast, Lightweight CPU-Only Verification Track")
    print("=" * 80)


def print_tier_result(res: Dict[str, Any]) -> None:
    status = "[PASS]" if res["success"] else "[FAIL]"
    print(f"\n{status} {res['name']}")
    print(f"       Tests: {res['total']} | Passed: {res['passed']} | Failed: {res['failed']} | Errored: {res['errored']} | Time: {res['elapsed_sec'] * 1000:.1f} ms")
    if not res["success"]:
        for f in res["failures_detail"]:
            print(f"       -> {f['type']}: {f['test']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="PackGuard Stage 2 v5 E2E Test Runner")
    parser.add_argument("--tier", type=int, choices=[1, 2, 3, 4], help="Run a specific tier (1, 2, 3, or 4)")
    parser.add_argument("--json-out", type=str, help="Path to write JSON test results report")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose test output")
    args = parser.parse_args()

    print_banner()

    tiers_to_run = [args.tier] if args.tier else [1, 2, 3, 4]

    tier_results = []
    total_tests = 0
    total_passed = 0
    total_failed = 0
    total_errored = 0
    total_time_sec = 0.0

    overall_success = True

    for t in tiers_to_run:
        t_name, t_cls = TIER_CLASSES[t]
        res = run_tier(t, t_name, t_cls, verbosity=2 if args.verbose else 1)
        tier_results.append(res)
        print_tier_result(res)

        total_tests += res["total"]
        total_passed += res["passed"]
        total_failed += res["failed"]
        total_errored += res["errored"]
        total_time_sec += res["elapsed_sec"]

        if not res["success"]:
            overall_success = False

    print("\n" + "=" * 80)
    print(f"  E2E TEST SUMMARY:")
    print(f"  Total Tests: {total_tests}")
    print(f"  Passed:      {total_passed} ({100.0 * total_passed / max(total_tests, 1):.1f}%)")
    print(f"  Failed:      {total_failed}")
    print(f"  Errored:     {total_errored}")
    print(f"  Total Time:  {total_time_sec * 1000:.1f} ms")
    print(f"  Final Verdict: {'PASSED [OK]' if overall_success else 'FAILED [X]'}")
    print("=" * 80)

    summary_data = {
        "suite": "PackGuard Stage 2 v5 E2E Test Suite",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "overall_success": overall_success,
        "total_tests": total_tests,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "total_errored": total_errored,
        "total_time_sec": round(total_time_sec, 4),
        "tiers": tier_results,
    }

    if args.json_out:
        out_path = Path(args.json_out)
        out_path.write_text(json.dumps(summary_data, indent=2), encoding="utf-8")
        print(f"[+] Exported JSON report to: {out_path.resolve()}")

    return 0 if overall_success else 1


if __name__ == "__main__":
    sys.exit(main())
