"""
PackGuard Stage 2 v5 — Master E2E Test Suite.

Aggregates all 4 Tiers of the PackGuard Stage 2 v5 Opaque-Box E2E Test Harness:
  - Tier 1: Feature Coverage (F01–F18)
  - Tier 2: Boundary & Corner Cases (stress, malformed inputs, edge cases)
  - Tier 3: Cross-Feature Combinations (pairwise and multi-vector evasion interactions)
  - Tier 4: Real-World Scenarios (Stage 1 false alarm rescues, wild malware attacks)

Runnable directly via:
  python -m unittest test_e2e_v5_suite.py
or:
  python run_e2e_tests.py
"""

import sys
import unittest
from pathlib import Path

# Ensure local test directory is in sys.path
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_tier1_features import TestTier1FeatureCoverage
from test_tier2_boundaries import TestTier2BoundaryAndCornerCases
from test_tier3_combinations import TestTier3CrossFeatureCombinations
from test_tier4_real_world import TestTier4RealWorldScenarios


def suite() -> unittest.TestSuite:
    """Build and return the complete 4-tier E2E test suite."""
    test_suite = unittest.TestSuite()
    loader = unittest.TestLoader()

    test_suite.addTests(loader.loadTestsFromTestCase(TestTier1FeatureCoverage))
    test_suite.addTests(loader.loadTestsFromTestCase(TestTier2BoundaryAndCornerCases))
    test_suite.addTests(loader.loadTestsFromTestCase(TestTier3CrossFeatureCombinations))
    test_suite.addTests(loader.loadTestsFromTestCase(TestTier4RealWorldScenarios))

    return test_suite


def load_tests(loader, tests, pattern):
    """Standard unittest test loader hook."""
    return suite()


if __name__ == "__main__":
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite())
    sys.exit(0 if result.wasSuccessful() else 1)
