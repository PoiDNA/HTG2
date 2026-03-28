'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';

interface Question {
  id?: string;
  question_text: string;
  order_index: number;
}

interface Stage {
  id?: string;
  name: string;
  order_index: number;
  questions: Question[];
}

interface StageEditorProps {
  meetingId: string;
  initialStages: any[];
}

function normalizeStages(raw: any[]): Stage[] {
  return raw.map((s, si) => ({
    id: s.id,
    name: s.name ?? '',
    order_index: si,
    questions: ((s.htg_meeting_questions ?? s.questions ?? []) as any[]).map((q: any, qi: number) => ({
      id: q.id,
      question_text: q.question_text ?? '',
      order_index: qi,
    })),
  }));
}

export default function StageEditor({ meetingId, initialStages }: StageEditorProps) {
  const [stages, setStages] = useState<Stage[]>(() => normalizeStages(initialStages));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const addStage = () => {
    setStages(prev => [
      ...prev,
      { name: '', order_index: prev.length, questions: [] },
    ]);
  };

  const removeStage = (si: number) => {
    setStages(prev => prev.filter((_, i) => i !== si).map((s, i) => ({ ...s, order_index: i })));
  };

  const moveStage = (si: number, dir: -1 | 1) => {
    const next = si + dir;
    if (next < 0 || next >= stages.length) return;
    setStages(prev => {
      const arr = [...prev];
      [arr[si], arr[next]] = [arr[next], arr[si]];
      return arr.map((s, i) => ({ ...s, order_index: i }));
    });
  };

  const updateStageName = (si: number, name: string) => {
    setStages(prev => prev.map((s, i) => i === si ? { ...s, name } : s));
  };

  const addQuestion = (si: number) => {
    setStages(prev => prev.map((s, i) => {
      if (i !== si) return s;
      return {
        ...s,
        questions: [...s.questions, { question_text: '', order_index: s.questions.length }],
      };
    }));
  };

  const removeQuestion = (si: number, qi: number) => {
    setStages(prev => prev.map((s, i) => {
      if (i !== si) return s;
      return {
        ...s,
        questions: s.questions.filter((_, j) => j !== qi).map((q, j) => ({ ...q, order_index: j })),
      };
    }));
  };

  const updateQuestion = (si: number, qi: number, text: string) => {
    setStages(prev => prev.map((s, i) => {
      if (i !== si) return s;
      return {
        ...s,
        questions: s.questions.map((q, j) => j === qi ? { ...q, question_text: text } : q),
      };
    }));
  };

  const moveQuestion = (si: number, qi: number, dir: -1 | 1) => {
    const next = qi + dir;
    setStages(prev => prev.map((s, i) => {
      if (i !== si) return s;
      const qs = [...s.questions];
      if (next < 0 || next >= qs.length) return s;
      [qs[qi], qs[next]] = [qs[next], qs[qi]];
      return { ...s, questions: qs.map((q, j) => ({ ...q, order_index: j })) };
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/htg-meeting/${meetingId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Błąd zapisu'); return; }
      // Normalize saved stages (they have new IDs)
      if (data.stages) setStages(normalizeStages(data.stages.map((s: any) => ({
        ...s,
        htg_meeting_questions: s.questions,
      }))));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {stages.length === 0 ? (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-8 text-center">
          <p className="text-htg-fg-muted text-sm mb-3">Brak etapów. Dodaj pierwszy etap spotkania.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stages.map((stage, si) => (
            <div key={si} className="bg-htg-card border border-htg-card-border rounded-xl p-5 space-y-4">
              {/* Stage header */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveStage(si, -1)}
                    disabled={si === 0}
                    className="p-0.5 rounded text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStage(si, 1)}
                    disabled={si === stages.length - 1}
                    className="p-0.5 rounded text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-htg-fg-muted">Etap {si + 1}</span>
                  </div>
                  <input
                    type="text"
                    value={stage.name}
                    onChange={e => updateStageName(si, e.target.value)}
                    placeholder="Nazwa etapu (np. Przedstawienie, Pytania)"
                    className="w-full px-3 py-2 rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStage(si)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Questions */}
              <div className="pl-8 space-y-2">
                {stage.questions.map((q, qi) => (
                  <div key={qi} className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveQuestion(si, qi, -1)}
                        disabled={qi === 0}
                        className="p-0.5 rounded text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(si, qi, 1)}
                        disabled={qi === stage.questions.length - 1}
                        className="p-0.5 rounded text-htg-fg-muted hover:text-htg-fg disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={q.question_text}
                      onChange={e => updateQuestion(si, qi, e.target.value)}
                      placeholder={`Pytanie ${qi + 1}`}
                      className="flex-1 px-3 py-2 rounded-lg bg-htg-surface border border-htg-card-border text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage/40"
                    />
                    <button
                      type="button"
                      onClick={() => removeQuestion(si, qi)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addQuestion(si)}
                  className="flex items-center gap-1.5 text-xs text-htg-fg-muted hover:text-htg-fg transition-colors py-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Dodaj pytanie
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addStage}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-htg-card-border bg-htg-surface hover:bg-htg-card text-htg-fg-muted hover:text-htg-fg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Dodaj etap
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-htg-sage text-white text-sm font-medium hover:bg-htg-sage/80 disabled:opacity-40 transition-colors"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Zapisuję...' : 'Zapisz plan'}
        </button>

        {saved && (
          <span className="text-xs text-htg-sage">Zapisano!</span>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
