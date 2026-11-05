/**
 * DreamSpeak-SEL: Middleware Xử Lý Lỗi, Giới Hạn Tốc Độ & An Toàn Học Đường
 */

const { aiConfig } = require('../config/aiConfig');

// 1. RATE LIMITING (THEO IP VÀ SESSION)
const clientRequestMap = new Map();

function checkRateLimit(clientId) {
  const now = Date.now();
  let records = clientRequestMap.get(clientId);
  if (!records) {
    records = [];
    clientRequestMap.set(clientId, records);
  }

  // Lọc các request trong cửa sổ rate limit (1 phút)
  records = records.filter(t => now - t < aiConfig.rateLimitWindowMs);
  clientRequestMap.set(clientId, records);

  if (records.length >= aiConfig.rateLimitMax) {
    const oldest = records[0];
    const retryAfter = Math.ceil((aiConfig.rateLimitWindowMs - (now - oldest)) / 1000);
    return { allowed: false, retryAfter };
  }

  records.push(now);
  return { allowed: true, remaining: aiConfig.rateLimitMax - records.length };
}

// Định kỳ dọn dẹp map mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [key, records] of clientRequestMap.entries()) {
    const fresh = records.filter(t => now - t < aiConfig.rateLimitWindowMs);
    if (fresh.length === 0) {
      clientRequestMap.delete(key);
    } else {
      clientRequestMap.set(key, fresh);
    }
  }
}, 5 * 60 * 1000);

// 2. PHÁT HIỆN THÔNG TIN ĐỊNH DANH CÁ NHÂN (PII PROTECTION)
const PII_PATTERNS = [
  { name: 'Số điện thoại', regex: /(?:0|\+84)[35789][0-9]{8}\b/g },
  // Chỉ cảnh báo số 12 chữ số, hoặc số 9 chữ số đi kèm chữ "CMND/CCCD/căn cước"
  // (trước đây mọi số 9 chữ số, kể cả số trong bài toán, đều bị cảnh báo nhầm là CMND)
  { name: 'Số CCCD/CMND', regex: /\b\d{12}\b|(?:cmnd|cccd|căn cước|chứng minh)[^\d]{0,20}\d{9}\b/gi },
  { name: 'Mật khẩu tài khoản', regex: /(mật khẩu|mat khau|password|pass)\s*[:=]\s*\S+/gi }
];

function detectPII(text) {
  const detected = [];
  if (!text || typeof text !== 'string') return detected;
  for (const p of PII_PATTERNS) {
    if (p.regex.test(text)) {
      detected.push(p.name);
      p.regex.lastIndex = 0;
    }
  }
  return detected;
}

// 3. BỘ LỌC KHỦNG HOẢNG TÂM LÝ & BẠO LỰC HỌC ĐƯỜNG (CRISIS PROTOCOL)
const CRISIS_KEYWORDS = [
  "muốn chết", "tự tử", "chán sống", "rạch tay", "tự hại", "tuyệt vọng",
  "không muốn sống", "muốn biến mất", "chết đi cho xong", "bị đánh đập",
  "bạo lực gia đình", "bị xâm hại", "uống thuốc sâu", "nhảy cầu", "kết thúc cuộc đời",
  "không ai cần tôi", "bế tắc cùng cực", "tủi nhục muốn chết", "bị dọa đánh",
  "muốn tự tử", "tự sát", "bị làm nhục"
];

// Câu hỏi bài học (Văn học, GDCD...) hay nhắc từ khóa nhạy cảm: "Lão Hạc tự tử vì sao?", "Bạo lực gia đình là gì?"
// Những câu này cần được TRẢ LỜI như câu hỏi học tập, không phải bị chặn bằng mẫu khủng hoảng.
const ACADEMIC_HINT = /(lão hạc|nhân vật|tác phẩm|văn bản|truyện|bài thơ|tác giả|nhà văn|đoạn trích|phân tích|là gì|nghĩa là gì|khái niệm|biểu hiện|nguyên nhân|hậu quả|cách phòng|phòng chống|phòng tránh|trình bày|hãy nêu)/i;
// Học sinh nói về CHÍNH MÌNH (hoặc người thân quen) đang gặp nguy cơ → luôn giữ giao thức khẩn cấp
const PERSONAL_RISK = /\b(em|mình|tôi|tớ|con|tao)\b[^.?!\n]{0,30}(bị\s+(đánh|đập|xâm hại|làm nhục|dọa|bạo lực|bắt nạt)|(muốn|định|sắp)\s+(chết|tự tử|tự sát|tự hại|biến mất|kết thúc)|không muốn sống|chán sống|rạch tay|tuyệt vọng)|không muốn sống|chán sống|rạch tay/i;

