"""
Runner E — Direct forced alignment to approved text (PRIORITY candidate).

Skips STT entirely. Input: concatenated approved EN text + audio. Output:
time ranges per segment via forced alignment (WhisperX-compatible aligner or
MFA with approved text as reference).

Why this is the strongest candidate:
  - Eliminates Whisper transcription errors (runners A/B suffer from them)
  - Uses the TEXT we actually care about as reference
  - When it works, confidence scores correspond to acoustic likelihood, not
    similarity heuristics

When it fails:
  - Translator improvises / diverges from approved text (scenario 05)
  - Translator repeats ("let me repeat") — need to pick the correct attempt
  - Large skip without any audio for segment X (scenario 04)

Fallback plan: if E fails on scenarios 03/04/05, hybrid of E (for clean runs)
+ A/B/C (for dirty) may be the production answer.

Inputs:
  - fixtures/recordings/{name}.wav
  - fixtures/session-ground-truth.json

Outputs:
  - out/e-direct/{name}.predictions.json

Env / deps:
  - torch + torchaudio
  - whisperx alignment API (without transcription step) OR
  - wav2vec2 CTC model with explicit forced alignment loop

TODO (spike implementation):
  1. Build concatenated reference text from approved EN segments w/ anchors
  2. Load wav2vec2 CTC model (e.g., jonatasgrosman/wav2vec2-large-xlsr-53-english)
  3. Run emission -> log probs per frame
  4. CTC forced alignment: Viterbi path through target text
  5. Recover per-segment time ranges via anchor positions
  6. Confidence = log-likelihood of alignment path per segment
  7. Detection of skipped segments: sharp drop in local likelihood
  8. Emit predictions.json with status 'missing' where likelihood below threshold
"""


def main() -> None:
    raise NotImplementedError("Runner E skeleton — implement during spike (priority)")


if __name__ == "__main__":
    main()
