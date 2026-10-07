/**
 * The local reasoning engine — RealityOS's documented no-LLM mode.
 *
 * Everything the LLM agent pipeline does conceptually (extract, plan, critique,
 * reflect) has a deterministic, inspectable implementation here:
 *   • `extractSituationLocally`  – keyword/pattern extraction (dates, hours,
 *     deliverables, constraints, resources) with no network access at all.
 *   • `planOptionsLocally`       – the portfolio of candidate strategies.
 *   • `critiqueLocally`          – challenges the assumptions behind each plan.
 *   • `reflectLocally`           – predicted vs actual cause analysis.
 *
 * The UI labels this mode explicitly ("Local reasoning core"), and the numbers
 * it feeds into the ML surface are the same either way. Nothing here pretends to
 * be an LLM: it is pattern matching plus the shared arithmetic core.
 */
import { clamp, clamp01, daysBetween, round1, round2 } from './features.ts'
import { estimateDeliverableHours, estimateWorkload } from './features.ts'
import type { CreateSimulationInput } from '../schemas.ts'
import type {
  CriticChallenge as CritiqueChallenge,
  DecisionOption,
  Deliverable,
  IdentifiedRisk,
  OutcomeRecord,
  PredictionComparison,
  OptionEvaluation,
  Resource,
  StructuredSituation,
} from './internals.ts'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const NUMBER_WORDS: Record<string, number> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  couple: 2,
  few: 3,
  several: 4,
}

const TECHNICAL = /\b(debug|debugging|model|algorithm|code|coding|implement|implementation|refactor|api|database|dataset|training|research|thesis|experiment|simulation|architecture|migration|pipeline)\b/i
const STUDY = /\b(exam|revision|revise|study|studying|course|coursework|lecture|reading|assignment|problem set|homework|quiz|test)\b/i
const ADMIN = /\b(email|form|invoice|tax|budget|booking|application|paperwork|filing|summary|admin)\b/i
const CREATIVE = /\b(write|writing|essay|report|presentation|deck|slides|design|video|portfolio|proposal)\b/i

const DELIVERABLE_CUES = /\b(project|exam|test|quiz|report|assignment|presentation|interview|thesis|dissertation|proposal|meeting|course|coursework|essay|portfolio|application|budget|training|practice|revision|prototype|demo|mvp|dataset|model|paper|documentation|client|invoice|taxes|visa|licence|license|certification|shift|workout|reading|plan)\w*\b/gi

const RESOURCE_CUES = /\b(laptop|computer|desk|library|mentor|supervisor|teacher|tutor|team|teammate|internet|wifi|dataset|gpu|budget|money|car|gym|equipment|software|license|notebook|friend|colleague|assistant|lab)\b/gi

const CONSTRAINT_CUES = /\b(no|not|without|only|can't|cannot|limited|limited to|busy|clash|clashes|shift|job|work|class|classes|lecture|lectures|family|kids|travel|commute|phone|budget)\b/i

const INTERRUPTION_WORDS = /\b(interrupt|unexpected|surprise|family|kids|shift|night shift|on call|on-call|guests|visitors|travel|sick)\b/i

const MS_PER_DAY = 86_400_000

function lower(text: string): string {
  return text.toLowerCase()
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  return toISODate(new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY))
}

