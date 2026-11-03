/**
 * DreamSpeak-SEL: Tuyến Điều Phối Chat & Hình Ảnh (/api/chat, /api/chat/image)
 * Hỗ trợ Streaming qua Server-Sent Events (SSE) và Nhận diện Hình ảnh Multimodal
 */

const geminiService = require('../services/geminiService');
const { getSystemPrompt, aiConfig } = require('../config/aiConfig');
const {
  checkRateLimit,
  detectPII,
  checkCrisis,
  getCrisisResponse,
  sendJsonError
} = require('../middleware/errorHandler');

/**
 * Xử lý POST /api/chat
 */
async function handleChat(req, res, clientIp, sessionId) {
  // 1. Kiểm tra giới hạn tốc độ (Rate Limit)
  const rateKey = sessionId || clientIp;
  const rateCheck = checkRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return sendJsonError(
      res,
      429,
      'RATE_LIMIT_EXCEEDED',
      `Bạn đang gửi tin nhắn quá nhanh. Vui lòng dừng lại hít thở sâu và thử lại sau ${rateCheck.retryAfter} giây.`,
      { retryAfter: rateCheck.retryAfter }
    );
  }

  // 2. Thu thập dữ liệu JSON từ request body
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk;
    if (rawBody.length > 65536) { // 64KB
      sendJsonError(res, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung tin nhắn vượt quá dung lượng cho phép.');
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(rawBody || '{}');
      const message = String(payload.message || '').trim();
      const mode = String(payload.mode || 'study');
      const grade = String(payload.grade || '7');
      const subject = String(payload.subject || '');
      const history = Array.isArray(payload.history) ? payload.history : [];
      const isStreaming = Boolean(payload.stream);

      // 3. Xác thực đầu vào
      if (!message) {
        return sendJsonError(res, 400, 'EMPTY_MESSAGE', 'Nội dung câu hỏi không được để trống.');
      }

      if (message.length > 2000) {
        return sendJsonError(res, 400, 'MESSAGE_TOO_LONG', 'Câu hỏi quá dài (tối đa 2000 ký tự). Hãy chia nhỏ câu hỏi nhé!');
      }

      // 4. Kiểm tra PII (Thông tin cá nhân)
      const detectedPII = detectPII(message);
      let piiWarningHtml = '';
      if (detectedPII.length > 0) {
        piiWarningHtml = `
          <div style="margin-bottom:12px; font-size:0.82rem; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:8px 12px;">
            ⚠️ <strong>Nhắc nhở an toàn thông tin:</strong> Hiệp Sĩ nhận thấy tin nhắn có chứa <em>${detectedPII.join(', ')}</em>. Vì sự an toàn của chính bạn, xin đừng chia sẻ số điện thoại, mật khẩu hoặc thông tin cá nhân lên mạng nhé!
          </div>
        `;
      }

      // 5. Kiểm tra Khủng hoảng tâm lý (Crisis Interception)
      if (checkCrisis(message)) {
        const crisisHtml = getCrisisResponse();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          response: crisisHtml,
          isCrisis: true,
          provider: 'crisis-protocol',
          piiWarning: piiWarningHtml
        }));
      }

      // 6. Xử lý phản hồi từ Gemini hoặc Local Socratic Engine
      const systemPrompt = getSystemPrompt(mode, grade);

      // Chế độ STREAMING (SSE)
      if (isStreaming) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        if (piiWarningHtml) {
          res.write(`data: ${JSON.stringify({ delta: piiWarningHtml })}\n\n`);
        }

        if (geminiService.isConfigured()) {
          try {
            await geminiService.streamGenerateContent(
              systemPrompt,
              message,
              history,
              [],
              (delta) => {
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
              }
            );
            res.write(`data: [DONE]\n\n`);
            return res.end();
          } catch (err) {
            console.warn('[Stream Fallback] Lỗi stream Gemini:', err.message);
            const fallbackText = geminiService.generateLocalSocraticResponse(message, mode, grade, subject);
            res.write(`data: ${JSON.stringify({ delta: fallbackText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          }
        } else {
          // Chưa cấu hình key: Fallback mượt mà
          const fallbackText = geminiService.generateLocalSocraticResponse(message, mode, grade, subject);
          // Gửi mô phỏng chunk mượt mà
          res.write(`data: ${JSON.stringify({ delta: fallbackText })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // Chế độ NON-STREAMING (JSON chuẩn)
      let replyText = '';
      let provider = 'gemini';

      if (geminiService.isConfigured()) {
        try {
          replyText = await geminiService.generateContent(systemPrompt, message, history);
          provider = 'gemini';
        } catch (err) {
          console.warn('[API Fallback] Gemini thất bại, kích hoạt Local Socratic:', err.message);
          replyText = geminiService.generateLocalSocraticResponse(message, mode, grade, subject);
          provider = 'socratic-fallback';
        }
      } else {
        replyText = geminiService.generateLocalSocraticResponse(message, mode, grade, subject);
        provider = 'socratic-offline';
      }

      if (piiWarningHtml) {
        replyText = piiWarningHtml + replyText;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        response: replyText,
        reply: replyText,
        provider,
        mode,
        model: provider === 'gemini' ? geminiService.model : 'socratic-engine'
      }));

    } catch (err) {
      console.error('[Chat Handler Error]:', err);
      sendJsonError(res, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi máy chủ trong chốc lát. Hiệp Sĩ sẽ sẵn sàng lại ngay!');
    }
  });
}

/**
 * Xử lý POST /api/chat/image (Phân tích hình ảnh bài tập - Multimodal Vision)
 */
