"""
Runner B — Whisper STT + Needleman-Wunsch on tokens (baseline without WhisperX).

Plain Whisper produces segment-level timestamps. We then map those segments
to approved EN text from ground-truth via classic Needleman-Wunsch sequence
alignment with insert/delete/mismatch penalties.

Purpose: baseline that tells us how much value WhisperX word-level alignment
adds over plain Whisper segment-level output.

Inputs / Outputs / Env: see runner A docstring for shape.

TODO (spike implementation):
  1. Whisper transcribe -> segments [{start, end, text}]
  2. Concatenate approved segments into reference token stream w/ anchors
  3. N-W alignment on tokens, recover segment boundaries via anchors
  4. Confidence = normalized alignment score
  5. Emit predictions.json (same shape as runner A)
"""


def main() -> None:
    raise NotImplementedError("Runner B skeleton — implement during spike")


if __name__ == "__main__":
    main()