/** Parse the deadline out of free text: ISO dates, "October 15", "next Friday", "in 5 days". */
export function parseDeadline(text: string, today: string): { deadline: string | null; source: 'explicit' | 'inferred' | 'unknown' } {
  const t = lower(text)
  const todayDate = new Date(`${today}T00:00:00Z`)

  const iso = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  if (iso) return { deadline: iso[0], source: 'explicit' }

  const slash = t.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/)
  if (slash) {
    const month = Number(slash[1])
    const day = Number(slash[2])
    const yearRaw = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : todayDate.getUTCFullYear()
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = `${yearRaw}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { deadline: candidate < today ? `${yearRaw + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : candidate, source: 'explicit' }
    }
  }

  const monthDay = t.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})\\b`))
  const dayMonth = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})\\b`))
  const monthName = monthDay?.[1] ?? dayMonth?.[2]
  const dayNumber = Number(monthDay?.[2] ?? dayMonth?.[1])
  if (monthName && Number.isFinite(dayNumber)) {
    const month = MONTHS.indexOf(monthName) + 1
    let year = todayDate.getUTCFullYear()
    let candidate = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
    if (candidate < today) {
      year += 1
      candidate = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
    }
    return { deadline: candidate, source: 'explicit' }
  }

  const inDays = t.match(/\bin\s+(\d{1,3})\s*(day|days|week|weeks|month|months)\b/)
  if (inDays) {
    const amount = Number(inDays[1])
    const unit = inDays[2].startsWith('week') ? 7 : inDays[2].startsWith('month') ? 30 : 1
    return { deadline: addDaysIso(today, amount * unit), source: 'inferred' }
  }

  if (/\btomorrow\b/.test(t)) return { deadline: addDaysIso(today, 1), source: 'explicit' }
  if (/\btonight\b/.test(t) || /\btoday\b/.test(t)) return { deadline: today, source: 'explicit' }
  if (/\bnext week\b/.test(t)) return { deadline: addDaysIso(today, 7), source: 'inferred' }
  if (/\bin two weeks\b|\bfortnight\b/.test(t)) return { deadline: addDaysIso(today, 14), source: 'inferred' }
  if (/\bnext month\b/.test(t)) return { deadline: addDaysIso(today, 30), source: 'inferred' }

  const weekday = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[2])
    const current = todayDate.getUTCDay()
    let delta = (target - current + 7) % 7
    if (delta === 0) delta = 7
    if (weekday[1]) delta += 7
    return { deadline: addDaysIso(today, delta), source: weekday[1] ? 'explicit' : 'inferred' }
  }

  return { deadline: null, source: 'unknown' }
}

export interface ParsedAvailability {
  hours: number
  daysPerWeek: number
  explicit: boolean
  /** 0..1 — how scattered the available time is, inferred from commitments. */
  fragmentation: number
}

export interface ParsedAvailability {
  hours: number
  daysPerWeek: number
  explicit: boolean
  /** 0..1 — how scattered the available time is, inferred from commitments. */
  fragmentation: number
}

const NUM_TOKEN = '(\\d+(?:\\.\\d+)?|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few|several)'
const HOURS_TOKEN = '(?:(?:an?|the)\\s+)?(?:hours?|hrs?)'
const HALF_TOKEN = '(?:\\s+and\\s+a\\s+half)?'

function readNumber(raw: string | undefined): number {
  if (!raw) return 0
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : (NUMBER_WORDS[raw] ?? 0)
}

/**
 * Parse "3 hours a day", "two hrs per day", "7 hours a week",
 * "half an hour a day", "90 minutes daily", "weekdays only".
 */
