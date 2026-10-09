export type Role = "admin" | "project_manager" | "site_manager" | "site_engineer" | "planning_engineer" | "estimation_engineer";
export type Health = "On Track" | "At Risk" | "Delayed" | "Blocked";
export type Severity = "Low" | "Medium" | "High";

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  active?: boolean;
}

export interface Project {
  _id: string;
  code: string;
  name: string;
  location?: string;
  projectType?: string;
  startDate?: string;
  plannedCompletionDate?: string;
  status: string;
  projectManager?: User;
  siteManager?: User;
  health?: Partial<Record<Health, number>>;
  totalActivities?: number;
  lastEvaluatedAt?: string;
}

// ---------- AI layer ----------
export type AlertLevel = "critical" | "warning" | "attention" | "positive";
export type PredictionStatus = "Proposed" | "Accepted" | "Rejected" | "Overridden";

export interface AiNarration {
  headline?: string | null;
  aiGenerated: boolean;
  summary?: string;
  findings?: { title: string; detail: string; evidence: string }[];
  recommendations?: { action: string; rationale: string; owner?: string }[];
  dataGaps?: string[];
}

export interface AiAgentCard {
  key: string;
  title: string;
  description: string;
  headline: string | null;
  narration: AiNarration | null;
  ranAt: string | null;
  status: "Success" | "Degraded" | "Failed" | null;
}

export interface Confidence {
  confidence: number;
  components: Record<string, number>;
  insufficientData: boolean;
  reason: string | null;
  basis: string[];
}

export interface CompletionForecast {
  plannedCompletion: string | null;
  projectCompletion: string | null;
  coversFullScope: boolean;
  scopeNote?: string | null;
  expected: string | null;
  best: string | null;
  worst: string | null;
  delayDays: number;
  bestDelayDays?: number;
  worstDelayDays?: number;
  criticalActivity?: { code: string; name: string; slipDays: number } | null;
  complete: boolean;
  basis: string[];
}

export interface DelayAnalysis {
  level: "Low" | "Medium" | "High" | "Critical";
  levelReason: string;
  maxSlipDays: number;
  activitiesBehind: number;
  activitiesBlocked: number;
  waitingOnPredecessor: number;
  blockersByType: Record<string, number>;
  contributors: {
    code: string; name: string; location: string; health: Health;
    slipDays: number; progressVariance: number; productivityGapPercent: number | null; reasons: string[];
  }[];
  basis: string[];
}

export interface LabourAnalysis {
  insufficientData: boolean;
  reason?: string | null;
  windowDays?: number;
  asOfReport?: string | null;
  requiredToday?: number;
  requiredPeak?: number;
  peakDate?: string;
  totalPresent?: number;
  shortfall?: number;
  shortfallPeak?: number;
  utilisationPercent?: number | null;
  trades: {
    trade: string; requiredToday: number; requiredPeak: number; present: number;
    shortfallToday: number; shortfallPeak: number; surplus: number;
  }[];
  basis: string[];
}

export interface MaterialRow {
  name: string;
  unit: string | null;
  requiredNextWindow: number;
  consumedToDate: number;
  stock?: number | null;
  minStock?: number | null;
  reorderLevel?: number | null;
  supplier?: string | null;
  dailyConsumption?: number | null;
  daysOfCover?: number | null;
  recommendedPurchase?: number | null;
  stockRisk?: "Critical" | "Low" | "Normal" | "Excess" | null;
}

export interface MaterialAnalysis {
  insufficientData: boolean;
  reason?: string | null;
  stockTracked?: boolean;
  stockNote?: string;
  windowDays?: number;
  materials: MaterialRow[];
  basis: string[];
}

export interface InventoryAnalysis {
  insufficientData: boolean;
  reason?: string;
  items: MaterialRow[];
  critical?: number;
  low?: number;
  basis: string[];
}

export interface PlanningAnalysis {
  phases: { category: string; activities: number; actual: number; planned: number; remaining: number }[];
  criticalPath: { remainingDays: number; activities: { code: string; name: string; remainingDays: number; health: Health }[] };
  dependencies: number;
  milestones: { code: string; name: string; plannedFinish: string; expectedFinish?: string; health: Health; priority: string }[];
  basis: string[];
}

