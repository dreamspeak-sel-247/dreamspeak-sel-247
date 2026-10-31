import path from 'path';
import fs from 'fs';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { apiRouter, setPublicTunnelUrl } from './routes/api';
import { apiRateLimiter, requestAuditMiddleware } from './middleware/security';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 8080);

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(requestAuditMiddleware);

// Rate limiting on AI API endpoints
app.use('/api/chat', apiRateLimiter);

// API Routes
app.use('/api', apiRouter);

// Check if public URL file exists (written by cloudflared tunnel helper)
const PUBLIC_URL_FILE = path.join(process.cwd(), 'data', 'public-url.txt');
function syncPublicUrlFromFile(): void {
  try {
    if (fs.existsSync(PUBLIC_URL_FILE)) {
      const url = fs.readFileSync(PUBLIC_URL_FILE, 'utf-8').trim();
      if (url.startsWith('http')) {
        setPublicTunnelUrl(url);
      }
    }
  } catch {
    // Ignore read error
  }
}
syncPublicUrlFromFile();
setInterval(syncPublicUrlFromFile, 5000);

// Serve static frontend files
const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));

// Admin Dashboard route
app.get('/admin', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// SPA Fallback to index.html
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================================`);
  console.log(`🛡️  DREAMSPEAK-SEL – HIỆP SĨ TỰ VẤN 24/7 Server đang hoạt động!`);
  console.log(`🌐 Địa chỉ nội bộ: http://localhost:${PORT}`);
  console.log(`📊 Trang Quản trị: http://localhost:${PORT}/admin`);
  console.log(`====================================================================`);
});
