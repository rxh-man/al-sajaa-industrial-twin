/**
 * Deterministic goal understanding for the operations agent. No language model is connected: the goal text is
 * matched against keyword rules for the workflow, and numbers with units are read as targets, constraints or
 * scenario inputs. Whatever the parser does not understand is reported back rather than guessed.
 */

export type WorkflowId = 'water' | 'traffic' | 'climate' | 'energy' | 'emergency' | 'maintenance' | 'freight';

export interface WorkflowInfo {
  id: WorkflowId;
  title: string;
  titleAr: string;
  /** scenario model that implements it; null = not implemented yet */
  scenarioId: string | null;
  keywords: RegExp;
}

/** order matters: the first workflow with the most keyword hits wins; ties go to the earlier one */
export const WORKFLOWS: WorkflowInfo[] = [
  { id: 'water', title: 'Water Incident', titleAr: 'حادث مياه', scenarioId: 'water-leak', keywords: /\b(leak\w*|water|pipe\w*|main|valve\w*|burst|pressure|supply)\b/gi },
  { id: 'traffic', title: 'Traffic Optimisation', titleAr: 'تحسين حركة المرور', scenarioId: 'traffic', keywords: /\b(traffic|congest\w*|bottleneck|lane\w*|road\s*works?|queue\w*|signal\w*|divert\w*|corridor|veh\/h|delays?|vehicle[- ]hours)\b/gi },
  { id: 'climate', title: 'Climate Action', titleAr: 'العمل المناخي', scenarioId: 'climate', keywords: /\b(climate|co2|co₂|carbon|emission\w*|solar|heat|cool\w*|trees?|shade|reflective|net[- ]zero)\b/gi },
  { id: 'energy', title: 'Energy Resilience', titleAr: 'مرونة الطاقة', scenarioId: null, keywords: /\b(outage|blackout|microgrid|feeder|substation|electricity outage)\b/gi },
  { id: 'emergency', title: 'Emergency Response', titleAr: 'الاستجابة للطوارئ', scenarioId: null, keywords: /\b(emergency|ambulance|fire|evacuat\w*|police)\b/gi },
  { id: 'maintenance', title: 'Infrastructure Maintenance', titleAr: 'صيانة البنية التحتية', scenarioId: null, keywords: /\b(maintenance|inspect\w*|asset health|ageing|aging|prioriti[sz]e repairs?)\b/gi },
  { id: 'freight', title: 'Freight Optimisation', titleAr: 'تحسين الشحن', scenarioId: null, keywords: /\b(freight|trucks?|lorr\w*|deliver\w*|logistics|waste collection)\b/gi },
];

export interface Target {
  /** KPI id in the scenario */
  kpi: string;
  kind: 'reduce-pct' | 'max' | 'min';
  value: number;
  text: string;
}

export interface ParsedGoal {
  text: string;
  workflow: WorkflowInfo | null;
  /** scenario inputs read from the goal (validated later by the tool) */
  inputs: Record<string, number | string>;
  targets: Target[];
  /** phrases recognised, so the user sees exactly what was understood */
  understood: string[];
  /** reasons the goal could not be acted on */
  problems: string[];
}

export const MAX_GOAL_CHARS = 400;

/** strip control characters and markup, collapse whitespace, cap the length */
export function sanitiseGoal(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_GOAL_CHARS);
}

const n = (s: string) => Number(s.replace(/,/g, ''));