export interface SchedulingAnalysis {
  openActivities: number;
  conflicts: { type: string; a: { code: string; name: string }; b: { code: string; name: string }; detail: string }[];
  delayed: { code: string; name: string; slipDays: number; expectedFinish?: string; plannedFinish: string }[];
  labourShortfall: LabourAnalysis["trades"];
  equipmentShortfall: EquipmentAnalysis["items"];
  recoveryOptions: { type: string; label: string; workers?: number; count?: number; hours?: number }[];
  basis: string[];
}

export interface EquipmentAnalysis {
  insufficientData: boolean;
  reason?: string | null;
  workingHoursPerDay?: number;
  reportedDays?: number;
  peakDate?: string;
  items: {
    name: string; required: number; requiredToday: number; deployed: number;
    shortfall: number; hoursLast7Days: number; utilisationPercent: number | null;
  }[];
  basis: string[];
}

export interface GroundAnalysis {
  detected: boolean;
  reports: {
    activity: { code: string; name: string; location: string };
    condition: string;
    severity?: Severity;
    insufficientData: boolean;
    reason?: string;
    remainingQuantity?: number;
    unit?: string | null;
    normalDurationDays?: number;
    affectedDurationDays?: number;
    additionalDays?: number;
    additionalBreakerOrMachines?: number;
    additionalLabour?: number;
    basis?: string[];
  }[];
  basis: string[];
}

export interface HealthScore {
  overall: number;
  dimensions: { key: string; score: number | null; basis: string }[];
  note: string;
}

export interface AiPrediction {
  _id: string;
  agent: string;
  kind: string;
  label: string;
  value: Record<string, unknown>;
  unit?: string;
  confidence?: number;
  basis: string[];
  narration?: string;
  status: PredictionStatus;
  decidedBy?: User;
  decidedAt?: string;
  override?: { value: unknown; reason?: string };
  createdAt: string;
}

export interface AiAlert {
  _id: string;
  project: string | Project;
  level: AlertLevel;
  category: string;
  title: string;
  message: string;
  basis: string[];
  status: "Open" | "Acknowledged" | "Resolved";
  acknowledgedBy?: User;
  createdAt: string;
}

export interface AiInsights {
  asOf: string;
  project: { id: string; code: string; name: string; location?: string; plannedCompletionDate?: string };
  ai: { configured: boolean; model: string | null; rateLimitPerMin: number };
  progress: {
    overall: number; planned: number; variance: number; weightBasis: string;
    counts: Record<string, number>;
  };
  analysis: {
    confidence: Confidence;
    completion: CompletionForecast;
    delay: DelayAnalysis;
    labour: LabourAnalysis;
    material: MaterialAnalysis;
    inventory: InventoryAnalysis;
    equipment: EquipmentAnalysis;
    ground: GroundAnalysis;
    planning: PlanningAnalysis;
    scheduling: SchedulingAnalysis;
    health: HealthScore;
  };
  agents: AiAgentCard[];
  predictions: AiPrediction[];
  alerts: AiAlert[];
}

export interface AiStatus {
  configured: boolean;
  model: string | null;
  rateLimitPerMin: number;
  agents: { key: string; title: string; description: string }[];
  scenarios: { key: string; label: string; params: Record<string, string> }[];
  note: string | null;
}

export interface Simulation {
  type: string;
  label?: string;
  insufficientData: boolean;
  reason?: string;
  scope?: { code?: string; name?: string; activities?: number; description?: string };
  baselineCompletion?: string;
  revisedCompletion?: string;
  plannedCompletion?: string;
  daysSaved?: number;
  daysLost?: number;
  delayVsPlanAfter?: number | null;
  delayVsPlanBefore?: number;
  costImpact?: { calculable: boolean; amount?: number; currency?: string; period?: string; formula?: string; note?: string };
  assumptions?: string[];
  summaryLine?: string;
}

export interface CopilotAnswer {
  answer: string;
  sources?: string[];
  followUps?: string[];
  findings?: { title: string; detail: string; evidence: string }[];
  recommendations?: { action: string; rationale: string; owner?: string }[];
  simulation?: Simulation;
  agent: string;
  aiGenerated: boolean;
  needsProject?: boolean;
  conversationId?: string;
  project?: { id: string; name: string; code: string };
}

export interface StructureNodeT {
  _id: string;
  name: string;
  type: string;
  parent: string | null;
  children: StructureNodeT[];
  summary: Record<Health | "total" | "Completed" | "risks" | "blockers", number>;
}