async function handleChatImage(req, res, clientIp, sessionId) {
  // 1. Kiểm tra Rate Limit
  const rateKey = sessionId || clientIp;
  const rateCheck = checkRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return sendJsonError(
      res,
      429,
      'RATE_LIMIT_EXCEEDED',
      `Bạn đang tải ảnh quá thường xuyên. Vui lòng thử lại sau ${rateCheck.retryAfter} giây.`,
      { retryAfter: rateCheck.retryAfter }
    );
  }

  // 2. Đọc payload (cho phép tới 6MB cho ảnh Base64)
  let rawBody = '';
  req.on('data', chunk => {
    rawBody += chunk;
    if (rawBody.length > 7 * 1024 * 1024) { // 7MB
      sendJsonError(res, 413, 'FILE_TOO_LARGE', 'Ảnh vượt quá dung lượng tối đa 5MB.');
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(rawBody || '{}');
      const { imageBase64, mimeType, message, mode, grade, history } = payload;

      if (!imageBase64) {
        return sendJsonError(res, 400, 'NO_IMAGE', 'Chưa có dữ liệu hình ảnh được gửi lên.');
      }

      const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validMimes.includes(mimeType)) {
        return sendJsonError(res, 400, 'INVALID_MIME', 'Định dạng ảnh không được hỗ trợ. Vui lòng dùng JPG, PNG hoặc WEBP.');
      }

      // Làm sạch Base64 nếu có data URL prefix
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      const systemPrompt = getSystemPrompt(mode || 'study', grade || '7') + `
\n[NHIỆM VỤ ĐẶC BIỆT KHI XEM ẢNH BÀI TẬP]:
- Bạn đang phân tích một hình ảnh bài tập do học sinh THCS tải lên (có thể là hình vẽ hình học, đồ thị hàm số, biểu đồ, bảng số liệu, hoặc chữ viết tay).
- Hãy đọc kỹ văn bản, các số liệu và ký hiệu trong ảnh.
- Nêu rõ đề bài trong ảnh đang yêu cầu điều gì.
- KHÔNG GIẢI TOÀN BỘ BÀI TẬP NGAY LẬP TỨC!
- Hãy trích xuất dữ kiện từ ảnh, gợi ý công thức và đặt 1 câu hỏi gợi mở để học sinh tự làm bước đầu tiên.
`;

      const inlineImages = [{
        mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
        base64Data: cleanBase64
      }];

      let replyText = '';
      let provider = 'gemini-vision';

      if (geminiService.isConfigured()) {
        try {
          replyText = await geminiService.generateContent(
            systemPrompt,
            message || "Xin Hiệp Sĩ đọc ảnh bài tập này và gợi mở phương pháp giải từng bước cho em!",
            history || [],
            inlineImages
          );
          provider = 'gemini-vision';
        } catch (err) {
          console.warn('[Vision Fallback]:', err.message);
          replyText = `
            <div class="socratic-problem-badge">
              <span class="badge-type">📷 Phân Tích Đề Bài Qua Ảnh</span>
              <span class="badge-target">Phương pháp Socratic</span>
            </div>
            <div class="socratic-stage-card info">
              <div class="socratic-stage-title">🖼️ Đã tiếp nhận hình ảnh bài tập</div>
              <p>Hiệp Sĩ đã nhận được ảnh bài tập của bạn! Trong lúc kết nối AI thị giác đang bận, bạn hãy thử kiểm tra:</p>
              <p>1. Bài toán này thuộc dạng nào (Hình học, Đại số, hay KHTN)?</p>
              <p>2. Các số đo độ dài, góc, hoặc đại lượng đã biết trong hình là bao nhiêu?</p>
            </div>
            <div class="socratic-stage-card highlight">
              <div class="socratic-stage-title">⚔️ Bạn hãy gõ lại dữ kiện cho Hiệp Sĩ:</div>
              <p>Hãy gõ vào ô chat: <em>"Đề bài cho biết... và yêu cầu tính..."</em> để Hiệp Sĩ hướng dẫn bạn từng bước ngay nhé!</p>
            </div>
          `;
          provider = 'socratic-fallback';
        }
      } else {
        replyText = `
          <div class="socratic-problem-badge">
            <span class="badge-type">📷 Tiếp Nhận Đề Bài Qua Ảnh</span>
            <span class="badge-target">Chế độ Socratic Nội Bộ</span>
          </div>
          <div class="socratic-stage-card info">
            <div class="socratic-stage-title">📌 Hướng dẫn tự phân tích ảnh đề bài:</div>
            <p>Hiệp Sĩ đã nhận được ảnh bài tập của bạn. Để tìm ra cách giải nhanh nhất:</p>
            <p>1. Hãy quan sát hình vẽ và đọc kỹ câu hỏi cuối cùng của đề bài.</p>
            <p>2. Viết ra nháp các công thức định lý liên quan.</p>
          </div>
          <div class="socratic-stage-card highlight">
            <div class="socratic-stage-title">⚔️ Thử thách dành cho bạn:</div>
            <p>Hãy gõ vào khung chat số liệu bài toán hoặc câu hỏi cụ thể, Hiệp Sĩ sẽ đồng hành cùng bạn tìm lời giải!</p>
          </div>
        `;
        provider = 'socratic-offline';
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        response: replyText,
        provider,
        model: provider === 'gemini-vision' ? geminiService.model : 'socratic-engine'
      }));

    } catch (err) {
      console.error('[Image Handler Error]:', err);
      sendJsonError(res, 500, 'IMAGE_PROCESS_ERROR', 'Không thể xử lý hình ảnh. Vui lòng kiểm tra lại định dạng tệp.');
    }
  });
}

module.exports = {
  handleChat,
  handleChatImage
};
