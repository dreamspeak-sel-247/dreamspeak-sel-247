import fs from 'fs';
import path from 'path';
import { FeedbackEntry, SelPillarId, SystemMetrics } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const activeSessions = new Map<string, { lastSeen: number; messageCount: number }>();

const defaultMetrics: SystemMetrics = {
  startTime: new Date().toISOString(),
  totalRequests: 0,
  totalChatMessages: 0,
  totalImageAnalyses: 0,
  totalMathFormulasProcessed: 0,
  totalFeedbackReceived: 0,
  positiveFeedbackCount: 0,
  negativeFeedbackCount: 0,
  estimatedTotalTokens: 0,
  dailyTokenBudget: Number(process.env.DAILY_GLOBAL_TOKEN_BUDGET || 2000000),
  activeAnonymousSessions: 0,
  crisisInterventionsTriggered: 0,
  selPillarDistribution: {
    'cham-minh': 0,
    'dieu-hoa': 0,
    'hieu-ban': 0,
    'cung-lam': 0,
    'chon-dung': 0,
    general: 0
  },
  subjectDistribution: {},
  gradeDistribution: {},
  recentErrors: []
};

let metrics: SystemMetrics = { ...defaultMetrics };

try {
  if (fs.existsSync(METRICS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
    metrics = { ...defaultMetrics, ...saved, startTime: defaultMetrics.startTime };
  }
} catch {
  // Ignore corrupted metrics file and start fresh
}

function saveMetricsSync(): void {
  try {
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2), 'utf-8');
  } catch {
    // Non-blocking metrics save
  }
}

export function trackSessionActivity(sessionId: string): { allowed: boolean; count: number; limit: number } {
  const now = Date.now();
  const limit = Number(process.env.DAILY_SESSION_MESSAGE_LIMIT || 150);

  // Clean up sessions inactive for > 24 hours
  for (const [id, data] of activeSessions.entries()) {
    if (now - data.lastSeen > 24 * 60 * 60 * 1000) {
      activeSessions.delete(id);
    }
  }

  const current = activeSessions.get(sessionId) || { lastSeen: now, messageCount: 0 };
  current.lastSeen = now;
  current.messageCount += 1;
  activeSessions.set(sessionId, current);
  metrics.activeAnonymousSessions = activeSessions.size;

  return {
    allowed: current.messageCount <= limit,
    count: current.messageCount,
    limit
  };
}

export function recordRequest(): void {
  metrics.totalRequests += 1;
}

export function recordChatSuccess(params: {
  selPillar: SelPillarId;
  subject: string;
  grade: string;
  hasImage: boolean;
  hasMath: boolean;
  estimatedTokens: number;
  isCrisis: boolean;
}): void {
  metrics.totalChatMessages += 1;
  if (params.hasImage) metrics.totalImageAnalyses += 1;
  if (params.hasMath) metrics.totalMathFormulasProcessed += 1;
  if (params.isCrisis) metrics.crisisInterventionsTriggered += 1;

  metrics.estimatedTotalTokens += params.estimatedTokens;
  metrics.selPillarDistribution[params.selPillar] =
    (metrics.selPillarDistribution[params.selPillar] || 0) + 1;
  metrics.subjectDistribution[params.subject] =
    (metrics.subjectDistribution[params.subject] || 0) + 1;
  metrics.gradeDistribution[params.grade] =
    (metrics.gradeDistribution[params.grade] || 0) + 1;

  saveMetricsSync();
}

export function recordError(endpoint: string, errorType: string, message: string): void {
  metrics.recentErrors.unshift({
    timestamp: new Date().toISOString(),
    endpoint,
    errorType,
    message: message.slice(0, 250)
  });
  if (metrics.recentErrors.length > 30) {
    metrics.recentErrors = metrics.recentErrors.slice(0, 30);
  }
  saveMetricsSync();
}

export function recordFeedback(entry: FeedbackEntry): void {
  metrics.totalFeedbackReceived += 1;
  if (entry.rating === 'positive') {
    metrics.positiveFeedbackCount += 1;
  } else {
    metrics.negativeFeedbackCount += 1;
  }
  saveMetricsSync();

  try {
    let list: FeedbackEntry[] = [];
    if (fs.existsSync(FEEDBACK_FILE)) {
      list = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
    }
    list.unshift(entry);
    if (list.length > 200) list = list.slice(0, 200);
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch {
    // Non-blocking feedback storage
  }
}

export function getBudgetStatus(): {
  usedTokens: number;
  budgetTokens: number;
  usagePercent: number;
  isWarning: boolean;
  isExceeded: boolean;
} {
  const budgetTokens = Number(process.env.DAILY_GLOBAL_TOKEN_BUDGET || 2000000);
  const warningThreshold = Number(process.env.BUDGET_WARNING_THRESHOLD_PERCENT || 80);
  const usedTokens = metrics.estimatedTotalTokens;
  const usagePercent = Math.min(100, Math.round((usedTokens / budgetTokens) * 1000) / 10);

  return {
    usedTokens,
    budgetTokens,
    usagePercent,
    isWarning: usagePercent >= warningThreshold,
    isExceeded: usedTokens >= budgetTokens
  };
}

export function getAggregatedMetrics(): SystemMetrics & {
  uptimeSeconds: number;
  budgetStatus: ReturnType<typeof getBudgetStatus>;
} {
  return {
    ...metrics,
    activeAnonymousSessions: activeSessions.size,
    uptimeSeconds: Math.floor(process.uptime()),
    budgetStatus: getBudgetStatus()
  };
}
