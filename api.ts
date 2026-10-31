import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import {
  getAiServiceStatus,
  processStudentChat,
  setAndVerifyGeminiApiKey
} from '../services/aiService';
import {
  getAggregatedMetrics,
  getBudgetStatus,
  recordError,
  recordFeedback,
  trackSessionActivity
} from '../services/metricsService';
import { REAL_WORLD_SCENARIOS, SEL_PILLARS } from '../config/selKnowledgeBase';
import { validateStudentInput } from '../middleware/security';

export const apiRouter = Router();

let currentPublicTunnelUrl = process.env.PUBLIC_APP_URL || '';

export function setPublicTunnelUrl(url: string): void {
  if (url && url.startsWith('http')) {
    currentPublicTunnelUrl = url.trim();
  }
}

export function getPublicAppUrl(req?: Request): string {
  if (currentPublicTunnelUrl && !currentPublicTunnelUrl.includes('dreamspeak-sel.web.app')) {
    return currentPublicTunnelUrl;
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:8080';
    return `${proto}://${host}`;
  }
  return currentPublicTunnelUrl || 'http://localhost:8080';
}

// 1. GET /api/health - Kiểm tra tình trạng máy chủ
apiRouter.get('/health', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'healthy',
    service: 'DREAMSPEAK-SEL – HIỆP SĨ TỰ VẤN 24/7 Backend',
    version: '2.4.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memoryMb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024)
    }
  });
});

// 2. GET /api/status - Kiểm tra trạng thái dịch vụ AI
apiRouter.get('/status', (req: Request, res: Response) => {
  const aiStatus = getAiServiceStatus();
  const budget = getBudgetStatus();
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    ai: aiStatus,
    budgetGuard: budget,
    publicAccessUrl: getPublicAppUrl(req),
    anonymousAccessEnabled: true,
    loginRequired: false
  });
});

// 3. GET /api/config/public - Lấy cấu hình công khai không chứa bí mật
apiRouter.get('/config/public', async (req: Request, res: Response) => {
  const publicUrl = getPublicAppUrl(req);
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#1e1b4b', light: '#ffffff' }
    });
  } catch {
    // Ignore QR generation error
  }

  res.json({
    success: true,
    appName: 'DREAMSPEAK-SEL – HIỆP SĨ TỰ VẤN 24/7',
    subtitle: 'Trợ lý AI Giáo dục Sư phạm & Đồng hành Cảm xúc – Xã hội (SEL 5 CHẠM)',
    version: '2.4.0',
    publicUrl,
    qrDataUrl,
    loginRequired: false,
    grades: ['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9', 'Lớp 10', 'Lớp 11', 'Lớp 12'],
    subjects: [
      'Toán học',
      'Khoa học tự nhiên',
      'Vật lí',
      'Hóa học',
      'Sinh học',
      'Ngữ văn',
      'Tiếng Anh',
      'Tin học',
      'Lịch sử & Địa lí',
      'GDCD / GDKT&PL',
      'HĐTN - Hướng nghiệp',
      'Tư vấn Tâm lý & Kỹ năng SEL'
    ],
    selPillars: Object.values(SEL_PILLARS),
    scenarios: REAL_WORLD_SCENARIOS,
    limits: {
      maxQuestionLength: Number(process.env.MAX_QUESTION_LENGTH || 4000),
      maxImageSizeMb: Number(process.env.MAX_IMAGE_SIZE_MB || 8),
      dailySessionLimit: Number(process.env.DAILY_SESSION_MESSAGE_LIMIT || 150)
    }
  });
});

// 4. POST /api/chat - Gửi câu hỏi và nhận phản hồi AI (Hỗ trợ cả JSON và SSE Streaming)
apiRouter.post('/chat', validateStudentInput, async (req: Request, res: Response) => {
  try {
    const sessionId =
      (req.body.sessionId as string) ||
      (req.headers['x-session-id'] as string) ||
      req.ip ||
      'anon_session';

    const sessionCheck = trackSessionActivity(sessionId);
    if (!sessionCheck.allowed) {
      res.status(429).json({
        success: false,
        error: 'DAILY_SESSION_LIMIT_REACHED',
        message: `Phiên ẩn danh của em đã đạt giới hạn ${sessionCheck.limit} câu hỏi trong ngày để bảo vệ sức khỏe và mắt. Em hãy nghỉ ngơi và quay lại sau nhé!`
      });
      return;
    }

    const wantStream = req.query.stream === 'true' || req.body.stream === true;
    const result = await processStudentChat(req.body);

    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const words = result.reply.split(/(\s+)/);
      const chunkSize = 6;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join('');
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunkText })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done', response: result })}\n\n`);
      res.end();
      return;
    }

    res.json(result);
  } catch (err: any) {
    recordError('/api/chat', 'INTERNAL_ERROR', err?.message || 'Chat handler error');
    res.status(500).json({
      success: false,
      error: 'AI_SERVICE_TEMPORARILY_UNAVAILABLE',
      message:
        'Hệ thống AI đang bận xử lý nhiều câu hỏi cùng lúc. Em vui lòng bấm gửi lại sau vài giây nhé!'
    });
  }
});

