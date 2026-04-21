"""
Runner A — WhisperX STT word timestamps + mapping to approved segments.

WhisperX produces word-level timestamps by aligning Whisper's own transcript
to the audio via wav2vec2. This is NOT a forced alignment to our approved
EN text — Whisper may mis-transcribe, so this runner must subsequently map
the (possibly-noisy) transcript to segments from session-ground-truth.json
using Needleman-Wunsch on tokens.

Inputs:
  - fixtures/recordings/{name}.wav
  - fixtures/session-ground-truth.json    (approved segments, EN text_i18n)

Outputs:
  - out/a-whisperx/{name}.predictions.json
    [
      {
        "segment_id": "seg_042",
        "take_start_sec": 123.45,
        "take_end_sec": 129.10,
        "confidence": 0.87,
        "matched_transcript_text": "...",
        "note": "..."
      },
      ...
    ]

Env / deps:
  - Python 3.10+
  - torch (CUDA preferred)
  - whisperx
  - faster-whisper (used by whisperx)

Usage:
  python runners/a-whisperx-stt-mapping.py \
      --audio fixtures/recordings/01-clean.wav \
      --ground-truth fixtures/session-ground-truth.json \
      --out out/a-whisperx/01-clean.predictions.json

TODO (spike implementation):
  1. Load audio, run Whisper transcribe -> segments w/ rough timestamps
  2. Run WhisperX alignment -> word-level timestamps
  3. Tokenize approved EN text per segment from ground-truth
  4. Needleman-Wunsch map transcript words -> approved tokens
  5. Derive (take_start_sec, take_end_sec) per matched segment
  6. Compute confidence: normalized N-W score / length
  7. Emit predictions.json
"""


def main() -> None:
    raise NotImplementedError("Runner A skeleton — implement during spike")


if __name__ == "__main__":
    main()