export function parseDailyHours(text: string): ParsedAvailability {
  const t = lower(text)
  let hours = 0
  let explicit = false

  const minutesPerDay = new RegExp(`${NUM_TOKEN}\\s*(?:minutes?|mins?)\\s*(?:a|per|each|every|/)\\s*(?:single\\s+)?day`)
  const minutesMatch = t.match(minutesPerDay)
  if (minutesMatch) {
    hours = readNumber(minutesMatch[1]) / 60
    explicit = true
  } else {
    const perDay = new RegExp(`${NUM_TOKEN}${HALF_TOKEN}\\s*${HOURS_TOKEN}?\\s*(?:a|per|each|every|/)\\s*(?:single\\s+)?(?:day|daily)`)
    const perWeek = new RegExp(`${NUM_TOKEN}${HALF_TOKEN}\\s*${HOURS_TOKEN}?\\s*(?:a|per|each|every|/)\\s*(?:single\\s+)?(?:week|weekly)`)
    const dayMatch = t.match(perDay)
    const weekMatch = t.match(perWeek)
    if (dayMatch) {
      hours = readNumber(dayMatch[1]) + (/and\s+a\s+half/.test(dayMatch[0]) ? 0.5 : 0)
      explicit = true
    } else if (weekMatch) {
      hours = (readNumber(weekMatch[1]) + (/and\s+a\s+half/.test(weekMatch[0]) ? 0.5 : 0)) / 7
      explicit = true
    } else {
      const bare = t.match(new RegExp(`${NUM_TOKEN}${HALF_TOKEN}\\s*${HOURS_TOKEN}`))
      if (bare) {
        hours = readNumber(bare[1]) + (/and\s+a\s+half/.test(bare[0]) ? 0.5 : 0)
        explicit = true
      } else if (/\ban hour\b|\bone hour\b/.test(t)) {
        hours = 1
        explicit = true
      } else if (/\bhalf an hour\b/.test(t)) {
        hours = 0.5
        explicit = true
      }
    }
  }

  const weekend = /\b(weekends?|saturdays?|sundays?)\b/.test(t)
  const weekdaysOnly = /\b(weekdays?|workdays?|after work|school nights|weeknights?)\b/.test(t)
  let daysPerWeek = 7
  if (weekend && !/\bdaily|every day|each day\b/.test(t)) daysPerWeek = 5
  else if (weekdaysOnly) daysPerWeek = 5

  const busy = (t.match(CONSTRAINT_CUES) ?? []).length
  const fragmentation = clamp01(0.18 + 0.08 * busy + (weekdaysOnly ? 0.12 : 0) + (/\b(class|classes|lectures|shift|job|work)\b/.test(t) ? 0.12 : 0))

  return {
    hours: clamp(hours || 2.5, 0.5, 12),
    daysPerWeek,
    explicit,
    fragmentation: round2(fragmentation),
  }
}

function complexityFor(name: string, context: string): number {
  const window = `${name} ${context}`.toLowerCase()
  let base = 0.45
  if (TECHNICAL.test(window)) base = 0.78
  else if (STUDY.test(window)) base = 0.55
  else if (CREATIVE.test(window)) base = 0.62
  else if (ADMIN.test(window)) base = 0.3
  if (/\b(research|from scratch|complete|full|entire|whole)\b/i.test(window)) base += 0.08
  if (/\b(quick|simple|short|small|tiny|just)\b/i.test(window)) base -= 0.12
  return round2(clamp01(base))
}

function cleanName(value: string): string {
  return value
    .trim()
    .replace(/^(the|my|our|a|an|i|we|and|but|also|still|need|needs|have|has|to)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '')
    .trim()
}

const SMALL_WORDS = new Set(['of', 'the', 'and', 'in', 'my', 'our', 'a', 'an', 'to', 'for', 'on'])

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

/**
 * Pull the deliverables out of prose. Three passes — known keywords, phrases
 * attached to due/deadline language, then the leading clause as a last resort —
 * followed by a de-duplication pass that drops fragments contained in a longer
 * candidate ("I have my Final Year Project" loses to "Final Year Project").
 */