export interface Metrics {
  plannedProgress: number;
  actualProgress: number;
  actualQuantity: number;
  progressVariance: number;
  actualStart?: string;
  actualFinish?: string;
  expectedStart?: string;
  expectedFinish?: string;
  scheduleVarianceDays: number;
  baselineVarianceDays?: number | null;
  manpower?: { date: string; trade?: string; planned: number; actual: number; short: boolean } | null;
  impactedBy: { activity: string; name: string; delayDays: number }[];
  healthReason?: string;
  lastUpdateAt?: string;
}

export interface Activity {
  _id: string;
  code: string;
  name: string;
  project: string | Project;
  structureNode?: { _id: string; name: string; type: string } | string;
  wbs?: string;
  plannedStart: string;
  plannedFinish: string;
  plannedDuration: number;
  plannedQuantity?: number;
  unit?: string;
  responsible?: User;
  priority: string;
  status: string;
  health: Health;
  metrics: Metrics;
  baseline?: { start?: string; finish?: string; version?: string; approvedBy?: string; source?: string; setAt?: string };
  source?: string;
  externalRef?: string;
  lastSyncedAt?: string;
}

export interface Estimate {
  _id: string;
  boqCode: string;
  description?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount?: number;
  currency: string;
  estimatedDurationDays?: number;
  productivityPerDay?: number;
  labour: { trade: string; count: number }[];
  materials: { name: string; quantity: number; unit: string }[];
  machinery: { name: string; count: number }[];
  version?: string;
  status: string;
  preparedBy?: User;
  source: string;
  lastSyncedAt?: string;
}

export interface ExecutionLog {
  _id: string;
  date: string;
  contractor?: string;
  manpower: { trade: string; planned: number; actual: number }[];
  machinery: { name: string; count: number; hours?: number }[];
  materialsConsumed: { name: string; quantity: number; unit: string }[];
  weather?: string;
  workingHours?: number;
  remarks?: string;
  reportedBy?: User;
  source: string;
}

export interface Team {
  _id: string;
  code: string;
  name: string;
  type: "Planning" | "Estimation" | "Execution";
  lead?: User;
  members: User[];
  source: string;
  lastSyncedAt?: string;
}

export interface IntegrationSync {
  _id: string;
  source: string;
  mode: "pull" | "push";
  types: string[];
  status: "Running" | "Success" | "Partial" | "Failed";
  stats?: Record<string, Record<string, number | string[]>>;
  errorMessages: string[];
  triggeredBy?: { name: string };
  startedAt: string;
  finishedAt?: string;
}

export interface HistoryEntry {
  status?: string;
  note?: string;
  by?: User;
  at: string;
  event?: string;
  severity?: Severity;
  message?: string;
}

export interface Blocker {
  _id: string;
  activity: Activity | string;
  type: string;
  description: string;
  reportedBy?: User;
  reportedDate: string;
  expectedResolution?: string;
  severity: Severity;
  status: string;
  assignedTo?: User;
  resolutionNote?: string;
  history: HistoryEntry[];
  createdAt: string;
}

export interface Risk {
  _id: string;
  activity: Activity;
  status: "Open" | "Closed";
  activityHealth: Health;
  progressVariance: number;
  delayDays: number;
  blockerType?: string;
  impacted: { activity: string; name: string; delayDays: number }[];
  expectedImpactDays: number;
  severity: Severity;
  message: string;
  escalatedTo?: User;
  history: HistoryEntry[];
  createdAt: string;
  closedAt?: string;
}

export interface Escalation {
  _id: string;
  activity?: { _id: string; name: string; code?: string };
  severity: Severity;
  level: Role;
  escalatedTo?: User;
  reason: string;
  status: "Open" | "Acknowledged";
  acknowledgedBy?: User;
  acknowledgedAt?: string;
  createdAt: string;
}

export interface ProgressUpdate {
  _id: string;
  date: string;
  plannedQuantity?: number;
  actualQuantity?: number;
  plannedProgress: number;
  actualProgress: number;
  status?: string;
  comment?: string;
  reportedBy?: User;
  createdAt: string;
}

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  userName: string;
  action: string;
  field?: string;
  previousValue?: unknown;
  newValue?: unknown;
  comment?: string;
  activity?: { _id: string; name: string; code: string };
  createdAt: string;
}

export interface DependencyLink {
  dependencyId: string;
  type: string;
  lagDays: number;
  activity: Activity;
}

