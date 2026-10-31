export type SelPillarId =
  | 'cham-minh'
  | 'dieu-hoa'
  | 'hieu-ban'
  | 'cung-lam'
  | 'chon-dung'
  | 'general';

export type QuestionCategory =
  | 'knowledge'       // Câu hỏi kiến thức phổ thông
  | 'exercise'        // Bài tập / Yêu cầu giải bài
  | 'study-skills'    // Tư vấn kỹ năng học tập / Quản lý thời gian
  | 'sel-counseling'  // Tâm sự / Tư vấn cảm xúc - xã hội 5 CHẠM
  | 'crisis';         // Tình huống nguy cơ cần hỗ trợ khẩn cấp

export type PedagogyMode =
  | 'socratic'        // Gợi mở từng bước (Mặc định theo chuẩn sư phạm)
  | 'simplified'      // Diễn giải đơn giản hơn kèm ví dụ trực quan
  | 'verify-solution';// Đối chiếu lời giải chi tiết sau khi học sinh đã suy nghĩ

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  hasImage?: boolean;
  latexFormulas?: string[];
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  grade?: string;            // Lớp 6 -> Lớp 12
  subject?: string;          // Toán, KHTN, Vật lí, Hóa học, Sinh học, Tin học, Ngữ văn, Tiếng Anh, SEL...
  selPillar?: SelPillarId;   // 1 trong 5 nội dung CHẠM
  pedagogyMode?: PedagogyMode;
  scenarioId?: string;       // Tình huống thực tế
  history?: ChatTurn[];
  latexFormula?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ChatResponse {
  success: boolean;
  reply: string;
  messageId: string;
  timestamp: string;
  metadata: {
    provider: string;
    model: string;
    detectedCategory: QuestionCategory;
    activeSelPillar: SelPillarId;
    selPillarName: string;
    pedagogyMode: PedagogyMode;
    grade: string;
    subject: string;
    isCrisisAlert: boolean;
    latencyMs: number;
    estimatedTokens: number;
    suggestedFollowUps: string[];
    extractedImageText?: string;
  };
}

export interface FeedbackEntry {
  id: string;
  messageId: string;
  rating: 'positive' | 'negative';
  comment?: string;
  category?: string;
  grade?: string;
  subject?: string;
  timestamp: string;
}

export interface SystemMetrics {
  startTime: string;
  totalRequests: number;
  totalChatMessages: number;
  totalImageAnalyses: number;
  totalMathFormulasProcessed: number;
  totalFeedbackReceived: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  estimatedTotalTokens: number;
  dailyTokenBudget: number;
  activeAnonymousSessions: number;
  crisisInterventionsTriggered: number;
  selPillarDistribution: Record<SelPillarId, number>;
  subjectDistribution: Record<string, number>;
  gradeDistribution: Record<string, number>;
  recentErrors: Array<{
    timestamp: string;
    endpoint: string;
    errorType: string;
    message: string;
  }>;
}
