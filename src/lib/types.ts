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
  dimensions: { plateWidthM: number; plateDepthM: number; floorHeightM: number; towers: number; detailedFloors: number; totalHeightM: number };
  towers: { id: string; name: string; floors: { id: string; name: string; storey: number | null }[] }[];
  components: {
    id: string; type: string; category: string; tower: string; floorName: string | null; floorIndex: number;
    position: [number, number, number]; size: [number, number, number];
    label: string; activityIds: string[]; side?: string; subtype?: string;
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