export interface ActivityDetail extends Activity {
  project: Project;
  location: string;
  predecessors: DependencyLink[];
  successors: DependencyLink[];
  history: ProgressUpdate[];
  blockers: Blocker[];
  risks: Risk[];
  escalations: Escalation[];
  comments: { _id: string; text: string; user?: User; createdAt: string }[];
  attachments: { _id: string; originalName: string; url: string; mimetype: string; caption?: string; uploadedBy?: User; createdAt: string }[];
  auditLogs: AuditLog[];
  estimates: Estimate[];
  executionLogs: ExecutionLog[];
  teams: { _id: string; name: string; type: Team["type"]; lead?: User }[];
}

export const BLOCKER_TYPES = ["Material", "Labour", "Vendor", "Machine", "Drawing", "Approval", "Inspection", "Weather", "Site Condition", "Other"];
export const BLOCKER_STATUSES = ["Open", "Assigned", "In Progress", "Resolved", "Closed"];
export const SEVERITIES: Severity[] = ["Low", "Medium", "High"];
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  project_manager: "Project Manager",
  site_manager: "Site Manager",
  site_engineer: "Site Engineer",
  planning_engineer: "Planning Engineer",
  estimation_engineer: "Estimation Engineer",
};
// Demo: roles left out of the login shortcuts and role pickers. Empty to show them again
// (and HIDDEN_ROLES in backend/src/models/constants.js).
export const HIDDEN_ROLES: Role[] = ["planning_engineer", "estimation_engineer"];
export const VISIBLE_ROLE_LABELS = Object.fromEntries(
  Object.entries(ROLE_LABELS).filter(([k]) => !HIDDEN_ROLES.includes(k as Role)),
) as Partial<Record<Role, string>>;
export const isManager = (role?: Role) => role === "admin" || role === "project_manager" || role === "site_manager";

export interface Portfolio {
  projects: number;
  averageProgress: number;
  projectsAtRisk: number;
  labourToday: number;
  labourAsOf: string | null;
  lowStockItems: number;
  criticalAlerts: number;
  alerts: AiAlert[];
}

export interface InventoryItem {
  _id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  reorderLevel: number;
  supplier?: string;
  notes?: string;
}

export interface InventoryTxn {
  _id: string;
  type: string;
  quantity: number;
  date: string;
  note?: string;
  recordedBy?: User;
  item?: { name: string; unit: string };
  activity?: { code: string; name: string };
}

export interface LabourAttendanceRow {
  _id: string;
  date: string;
  trade: string;
  category?: string;
  contractor?: string;
  planned: number;
  present: number;
  checkIn?: string;
  checkOut?: string;
  reportedBy?: User;
}

export interface SiteReportRow {
  _id: string;
  date: string;
  reportedBy?: User;
  labour: { trade: string; category?: string; planned?: number; present?: number }[];
  materialsReceived: { name: string; quantity: number; unit?: string }[];
  materialsConsumed: { name: string; quantity: number; unit?: string }[];
  equipment: { name: string; count?: number; hours?: number }[];
  weather?: string;
  issues?: string;
  remarks?: string;
  aiSummary?: AiNarration & { headline?: string };
}

export interface CameraObs {
  _id: string;
  url: string;
  caption?: string;
  createdAt: string;
  uploadedBy?: User;
  activity?: { code: string; name: string };
  analysis?: {
    workers?: number; helmets?: number; jackets?: number; machinery?: string[];
    activitiesVisible?: string[]; safetyIssues?: string[]; siteChanges?: string;
    progressEstimate?: number; previousProgressEstimate?: number; progressDelta?: number;
    confidence?: number; notes?: string; aiGenerated?: boolean; insufficientData?: boolean; reason?: string;
  };
  verification?: { status: string; note?: string; by?: User };
  source?: string;
}