export function parseGoal(raw: unknown): ParsedGoal {
  const text = sanitiseGoal(raw);
  const out: ParsedGoal = { text, workflow: null, inputs: {}, targets: [], understood: [], problems: [] };
  if (!text) {
    out.problems.push('The goal is empty.');
    return out;
  }
  let best: WorkflowInfo | null = null;
  let hits = 0;
  for (const w of WORKFLOWS) {
    const h = (text.match(w.keywords) ?? []).length;
    if (h > hits) [best, hits] = [w, h];
  }
  out.workflow = best;
  if (!best) {
    out.problems.push('No workflow matched. Mention water/leak, traffic/congestion, or climate/CO₂/heat.');
    return out;
  }
  out.understood.push(`Workflow: ${best.title} (${hits} keyword match${hits > 1 ? 'es' : ''})`);
  if (!best.scenarioId) {
    out.problems.push(`The ${best.title} workflow is not implemented yet; only Water Incident, Traffic Optimisation and Climate Action are.`);
    return out;
  }
  const t = text.toLowerCase();
  const read = (re: RegExp, f: (m: RegExpMatchArray) => void) => {
    const m = t.match(re);
    if (m) f(m);
  };
  // reduction targets: "reduce/cut X by N%"
  const reduceRe = /(?:reduce|cut|lower|decrease)\s+([a-z₂0-9 \-]+?)\s+by\s+(\d+(?:\.\d+)?)\s*%/g;
  for (const m of t.matchAll(reduceRe)) {
    const what = m[1];
    const pct = n(m[2]);
    const kpi = kpiFor(best.id, what);
    if (kpi) {
      out.targets.push({ kpi, kind: 'reduce-pct', value: pct, text: `reduce ${what} by ${pct} %` });
      out.understood.push(`Target: reduce ${what} by ${pct} %`);
    } else out.problems.push(`Could not match "${what}" to a measured KPI of the ${best.title} workflow; target ignored.`);
  }
  if (best.id === 'water') {
    read(/(\d+(?:\.\d+)?)\s*(?:l\/s|litres? per second|liters? per second)/, (m) => ((out.inputs.leakLps = n(m[1])), out.understood.push(`Leak rate ${m[1]} L/s`)));
    read(/(?:stop|isolate)\w*\b.*?within\s+(\d+(?:\.\d+)?)\s*(min|minutes|h|hours?)/, (m) => {
      const h = /^min/.test(m[2]) ? n(m[1]) / 60 : n(m[1]);
      out.targets.push({ kpi: 'isolateH', kind: 'max', value: h, text: `stop the leak within ${m[1]} ${m[2]}` });
      out.understood.push(`Constraint: leak stopped within ${m[1]} ${m[2]}`);
    });
    read(/restor\w*\b.*?within\s+(\d+(?:\.\d+)?)\s*(min|minutes|h|hours?)/, (m) => {
      const h = /^min/.test(m[2]) ? n(m[1]) / 60 : n(m[1]);
      out.targets.push({ kpi: 'restoreH', kind: 'max', value: h, text: `restore supply within ${m[1]} ${m[2]}` });
      out.understood.push(`Constraint: supply restored within ${m[1]} ${m[2]}`);
    });
    read(/repair\w*\s+(?:takes?\s+)?(\d+(?:\.\d+)?)\s*(?:h|hours?)/, (m) => ((out.inputs.repairH = n(m[1])), out.understood.push(`Repair ${m[1]} h`)));
    if (/(keep|without cutting|no)\b.*\b(customers?|homes?|residents?)\b.*\b(supplied|water|off)\b|keep (customers?|homes?|residents?) supplied/.test(t)) {
      out.targets.push({ kpi: 'personHours', kind: 'max', value: 0, text: 'keep residents supplied' });
      out.understood.push('Constraint: no residents left without water');
    }
  }
  if (best.id === 'traffic') {
    read(/(\d[\d,]*)\s*(?:veh(?:icles)?\s*(?:\/|per)\s*h(?:our)?)/, (m) => ((out.inputs.demand = n(m[1])), out.understood.push(`Demand ${m[1]} veh/h`)));
    read(/(\d+|one|two)\s+lanes?\s+(?:closed|shut|blocked)/, (m) => {
      const v = m[1] === 'one' ? 1 : m[1] === 'two' ? 2 : n(m[1]);
      out.inputs.lanesClosed = v;
      out.understood.push(`${v} lane(s) closed`);
    });
    read(/al sajaa road (\d+)/, (m) => ((out.inputs.corridor = `Al Sajaa Road ${m[1]}`), out.understood.push(`Corridor Al Sajaa Road ${m[1]}`)));
    read(/(?:trip|travel)\s*time\b.*?(?:under|below|within)\s+(\d+(?:\.\d+)?)\s*min/, (m) => {
      out.targets.push({ kpi: 'avgMin', kind: 'max', value: n(m[1]), text: `average trip under ${m[1]} min` });
      out.understood.push(`Constraint: average trip under ${m[1]} min`);
    });
  }
  if (best.id === 'climate') {
    read(/(\d[\d,]*)\s*trees/, (m) => ((out.inputs.trees = n(m[1])), out.understood.push(`${m[1]} trees`)));
    read(/(\d+(?:\.\d+)?)\s*%\s*(?:panel\s*)?coverage/, (m) => ((out.inputs.coverage = n(m[1])), out.understood.push(`Panel coverage ${m[1]} %`)));
    read(/(?:water|irrigation)\b.*?(?:under|below|max(?:imum)?|within)\s+(\d[\d,]*)\s*m(?:3|³)/, (m) => {
      out.targets.push({ kpi: 'waterM3', kind: 'max', value: n(m[1]), text: `irrigation under ${m[1]} m³/yr` });
      out.understood.push(`Constraint: irrigation under ${m[1]} m³/yr`);
    });
    if (/\bheat\b|cool/.test(t) && !/co2|co₂|carbon|emission|solar/.test(t)) out.inputs.weightCo2 = 20;
    if (/co2|co₂|carbon|emission/.test(t) && !/\bheat\b|cool/.test(t)) out.inputs.weightCo2 = 90;
  }
  return out;
}

function kpiFor(workflow: WorkflowId, what: string): string | null {
  const w = what.trim();
  if (workflow === 'water') {
    if (/water|loss|lost|leak/.test(w)) return 'lossM3';
    if (/restor|outage|downtime/.test(w)) return 'restoreH';
  }
  if (workflow === 'traffic') {
    if (/delay|vehicle[- ]hours|congestion/.test(w)) return 'vehHours';
    if (/trip|travel/.test(w)) return 'avgMin';
  }
  if (workflow === 'climate') {
    if (/co2|co₂|carbon|emission/.test(w)) return 'co2T';
    if (/grid|electric/.test(w)) return 'gridMWh';
    if (/heat/.test(w)) return 'heatHot';
  }
  return null;
}
