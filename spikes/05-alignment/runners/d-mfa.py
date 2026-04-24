"""
Runner D — Montreal Forced Aligner (OPTIONAL).

Classical Kaldi-based forced aligner. Strong EN acoustic models, weaker for
DE/PT. Heavy setup (pretrained acoustic model + dictionary + G2P).

Skip rule: if setup takes more than half a day, abandon this runner and rely
on A/B/C/E.

Inputs / Outputs: same shape as other runners.

Env / deps:
  - conda env with montreal-forced-aligner
  - Pretrained english_us_arpa acoustic model + lexicon
  - ffmpeg for audio resampling

TODO (spike implementation):
  1. Write transcript file from approved EN text (one utterance per segment)
  2. Build MFA input corpus (wav + lab files)
  3. mfa align <corpus> <lexicon> <acoustic_model> <output>
  4. Parse MFA TextGrid output -> segment time ranges
  5. Confidence = MFA log-likelihood (normalized)
  6. Emit predictions.json
"""


def main() -> None:
    raise NotImplementedError("Runner D skeleton — implement during spike (optional)")


if __name__ == "__main__":
    main()