export interface BuildingModel {
  project: { id: string; code: string; name: string };
  spec: Record<string, number | string | boolean>;
  sources: Record<string, string>;
  stored: boolean;
  floorplan?: {
    source?: { originalName: string; url: string; uploadedAt: string };
    stats: Record<string, { title: string; widthM: number; depthM: number; walls: number; openings: number; rooms: number; furniture: number; flats: number }>;
    floors: { typical: number[]; refuge: number[] };
    floorCount: number;
  } | null;
  dimensions: { plateWidthM: number; plateDepthM: number; floorHeightM: number; towers: number; detailedFloors: number; totalHeightM: number };
  towers: { id: string; name: string; floors: { id: string; name: string; storey: number | null }[] }[];
  components: {
    id: string; type: string; category: string; tower: string; floorName: string | null; floorIndex: number;
    position: [number, number, number]; size: [number, number, number];
    label: string; activityIds: string[]; color?: string; side?: string; subtype?: string; skin?: string; unit?: string | null;
    rotation?: [number, number, number]; callout?: string; engineering?: boolean;
  }[];
  activities: {
    id: string; code: string; name: string; category: string; health: Health; status: string;
    plannedStart: string; plannedFinish: string; expectedFinish?: string;
    plannedProgress: number; actualProgress: number; slipDays: number;
    responsible?: string | null; healthReason?: string | null;
    history: { date: string; progress: number }[];
    labour: { trade: string; count: number }[];
    materials: { name: string; quantity: number; unit?: string }[];
    estimatedAmount?: number | null;
    manpowerReported?: number | null;
  }[];
  timeline: { start: string; end: string; days: number } | null;
  categories: string[];
  disclaimer: string;
}

export interface PlanCheck {
  project: {
    name: string;
    location: string;
    architect: string;
    drawnBy: string;
    jobNo: string;
    clientOnUnitPlans: string;
    marketing: string;
    stackOnDrawing: string;
    stackOnBooklet: string;
    corridorM: number;
    lifts: string;
    refugeAreaSqm: number;
  };
  summary: { pass: number; warning: number; fail: number };
  checks: { id: number; status: "pass" | "warning" | "fail"; title: string; detail: string; source: string }[];
  sheets: { number: string; rev: string; title: string; date: string; dwgPresent: boolean; pdfPresent: boolean }[];
  residential: {
    type: string;
    carpet: number;
    balcony: number;
    terrace: number;
    totalSqm: number;
    carpetSqft: number;
    salableSqft: number;
    computedTotalSqm: number;
    computedCarpetSqft: number;
    computedSalableSqft: number;
  }[];
  shops: {
    type: string;
    count: number;
    carpet: number;
    mezz: number;
    totalSqm: number;
    salableSqft: number;
    groupSalableSqft?: number;
    computedTotalSqm: number;
    computedSalableSqft: number;
  }[];
  shopCount: number;
  floors: {
    typical: { floors: number[]; flatsPerFloor: number };
    refuge: { floors: number[]; flatsPerFloor: number; refugeAreaSqm: number };
    first: { floors: number[]; largeFlats: number[]; twoBhkA: number[] };
  };
  rooms: { type: string; rooms: { name: string; widthM: number; depthM: number }[] }[];
}

// ---------- Geotech agent (plinth estimate) ----------
export type SoilClass = "soft" | "ordinary" | "hard" | "rock";
export type FoundationType = "isolated" | "raft" | "pile";

export interface SoilLayer {
  fromDepthM: number | null;
  toDepthM: number | null;
  description: string;
  sptN: number | null;
  sourceText: string | null;
  page?: number | null;
}

export interface GeotechEvidence {
  quote: string;
  page: number | null;
}

export interface GeotechFacts {
  isGeotechnicalReport: boolean;
  reportTitle: string | null;
  boreholes: number | null;
  layers: SoilLayer[];
  groundwaterDepthM: number | null;
  groundwaterNote: string | null;
  rockOrBoulderPresent: boolean | null;
  rockDepthM: number | null;
  bearingCapacity: { value: number; unit: string; depthM: number | null; sourceText: string | null; page?: number | null; kNm2: number | null } | null;
  recommendedFoundation: FoundationType | null;
  recommendedDepthM: number | null;
  evidence?: { groundwater: GeotechEvidence | null; rock: GeotechEvidence | null; foundation: GeotechEvidence | null; depth: GeotechEvidence | null };
  keyFindings?: { label: string; value: string; page: number | null }[];
  notes: string | null;
  completeness: { found: number; of: number; missing: string[] };
  readQuality?: { attempts: number; issues: string[]; via?: "text" | "pdf" | "file"; pages?: number | null };
}

export interface GeotechPhase {
  key: string;
  name: string;
  insufficientData?: boolean;
  reason?: string;
  quantity: { value: number; unit: string; label: string } | null;
  days: number;
  startDay: number;
  endDay: number;
  workers: { trade: string; count: number }[];
  workerTotal: number;
  machines: { name: string; count: number }[];
  vehicles: { name: string; count: number }[];
  basis: string[];
}

export interface GeotechLearnedRate {
  default: number;
  used: number;
  factor: number;
  observations: number;
  weight: number;
}

