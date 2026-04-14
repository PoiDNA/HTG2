#!/usr/bin/env tsx
/**
 * scripts/review.ts — Multi-model AI code review
 *
 * Usage:
 *   npm run review                       # staged diff, basic mode
 *   npm run review:deep                  # staged diff, deep mode
 *   npx tsx scripts/review.ts --pr 424   # GitHub PR diff
 *   npx tsx scripts/review.ts --staged   # git diff --cached
 *   npx tsx scripts/review.ts --help
 *
 * Required env vars (per mode):
 *   ANTHROPIC_API_KEY  — Claude coordinator
 *   OPENAI_API_KEY     — OpenAI reviewer (o4-mini / o3)
 *   GEMINI_API_KEY     — Gemini reviewer (2.0-flash / 2.5-pro)
 *   GITHUB_TOKEN or GH_TOKEN — for --pr flag and --output github
 *
 * Models:
 *   Basic: gemini-2.0-flash + o4-mini + claude-sonnet-4-6
 *   Deep:  gemini-2.5-pro (thinking) + o3 + claude-opus-4-6 (thinking)
 */

import { execSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'basic' | 'deep'
type OutputFormat = 'terminal' | 'github' | 'json' | 'all'

interface ReviewResult {
  model: string
  status: 'ok' | 'skipped' | 'error'
  content: string
  error?: string
}

interface ReviewOutput {
  mode: Mode
  pr?: number
  commit: string
  meta: {
    tokens: number
    estimated_cost_usd: number
    duration_ms: number
  }
  reviews: ReviewResult[]
  synthesis: ReviewResult
}

// ── Config ────────────────────────────────────────────────────────────────────

const MODELS = {
  basic: {
    gemini: 'gemini-2.0-flash',
    openai: 'gpt-4o-mini',
    claude: 'claude-sonnet-4-6',
  },
  deep: {
    gemini: 'gemini-2.5-pro',
    openai: 'o3',
    claude: 'claude-opus-4-6',
  },
}

const TOKEN_LIMITS = {
  basic: { diff: 50_000, perFile: 5_000 },
  deep: { diff: 100_000, perFile: 10_000 },
}

const COST_PER_TOKEN = {
  basic: 0.0000004,  // ~$0.0004/1k blended input estimate
  deep: 0.000008,    // ~$0.008/1k blended input estimate
}

const COMMENT_MAX_CHARS = 15_000

const EXCLUSION_PATTERNS = [
  /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|svg|webp)$/i,
  /\.(pem|key|p12|pfx)$/i,
  /^\.env/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
]

// ── Prompts ───────────────────────────────────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are a senior developer reviewing a pull request for the HTG2 project.

Stack: Next.js 15 App Router, TypeScript 5, Tailwind CSS 4, Supabase (PostgreSQL + Row Level Security), LiveKit WebRTC, Bunny Stream HLS, Stripe, Vercel, next-intl (i18n).

Review the diff for:
- Security: RLS policy correctness, auth checks, env var exposure in client components
- Logic errors: incorrect assumptions, missing edge cases, race conditions
- Next.js boundaries: server vs client component misuse, missing "use client"/"use server"
- i18n: hardcoded strings that should use next-intl, missing translation keys
- Type safety: any casts, missing null checks, improper TypeScript usage

Output format — use exactly these severity labels:
🔴 Critical: security vulnerability, data loss risk, broken auth
🟡 Warning: logic error, missing edge case, performance issue
🟢 Info: style, minor improvement, optional suggestion

Rules:
- Bullet points only, no prose paragraphs
- Maximum 20 findings total (skip trivial style issues if over limit)
- If the diff looks correct, say "No significant issues found"
- Do not explain what the code does — only flag problems`

const COORDINATOR_SYSTEM_PROMPT = `You are a senior engineering lead synthesizing two code reviews of the same pull request.

You have access to:
1. The original diff
2. Review from Reviewer 1 (Gemini)
3. Review from Reviewer 2 (OpenAI)

Your job:
1. CONSENSUS: List findings both reviewers agree on (these are high-confidence issues)
2. CONFLICTS: List findings where reviewers disagree or contradict each other — briefly explain the conflict
3. MISSED: Identify any issues you can see in the diff that neither reviewer caught
4. PRIORITY LIST: Order all findings by severity (Critical first, then Warning, then Info)