function extractDeliverableNames(text: string): string[] {
  const candidates: string[] = []
  const push = (value: string) => {
    const cleaned = cleanName(value)
    if (cleaned.length < 3 || cleaned.length > 60) return
    if (cleaned.split(/\s+/).length > 6) return
    candidates.push(titleCase(cleaned))
  }

  for (const match of text.matchAll(DELIVERABLE_CUES)) {
    const word = match[0]
    const before = text.slice(Math.max(0, match.index - 26), match.index)
    // Grab up to three words of qualifier ("driving theory" + "test") when they
    // read as a noun phrase rather than a clause.
    const qualifier = (before.match(/(?:\b\w+\b\s+){0,3}$/)?.[0] ?? '').trim()
    let cleanedQualifier = cleanName(qualifier)
    if (/\b(i|we|and|but|also|with|the|to|of|for|a|an|my|our|is|are|have|has|need|needs|can|will)\b/.test(cleanedQualifier)) {
      cleanedQualifier = cleanedQualifier
        .replace(/^.*\b(i|we|and|but|also|with|the|to|of|for|a|an|my|our|is|are|have|has|need|needs|can|will)\b\s*/i, '')
        .trim()
    }
    const words = cleanedQualifier ? cleanedQualifier.split(' ') : []
    const usable = cleanedQualifier.length > 2 && words.length <= 3
    push(usable ? `${cleanedQualifier} ${word}` : word)
  }

  for (const match of text.matchAll(/([A-Za-z][A-Za-z\s]{2,40}?)\s+(?:is\s+)?(?:due|deadline|submits?|submit)\b/gi)) {
    push(match[1])
  }

  if (candidates.length === 0) push(text.split(/[.,;\n]/)[0] ?? '')

  // De-duplicate: prefer the specific, shorter phrasing; drop contained fragments
  // and near-identical repeats.
  const unique: string[] = []
  for (const candidate of candidates) {
    const key = candidate.toLowerCase()
    if (unique.some((u) => u.toLowerCase() === key)) continue
    const containerIndex = unique.findIndex((u) => u.toLowerCase().includes(key) || key.includes(u.toLowerCase()))
    if (containerIndex >= 0) {
      const existing = unique[containerIndex]
      // Keep whichever phrasing is more specific but still a clean noun phrase.
      const existingWords = existing.split(' ').length
      const candidateWords = candidate.split(' ').length
      if (candidateWords < existingWords || (candidateWords === existingWords && candidate.length < existing.length)) {
        unique[containerIndex] = candidate
      }
      continue
    }
    unique.push(candidate)
  }

  // Drop a deliverable that merely repeats another one's head noun with different
  // modifiers ("Final Report" vs "Final Year Project Report").
  const deduped = unique.filter((candidate) => {
    const words = candidate.toLowerCase().split(' ')
    const head = words[words.length - 1]
    return !unique.some((other) => {
      if (other === candidate) return false
      const otherWords = other.toLowerCase().split(' ')
      return otherWords[otherWords.length - 1] === head && otherWords.length > words.length
    })
  })

  return deduped.slice(0, 5)
}

function extractResources(text: string): Resource[] {
  const seen = new Map<string, Resource>()
  for (const match of text.matchAll(RESOURCE_CUES)) {
    const name = titleCase(match[0])
    const window = lower(text).slice(Math.max(0, (match.index ?? 0) - 24), (match.index ?? 0) + match[0].length + 18)
    const availability: Resource['availability'] = /\b(no|without|not|lacking|missing)\b/.test(window) ? 'low' : /\b(shared|limited|sometimes|a friend|borrowed)\b/.test(window) ? 'medium' : 'high'
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, availability, note: availability === 'low' ? 'Limited or unreliable' : undefined })
  }
  return [...seen.values()].slice(0, 5)
}

function extractConstraints(text: string): string[] {
  const found: string[] = []
  for (const clause of text.split(/[.;\n]/)) {
    const trimmed = clause.trim()
    if (trimmed.length < 4 || trimmed.length > 160) continue
    if (CONSTRAINT_CUES.test(trimmed) && !/^(i have|i need|my goal)/i.test(trimmed)) found.push(trimmed.replace(/^and\s+/i, ''))
  }
  const keywords = ['college', 'university', 'full-time job', 'part-time job', 'shift work', 'family', 'kids', 'travel', 'budget', 'internet', 'sleep', 'health']
  for (const keyword of keywords) {
    if (lower(text).includes(keyword)) {
      const label = titleCase(keyword)
      if (!found.some((f) => f.toLowerCase().includes(keyword))) found.push(`${label} commitments`)
    }
  }
  return found.slice(0, 6)
}