export interface GeotechEstimate {
  soil: { class: SoilClass; label: string; dewatering: boolean; sbcKnM2: number | null; reasons: string[] };
  foundation: { type: FoundationType; source: "report" | "rule" | "assumed"; reason: string; label: string };
  inputs: { plinthAreaSqm: number; areaSource?: "user" | "report" | "default"; depthM: number; depthSource: "user" | "report" | "default" };
  excavation: { inSituVolumeM3: number; looseVolumeM3: number; days: number; jcbs: number; ratePerJcbDay: number };
  phases: GeotechPhase[];
  totals: {
    calendarDays: number;
    partial: boolean;
    peakWorkers: number;
    peakJcbs: number;
    tippers: number;
    machines: { name: string; count: number }[];
    otherVehicles: { name: string; count: number }[];
  };
  warnings: { level: "critical" | "warning" | "attention" | "info"; text: string }[];
  assumptions: string[];
  learning: {
    observations: number;
    siteFactor: number;
    rate: GeotechLearnedRate | null;
    scheduleFactor: number;
    scheduleObservations: number;
  } | null;
  confidence: number;
  confidenceBasis: string[];
}

export interface WeatherDay { date: string; rainMm: number; probability: number | null; source: "forecast" | "upload"; fromWording?: boolean }
export type WeatherKind = "work" | "light" | "rain" | "recovery" | "buffer";
export interface GeotechWeather {
  start: string;
  end: string;
  dryDays: number;
  totalDays: number;
  extraDays: number;
  phases: { key: string; name: string; dryDays: number; days: number; extraDays: number; rainDays: number; lightDays: number; recoveryDays: number; bufferDays: number; expectedLoss: number }[];
  schedule: { date: string; phaseKey: string; phaseName: string; kind: WeatherKind; rainMm: number | null; probability: number | null; source: "forecast" | "upload" | "normal"; note: string | null }[];
  warnings: GeotechEstimate["warnings"];
  basis: string[];
  location: { name: string; latitude: number; longitude: number; source: string };
  forecast: { fetchedAt: string | null; error: string | null; from: string | null; to: string | null };
  known: WeatherDay[];
  computedAt: string;
}

export interface GeotechReport {
  _id: string;
  project: string;
  source: "upload" | "sample";
  uploadedBy?: User;
  file?: { originalName: string; url: string; mimetype: string; size: number };
  extraction: { status: "Read" | "Not read" | "Sample"; reason?: string; model?: string; facts: GeotechFacts | null };
  inputs: { plinthAreaSqm: number | null; areaSource?: "user" | "report" | "default" | null; depthM: number | null; depthUsedM?: number; depthSource?: string };
  estimate: GeotechEstimate | null;
  narration: { summary: string; warnings?: string[]; recommendations: { action: string; rationale: string }[]; aiGenerated: boolean } | null;
  verification: { status: "Pending" | "Accepted" | "Rejected" | "Overridden"; by?: User; at?: string; note?: string };
  actual?: { excavationDays?: number; jcbCount?: number; totalDays?: number; note?: string; recordedBy?: User; at?: string };
  prediction?: { _id: string; status: PredictionStatus; confidence?: number };
  plan?: { created?: number; existing?: number; removed?: number; kept?: number; replanned?: boolean; days?: number };
  weather?: GeotechWeather | null;
  weatherUpload?: {
    file?: { originalName: string; url: string; mimetype: string; size: number };
    status?: "Read" | "Not read";
    reason?: string;
    title?: string | null;
    location?: string | null;
    days?: WeatherDay[];
    at?: string;
  } | null;
  createdAt: string;
}

export interface GeotechLearning {
  observations: number;
  siteFactor: number;
  rates: Record<SoilClass, GeotechLearnedRate>;
  scheduleFactor: number;
  scheduleObservations: number;
  priorWeight: number;
}

export interface GeotechList {
  reports: GeotechReport[];
  learning: GeotechLearning;
  ai: { configured: boolean; quota?: { blocked: boolean; retryAt?: string; retryInSec?: number } };
}

// ---------- Plinth plan (site checklist after an estimate is accepted) ----------
export interface PlinthItem {
  _id: string;
  text: string;
  done: boolean;
  source: "plan" | "added";
  doneAt?: string;
}