Be brief. Use the same severity labels (🔴 Critical / 🟡 Warning / 🟢 Info).
Do not repeat findings verbatim — summarize and deduplicate.
If both reviews are empty or trivial, say "No significant issues found across all reviewers."`

// ── CLI Args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx scripts/review.ts [options]

Diff source (pick one):
  --pr <n>         GitHub PR number
  --staged         git diff --cached (default)
  --branch <b>     diff vs origin/main

Options:
  --mode basic|deep    Review depth (default: basic)
  --output terminal|github|json|all  (default: terminal)
  --no-coordinator     Skip Claude synthesis
  --dry-run            Show token count + estimated cost, no API calls
  --help               Show this help

Required env vars:
  ANTHROPIC_API_KEY    Claude coordinator
  OPENAI_API_KEY       OpenAI reviewer
  GEMINI_API_KEY       Gemini reviewer
  GITHUB_TOKEN or GH_TOKEN  For --pr and --output github

Examples:
  npm run review
  npm run review:deep
  npx tsx scripts/review.ts --pr 424 --mode deep --output all
  npx tsx scripts/review.ts --staged --dry-run
    `)
    process.exit(0)
  }

  const prIndex = args.indexOf('--pr')
  const branchIndex = args.indexOf('--branch')
  const modeIndex = args.indexOf('--mode')
  const outputIndex = args.indexOf('--output')

  return {
    pr: prIndex >= 0 ? parseInt(args[prIndex + 1], 10) : undefined,
    staged: args.includes('--staged'),
    branch: branchIndex >= 0 ? args[branchIndex + 1] : undefined,
    mode: (modeIndex >= 0 ? args[modeIndex + 1] : 'basic') as Mode,
    output: (outputIndex >= 0 ? args[outputIndex + 1] : 'terminal') as OutputFormat,
    noCoordinator: args.includes('--no-coordinator'),
    dryRun: args.includes('--dry-run'),
  }
}

// ── Repo detection ────────────────────────────────────────────────────────────

function getRepoOwner(): string {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/)
    if (match) return match[1]
  } catch {}
  return ''
}

function getToken(): string {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
}

function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

// ── Diff fetching ─────────────────────────────────────────────────────────────

