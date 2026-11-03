/**
 * DreamSpeak-SEL: Hiệp Sĩ Tự Vấn 24/7 - Backend HTTP Server
 * Kiến trúc mô-đun hóa, Zero-dependency, sẵn sàng triển khai Cloud & Docker
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { aiConfig } = require('./config/aiConfig');
const geminiService = require('./services/geminiService');
const { handleChat, handleChatImage } = require('./routes/chat');
const { sendJsonError } = require('./middleware/errorHandler');

const PORT = aiConfig.port;
const HOST = aiConfig.host;

// Danh mục MIME types chuẩn
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/**
 * Phục vụ tệp tĩnh an toàn
 */
function serveStatic(req, res, pathname) {
  let safePath = pathname;
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  // Chuẩn hóa đường dẫn và ngăn chặn Directory Traversal
  const normalized = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, normalized);

  // Bảo vệ không cho phép truy cập ra ngoài hoặc đọc file cấu hình nhạy cảm (.env, Dockerfile, etc.)
  if (!filePath.startsWith(__dirname) || safePath.includes('.env') || safePath.includes('.git')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 - Cấm truy cập tệp tin cấu hình nhạy cảm.');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 - Không tìm thấy tệp: ${safePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

/**
 * Tạo HTTP Server chính
 */
const server = http.createServer((req, res) => {
  // Cấu hình CORS mở cho truy cập không cần đăng nhập
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const sessionId = req.headers['x-session-id'] || 'anon_' + clientIp;

  // 1. ENDPOINT: GET /api/health
  if (pathname === '/api/health' && req.method === 'GET') {
    const memory = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'DreamSpeak-SEL Backend',
      version: '2.5.0',
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsage: {
        rssMB: Math.round(memory.rss / 1024 / 1024),
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024)
      },
      aiConfigured: geminiService.isConfigured(),
      aiModel: geminiService.model
    }));
  }

  // 2. ENDPOINT: GET /api/status
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      backend: 'online',
      service: 'DreamSpeak-SEL Hiệp Sĩ Tự Vấn 24/7',
      version: '2.5.0',
      aiConfigured: geminiService.isConfigured(),
      activeProvider: geminiService.isConfigured() ? 'Google Gemini AI' : 'Socratic Internal Engine',
      model: geminiService.isConfigured() ? geminiService.model : 'socratic-offline',
      anonymousAccessAllowed: true,
      authRequired: false
    }));
  }

  // 3. ENDPOINT: GET /api/config/public (hoặc /api/config)
  if ((pathname === '/api/config/public' || pathname === '/api/config') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      appName: 'DreamSpeak-SEL – Hiệp Sĩ Tự Vấn 24/7',
      motto: 'Không làm hộ – Cùng bạn tìm lời giải',
      aiConfigured: geminiService.isConfigured(),
      defaultModel: geminiService.model,
      supportedModels: aiConfig.supportedModels,
      supportedModes: [
        { id: 'study', name: 'Tự vấn học tập', icon: '📐', desc: 'Giải thích, gợi ý, hướng dẫn tư duy từng bước' },
        { id: 'emotion', name: 'Khám phá cảm xúc', icon: '🌿', desc: 'Nhận diện cảm xúc, suy nghĩ và nhu cầu (SEL 1 & 2)' },
        { id: 'relationship', name: 'Hiểu bạn – Giao tiếp', icon: '🤝', desc: 'Xử lý bất đồng, lắng nghe và thấu cảm (SEL 3 & 4)' },
        { id: 'decision', name: 'Ra quyết định', icon: '⚖️', desc: 'Phân tích lựa chọn, hệ quả và trách nhiệm (SEL 5)' },
        { id: 'ai_safety', name: 'AI an toàn', icon: '🛡️', desc: 'Đặt câu hỏi hiệu quả theo C-H-A-M-S và kiểm chứng' },
        { id: 'free', name: 'Trò chuyện tự do', icon: '💬', desc: 'Tâm sự và trao đổi trong phạm vi học đường an toàn' }
      ],
      cham5Framework: [
        { step: 1, name: 'Chạm Mình', desc: 'Tự nhận thức cảm xúc và nhu cầu cá nhân' },
        { step: 2, name: 'Điều Hòa', desc: 'Làm chủ cảm xúc, bài tập thở 4-7-8, khoảng lặng' },
        { step: 3, name: 'Hiểu Bạn', desc: 'Thấu cảm, tôn trọng góc nhìn của người khác' },
        { step: 4, name: 'Cùng Làm', desc: 'Hợp tác nhóm, kỹ năng giao tiếp tích cực' },
        { step: 5, name: 'Chọn Đúng', desc: 'Ra quyết định có trách nhiệm và đạo đức' }
      ],
      disclaimer: 'DreamSpeak-SEL là trợ lý AI giáo dục, không phải con người, bác sĩ hay chuyên gia tâm lý. Thông tin do AI cung cấp cần được kiểm chứng cùng SGK và Thầy Cô.'
    }));
  }

  // 4. ENDPOINT: POST /api/chat
  if (pathname === '/api/chat' && req.method === 'POST') {
    return handleChat(req, res, clientIp, sessionId);
  }

  // 5. ENDPOINT: POST /api/chat/image
  if (pathname === '/api/chat/image' && req.method === 'POST') {
    return handleChatImage(req, res, clientIp, sessionId);
  }

  // 6. PHỤC VỤ STATIC FILES
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 - Phương thức HTTP không được hỗ trợ.');
});

// Khởi chạy Server
server.listen(PORT, HOST, () => {
  console.log('=================================================================');
  console.log('   DREAMSPEAK-SEL: HIỆP SĨ TỰ VẤN 24/7 (BACKEND SERVER 2.5)     ');
  console.log('=================================================================');
  console.log(`>> Máy chủ đang lắng nghe tại: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`>> Trạng thái Gemini AI: ${geminiService.isConfigured() ? 'ĐÃ KÍCH HOẠT (Model: ' + geminiService.model + ')' : 'CHẾ ĐỘ SOCRATIC ENGINE NỘI BỘ (Chưa có API Key)'}`);
  console.log(`>> Giới hạn tốc độ: ${aiConfig.rateLimitMax} req/phút`);
  console.log(`>> Truy cập công khai: 24/7 không cần tài khoản / không cần đăng nhập`);
  console.log('=================================================================');
});

// Xử lý shutdown mềm mại
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Đang dừng máy chủ DreamSpeak-SEL an toàn...');
  server.close(() => {
    console.log('[Shutdown] Máy chủ đã dừng.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

module.exports = server;