// 5. POST /api/chat/image - Gửi câu hỏi kèm hình ảnh bài tập
apiRouter.post('/chat/image', async (req: Request, res: Response) => {
  try {
    const { imageBase64, imageMimeType, message } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({
        success: false,
        error: 'MISSING_IMAGE',
        message: 'Em vui lòng chọn hoặc chụp một hình ảnh bài tập trước khi gửi nhé!'
      });
      return;
    }

    const maxBytes = Number(process.env.MAX_IMAGE_SIZE_MB || 8) * 1024 * 1024 * 1.37;
    if (imageBase64.length > maxBytes) {
      res.status(413).json({
        success: false,
        error: 'IMAGE_TOO_LARGE',
        message: `Dung lượng ảnh vượt quá giới hạn ${process.env.MAX_IMAGE_SIZE_MB || 8}MB. Vui lòng chọn ảnh nhỏ hơn.`
      });
      return;
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (imageMimeType && !allowedMimes.includes(imageMimeType)) {
      res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_FORMAT',
        message: 'Định dạng ảnh không hợp lệ. Hệ thống chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.'
      });
      return;
    }

    const sessionId = (req.body.sessionId as string) || req.ip || 'anon_image_session';
    const sessionCheck = trackSessionActivity(sessionId);
    if (!sessionCheck.allowed) {
      res.status(429).json({
        success: false,
        error: 'DAILY_SESSION_LIMIT_REACHED',
        message: 'Phiên làm việc đã đạt giới hạn trong ngày.'
      });
      return;
    }

    const result = await processStudentChat({
      ...req.body,
      message:
        message && message.trim()
          ? message.trim()
          : 'Hãy đọc nội dung đề bài/công thức trong hình ảnh này và hướng dẫn em giải từng bước theo phương pháp gợi mở.'
    });

    res.json(result);
  } catch (err: any) {
    recordError('/api/chat/image', 'IMAGE_ANALYSIS_ERROR', err?.message || 'Image error');
    res.status(500).json({
      success: false,
      error: 'IMAGE_PROCESSING_FAILED',
      message: 'Không thể xử lý hình ảnh lúc này. Em vui lòng kiểm tra lại ảnh hoặc thử lại nhé!'
    });
  }
});

// 6. POST /api/feedback - Nhận đánh giá phản hồi về chất lượng câu trả lời
apiRouter.post('/feedback', (req: Request, res: Response) => {
  const { messageId, rating, comment, category, grade, subject } = req.body || {};
  if (!rating || !['positive', 'negative'].includes(rating)) {
    res.status(400).json({
      success: false,
      error: 'INVALID_RATING',
      message: 'Vui lòng chọn đánh giá tích cực (positive) hoặc cần cải thiện (negative).'
    });
    return;
  }

  const entry = {
    id: `fb_${Date.now()}`,
    messageId: String(messageId || 'unknown'),
    rating: rating as 'positive' | 'negative',
    comment: comment ? String(comment).slice(0, 500) : undefined,
    category: category ? String(category) : undefined,
    grade: grade ? String(grade) : undefined,
    subject: subject ? String(subject) : undefined,
    timestamp: new Date().toISOString()
  };

  recordFeedback(entry);

  res.json({
    success: true,
    message: 'Cảm ơn em đã gửi phản hồi giúp Hiệp sĩ Tự vấn ngày càng thông minh và tận tâm hơn!',
    feedbackId: entry.id
  });
});

// 7. GET /api/qrcode - Tạo mã QR truy cập nhanh
apiRouter.get('/qrcode', async (req: Request, res: Response) => {
  try {
    const targetUrl = (req.query.url as string) || getPublicAppUrl(req);
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      width: 360,
      margin: 2,
      color: { dark: '#1e1b4b', light: '#ffffff' }
    });
    res.json({
      success: true,
      url: targetUrl,
      qrDataUrl: dataUrl
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Không thể tạo mã QR.'
    });
  }
});

// 8. GET /api/admin/metrics - Thống kê tổng hợp cho Quản trị viên (Bảo vệ quyền riêng tư học sinh)
apiRouter.get('/admin/metrics', (req: Request, res: Response) => {
  const metrics = getAggregatedMetrics();
  const aiStatus = getAiServiceStatus();
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    publicUrl: getPublicAppUrl(req),
    aiStatus,
    metrics,
    privacyNotice:
      'Hệ thống tuân thủ nguyên tắc bảo vệ trẻ vị thành niên: Không lưu trữ họ tên, số điện thoại hay nội dung hội thoại cá nhân của học sinh.'
  });
});

// 9. POST /api/admin/config-key - Cấu hình khóa Google Gemini API bảo mật
apiRouter.post('/admin/config-key', async (req: Request, res: Response) => {
  const { apiKey, adminCode } = req.body || {};
  const expectedAdminCode = process.env.ADMIN_ACCESS_CODE || 'DREAMSPEAK2026';

  if (adminCode && adminCode !== expectedAdminCode) {
    res.status(403).json({
      success: false,
      message: 'Mã xác thực Quản trị viên không chính xác.'
    });
    return;
  }

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Vui lòng nhập khóa Google Gemini API.'
    });
    return;
  }

  const verification = await setAndVerifyGeminiApiKey(apiKey);
  res.status(verification.valid ? 200 : 400).json({
    success: verification.valid,
    modelTested: verification.modelTested,
    message: verification.message,
    aiStatus: getAiServiceStatus()
  });
});