function checkCrisis(text, mode) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  if ((mode === 'study' || mode === 'ai_safety') && ACADEMIC_HINT.test(lower) && !PERSONAL_RISK.test(lower)) {
    return false;
  }
  for (const kw of CRISIS_KEYWORDS) {
    if (lower.includes(kw)) {
      return true;
    }
  }
  return false;
}

function getCrisisResponse() {
  return `
    <div class="socratic-problem-badge" style="background:#fee2e2; border-color:#ef4444; color:#991b1b;">
      <span class="badge-type">🚨 GIAO THỨC AN TOÀN KHẨN CẤP</span>
      <span class="badge-target">Bạn luôn quý giá và không hề đơn độc!</span>
    </div>
    <div class="socratic-stage-card info" style="border-left: 4px solid #ef4444;">
      <div class="socratic-stage-title" style="color:#b91c1c;">🫂 Hiệp Sĩ luôn ở đây lắng nghe bạn</div>
      <p>Hiệp Sĩ nhận thấy bạn đang phải gánh chịu những cảm xúc rất nặng nề, đau lòng hoặc cảm giác nguy hiểm. Xin bạn hãy nhớ rằng: <strong>Bạn là một con người quý giá và xứng đáng được yêu thương, lắng nghe và bảo vệ an toàn.</strong></p>
    </div>
    <div class="socratic-stage-card highlight" style="background:#fffbeb; border-color:#f59e0b;">
      <div class="socratic-stage-title" style="color:#b45309;">📞 Hãy kết nối ngay với người lớn tin cậy:</div>
      <p style="margin-bottom:8px;"><strong>1. Tổng Đài Quốc Gia Bảo Vệ Trẻ Em:</strong> Gọi ngay số <strong style="font-size:1.15rem; color:#dc2626; background:#fee2e2; padding:2px 8px; border-radius:4px;">111</strong> (Hoàn toàn miễn cước 24/7, luôn lắng nghe và bảo mật thông tin).</p>
      <p style="margin-bottom:8px;"><strong>2. Tại Trường Học:</strong> Hãy tìm gặp trực tiếp Thầy/Cô Tổng phụ trách Đội hoặc Thầy Cô chủ nhiệm vào giờ ra chơi.</p>
      <p><strong>3. Về nhà:</strong> Hãy chia sẻ ngay với bố mẹ, người thân hoặc một người anh/chị/bạn bè mà bạn tin tưởng nhất.</p>
    </div>
    <div class="socratic-stage-card steps">
      <div class="socratic-stage-title">🌬️ Bước hành động ngay lúc này:</div>
      <div class="step-flow">
        <div class="step-item"><span class="step-num">1</span><div class="step-text"><strong>Dừng lại:</strong> Đặt điện thoại hoặc bài tập xuống, uống một ngụm nước ấm.</div></div>
        <div class="step-item"><span class="step-num">2</span><div class="step-text"><strong>Luyện thở 4-7-8:</strong> Hít vào 4 giây ➔ Nén hơi 7 giây ➔ Thở ra từ tốn 8 giây để nhịp tim dịu lại.</div></div>
        <div class="step-item"><span class="step-num">3</span><div class="step-text"><strong>Lên tiếng:</strong> Chia sẻ với một người lớn ngay bây giờ. Mọi khó khăn đều có cách giải quyết!</div></div>
      </div>
    </div>
  `;
}

// 4. TIỆN ÍCH TRẢ VỀ JSON PHẢN HỒI LỖI
function sendJsonError(res, statusCode, errorCode, message, extra = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({
    success: false,
    error: errorCode,
    message: message,
    ...extra
  }));
}

module.exports = {
  checkRateLimit,
  detectPII,
  checkCrisis,
  getCrisisResponse,
  sendJsonError
};
