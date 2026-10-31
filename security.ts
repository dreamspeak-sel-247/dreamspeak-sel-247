import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { recordRequest } from '../services/metricsService';

export const apiRateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS_PER_WINDOW || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message:
      'Hiệp sĩ Tự vấn đang nhận quá nhiều câu hỏi cùng lúc từ phiên của em. Em hãy nghỉ ngơi vài giây rồi gửi lại nhé!'
  }
});

export function requestAuditMiddleware(req: Request, _res: Response, next: NextFunction): void {
  recordRequest();
  next();
}

const HARMFUL_EXPLOIT_PATTERNS = [
  /chế\s*tạo\s*(bom|vũ\s*khí|thuốc\s*nổ|ma\s*túy)/i,
  /hướng\s*dẫn\s*(hack|lừa\s*đảo|đánh\s*bạc|cá\s*độ)/i
];

export function validateStudentInput(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { message } = req.body || {};
  const maxLen = Number(process.env.MAX_QUESTION_LENGTH || 4000);

  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({
      success: false,
      error: 'EMPTY_MESSAGE',
      message: 'Em vui lòng nhập câu hỏi, công thức toán học hoặc nội dung cần Hiệp sĩ Tự vấn hỗ trợ nhé!'
    });
    return;
  }

  if (message.length > maxLen) {
    res.status(400).json({
      success: false,
      error: 'MESSAGE_TOO_LONG',
      message: `Câu hỏi vượt quá độ dài cho phép (${maxLen} ký tự). Em hãy rút gọn hoặc chia thành từng câu hỏi nhỏ nhé!`
    });
    return;
  }

  for (const pattern of HARMFUL_EXPLOIT_PATTERNS) {
    if (pattern.test(message)) {
      res.status(200).json({
        success: true,
        reply:
          '🛡️ **Hiệp sĩ Tự vấn – Nguyên tắc An toàn Học đường:**\n\nMình không thể cung cấp hướng dẫn về các hành vi nguy hiểm, vi phạm pháp luật hoặc gây hại cho bản thân và cộng đồng. Nếu em đang tìm hiểu kiến thức Hóa học, Vật lí, Tin học hoặc Pháp luật trong chương trình phổ thông, em hãy đặt câu hỏi theo nội dung bài học trong Sách giáo khoa để mình cùng khám phá an toàn nhé!',
        messageId: `safe_${Date.now()}`,
        timestamp: new Date().toISOString(),
        metadata: {
          provider: 'DREAMSPEAK-SEL Safety Shield',
          model: 'child-safety-guardrail-v2',
          detectedCategory: 'sel-counseling',
          activeSelPillar: 'chon-dung',
          selPillarName: 'CHỌN ĐÚNG',
          pedagogyMode: 'socratic',
          grade: req.body.grade || 'THCS & THPT',
          subject: req.body.subject || 'An toàn học đường',
          isCrisisAlert: false,
          latencyMs: 5,
          estimatedTokens: 50,
          suggestedFollowUps: [
            'Làm sao để nhận biết và phòng tránh lừa đảo trên không gian mạng?',
            'Nguyên tắc an toàn trong phòng thí nghiệm Khoa học tự nhiên là gì?'
          ]
        }
      });
      return;
    }
  }

  next();
}