async function getDiff(args: ReturnType<typeof parseArgs>): Promise<string> {
  if (args.pr) {
    const repo = getRepoOwner()
    const token = getToken()
    if (!repo) throw new Error('Cannot detect repo owner. Set GITHUB_REPOSITORY env var.')

    const res = await fetchWithRetry(
      `https://api.github.com/repos/${repo}/pulls/${args.pr}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.diff',
        },
      }
    )
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    return res.text()
  }

  if (args.staged) {
    return execSync('git diff --cached', { encoding: 'utf8' })
  }

  if (args.branch) {
    return execSync(`git diff origin/main...${args.branch}`, { encoding: 'utf8' })
  }

  // Default: staged, fallback to HEAD~1
  const staged = execSync('git diff --cached', { encoding: 'utf8' })
  if (staged.trim()) return staged
  return execSync('git diff HEAD~1', { encoding: 'utf8' })
}

// ── Diff trimming ─────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function shouldExclude(filename: string): boolean {
  return EXCLUSION_PATTERNS.some(p => p.test(filename))
}

interface FileDiff {
  header: string
  filename: string
  content: string
  tokens: number
}

function parseDiffFiles(diff: string): FileDiff[] {
  const files: FileDiff[] = []
  const chunks = diff.split(/^(?=diff --git )/m).filter(Boolean)

  for (const chunk of chunks) {
    const headerMatch = chunk.match(/^diff --git a\/.+ b\/(.+)/)
    if (!headerMatch) continue
    const filename = headerMatch[1]
    if (shouldExclude(filename)) continue

    files.push({
      header: `diff --git a/${filename} b/${filename}`,
      filename,
      content: chunk,
      tokens: estimateTokens(chunk),
    })
  }

  return files
}

function truncateFile(content: string, maxTokens: number): string {
  if (estimateTokens(content) <= maxTokens) return content

  const lines = content.split('\n')
  const keepLines = maxTokens * 4 / 2  // rough: half for first, half for last
  const first = Math.floor(keepLines * 0.6)
  const last = Math.floor(keepLines * 0.4)

  if (lines.length <= first + last) return content

  const truncated = lines.slice(0, first).length + lines.slice(-last).length
  const skipped = lines.length - truncated
  return [
    ...lines.slice(0, first),
    `... [${skipped} lines truncated — see full diff in artifact] ...`,
    ...lines.slice(-last),
  ].join('\n')
}

function trimDiff(raw: string, mode: Mode): { diff: string; totalTokens: number } {
  const limits = TOKEN_LIMITS[mode]
  const files = parseDiffFiles(raw)

  // Sort: largest first (we drop smallest from the bottom)
  files.sort((a, b) => b.tokens - a.tokens)

  // Truncate per-file
  const truncated = files.map(f => ({
    ...f,
    content: truncateFile(f.content, limits.perFile),
    tokens: Math.min(f.tokens, limits.perFile),
  }))

  // Drop smallest files until within diff limit
  let totalTokens = truncated.reduce((s, f) => s + f.tokens, 0)
  while (totalTokens > limits.diff && truncated.length > 1) {
    const removed = truncated.pop()!
    totalTokens -= removed.tokens
  }

  return {
    diff: truncated.map(f => f.content).join('\n'),
    totalTokens,
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)

      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < retries) {
          const retryAfter = res.headers.get('Retry-After')
          const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt + 1) * 2000
          await sleep(wait)
          continue
        }
      }

      return res
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) await sleep(Math.pow(2, attempt + 1) * 2000)
    }
  }

  throw lastError || new Error('Request failed')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Model callers ─────────────────────────────────────────────────────────────

async function callGemini(diff: string, mode: Mode): Promise<ReviewResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { model: MODELS[mode].gemini, status: 'skipped', content: '[GEMINI_API_KEY not set]' }

  const model = MODELS[mode].gemini
  const isDeep = mode === 'deep'
  const endpoint = isDeep
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
    : `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: REVIEWER_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `Review this diff:\n\n${diff}` }] }],
  }

  if (isDeep) {
    body.generationConfig = { thinkingConfig: { thinkingBudget: 8192 } }
  }

  try {
    const res = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return { model, status: 'error', content: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const text = parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
    return { model, status: 'ok', content: text }
  } catch (err) {
    return { model, status: 'error', content: '', error: String(err) }
  }
}

async function callOpenAI(diff: string, mode: Mode): Promise<ReviewResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { model: MODELS[mode].openai, status: 'skipped', content: '[OPENAI_API_KEY not set]' }

  const model = MODELS[mode].openai
  const isDeep = mode === 'deep'

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
      { role: 'user', content: `Review this diff:\n\n${diff}` },
    ],
  }

  // o3 does not accept temperature
  if (!isDeep) body.temperature = 0.2

  if (isDeep) body.reasoning_effort = 'medium'

  try {
    const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return { model, status: 'error', content: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    return { model, status: 'ok', content: text }
  } catch (err) {
    return { model, status: 'error', content: '', error: String(err) }
  }
}

