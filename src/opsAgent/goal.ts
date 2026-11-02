/**
 * Deterministic goal understanding for the operations agent. No language model is connected: the goal text is
 * matched against keyword rules for the workflow, and numbers with units are read as targets, constraints or
 * scenario inputs. Whatever the parser does not understand is reported back rather than guessed.
 */

export type WorkflowId = 'water' | 'traffic' | 'climate' | 'energy' | 'emergency' | 'maintenance' | 'freight' | 'planning' | 'air' | 'flood' | 'sustainability' | 'parking';

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
  { id: 'climate', title: 'Climate Action', titleAr: 'العمل المناخي', scenarioId: 'climate', keywords: /\b(climate|co2|co₂|carbon|emission\w*|solar|heat|cool\w*|trees?|shade|reflective)\b/gi },
  { id: 'energy', title: 'Energy Resilience', titleAr: 'مرونة الطاقة', scenarioId: 'energy', keywords: /\b(outage|blackout|power cut|microgrid|feeder|substation|cable fault|backup power|generators?)\b/gi },
  { id: 'emergency', title: 'Emergency Response', titleAr: 'الاستجابة للطوارئ', scenarioId: 'emergency', keywords: /\b(emergency|ambulance|fire|evacuat\w*|police|crash|spill|chemical release|hazard|responders?)\b/gi },
  { id: 'maintenance', title: 'Infrastructure Maintenance', titleAr: 'صيانة البنية التحتية', scenarioId: 'maintenance', keywords: /\b(maintenance|inspect\w*|asset health|ageing|aging|renew\w*|crew budget|crew-hours|predictive|prioriti[sz]e repairs?)\b/gi },
  { id: 'freight', title: 'Freight Optimisation', titleAr: 'تحسين الشحن', scenarioId: 'freight', keywords: /\b(freight|trucks?|lorr\w*|deliver\w*|logistics|depot|rounds?)\b/gi },
  { id: 'planning', title: 'Urban Planning', titleAr: 'التخطيط العمراني', scenarioId: 'planning', keywords: /\b(new\b[\w ]{0,40}?(?:factor\w*|facilit\w*|plants?|warehouses?)|develop\w*|zoning|proposed|planning|built|construct\w*|additional (?:factor\w*|facilit\w*))\b/gi },
  { id: 'air', title: 'Air Quality', titleAr: 'جودة الهواء', scenarioId: 'air', keywords: /\b(air|pollution|smog|plumes?|wind|stacks?|smoke|nox|pm2\.5)\b/gi },
  { id: 'flood', title: 'Flood and Drainage', titleAr: 'الفيضانات والتصريف', scenarioId: 'flood', keywords: /\b(flood\w*|storm\w*|rain\w*|drain\w*|runoff|cloudburst)\b/gi },
  { id: 'parking', title: 'Parking Intelligence', titleAr: 'ذكاء المواقف', scenarioId: 'parking', keywords: /\b(parking|parknex|car ?park|bays?|tariffs?|pricing|tenants?|visitors?)\b/gi },
  { id: 'sustainability', title: 'Sustainability Strategy', titleAr: 'استراتيجية الاستدامة', scenarioId: 'sustainability', keywords: /\b(city-wide|district-wide|programme|program|decarboni\w*|net[- ]zero|carbon balance|dust|abatement|strategy)\b/gi },
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
    out.problems.push('No workflow matched. Mention a leak, traffic, CO₂/heat, an outage, an emergency, maintenance, freight, a new development, air pollution, a storm, or a city-wide strategy.');
    return out;
  }
  out.understood.push(`Workflow: ${best.title} (${hits} keyword match${hits > 1 ? 'es' : ''})`);
  if (!best.scenarioId) {
    out.problems.push(`The ${best.title} workflow is not implemented yet.`);
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
  if (best.id === 'energy') {
    read(/repair\w*\s+(?:takes?\s+|of\s+)?(\d+(?:\.\d+)?)\s*(?:h|hours?)/, (m) => ((out.inputs.repairH = n(m[1])), out.understood.push(`Repair ${m[1]} h`)));
    read(/(\d+(?:\.\d+)?)\s*mwh\s*(?:of\s+)?batter/, (m) => ((out.inputs.batteryMWh = n(m[1])), out.understood.push(`Battery ${m[1]} MWh`)));
    if (/(hospital|school|critical)/.test(t)) {
      out.targets.push({ kpi: 'criticalHours', kind: 'max', value: 2, text: 'critical sites back within ~2 site-hours' });
      out.understood.push('Constraint: protect critical sites');
    }
  }
  if (best.id === 'emergency') {
    const inc = /chemical|spill|release/.test(t) ? 'chem-spill' : /camp|labou?r|accommodation/.test(t) ? 'camp-fire' : /cold|warehouse fire|store/.test(t) ? 'cold-fire' : /crash|e611|highway|collision/.test(t) ? 'e611-crash' : null;
    if (inc) (out.inputs.incident = inc), out.understood.push(`Incident: ${inc}`);
    read(/(al sajaa road \d+|al sajaa western road)\s+(?:is\s+)?(?:closed|blocked)/, (m) => {
      const name = m[1].replace(/\b\w/g, (c) => c.toUpperCase());
      out.inputs.closure = name;
      out.understood.push(`Closure: ${name}`);
    });
    read(/within\s+(\d+(?:\.\d+)?)\s*min/, (m) => {
      out.targets.push({ kpi: 'responseMin', kind: 'max', value: n(m[1]), text: `respond within ${m[1]} min` });
      out.understood.push(`Constraint: respond within ${m[1]} min`);
    });
  }
  if (best.id === 'maintenance') {
    read(/(\d[\d,]*)\s*crew[- ]?hours/, (m) => ((out.inputs.crewHours = n(m[1])), out.understood.push(`Crew budget ${m[1]} h`)));
  }
  if (best.id === 'freight') {
    read(/(\d+)\s*(?:sites|stops|warehouses|customers)/, (m) => ((out.inputs.stops = n(m[1])), out.understood.push(`${m[1]} stops`)));
  }
  if (best.id === 'planning') {
    read(/(\d+)\s+(?:additional\s+|new\s+)?(?:[a-z ]+?\s)?(?:factor\w*|facilit\w*|plants?|warehouses?)/, (m) => ((out.inputs.count = n(m[1])), out.understood.push(`${m[1]} facilities`)));
    const cats: [RegExp, string][] = [[/metal/, 'metal'], [/food/, 'food'], [/packag/, 'packaging'], [/chemical/, 'chemical'], [/building material|cement|concrete/, 'materials'], [/plastic|polymer/, 'plastics'], [/automotive|car assembly/, 'automotive'], [/recycl|waste/, 'recycling'], [/heavy/, 'heavy'], [/cold/, 'cold'], [/logistic|warehouse|distribution/, 'logistics'], [/workshop/, 'workshop']];
    const c = cats.find(([re]) => re.test(t));
    if (c) (out.inputs.category = c[1]), out.understood.push(`Category: ${c[1]}`);
    const ds: [RegExp, string][] = [[/far northern/, 'far-north'], [/northern mixed/, 'north-mixed'], [/freight yard/, 'freight-yards'], [/western logistics/, 'west-logistics'], [/rahmaniya/, 'rahmaniya'], [/central/, 'central'], [/eastern/, 'east-res']];
    const d = ds.find(([re]) => re.test(t));
    if (d) (out.inputs.district = d[1]), out.understood.push(`District: ${d[1]}`);
  }
  if (best.id === 'air') {
    read(/wind\s+from\s+(\d+)/, (m) => ((out.inputs.windDeg = n(m[1]) % 360), out.understood.push(`Wind from ${m[1]}°`)));
  }
  if (best.id === 'parking') {
    const fac: [RegExp, string][] = [[/central/, 'central'], [/business/, 'business'], [/residential/, 'residential'], [/event|arena/, 'event'], [/commercial/, 'commercial'], [/premium|ev\b/, 'premium']];
    const fm = fac.find(([re]) => re.test(t));
    if (fm) (out.inputs.facility = fm[1]), out.understood.push(`Facility: ${fm[1]}`);
    read(/(\d+)\s*%\s*(?:more|higher|increase)/, (m) => ((out.inputs.priceUp = n(m[1])), out.understood.push(`Tariff test +${m[1]} %`)));
  }
  if (best.id === 'flood') {
    read(/(\d+(?:\.\d+)?)\s*mm\s*(?:\/|per)\s*h/, (m) => ((out.inputs.rainMmH = n(m[1])), out.understood.push(`Rain ${m[1]} mm/h`)));
    read(/for\s+(\d+(?:\.\d+)?)\s*(?:h|hours?)/, (m) => ((out.inputs.hours = n(m[1])), out.understood.push(`Duration ${m[1]} h`)));
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
  if (workflow === 'energy') {
    if (/unserved|energy/.test(w)) return 'unservedMWh';
    if (/outage|hours|customers?/.test(w)) return 'custHours';
  }
  if (workflow === 'emergency' && /response|time/.test(w)) return 'responseMin';
  if (workflow === 'freight') {
    if (/co2|co₂|emission/.test(w)) return 'co2Kg';
    if (/distance|km/.test(w)) return 'km';
  }
  if (workflow === 'planning' && /co2|co₂|carbon|emission/.test(w)) return 'addCo2';
  if (workflow === 'air' && /pollution|exposure|concentration/.test(w)) return 'worst';
  if (workflow === 'flood' && /flood|runoff|excess/.test(w)) return 'excessM3';
  if (workflow === 'parking') {
    if (/revenue|income/.test(w)) return 'revenueDay';
    if (/turned away|unserved|queue/.test(w)) return 'turnedAway';
  }
  if (workflow === 'sustainability') {
    if (/co2|co₂|carbon|emission/.test(w)) return 'netT';
    if (/dust|pm/.test(w)) return 'pm';
  }
  return null;
}