/** Keyword/pattern extraction — no network, no model. Deterministic and auditable. */
export function extractSituationLocally(
  input: CreateSimulationInput,
  today: string,
): StructuredSituation {
  const parts = [input.goal ?? '', input.description, ...input.constraints ?? [], input.voiceTranscript ?? '', ...input.attachments.map((a) => a.text)].filter(Boolean)
  const corpus = parts.join('. ')
  const { deadline, source } = input.deadline
    ? { deadline: input.deadline, source: 'explicit' as const }
    : parseDeadline(corpus, today)
  const parsedHours = parseDailyHours(corpus)
  const availableHoursPerDay = input.availableHoursPerDay ?? parsedHours.hours

  const names = extractDeliverableNames(corpus)
  const deliverables: Deliverable[] = (names.length ? names : ['Main deliverable']).map((name, index) => {
    const isTechnical = TECHNICAL.test(`${name} ${corpus}`)
    return {
      id: `d${index + 1}`,
      name,
      complexity: complexityFor(name, corpus),
      // Technical work depends on a data/prep step; otherwise the chain is linear.
      dependencies: isTechnical && index > 0 ? [`d${index}`] : [],
      criticalPath: index < 2,
    }
  })

  if (deliverables.length === 1 && names.length === 0) {
    deliverables[0].name = 'Complete the goal'
  }

  const constraints = extractConstraints(corpus)
  const resources = extractResources(corpus)
  const hoursPerDay = availableHoursPerDay

  const risks: IdentifiedRisk[] = []
  const totalRequired = deliverables.reduce((sum, d) => sum + estimateDeliverableHours(d), 0)
  const horizon = deadline ? Math.max(1, daysBetween(today, deadline)) : 21
  const capacity = horizon * (parsedHours.daysPerWeek / 7) * hoursPerDay
  const tightness = totalRequired / Math.max(0.5, capacity)

  if (tightness > 1.05) {
    risks.push({
      label: 'Estimated work exceeds available hours',
      severity: tightness > 1.4 ? 'high' : 'medium',
      rationale: `The task set looks like ~${totalRequired.toFixed(0)}h of focused work against ~${capacity.toFixed(0)}h of available time before the deadline.`,
    })
  }
  if (deliverables.some((d) => d.complexity >= 0.7)) {
    risks.push({
      label: 'Technical work tends to overrun',
      severity: 'medium',
      rationale: 'Deliverables involving implementation, debugging or research historically take longer than planned.',
    })
  }
  if (deliverables.length >= 3 && horizon <= 10) {
    risks.push({
      label: 'Competing deadlines in a short window',
      severity: horizon <= 5 ? 'high' : 'medium',
      rationale: `${deliverables.length} deliverables inside ${horizon} days leaves little room to reshuffle when something slips.`,
    })
  }
  if (INTERRUPTION_WORDS.test(corpus)) {
    risks.push({
      label: 'Interruption risk',
      severity: 'medium',
      rationale: 'The situation mentions commitments that can consume evening or weekend blocks without notice.',
    })
  }
  if (!resources.length) {
    risks.push({
      label: 'Resources not stated',
      severity: 'low',
      rationale: 'No tools, help or material constraints were described, so availability is assumed to be adequate.',
    })
  }

  const priorities = [...deliverables]
    .sort((a, b) => Number(b.criticalPath) - Number(a.criticalPath) || b.complexity - a.complexity)
    .map((d) => d.name)

  const openQuestions: string[] = []
  if (!parsedHours.explicit && !input.availableHoursPerDay) openQuestions.push('How many focused hours can you realistically protect each day?')
  if (!deadline) openQuestions.push('Is there a hard date, or is the timing flexible?')
  if (!resources.length) openQuestions.push('Which tools or people are you relying on to get this done?')

  const extractionConfidence = round2(
    clamp01(
      0.4 +
        0.2 * (deadline ? 1 : 0) +
        0.15 * (parsedHours.explicit ? 1 : 0) +
        0.12 * (deliverables.length > 1 ? 1 : 0) +
        0.08 * (constraints.length ? 1 : 0) +
        0.05 * (resources.length ? 1 : 0),
    ),
  )

  return {
    goal: input.goal?.trim() || deliverables[0]?.name || 'Make progress on the goal',
    summary: corpus.length > 360 ? `${corpus.slice(0, 357).trim()}…` : corpus,
    deadline,
    deadlineSource: source,
    availableHoursPerDay,
    activeDaysPerWeek: parsedHours.daysPerWeek,
    constraints,
    resources,
    risks,
    deliverables,
    priorities,
    complexity: round2(clamp01(deliverables.reduce((sum, d) => sum + d.complexity, 0) / Math.max(1, deliverables.length) * 1.05)),
    fragmentation: parsedHours.fragmentation,
    openQuestions: openQuestions.slice(0, 4),
    extractionConfidence,
  }
}