async function callClaude(diff: string, review1: string, review2: string, mode: Mode): Promise<ReviewResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { model: MODELS[mode].claude, status: 'skipped', content: '[ANTHROPIC_API_KEY not set]' }

  const model = MODELS[mode].claude
  const isDeep = mode === 'deep'

  const userContent = `Original diff:\n\n${diff}\n\n---\nReview from Reviewer 1 (Gemini):\n${review1}\n\n---\nReview from Reviewer 2 (OpenAI):\n${review2}`

  const body: Record<string, unknown> = {
    model,
    max_tokens: isDeep ? 16_000 : 4_096,
    system: COORDINATOR_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  }

  if (isDeep) {
    body.thinking = { type: 'enabled', budget_tokens: 10_000 }
  }

  try {
    const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        ...(isDeep ? { 'anthropic-beta': 'interleaved-thinking-2025-05-14' } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return { model, status: 'error', content: '', error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = (data.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
    return { model, status: 'ok', content: text }
  } catch (err) {
    return { model, status: 'error', content: '', error: String(err) }
  }
}

// ── GitHub comment ────────────────────────────────────────────────────────────

const BOT_MARKER = '<!-- ai-review-bot -->'

async function upsertPRComment(prNumber: number, body: string): Promise<void> {
  const repo = getRepoOwner()
  const token = getToken()
  if (!repo || !token) {
    console.error('Cannot post comment: missing GITHUB_TOKEN/GH_TOKEN or repo owner')
    return
  }

  // Paginate to find existing comment
  let existingId: number | null = null
  let page = 1
  while (!existingId) {
    const res = await fetchWithRetry(
      `https://api.github.com/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
    )
    if (!res.ok) break

    const comments = await res.json() as Array<{ id: number; body?: string }>
    const found = comments.find(c => c.body?.includes(BOT_MARKER))
    if (found) { existingId = found.id; break }
    if (comments.length < 100) break
    page++
  }

  const url = existingId
    ? `https://api.github.com/repos/${repo}/issues/comments/${existingId}`
    : `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`

  await fetchWithRetry(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })
}

// ── Output formatting ─────────────────────────────────────────────────────────

function truncateSection(content: string): string {
  if (content.length <= COMMENT_MAX_CHARS) return content
  return content.slice(0, COMMENT_MAX_CHARS) + '\n\n_... [truncated — see full review in Actions Artifacts]_'
}

function formatPRComment(output: ReviewOutput, mode: Mode): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const modelNames: Record<string, string> = {
    'gemini-2.0-flash': '🔵 Gemini 2.0 Flash',
    'gemini-2.5-pro': '🔵 Gemini 2.5 Pro (thinking)',
    'gpt-4o-mini': '🟡 GPT-4o Mini',
    'o3': '🟡 o3',
    'claude-sonnet-4-6': '🟣 Claude Sonnet 4.6',
    'claude-opus-4-6': '🟣 Claude Opus 4.6 (thinking)',
  }

  const sections = output.reviews.map(r => {
    const title = modelNames[r.model] ?? r.model
    const body = r.status === 'ok' ? truncateSection(r.content) : `_[${r.status}: ${r.error ?? r.content}]_`
    return `<details>\n<summary>${title} — Reviewer</summary>\n\n${body}\n\n</details>`
  })

  const synthesis = output.synthesis
  const synthTitle = modelNames[synthesis.model] ?? synthesis.model
  const synthBody = synthesis.status === 'ok'
    ? truncateSection(synthesis.content)
    : `_[${synthesis.status}: ${synthesis.error ?? synthesis.content}]_`

  const allFailed = output.reviews.every(r => r.status !== 'ok')
  const statusLine = allFailed
    ? '\n> ⚠️ All models failed — check API keys in repo secrets.\n'
    : ''

  return [
    BOT_MARKER,
    `## 🤖 AI Code Review — PR #${output.pr} · \`${mode}\``,
    `_Last reviewed: commit \`${output.commit}\` · ${timestamp}_`,
    statusLine,
    ...sections,
    `<details open>\n<summary>${synthTitle} — Synthesis</summary>\n\n${synthBody}\n\n</details>`,
  ].join('\n\n')
}

function formatTerminal(output: ReviewOutput): void {
  const bar = '─'.repeat(60)
  const modelLabels: Record<string, string> = {
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro (thinking)',
    'gpt-4o-mini': 'GPT-4o Mini',
    'o3': 'o3 (reasoning)',
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'claude-opus-4-6': 'Claude Opus 4.6 (thinking)',
  }

  for (const r of output.reviews) {
    const label = modelLabels[r.model] ?? r.model
    console.log(`\n${bar}`)
    console.log(`REVIEWER: ${label}`)
    console.log(bar)
    if (r.status === 'ok') {
      console.log(r.content)
    } else {
      console.log(`[${r.status.toUpperCase()}] ${r.error ?? r.content}`)
    }
  }

  console.log(`\n${bar}`)
  const synthLabel = modelLabels[output.synthesis.model] ?? output.synthesis.model
  console.log(`SYNTHESIS: ${synthLabel}`)
  console.log(bar)
  if (output.synthesis.status === 'ok') {
    console.log(output.synthesis.content)
  } else {
    console.log(`[${output.synthesis.status.toUpperCase()}] ${output.synthesis.error ?? output.synthesis.content}`)
  }

  console.log(`\n${bar}`)
  console.log(`Mode: ${output.mode} | Tokens: ~${output.meta.tokens.toLocaleString()} | Est. cost: $${output.meta.estimated_cost_usd.toFixed(3)} | Duration: ${(output.meta.duration_ms / 1000).toFixed(1)}s`)
  console.log(bar)
}

// ── Local file output ─────────────────────────────────────────────────────────

function saveLocalFile(output: ReviewOutput, mode: Mode): void {
  const dir = join(process.cwd(), 'reviews')
  mkdirSync(dir, { recursive: true })

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = output.pr
    ? `pr-${output.pr}-${ts}-${mode}.md`
    : `staged-${ts}-${mode}.md`

  const content = formatPRComment(output, mode)
  writeFileSync(join(dir, name), content, 'utf8')
  console.log(`\nSaved: reviews/${name}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()
  const mode = args.mode
  const startTime = Date.now()

  // Fetch diff
  let raw: string
  try {
    raw = await getDiff(args)
  } catch (err) {
    console.error(`Error fetching diff: ${err}`)
    process.exit(1)
  }

  if (!raw.trim()) {
    console.log('No changes found.')
    process.exit(0)
  }

  // Trim
  const { diff, totalTokens } = trimDiff(raw, mode)
  const estimatedCost = totalTokens * COST_PER_TOKEN[mode] * 3 // 3 models

  if (args.dryRun) {
    const limits = TOKEN_LIMITS[mode]
    console.log(`\nDry run — ${mode} mode`)
    console.log(`Diff tokens:     ~${totalTokens.toLocaleString()} / ${limits.diff.toLocaleString()} limit`)
    console.log(`Estimated cost:  ~$${estimatedCost.toFixed(3)} (3 models × ${totalTokens.toLocaleString()} tokens)`)
    console.log(`Models:          ${MODELS[mode].gemini} + ${MODELS[mode].openai} + ${MODELS[mode].claude}`)
    process.exit(0)
  }

  console.log(`\nRunning ${mode} review (${MODELS[mode].gemini} + ${MODELS[mode].openai})...`)

  // Run reviewers in parallel
  const [geminiResult, openaiResult] = await Promise.allSettled([
    callGemini(diff, mode),
    callOpenAI(diff, mode),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : { model: '', status: 'error' as const, content: '', error: String((r as PromiseRejectedResult).reason) }))

  const reviews: ReviewResult[] = [geminiResult, openaiResult]

  // Coordinator
  let synthesis: ReviewResult
  if (args.noCoordinator) {
    synthesis = { model: MODELS[mode].claude, status: 'skipped', content: '[coordinator skipped]' }
  } else {
    console.log(`Running synthesis (${MODELS[mode].claude})...`)
    synthesis = await callClaude(
      diff,
      geminiResult.status === 'ok' ? geminiResult.content : `[${geminiResult.status}: ${geminiResult.error}]`,
      openaiResult.status === 'ok' ? openaiResult.content : `[${openaiResult.status}: ${openaiResult.error}]`,
      mode
    )
  }

  const commit = getCurrentCommit()
  const duration = Date.now() - startTime

  const output: ReviewOutput = {
    mode,
    pr: args.pr,
    commit,
    meta: { tokens: totalTokens, estimated_cost_usd: estimatedCost, duration_ms: duration },
    reviews,
    synthesis,
  }

  // Outputs
  const outputFormat = args.output

  if (outputFormat === 'terminal' || outputFormat === 'all') {
    formatTerminal(output)
  }

  if (outputFormat === 'json') {
    console.log(JSON.stringify(output, null, 2))
  }

  if ((outputFormat === 'github' || outputFormat === 'all') && args.pr) {
    const comment = formatPRComment(output, mode)
    await upsertPRComment(args.pr, comment)
    console.log(`PR #${args.pr} comment updated.`)
  }

  if (outputFormat === 'all' || outputFormat === 'json') {
    saveLocalFile(output, mode)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
