// ─────────────────────────────────────────────────────────────────────────────
// Deterministic group matching — no AI, no randomness
// Algorithm: Stratified Snake Distribution + Greedy Conflict Reduction
// ─────────────────────────────────────────────────────────────────────────────

export interface UserScore {
  userId: string;
  displayName: string;
  email?: string;
  d1: number;  // Merytoryczny (0–10)
  d2: number;  // Organizacyjny (0–10)
  d3: number;  // Relacyjny (0–10)
  // IDs of people they've been grouped with before
  pastGroupmates: string[];
}

export interface GroupMember extends UserScore {
  composite: number;  // (d1+d2+d3)/3
}

export interface GroupExplanation {
  icon: string;
  text: string;
  type: 'positive' | 'neutral' | 'warning';
}

export interface GroupProposal {
  id: string;
  members: GroupMember[];
  explanation: GroupExplanation[];
  stats: {
    d1Spread: number;
    d2Avg: number;
    d3Avg: number;
    compositeSpread: number;
    newPairs: number;
    knownPairs: number;
  };
}

export interface GroupingResult {
  groups: GroupProposal[];
  meta: {
    algorithm: string;
    totalUsers: number;
    groupCount: number;
    groupSizeMin: number;
    groupSizeMax: number;
    totalNewPairs: number;
    totalKnownPairs: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function composite(u: UserScore): number {
  return (u.d1 + u.d2 + u.d3) / 3;
}

function countKnownPairs(group: UserScore[]): number {
  let count = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (group[i].pastGroupmates.includes(group[j].userId)) count++;
    }
  }
  return count;
}

function countNewPairs(group: UserScore[]): number {
  const total = (group.length * (group.length - 1)) / 2;
  return total - countKnownPairs(group);
}

// Score for a group: lower = better (fewer conflicts, more diverse)
function groupCost(group: UserScore[]): number {
  const knownPairs = countKnownPairs(group);
  const composites = group.map(composite);
  const spread     = Math.max(...composites) - Math.min(...composites);
  // Prefer: many known pairs = bad (high cost), low spread = bad (same level)
  return knownPairs * 5 - spread;
}

// ─── Step 1: Stratified Snake Distribution ────────────────────────────────────
// Like dealing cards in a snake pattern: ensures each group gets a mix of
// high, mid, and low-scoring participants.
//
//  Sorted: u1  u2  u3 | u4  u5  u6 | u7  u8  u9 | u10 u11 u12
//  Round1 →: G1, G2, G3
//  Round2 ←: G3, G2, G1
//  → G1 gets u1, u6, u7, u12 — spread across full range

function snakeDistribute(sorted: GroupMember[], k: number): GroupMember[][] {
  const groups: GroupMember[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    const cycle    = Math.floor(i / k);
    const pos      = i % k;
    const groupIdx = cycle % 2 === 0 ? pos : k - 1 - pos;
    groups[groupIdx].push(sorted[i]);
  }
  return groups;
}

// ─── Step 2: Greedy Conflict Reduction ────────────────────────────────────────
// Try all pairwise swaps between groups. Accept swap if it lowers total cost.
// Runs at most maxIter rounds.

function reduceConflicts(groups: UserScore[][], maxIter = 15): UserScore[][] {
  let improved = true;
  let iter     = 0;

  while (improved && iter < maxIter) {
    improved = false;
    iter++;

    for (let g1 = 0; g1 < groups.length; g1++) {
      for (let m1 = 0; m1 < groups[g1].length; m1++) {
        for (let g2 = g1 + 1; g2 < groups.length; g2++) {
          for (let m2 = 0; m2 < groups[g2].length; m2++) {
            const costBefore = groupCost(groups[g1]) + groupCost(groups[g2]);

            // Swap
            const tmp        = groups[g1][m1];
            groups[g1][m1]   = groups[g2][m2];
            groups[g2][m2]   = tmp;

            const costAfter = groupCost(groups[g1]) + groupCost(groups[g2]);

            if (costAfter >= costBefore) {
              // Revert
              groups[g2][m2] = groups[g1][m1];
              groups[g1][m1] = tmp;
            } else {
              improved = true;
            }
          }
        }
      }
    }
  }

  return groups;
}

// ─── Step 3: Explanation generation ──────────────────────────────────────────
// Deterministic if/else rules on numbers — no LLM.