/** Allocate `hoursPerDay` across deliverables by weight, never exceeding capacity. */
function allocate(deliverables: Deliverable[], hoursPerDay: number, weights: number[]): { allocations: DecisionOption['allocations']; total: number } {
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1
  const allocations = deliverables.map((d, index) => ({
    deliverableId: d.id,
    hoursPerDay: round2(Math.max(0.25, (hoursPerDay * (weights[index] ?? 0)) / totalWeight)),
  }))
  const total = round2(allocations.reduce((sum, a) => sum + a.hoursPerDay, 0))
  return { allocations, total }
}

/**
 * Candidate strategies derived from the structure of the situation.
 *
 * Three strategies always exist (balanced / critical-path-first / deep-work).
 * When the estimated work does not fit the available hours, a fourth **triage**
 * option is added that fully covers the critical path and names what it defers —
 * because "this plan does not fit" is a finding, not a failure of the product.
 */
export function planOptionsLocally(situation: StructuredSituation, today?: string): DecisionOption[] {
  const deliverables = situation.deliverables
  const capacity = situation.availableHoursPerDay
  const ordered = [...deliverables].sort((a, b) => Number(b.criticalPath) - Number(a.criticalPath) || b.complexity - a.complexity)
  const byHours = [...deliverables].sort((a, b) => estimateDeliverableHours(b) - estimateDeliverableHours(a))
  const top = ordered[0]
  const second = ordered[1] ?? byHours[0]
  const labels = (name: string | undefined) => name ?? 'the main deliverable'

  const balancedWeights = deliverables.map((d) => clamp01(d.complexity + 0.25))
  const balanced = allocate(deliverables, capacity * 0.88, balancedWeights)

  const criticalWeights = deliverables.map((d) => (d.id === top?.id ? 2.4 : d.id === second?.id ? 1.5 : 0.7))
  const critical = allocate(deliverables, capacity * 0.96, criticalWeights)

  const qualityWeights = deliverables.map((d) => (d.id === byHours[0]?.id ? 2.2 : 1))
  const quality = allocate(deliverables, capacity * 0.72, qualityWeights)

  const options: DecisionOption[] = [
    {
      id: 'opt-balanced',
      code: 'A',
      name: 'Balanced Plan',
      strategy: `Spread ${balanced.total.toFixed(1)}h/day across every deliverable, keeping some slack in reserve.`,
      allocations: balanced.allocations,
      hoursPerDay: balanced.total,
      bufferDays: 1,
      assumptions: [
        'Every deliverable can progress in parallel with short daily blocks.',
        `You can protect roughly ${balanced.total.toFixed(1)} focused hours per day.`,
      ],
      tradeoffs: ['No single deliverable gets an aggressive push, so a late slip is absorbed rather than caught up.'],
    },
    {
      id: 'opt-critical',
      code: 'B',
      name: `${labels(top?.name)} First`,
      strategy: `Front-load ${labels(top?.name)} at ${critical.allocations.find((a) => a.deliverableId === top?.id)?.hoursPerDay.toFixed(1) ?? capacity.toFixed(1)}h/day, then rotate to the rest.`,
      allocations: critical.allocations,
      hoursPerDay: critical.total,
      bufferDays: 0,
      assumptions: [
        `${labels(top?.name)} is the bottleneck: finishing it early unlocks the rest.`,
        'Sequencing matters more than parallel progress.',
      ],
      tradeoffs: [`Other deliverables receive little attention until ${labels(top?.name)} moves.`],
    },
    {
      id: 'opt-quality',
      code: 'C',
      name: `${labels(byHours[0]?.name)} Deep Work`,
      strategy: `Concentrate ${quality.total.toFixed(1)}h/day on ${labels(byHours[0]?.name)} and keep the load deliberately below your limit.`,
      allocations: quality.allocations,
      hoursPerDay: quality.total,
      bufferDays: 2,
      assumptions: [
        `${labels(byHours[0]?.name)} is the largest single piece of work.`,
        'Lower daily load protects quality and reduces overrun.',
      ],
      tradeoffs: ['Less total hours are scheduled, so smaller deliverables may end up rushed near the deadline.'],
    },
  ]

  const required = estimateWorkload(situation).totalHours
  const horizonDays = situation.deadline && today ? Math.max(1, daysBetween(today, situation.deadline)) : 21
  const effectiveDays = Math.max(1, horizonDays * (situation.activeDaysPerWeek / 7))
  const capacityHours = effectiveDays * situation.availableHoursPerDay

  if (required > capacityHours * 0.98 && deliverables.length > 2) {
    const keep = ordered.slice(0, 2)
    const deferred = ordered.slice(2)
    const keepIds = new Set(keep.map((k) => k.id))
    const triageTargets = deliverables.filter((d) => keepIds.has(d.id))
    const triage = allocate(
      triageTargets,
      capacity * 0.92,
      triageTargets.map((d) => (d.id === keep[0]?.id ? 2.2 : 1.6)),
    )
    options.push({
      id: 'opt-triage',
      code: 'D',
      name: 'Triage Plan',
      strategy: `Give everything to ${keep.map((k) => k.name).join(' and ')} at full pace until the deadline passes, and defer ${deferred.map((d) => d.name).join(', ')}.`,
      allocations: triage.allocations,
      hoursPerDay: triage.total,
      bufferDays: 0,
      assumptions: [
        `The full task set is roughly ${required.toFixed(0)}h against about ${capacityHours.toFixed(0)}h of available time, so not everything can be finished well.`,
        `${keep.map((k) => k.name).join(' and ')} are the deliverables that gate everything else.`,
      ],
      tradeoffs: [`${deferred.map((d) => d.name).join(', ')} receive no scheduled time and must be renegotiated, reduced in scope, or moved.`],
    })
  }

  return options
}

