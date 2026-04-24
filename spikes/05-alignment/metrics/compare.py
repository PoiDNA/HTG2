"""
Collects predictions.json from each runner, compares against ground truth
labels, emits results.md + results.json with all metrics from README.md.

Metrics computed (see README.md for thresholds):
  - start_error_ms (median, p95)
  - end_error_ms (median, p95)
  - overlap_iou (median)
  - %_auto / %_needs_review / %_missing
  - missing_recall (scenario 04)
  - false_positive_rate
  - reorder_correctness (scenario 05, window ±3)
  - latency_s_per_min_audio
  - cost_usd_per_min (runner-specific)
  - admin_minutes_per_audio_hour (MANUAL stopwatch entry)

Usage:
  python metrics/compare.py \
    --predictions-dir out/ \
    --labels-dir fixtures/labels/ \
    --out metrics/results.md

TODO (spike implementation):
  1. Load predictions per runner per recording
  2. Load labels per recording (with attempt_index honored)
  3. Compute per-segment errors vs ground truth
  4. Aggregate per scenario, per runner
  5. Include manual `admin_minutes` stopwatch field (read from CSV)
  6. Render results.md with comparison table
"""


def main() -> None:
    raise NotImplementedError("compare.py skeleton — implement during spike")


if __name__ == "__main__":
    main()