export interface PlinthDay {
  _id: string;
  report: string;
  project: string;
  day: number;
  date: string;
  phaseKey: string;
  phaseName: string;
  dayInPhase: number;
  phaseDays: number;
  title: string;
  weather?: { kind: WeatherKind; rainMm?: number; note?: string };
  planned?: { quantity: number; unit: string; label?: string };
  crew: { trade: string; count: number }[];
  machines: { name: string; count: number; kind: "machine" | "vehicle" }[];
  items: PlinthItem[];
  actualQuantity?: number;
  note?: string;
  status: "Pending" | "In Progress" | "Done";
  completedAt?: string;
}

export interface PlinthPlan {
  report: { _id: string; title: string; project?: { _id: string; name: string; code: string }; plinthAreaSqm?: number; acceptedBy?: string; acceptedAt?: string };
  start: string;
  end: string;
  summary: { totalDays: number; doneDays: number; behindDays: number; items: number; itemsDone: number; percent: number; todayDay: number | null };
  days: PlinthDay[];
}

// ---------- MS Project schedule ----------
export type ScheduleTaskStatus = "Completed" | "In Progress" | "Overdue" | "Not Started";
export interface ScheduleTask {
  uid: number;
  wbs: string | null;
  level: number;
  parentUid: number | null;
  name: string;
  summary: boolean;
  milestone: boolean;
  critical: boolean;
  start: string | null;
  finish: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  durationDays: number | null;
  baselineDurationDays: number | null;
  percent: number;
  totalSlackDays: number | null;
  predecessors: { uid: number; type: string; lagDays: number }[];
  resources: string[];
  path: string[];
  finishVarianceDays: number | null;
  startVarianceDays: number | null;
  status: ScheduleTaskStatus;
  materials?: ScheduleMaterial[];
  cost?: number | null;
  baselineCost?: number | null;
  actualCost?: number | null;
  remainingCost?: number | null;
  actualDurationDays?: number | null;
  remainingDurationDays?: number | null;
  freeSlackDays?: number | null;
  earlyStart?: string | null;
  earlyFinish?: string | null;
  lateStart?: string | null;
  lateFinish?: string | null;
  plannedPercent?: number | null;
  constraint?: { type: string; date: string | null } | null;
  note?: string | null;
}
export interface ScheduleMaterial {
  name: string; unit: string | null; quantity: number; actualQuantity: number; remainingQuantity: number;
  cost: number | null; actualCost: number | null; perDay?: number; tasks?: number;
}
export interface ScheduleSummary {
  tasks: number; workTasks: number; summaries: number; milestones: number; critical: number;
  completed: number; inProgress: number; overdue: number; notStarted: number; percent: number;
  start: string | null; finish: string | null; baselineFinish: string | null; delayDays: number | null;
  startingThisWeek: number; resources: string[];
  materials?: ScheduleMaterial[]; cost?: number | null; baselineCost?: number | null; actualCost?: number | null;
  remainingCost?: number | null; behindPlan?: number;
}
export interface ScheduleImport {
  _id: string;
  project: string;
  uploadedBy?: User;
  file: { originalName: string; url: string; size: number };
  format: "mpp" | "xlsx";
  title: string | null;
  sheet?: string;
  statusDate: string | null;
  author: string | null;
  application: string | null;
  workDaysPerWeek: number;
  summary: ScheduleSummary;
  tasks?: ScheduleTask[];
  createdAt: string;
}
export interface DayTask {
  uid: number; wbs: string | null; name: string; path: string[]; start: string; finish: string;
  baselineStart: string | null; baselineFinish: string | null; actualStart: string | null;
  durationDays: number | null; percent: number; status: ScheduleTaskStatus; critical: boolean; milestone: boolean;
  finishVarianceDays: number | null; resources: string[];
  predecessors: { uid: number; type: string; lagDays: number; name: string | null; status: ScheduleTaskStatus | null }[];
  dayNo: number | null; totalDays: number; expectedPercent: number | null; isStart: boolean; isFinish: boolean; daysLate?: number;
  materials: ScheduleMaterial[]; remainingDurationDays: number | null; totalSlackDays: number | null; note: string | null;
  cost: number | null; actualCost: number | null; constraint: { type: string; date: string | null } | null;
}
export interface DayTasks {
  import: Omit<ScheduleImport, "tasks"> | null;
  from: string;
  days: { date: string; workDay: boolean; tasks: DayTask[]; starting: number; finishing: number }[];
  overdue: DayTask[];
  workDaysPerWeek: number;
}