/** Deterministic critique of the candidate set. */
export function critiqueLocally(evaluations: OptionEvaluation[]): CritiqueChallenge[] {
  const challenges: CritiqueChallenge[] = []
  for (const evaluation of evaluations) {
    const { option, projection } = evaluation
    if (projection.capacityUtilization > 1) {
      challenges.push({
        target: `${option.code} — ${option.name}`,
        challenge: `Assumes more than 100% of your stated capacity (${(projection.capacityUtilization * 100).toFixed(0)}%). One bad day erases the buffer.`,
        severity: projection.capacityUtilization > 1.15 ? 'high' : 'medium',
      })
    }
    const unmet = [...projection.coverage].filter((c) => c.ratio < 0.7).sort((a, b) => a.ratio - b.ratio)
    if (unmet.length) {
      const worst = unmet.slice(0, 2)
      challenges.push({
        target: `${option.code} — ${option.name}`,
        challenge: `Covers only ${worst
          .map((u) => `${Math.round(u.ratio * 100)}% of the estimated hours for ${u.name}`)
          .join(' and ')}${unmet.length > 2 ? ` (and ${unmet.length - 2} more)` : ''}. Either the estimate for that work is wrong or the scope has to shrink.`,
        severity: unmet[0].ratio < 0.45 ? 'high' : 'medium',
      })
    }
    if (projection.bufferDays <= 0 && projection.deadlineRisk > 0.45) {
      challenges.push({
        target: `${option.code} — ${option.name}`,
        challenge: 'Has no finishing buffer. Everything must land on time, first attempt.',
        severity: 'high',
      })
    }
  }
  return challenges.slice(0, 5)
}

