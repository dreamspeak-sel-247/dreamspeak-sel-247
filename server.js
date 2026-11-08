/**
 * DreamSpeak-SEL: Hiệp Sĩ Tự Vấn 24/7 - Backend HTTP Server
 * Kiến trúc mô-đun hóa, Zero-dependency, sẵn sàng triển khai Cloud & Docker
 * (Bản đã vá lỗi bảo mật Static Files, chuẩn hóa Model gemini-2.5-flash & Health Check)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { aiConfig } = require('./config/aiConfig');
const geminiService = require('./services/geminiService');
const { handleChat, handleChatImage } = require('./routes/chat');
const { sendJsonError } = require('./middleware/errorHandler');

// Tự động nâng cấp nếu cấu hình cũ vẫn để model gemini-1.5-flash đã ngừng hỗ trợ
if (geminiService && (geminiService.model === 'gemini-1.5-flash' || geminiService.model === 'gemini-1.5-pro')) {
  geminiService.model = 'gemini-2.5-flash';
}
if (aiConfig && (aiConfig.defaultModel === 'gemini-1.5-flash' || aiConfig.model === 'gemini-1.5-flash')) {
  aiConfig.defaultModel = 'gemini-2.5-flash';
  aiConfig.model = 'gemini-2.5-flash';
}

const PORT = process.env.PORT || aiConfig.port || 8080;
const HOST = aiConfig.host || '0.0.0.0';

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

// Danh sách tệp và thư mục hệ thống Backend không cho phép truy cập công khai
const BLOCKED_PATHS = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/dockerfile',
  '/render.yaml',
  '/config/',
  '/services/',
  '/routes/',
  '/middleware/',
  '/node_modules/'
];

/**
 * Phục vụ tệp tĩnh an toàn (Chặn lộ mã nguồn Backend & Directory Traversal)
 */
function serveStatic(req, res, pathname) {
  let safePath = pathname;
  try {
    safePath = decodeURIComponent(pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 - Đường dẫn URL không hợp lệ.');
  }

  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  }

  const lowerPath = safePath.toLowerCase();
  const isBlocked =
    lowerPath.includes('.env') ||
    lowerPath.includes('.git') ||
    BLOCKED_PATHS.some(blocked => lowerPath === blocked || lowerPath.startsWith(blocked));

  if (isBlocked) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 - Cấm truy cập tệp tin cấu hình và mã nguồn máy chủ.');
  }

  // Chuẩn hóa đường dẫn và ngăn chặn Directory Traversal
  const filePath = path.resolve(__dirname, '.' + safePath);
  if (!filePath.startsWith(__dirname + path.sep) && filePath !== path.join(__dirname, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 - Cấm truy cập tệp tin ngoài phạm vi thư mục.');
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

    if (req.method === 'HEAD') {
      return res.end();
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('500 - Lỗi đọc tệp tĩnh.');
    });
    stream.pipe(res);
  });
}

/**
 * Tạo HTTP Server chính
 */
const server = http.createServer((req, res) => {
  // Cấu hình CORS mở cho truy cập không cần đăng nhập
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  let pathname = '/';
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = parsedUrl.pathname;
  } catch (e) {
    pathname = (req.url || '/').split('?')[0];
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const sessionId = req.headers['x-session-id'] || 'anon_' + clientIp;

  // 1. ENDPOINT: GET / HEAD /api/health
  if (pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    const memory = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (req.method === 'HEAD') return res.end();
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'DreamSpeak-SEL Backend',
      version: '2.5.1',
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

  // 2. ENDPOINT: GET / HEAD /api/status
  if (pathname === '/api/status' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (req.method === 'HEAD') return res.end();
    return res.end(JSON.stringify({
      backend: 'online',
      service: 'DreamSpeak-SEL Hiệp Sĩ Tự Vấn 24/7',
      version: '2.5.1',
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
  console.log('   DREAMSPEAK-SEL: HIỆP SĨ TỰ VẤN 24/7 (BACKEND SERVER 2.5.1)   ');
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