function explainGroup(members: GroupMember[]): GroupExplanation[] {
  const explanations: GroupExplanation[] = [];

  const d1s    = members.map(m => m.d1);
  const d2s    = members.map(m => m.d2);
  const d3s    = members.map(m => m.d3);
  const comps  = members.map(m => m.composite);

  const d1Spread   = Math.max(...d1s) - Math.min(...d1s);
  const d2Avg      = d2s.reduce((a, b) => a + b, 0) / d2s.length;
  const d3Avg      = d3s.reduce((a, b) => a + b, 0) / d3s.length;
  const compSpread = Math.max(...comps) - Math.min(...comps);
  const known      = countKnownPairs(members);
  const total      = (members.length * (members.length - 1)) / 2;
  const newP       = total - known;

  // D1 — merytoryczny
  if (d1Spread >= 4) {
    explanations.push({ icon: '🧠', type: 'positive',
      text: `Duża rozpiętość merytoryczna (${d1Spread.toFixed(1)} pkt) — wymiana różnych perspektyw i doświadczeń` });
  } else if (d1Spread >= 2) {
    explanations.push({ icon: '🧠', type: 'neutral',
      text: `Umiarkowana różnorodność merytoryczna (${d1Spread.toFixed(1)} pkt) — zbliżony poziom z przestrzenią do wymiany` });
  } else {
    explanations.push({ icon: '🧠', type: 'neutral',
      text: `Homogeniczna merytorycznie (${d1Spread.toFixed(1)} pkt) — głęboka rozmowa na jednym poziomie` });
  }

  // D2 — organizacyjny
  if (d2Avg >= 7.5) {
    explanations.push({ icon: '📋', type: 'positive',
      text: `Wysoka dyscyplina organizacyjna (śr. ${d2Avg.toFixed(1)}/10) — regularni, punktualni uczestnicy` });
  } else if (d2Avg >= 5) {
    explanations.push({ icon: '📋', type: 'neutral',
      text: `Średnia aktywność organizacyjna (śr. ${d2Avg.toFixed(1)}/10) — dobry mix doświadczonych i nowych` });
  } else {
    explanations.push({ icon: '📋', type: 'warning',
      text: `Niski poziom organizacyjny (śr. ${d2Avg.toFixed(1)}/10) — potrzebne mocne prowadzenie moderatora` });
  }

  // D3 — relacyjny
  if (d3Avg >= 7) {
    explanations.push({ icon: '🤝', type: 'positive',
      text: `Wysokie kompetencje relacyjne (śr. ${d3Avg.toFixed(1)}/10) — naturalna dynamika grupy` });
  } else if (d3Avg >= 4) {
    explanations.push({ icon: '🤝', type: 'neutral',
      text: `Rozwijające się kompetencje relacyjne (śr. ${d3Avg.toFixed(1)}/10)` });
  } else {
    explanations.push({ icon: '🤝', type: 'warning',
      text: `Niski poziom relacyjny (śr. ${d3Avg.toFixed(1)}/10) — zadbaj o integrację na wstępie` });
  }

  // Novelty — past groupmates
  if (known === 0) {
    explanations.push({ icon: '✨', type: 'positive',
      text: `Wszystkie połączenia nowe — ${newP} świeżych relacji do zbudowania` });
  } else if (known <= 1) {
    explanations.push({ icon: '🔄', type: 'neutral',
      text: `${newP} nowych par, 1 znana para — dobry balans ciągłości i nowości` });
  } else {
    explanations.push({ icon: '⚠️', type: 'warning',
      text: `${known} znanych par — częściowo powtarzający się skład. Rozważ ręczną korektę.` });
  }

  // Spread overall
  if (compSpread >= 3) {
    explanations.push({ icon: '⚡', type: 'positive',
      text: `Zróżnicowany przekrój (rozpiętość ${compSpread.toFixed(1)} pkt) — lider, środek i nowy uczestnik razem` });
  }

  return explanations;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeGroups(
  users: UserScore[],
  options: {
    groupSizeMin?: number;
    groupSizeMax?: number;
    targetGroupCount?: number;
  } = {},
): GroupingResult {
  const { groupSizeMin = 4, groupSizeMax = 6, targetGroupCount } = options;

  if (users.length < groupSizeMin) {
    throw new Error(`Za mało uczestników (${users.length}). Minimum: ${groupSizeMin}.`);
  }

  // Determine number of groups
  const avgSize  = (groupSizeMin + groupSizeMax) / 2;
  const k        = targetGroupCount ?? Math.max(1, Math.round(users.length / avgSize));

  // Sort by composite score ascending (lowest first)
  const sorted: GroupMember[] = users
    .map(u => ({ ...u, composite: composite(u) }))
    .sort((a, b) => a.composite - b.composite);

  // Snake distribution
  let rawGroups = snakeDistribute(sorted, k);

  // Conflict reduction
  rawGroups = reduceConflicts(rawGroups) as GroupMember[][];

  // Build proposals with explanations
  const groups: GroupProposal[] = rawGroups.map((members, i) => {
    const mems   = members as GroupMember[];
    const d1s    = mems.map(m => m.d1);
    const d2s    = mems.map(m => m.d2);
    const d3s    = mems.map(m => m.d3);
    const comps  = mems.map(m => m.composite);
    const known  = countKnownPairs(mems);

    return {
      id: `g-${i + 1}`,
      members: mems,
      explanation: explainGroup(mems),
      stats: {
        d1Spread:        Math.max(...d1s) - Math.min(...d1s),
        d2Avg:           d2s.reduce((a, b) => a + b, 0) / d2s.length,
        d3Avg:           d3s.reduce((a, b) => a + b, 0) / d3s.length,
        compositeSpread: Math.max(...comps) - Math.min(...comps),
        newPairs:        countNewPairs(mems),
        knownPairs:      known,
      },
    };
  });

  const totalKnown = groups.reduce((s, g) => s + g.stats.knownPairs, 0);
  const totalNew   = groups.reduce((s, g) => s + g.stats.newPairs, 0);

  return {
    groups,
    meta: {
      algorithm:      'stratified_snake_v1',
      totalUsers:     users.length,
      groupCount:     groups.length,
      groupSizeMin,
      groupSizeMax,
      totalNewPairs:  totalNew,
      totalKnownPairs: totalKnown,
    },
  };
}