/** Deterministic cause analysis for prediction vs reality. */
export function reflectLocally(
  prediction: { successProbability: number; deadlineRisk: number; stressIndex: number; expectedHours: number },
  outcome: OutcomeRecord,
): { causes: PredictionComparison['causes']; narrative: string } {
  const actualSuccess = outcome.completed === 'yes' ? 1 : outcome.completed === 'partly' ? 0.5 : 0
  const successDelta = round1(actualSuccess * 100 - prediction.successProbability * 100)
  const causes: PredictionComparison['causes'] = []

  if (outcome.actualHours && prediction.expectedHours > 0) {
    const ratio = outcome.actualHours / prediction.expectedHours
    if (ratio > 1.2) {
      causes.push({
        label: `Effort ran ${(ratio * 100 - 100).toFixed(0)}% over the estimate`,
        detail: `The simulation expected about ${prediction.expectedHours.toFixed(0)}h; ${outcome.actualHours.toFixed(0)}h were actually spent. The estimator under-weights unplanned rework and setup.`,
        kind: 'underestimate',
      })
    } else if (ratio < 0.8) {
      causes.push({
        label: `Effort came in ${(100 - ratio * 100).toFixed(0)}% under the estimate`,
        detail: `Estimated ${prediction.expectedHours.toFixed(0)}h, spent ${outcome.actualHours.toFixed(0)}h. The workload estimator may be over-weighting complexity for this kind of task.`,
        kind: 'overestimate',
      })
    }
  }

  if (successDelta < -8) {
    causes.push({
      label: 'Outcome was worse than simulated',
      detail:
        outcome.whatWentWrong ||
        'Something outside the modelled variables consumed the buffer. Recording the specific cause improves the next simulation.',
      kind: 'external',
    })
  } else if (successDelta > 8) {
    causes.push({
      label: 'Outcome beat the simulation',
      detail: outcome.whatWentBetter || 'The plan was executed with fewer interruptions than the model assumed.',
      kind: 'overestimate',
    })
  }

  if (outcome.actualStress !== null && Math.abs(outcome.actualStress - prediction.stressIndex) > 12) {
    causes.push({
      label: outcome.actualStress > prediction.stressIndex ? 'Pressure felt higher than modelled' : 'Pressure felt lower than modelled',
      detail: `Simulated pressure ${Math.round(prediction.stressIndex)}/100, you reported ${outcome.actualStress}/100.`,
      kind: outcome.actualStress > prediction.stressIndex ? 'underestimate' : 'overestimate',
    })
  }

  if (outcome.actualCompletionDate && outcome.completed !== 'yes') {
    causes.push({
      label: 'Goal not fully completed',
      detail: 'Unfinished deliverables are the strongest signal in this data point: they usually trace back to an underestimated dependency chain.',
      kind: 'underestimate',
    })
  }

  if (causes.length === 0) {
    causes.push({
      label: 'Simulation tracked reality closely',
      detail: `Predicted ${(prediction.successProbability * 100).toFixed(0)}% completion and the outcome scored ${(actualSuccess * 100).toFixed(0)}%. No systematic error detected in this data point.`,
      kind: 'overestimate',
    })
  }

  const narrative =
    successDelta < -5
      ? `The simulation was optimistic by ${Math.abs(successDelta).toFixed(0)} points. ${causes[0]?.detail ?? ''}`
      : successDelta > 5
        ? `The simulation was conservative by ${successDelta.toFixed(0)} points. ${causes[0]?.detail ?? ''}`
        : `Prediction and reality were within ${Math.abs(successDelta).toFixed(0)} points — this decision is well captured by the model.`

  return { causes: causes.slice(0, 4), narrative }
}
