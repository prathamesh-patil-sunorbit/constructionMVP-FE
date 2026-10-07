import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  hint: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

const item = (href: string, label: string, hint: string): NavItem => ({ href, label, hint });

const today = (label = "Today's Plan") => item("/today", label, "Today + next 5 days");
const dashboard = item("/dashboard", "Dashboard", "Status, risks, delays");
const projects = (label = "Projects") => item("/projects", label, "Tower → Floor → Activity");
const blockers = (label = "Blockers") => item("/blockers", label, "What is stopping work");
const risks = item("/risks", "Risks & Escalations", "Early warnings to act on");
const notifications = item("/notifications", "Notifications", "Alerts for you");
const teams = item("/integrations", "Teams & Data Sources", "Colab sync, teams");
const aiInsights = item("/ai", "AI Intelligence", "Forecast, delays, resources");
const copilot = item("/copilot", "Copilot", "Ask about the project");
const model3d = item("/model", "3D / 4D Model", "Building + timeline");
const planCheck = item("/plans", "Drawing Check", "City Life plan set");
const reports = item("/reports", "AI Reports", "Daily / weekly / health");
const geotech = item("/geotech", "Plinth Estimate", "Geotech report → JCBs, days");
const plinthPlan = item("/plinth-plan", "Plinth Plan", "Day-by-day site checklist");
const siteReports = item("/site-reports", "Site Reports", "Daily site DPR");
const auditTrail = item("/audit", "Audit Trail", "Who changed what");
const admin = item("/admin", "Users & Rules", "Users, roles, thresholds");

// Sidebar per role: each role only sees the screens it works with.
export const NAV_BY_ROLE: Record<Role, NavSection[]> = {
  site_engineer: [
    { title: "My work", items: [today("My Day"), plinthPlan, siteReports, blockers("My Blockers"), notifications] },
    { title: "Site", items: [projects("Project Activities"), aiInsights, model3d, planCheck] },
  ],
  site_manager: [
    { title: "Monitor", items: [dashboard, today("Site Plan"), risks, notifications] },
    { title: "Intelligence", items: [aiInsights, copilot, geotech, model3d, planCheck, reports] },
    { title: "Manage", items: [blockers(), projects("Projects & Planning"), plinthPlan, siteReports] },
    { title: "Records", items: [teams, auditTrail] },
  ],
  project_manager: [
    { title: "Monitor", items: [dashboard, risks, notifications] },
    { title: "Intelligence", items: [aiInsights, copilot, geotech, model3d, planCheck, reports] },
    { title: "Plan", items: [projects("Projects & Planning"), teams] },
    { title: "Site", items: [today("Site Plan"), plinthPlan, blockers(), siteReports] },
    { title: "Records", items: [auditTrail] },
  ],
  planning_engineer: [
    { title: "Overview", items: [dashboard, projects("Schedule & Projects"), notifications] },
    { title: "Intelligence", items: [aiInsights, copilot, geotech, model3d, planCheck, reports] },
    { title: "Planning data", items: [teams] },
  ],
  estimation_engineer: [
    { title: "Overview", items: [dashboard, projects("Projects & Estimates"), notifications] },
    { title: "Intelligence", items: [aiInsights, geotech, planCheck, reports] },
    { title: "Estimation data", items: [teams] },
  ],
  admin: [
    { title: "Overview", items: [dashboard, projects(), notifications] },
    { title: "Intelligence", items: [aiInsights, copilot, geotech, model3d, planCheck, reports] },
    { title: "Setup", items: [admin, teams] },
    { title: "Records", items: [risks, blockers(), plinthPlan, siteReports, auditTrail] },
  ],
};

export function navFor(role: Role) {
  return NAV_BY_ROLE[role] ?? [];
}

// Pages reachable from inside other pages (e.g. activity drill-down) rather than the sidebar.
const ALWAYS_ALLOWED = ["/activities"];

export function canAccess(role: Role, pathname: string) {
  if (ALWAYS_ALLOWED.some((p) => pathname.startsWith(p))) return true;
  return navFor(role).some((s) => s.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)));
}
