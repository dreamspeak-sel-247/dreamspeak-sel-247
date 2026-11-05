/**
 * DreamSpeak-SEL: Gemini AI Service & Socratic Pedagogical Engine v3.0
 * - Hỗ trợ Văn bản, Hình ảnh (Multimodal Vision), Streaming (SSE)
 * - Fallback engine THÔNG MINH: nhận diện đúng loại câu hỏi, không dùng template cứng nhắc
 * - Mọi câu trả lời đều trích dẫn lại nguyên văn / số liệu từ câu hỏi thực của học sinh
 */

const https = require('https');
const { aiConfig } = require('../config/aiConfig');

class GeminiService {
  constructor() {
    this.apiKey = aiConfig.apiKey;
    this.model = aiConfig.model;
    this.modelChain = aiConfig.modelFallbackChain || [];
    this.generationConfig = aiConfig.generationConfig;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 10);
  }

  setModel(newModel) {
    if (aiConfig.supportedModels.includes(newModel)) {
      this.model = newModel;
    }
  }

  /**
   * Gọi Gemini API tạo văn bản (Non-streaming)
   */
  async generateContent(systemInstruction, userMessage, history = [], inlineImages = []) {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
    }

    const contents = this._buildContents(systemInstruction, userMessage, history, inlineImages);
    const payload = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: this.generationConfig
    });

    return this._withModelFallback(async (model) => {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      return this._makeRequest(apiUrl, payload);
    });
  }

  /**
   * Gọi Gemini API Streaming (SSE: Server-Sent Events)
   */
  async streamGenerateContent(systemInstruction, userMessage, history = [], inlineImages = [], onChunk = () => {}) {
    if (!this.isConfigured()) {
      throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
    }

    const contents = this._buildContents(systemInstruction, userMessage, history, inlineImages);
    const payload = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: this.generationConfig
    });

    // Chỉ được đổi model khi CHƯA gửi chữ nào cho học sinh (tránh nối 2 câu trả lời với nhau)
    let emitted = false;
    const trackedChunk = (delta) => { emitted = true; onChunk(delta); };

    return this._withModelFallback(async (model) => {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
      return this._makeStreamingRequest(apiUrl, payload, trackedChunk);
    }, () => !emitted);
  }

  /**
   * Danh sách model sẽ thử: model hiện tại rồi tới các model dự phòng (không trùng).
   */
  _modelsToTry() {
    return [this.model, ...this.modelChain].filter((m, i, arr) => m && arr.indexOf(m) === i);
  }

  /**
   * Lỗi thuộc về MODEL (đã bị tắt, không tồn tại, quá tải, hết quota) → đáng thử model khác.
   * Lỗi khác (sai key, nội dung bị chặn, mạng...) → thử model khác cũng vô ích.
   */
  _isModelUnavailableError(err) {
    const msg = String((err && err.message) || err || '');
    return /not found|no longer available|has been shut|shut ?down|deprecated|not supported for|is not supported|overloaded|unavailable|high demand|quota|RESOURCE_EXHAUSTED|\b(404|429|503)\b/i.test(msg);
  }

  async _withModelFallback(run, canRetry = () => true) {
    const models = this._modelsToTry();
    let lastErr;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      try {
        const result = await run(model);
        // Model chính đã chết hẳn → nhớ model đang chạy được để lần sau khỏi gọi lại model hỏng
        if (model !== this.model && lastErr && /not found|no longer available|shut|deprecated/i.test(String(lastErr.message))) {
          console.warn(`[Gemini] Model "${this.model}" không dùng được, chuyển sang "${model}".`);
          this.model = model;
        }
        return result;
      } catch (err) {
        lastErr = err;
        const hasNext = i < models.length - 1;
        if (hasNext && canRetry() && this._isModelUnavailableError(err)) {
          console.warn(`[Gemini] Model "${model}" lỗi (${String(err.message).slice(0, 120)}) → thử model tiếp theo.`);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /**
   * Lấy văn bản trả lời, ghép MỌI phần chữ (bỏ phần "suy nghĩ" của model nếu có).
   * Cách cũ chỉ lấy parts[0] nên có thể lấy nhầm phần suy nghĩ hoặc cắt mất nửa câu trả lời.
   */
  _extractText(data) {
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts;
    if (!Array.isArray(parts)) return '';
    return parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  }

  /**
   * Chuẩn bị mảng contents theo chuẩn Google Gemini API
   */
  _buildContents(systemInstruction, userMessage, history, inlineImages) {
    const contents = [];

    // Lịch sử hội thoại (10 lượt gần nhất để AI nhớ ngữ cảnh)
    // - Bỏ thẻ HTML: các câu trả lời dự phòng cũ là HTML, nếu đưa nguyên vào lịch sử thì AI sẽ bắt chước khuôn đó.
    // - Gộp các lượt liên tiếp cùng vai, và lịch sử phải bắt đầu bằng lượt của học sinh.
    if (Array.isArray(history) && history.length > 0) {
      const turns = [];
      history.slice(-10).forEach(item => {
        if (item && (item.sender || item.role) && (item.text || item.content)) {
          const role = (item.sender === 'user' || item.role === 'user') ? 'user' : 'model';
          const text = String(item.text || item.content)
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .trim()
            .slice(0, 1500);
          if (!text) return;
          const last = turns[turns.length - 1];
          if (last && last.role === role) last.parts[0].text += '\n' + text;
          else turns.push({ role, parts: [{ text }] });
        }
      });
      while (turns.length && turns[0].role !== 'user') turns.shift();
      // Nếu client đã đưa luôn tin nhắn hiện tại vào lịch sử thì bỏ bản trùng
      const tail = turns[turns.length - 1];
      if (tail && tail.role === 'user' && userMessage && tail.parts[0].text.trim() === String(userMessage).trim()) {
        turns.pop();
      }
      turns.forEach(t => contents.push(t));
    }

    // Turn hiện tại của học sinh
    const userParts = [];

    // Đính kèm ảnh nếu có (Gemini Multimodal Vision)
    if (Array.isArray(inlineImages) && inlineImages.length > 0) {
      inlineImages.forEach(img => {
        if (img && img.mimeType && img.base64Data) {
          userParts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64Data }
          });
        }
      });
    }

    userParts.push({
      text: userMessage || (inlineImages.length > 0
        ? 'Xin Hiệp Sĩ xem ảnh đề bài này và hướng dẫn em cách làm từng bước theo phương pháp Socrates!'
        : '')
    });

    contents.push({ role: 'user', parts: userParts });
    return contents;
  }

  _makeRequest(apiUrl, payload) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(apiUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 35000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              const text = this._extractText(data);
              if (text) {
                resolve(text);
              } else {
                reject(new Error('AI phản hồi dữ liệu rỗng.'));
              }
            } catch (e) {
              reject(new Error('Lỗi giải mã JSON từ Gemini: ' + e.message));
            }
          } else {
            try {
              const errData = JSON.parse(body);
              reject(new Error(errData.error?.message || `Lỗi Gemini API (HTTP ${res.statusCode})`));
            } catch (e) {
              reject(new Error(`Lỗi Gemini API HTTP ${res.statusCode}: ${body.slice(0, 150)}`));
            }
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Yêu cầu tới Gemini bị timeout quá 35s.')); });
      req.on('error', (err) => reject(new Error('Lỗi kết nối Gemini: ' + err.message)));
      req.write(payload);
      req.end();
    });
  }

  _makeStreamingRequest(apiUrl, payload, onChunk) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(apiUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Accept': 'text/event-stream'
        },
        timeout: 45000
      };

      let fullText = '';
      let buffer = '';

      const req = https.request(options, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let errBody = '';
          res.on('data', d => errBody += d);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(errBody);
              reject(new Error(parsed.error?.message || `Lỗi Stream Gemini (HTTP ${res.statusCode})`));
            } catch (e) {
              reject(new Error(`Lỗi Stream Gemini HTTP ${res.statusCode}`));
            }
          });
          return;
        }

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6).trim();
              if (jsonStr && jsonStr !== '[DONE]') {
                try {
                  const data = JSON.parse(jsonStr);
                  const delta = this._extractText(data);
                  if (delta) { fullText += delta; onChunk(delta); }
                } catch (e) {}
              }
            }
          }
        });

        res.on('end', () => resolve(fullText));
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Stream Gemini bị timeout quá 45s.')); });
      req.on('error', (err) => reject(new Error('Lỗi kết nối Stream Gemini: ' + err.message)));
      req.write(payload);
      req.end();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * FALLBACK ENGINE v3.0 — Phân loại câu hỏi THÔNG MINH
   * Chỉ dùng khi Gemini API không khả dụng.
   * Nhận diện đúng bản chất câu hỏi → trả lời sát thực tế, không template chung.
   */
  // ─────────────────────────────────────────────────────────────────────────────
  generateLocalSocraticResponse(userText, mode = 'study', grade = '7', subject = '') {
    const body = this._localSocraticCore(userText, mode, grade, subject);
    const notice = `<div class="socratic-stage-card info"><p><em>⚠️ Hiệp Sĩ đang ở chế độ dự phòng (tạm thời chưa kết nối được với AI) nên gợi ý có thể chưa sát hết câu hỏi của em. Em thử gửi lại sau ít phút nhé!</em></p></div>`;
    return body + notice;
  }

  _localSocraticCore(userText, mode = 'study', grade = '7', subject = '') {
    // Chống chèn HTML/script: mọi nội dung học sinh nhập đều được escape trước khi đưa vào thẻ
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    grade = esc(grade || '');
    subject = esc(subject || '');

    const raw = (userText || '').trim();
    const text = raw.toLowerCase();
    // Khớp CẢ TỪ (không khớp một phần của từ khác: "lo" không còn dính vào "logic", "loại"...)
    const hasWord = (w) => new RegExp('(^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}\\p{N}])', 'u').test(text);

    // ─── BƯỚC 0: Trích xuất thông tin cụ thể từ câu hỏi ──────────────────────
    const numbers   = (raw.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const hasNumbers = numbers.length > 0;
    const shortQ    = esc(raw.slice(0, 180) + (raw.length > 180 ? '...' : ''));

    // Helper tạo badge
    const badge = (type, target) =>
      `<div class="socratic-problem-badge"><span class="badge-type">${type}</span><span class="badge-target">${target}</span></div>`;
    const card = (cls, title, body) =>
      `<div class="socratic-stage-card ${cls}"><div class="socratic-stage-title">${title}</div>${body}</div>`;

    // ─── NHÓM 1: CẢM XÚC / TÂM LÝ (ưu tiên nhận diện trước học thuật) ────────
    const emotionWords = [
      'buồn','tủi','khóc','cô đơn','cô lập','lo lắng','lo sợ','sợ','căng thẳng','áp lực',
      'chán','mệt','tức giận','bực','ghét','thất bại','không muốn đi học',
      'bị la','bị mắng','điểm kém','điểm thấp','điểm tệ','bị điểm',
      'bị bắt nạt','bạo lực','nhớ nhà','xa nhà','không có bạn'
    ];
    const isEmotion = mode === 'emotion' || emotionWords.some(w => hasWord(w));

    if (isEmotion) {
      // Trích xuất CẢM XÚC CỤ THỂ từ câu hỏi
      const matchDiem  = raw.match(/điểm\s*(\d+)/i);
      const matchMon   = raw.match(/môn\s*(toán|văn|anh|lý|hóa|sinh|sử|địa|gdcd|tiếng anh|khoa học|tin|nhạc|thể dục)/i);
      const matchTen   = raw.match(/(?:thầy|cô|bạn)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ][a-zàáâãèéêìíòóôõùúýăđơư]+)/);

      let emotionLabel = 'áp lực và lo lắng';
      if (text.includes('buồn') || text.includes('tủi') || text.includes('khóc')) emotionLabel = 'buồn và tủi thân';
      else if (text.includes('chán') || text.includes('mệt')) emotionLabel = 'mệt mỏi và chán nản';
      else if (text.includes('cô đơn') || text.includes('không có bạn') || text.includes('cô lập')) emotionLabel = 'cô đơn và thiếu kết nối bạn bè';
      else if (matchDiem || text.includes('điểm kém') || text.includes('điểm thấp')) emotionLabel = `buồn vì điểm số${matchDiem ? ' ' + matchDiem[0] : ''}`;
      else if (text.includes('bị la') || text.includes('bị mắng')) emotionLabel = 'tổn thương vì bị la mắng';
      else if (text.includes('tức') || text.includes('bực') || text.includes('ghét')) emotionLabel = 'tức giận và bực bội';
      else if (text.includes('bắt nạt') || text.includes('bạo lực')) emotionLabel = 'sợ hãi vì bị bắt nạt';
      else if (text.includes('nhớ nhà') || text.includes('xa nhà')) emotionLabel = 'nhớ nhà và cô đơn';

      let detail = '';
      if (matchDiem) detail += ` Điểm <strong>${matchDiem[0]}</strong>`;
      if (matchMon)  detail += ` môn <strong>${matchMon[1]}</strong>`;
      if (matchTen)  detail += ` liên quan đến <strong>${matchTen[0]}</strong>`;

      return badge('🌿 Khám Phá Cảm Xúc (SEL 1 & 2)', 'Chạm Mình & Điều Hòa Cảm Xúc') +
        card('info', '🫂 Hiệp Sĩ lắng nghe và đồng hành cùng em', `
          <p>Hiệp Sĩ hiểu em vừa chia sẻ: <em>"${shortQ}"</em></p>
          <p>Em đang cảm thấy <strong>${emotionLabel}</strong>${detail ? ' —' + detail : ''}. Điều đó hoàn toàn tự nhiên và em không hề đơn độc – rất nhiều bạn học sinh cũng trải qua những cảm xúc như vậy.</p>
          <p>Cảm xúc của em là thật và quan trọng. Hiệp Sĩ ở đây để lắng nghe, không phán xét em đâu nhé! 💙</p>
        `) +
        card('highlight', '💬 Hiệp Sĩ muốn hiểu em hơn', `
          <p>👉 <strong>Điều gì cụ thể${detail ? ' về' + detail : ''} đang làm em khó chịu nhất lúc này?</strong></p>
          <p>Em có thể kể thêm cho Hiệp Sĩ nghe không? Đôi khi chỉ cần nói ra, lòng mình đã nhẹ hơn rất nhiều. Hiệp Sĩ sẽ cùng em suy nghĩ xem chúng mình có thể làm gì để cảm thấy tốt hơn nhé! 🌱</p>
          <p><em>Mẹo nhỏ:</em> Nếu em đang căng thẳng, hãy thử hít vào 4 giây – nín 7 giây – thở ra 8 giây. Bài tập thở này giúp nhịp tim ổn định lại ngay!</p>
        `);
    }

    // ─── NHÓM 2: MÂU THUẪN BẠN BÈ / QUAN HỆ XÃ HỘI ─────────────────────────
    const isRelationship = mode === 'relationship' ||
      text.includes('cãi nhau') || text.includes('mâu thuẫn') || text.includes('giận') ||
      text.includes('không nói chuyện') || text.includes('nói xấu') || text.includes('bắt nạt') ||
      text.includes('hòa giải') || text.includes('làm lành') || text.includes('bạn thân');

    if (isRelationship) {
      const matchBan   = raw.match(/(?:bạn|với)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ][a-zàáâãèéêìíòóôõùúýăđơư]+)/);
      const tenBan     = matchBan ? matchBan[1] : null;
      const causeMatch = text.includes('bài tập') ? 'bài tập' :
                         text.includes('nhóm') ? 'bài tập nhóm' :
                         text.includes('nói xấu') ? 'chuyện nói xấu' :
                         text.includes('tiền') ? 'chuyện tiền bạc' :
                         text.includes('chơi') ? 'chuyện chơi cùng' : null;

      return badge('🤝 Hiểu Bạn – Giao Tiếp (SEL 3 & 4)', 'Thấu cảm & Giảng hòa mâu thuẫn') +
        card('info', '🫂 Hiệp Sĩ hiểu tình huống của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Khi xảy ra mâu thuẫn${tenBan ? ` với bạn <strong>${tenBan}</strong>` : ''}${causeMatch ? ` vì <strong>${causeMatch}</strong>` : ''}, cảm giác hụt hẫng và buồn bực là điều rất tự nhiên. Tuy nhiên, một tình bạn đẹp luôn đáng để gìn giữ.</p>
          <p>Hãy dành một khoảng lặng để <strong>thấu cảm</strong>: ${tenBan ? `Bạn <strong>${tenBan}</strong>` : 'Bạn ấy'} lúc này có thể cũng đang cảm thấy tổn thương hoặc có hiểu nhầm gì đó chăng?</p>
        `) +
        card('highlight', '⚔️ Hướng dẫn 3 bước mở lời giảng hòa', `
          <p>1. <em>Xác nhận cảm xúc:</em> "Hôm qua chúng mình${causeMatch ? ` cãi nhau vì ${causeMatch}` : ''}, về nhà mình thấy rất buồn."</p>
          <p>2. <em>Khẳng định giá trị:</em> "Mình rất trân trọng tình bạn với ${tenBan || 'bạn'}."</p>
          <p>3. <em>Mời gọi cởi mở:</em> "Khi nào bình tĩnh lại, chúng mình ngồi nói chuyện nhẹ nhàng để hiểu nhau hơn nhé!"</p>
          <p>👉 Em có muốn cùng Hiệp Sĩ điều chỉnh lại câu chữ cho phù hợp với ${tenBan ? `bạn <strong>${tenBan}</strong>` : 'bạn ấy'} không?</p>
        `);
    }

    // ─── NHÓM 3: RA QUYẾT ĐỊNH ───────────────────────────────────────────────
    if (mode === 'decision' || text.includes('phân vân') || text.includes('có nên') ||
        (text.includes('quyết định') && !text.includes('bài'))) {
      return badge('⚖️ Ra Quyết Định Có Trách Nhiệm (SEL 5)', 'Khung phân tích Quyết Định & Hệ quả') +
        card('info', '📋 Hiệp Sĩ hiểu tình huống của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Một người trưởng thành là người biết dừng lại suy nghĩ trước khi hành động, dũng cảm nhìn nhận <strong>hệ quả</strong> và tự chịu <strong>trách nhiệm</strong> với lựa chọn của bản thân.</p>
        `) +
        card('highlight', '⚔️ 3 Câu hỏi tự vấn trước khi quyết định', `
          <p>1. <strong>Hệ quả trực tiếp:</strong> Nếu em chọn làm điều đó ngay bây giờ, ai sẽ bị ảnh hưởng và như thế nào?</p>
          <p>2. <strong>Lâu dài:</strong> 1 tuần hoặc 1 tháng sau, em sẽ cảm thấy thế nào về lựa chọn này?</p>
          <p>3. <strong>Kiểm tra giá trị:</strong> Lựa chọn này có an toàn, có tôn trọng bản thân và người khác không?</p>
          <p>👉 Em thử trả lời 3 câu hỏi trên dựa trên tình huống thực của em rồi nhắn cho Hiệp Sĩ cùng phân tích nhé!</p>
        `);
    }

    // ─── NHÓM 4: TOÁN – PHƯƠNG TRÌNH ─────────────────────────────────────────
    const isEquation = text.includes('phương trình') || text.includes('tìm x') ||
      /\d*\.?\d*\s*x\s*[+\-*/=]/.test(text) || /[+\-*/=]\s*\d*\.?\d*\s*x/.test(text);

    if (isEquation) {
      const eqMatch = raw.match(/(-?\d*\.?\d*)\s*x\s*([+\-])\s*(\d+\.?\d*)\s*=\s*(-?\d+\.?\d*)/i)
                   || raw.match(/x\s*([+\-])\s*(\d+\.?\d*)\s*=\s*(-?\d+\.?\d*)/i)
                   || raw.match(/(-?\d*\.?\d*)\s*x\s*=\s*(-?\d+\.?\d*)/i);

      const eqText = esc((raw.match(/[\d.]*\s*x[\s\d.+\-*/=]+\d+/i) || [''])[0].trim() || raw.slice(0, 60));

      let stepHint = '';
      if (eqMatch && eqMatch.length >= 5) {
        const [, a, sign, b, c] = eqMatch;
        const opp = sign === '+' ? '−' : '+';
        const aD  = (a === '' || a === '1' || a === '-1') ? (a === '-1' ? '-' : '') : a;
        stepHint = `
          <p>Với phương trình <strong>${eqText}</strong>, em áp dụng <strong>quy tắc chuyển vế</strong>:</p>
          <p style="text-align:center;font-size:1.1rem;font-weight:600;">$${aD}x = ${c} ${opp} ${b}$</p>
          <p>👉 Em hãy tính vế phải: $${c} ${opp} ${b} = ?$ rồi nhắn kết quả cho Hiệp Sĩ nhé!</p>`;
      } else {
        stepHint = `
          <p>Em đang giải phương trình: <strong>"${eqText}"</strong></p>
          <p>👉 Em hãy viết lại nguyên phương trình đầy đủ (dạng: ...x + ... = ...) để Hiệp Sĩ cùng giải từng bước với em nhé!</p>`;
      }

      return badge(`📐 Toán học Lớp ${grade}: Phương trình một ẩn`, 'Phân tích đề bài thực tế của em') +
        card('info', '📌 Hiệp Sĩ đã đọc câu hỏi của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Đây là dạng bài <strong>Phương trình bậc nhất một ẩn</strong> — tìm giá trị của $x$. Hiệp Sĩ sẽ gợi mở từng bước để em tự tìm ra kết quả!</p>
        `) +
        card('highlight', '⚔️ Bước 1 — Chuyển vế', stepHint);
    }

    // ─── NHÓM 5: TOÁN – HÌNH HỌC ─────────────────────────────────────────────
    if (text.includes('hình vuông') || text.includes('hình chữ nhật') || text.includes('tam giác') ||
        text.includes('chu vi') || text.includes('diện tích') || text.includes('cạnh') ||
        text.includes('góc') || text.includes('pythagore') || text.includes('cạnh huyền')) {

      let shape = 'hình phẳng';
      let formulas = '';
      if (text.includes('hình vuông')) {
        shape = 'Hình vuông';
        const sideMatch = raw.match(/(?:cạnh[^=]*=?\s*|cạnh\s+)(\d+\.?\d*)\s*(cm|m|dm|mm)?/i)
                       || raw.match(/(\d+\.?\d*)\s*(cm|m|dm|mm)/i);
        const side = sideMatch ? sideMatch[1] : null;
        const unit = sideMatch ? (sideMatch[2] || 'cm') : 'cm';
        formulas = side
          ? `<p>Hiệp Sĩ thấy hình vuông có cạnh $a = ${side}\\text{ ${unit}}$. Hai công thức cần nhớ:</p>
             <p>• Chu vi: $P = 4 \\times a = 4 \\times ${side} = ?\\text{ ${unit}}$</p>
             <p>• Diện tích: $S = a^2 = ${side}^2 = ?\\text{ ${unit}}^2$</p>
             <p>👉 Em tính từng công thức rồi nhắn kết quả cho Hiệp Sĩ nhé!</p>`
          : `<p>Với hình vuông: Chu vi $P = 4a$ và Diện tích $S = a^2$.</p>
             <p>👉 Em cho Hiệp Sĩ biết <strong>cạnh của hình vuông bằng bao nhiêu</strong>?</p>`;
      } else if (text.includes('hình chữ nhật')) {
        shape = 'Hình chữ nhật';
        const daiM = raw.match(/(?:dài|chiều dài)[^=]*=?\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i);
        const rongM = raw.match(/(?:rộng|chiều rộng)[^=]*=?\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i);
        const dimM = raw.match(/(\d+\.?\d*)\s*(cm|m|dm|mm)?\s*[,×xvà]\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i);
        const dai = daiM ? daiM[1] : (dimM ? dimM[1] : null);
        const rong = rongM ? rongM[1] : (dimM ? dimM[3] : null);
        const unit = (daiM && daiM[2]) || (dimM && dimM[2]) || 'cm';
        formulas = (dai && rong)
          ? `<p>Hiệp Sĩ thấy hình chữ nhật: dài $a = ${dai}\\text{ ${unit}}$, rộng $b = ${rong}\\text{ ${unit}}$.</p>
             <p>• Chu vi: $P = 2(a+b) = 2 \\times (${dai}+${rong}) = ?$</p>
             <p>• Diện tích: $S = a \\times b = ${dai} \\times ${rong} = ?$</p>
             <p>👉 Em tính tổng $${dai}+${rong}=?$ trước rồi nhân 2 nhé!</p>`
          : `<p>Chu vi: $P = 2(a+b)$; Diện tích: $S = a \\times b$.</p>
             <p>👉 Em cho Hiệp Sĩ biết <strong>chiều dài và chiều rộng</strong> để cùng tính nhé!</p>`;
      } else if (text.includes('tam giác') && (text.includes('vuông') || text.includes('pythagore') || text.includes('cạnh huyền'))) {
        shape = 'Tam giác vuông – Pythagore';
        const nums = raw.match(/\d+\.?\d*/g) || [];
        formulas = nums.length >= 2
          ? `<p>Hiệp Sĩ thấy trong đề bài có số: <strong>${nums.slice(0,3).join(', ')}</strong>.</p>
             <p>Định lý Pythagore: $c^2 = a^2 + b^2$ (c là cạnh huyền).</p>
             <p>👉 Em xác định $a$ và $b$ là hai cạnh góc vuông, tính $a^2 + b^2 = ?$ rồi nhắn kết quả!</p>`
          : `<p>Định lý Pythagore: $c^2 = a^2 + b^2$</p>
             <p>👉 Em cho Hiệp Sĩ biết các cạnh của tam giác để cùng áp dụng định lý nhé!</p>`;
      } else {
        // Hình học chung
        formulas = `<p>Hiệp Sĩ đã đọc câu hỏi về <strong>hình học</strong> của em. Hãy cho Hiệp Sĩ biết:</p>
          <p>• Dạng hình nào? (vuông, chữ nhật, tam giác, tròn...)</p>
          <p>• Các số đo đã biết là bao nhiêu?</p>
          <p>• Em cần tính chu vi, diện tích hay góc?</p>
          <p>👉 Với thông tin đó, Hiệp Sĩ sẽ gợi mở từng bước ngay!</p>`;
      }

      return badge(`📐 Toán học Lớp ${grade}: Hình học`, shape) +
        card('info', '📌 Đề bài của em', `<p><em>"${shortQ}"</em></p>${formulas}`) +
        card('highlight', '⚔️ Thử thách bước tiếp theo', `<p>Sau khi tính xong, đừng quên ghi kèm <strong>đơn vị đo</strong> (cm, m, cm²...) vào kết quả nhé!</p><p>👉 Nhắn kết quả tính được cho Hiệp Sĩ kiểm tra!</p>`);
    }

    // ─── NHÓM 6: VẬT LÝ / KHTN – VẬN TỐC, LỰC, ÁP SUẤT, ĐIỆN ───────────────
    if (text.includes('vận tốc') || text.includes('tốc độ') || text.includes('quãng đường') ||
        (text.includes('thời gian') && (text.includes('km') || text.includes('m/s') || text.includes('tính')))) {
      // Đọc số liệu theo ĐƠN VỊ ("54km/h", "2 giờ", "120 km") trước, rồi mới theo nhãn ("v = 54").
      // Bản cũ chỉ đọc theo nhãn nên đề viết tự nhiên như "vận tốc 54km/h trong 2 giờ" không nhận được số nào.
      const NUM = '(\\d+(?:[.,]\\d+)?)';
      const matchV = raw.match(new RegExp(NUM + '\\s*(km\\/h|m\\/s)', 'i'))
                  || raw.match(/(?:vận tốc|tốc độ|v)\s*(?:=|:|là|bằng)\s*(\d+(?:[.,]\d+)?)\s*(m\/s|km\/h)?/i);
      const matchT = raw.match(new RegExp(NUM + '\\s*(giờ|phút|giây)', 'i'))
                  || raw.match(/(?:thời gian|t)\s*(?:=|:|là|bằng)\s*(\d+(?:[.,]\d+)?)\s*(s|h)?/i);
      const matchS = raw.match(new RegExp(NUM + '\\s*(km|m)(?![\\/\\p{L}])', 'iu'))
                  || raw.match(/(?:quãng đường|s)\s*(?:=|:|là|bằng)\s*(\d+(?:[.,]\d+)?)\s*(km|m)?/i);

      // Tự phát hiện số liệu kể cả khi không có nhãn rõ ràng
      let formulaHint = '';
      if (matchS && matchT && !matchV) {
        formulaHint = `<p>Em cần tính vận tốc, với $s = ${matchS[1]}\\text{ ${matchS[2]||'m'}}$ và $t = ${matchT[1]}\\text{ ${matchT[2]||'s'}}$:</p>
          <p style="text-align:center;font-size:1.1rem;font-weight:600;">$v = \\frac{s}{t} = \\frac{${matchS[1]}}{${matchT[1]}} = ?$</p>
          <p>👉 Em tính phép chia rồi nhắn kết quả (kèm đơn vị) cho Hiệp Sĩ nhé!</p>`;
      } else if (matchV && matchT && !matchS) {
        formulaHint = `<p>Em cần tính quãng đường, với $v = ${matchV[1]}\\text{ ${matchV[2] || ''}}$ và $t = ${matchT[1]}\\text{ ${matchT[2] || ''}}$ (em để ý đơn vị thời gian và vận tốc đã khớp nhau chưa nhé):</p>
          <p style="text-align:center;font-size:1.1rem;font-weight:600;">$s = v \\times t = ${matchV[1]} \\times ${matchT[1]} = ?$</p>
          <p>👉 Em thực hiện phép nhân rồi nhắn kết quả cho Hiệp Sĩ nhé!</p>`;
      } else if (matchV && matchS && !matchT) {
        formulaHint = `<p>Em cần tính thời gian, với $s = ${matchS[1]}$ và $v = ${matchV[1]}$:</p>
          <p style="text-align:center;font-size:1.1rem;font-weight:600;">$t = \\frac{s}{v} = \\frac{${matchS[1]}}{${matchV[1]}} = ?$</p>
          <p>👉 Em tính phép chia rồi nhắn kết quả (kèm đơn vị) cho Hiệp Sĩ nhé!</p>`;
      } else {
        formulaHint = `<p>Hiệp Sĩ đã đọc đề bài của em. Em hãy cho Hiệp Sĩ biết:</p>
          <p>• Đề bài <strong>đã cho</strong> những đại lượng nào (vận tốc $v$, quãng đường $s$, hay thời gian $t$)?</p>
          <p>• Đề bài <strong>yêu cầu tính</strong> đại lượng nào?</p>
          <p>👉 Nhắn thêm thông tin để Hiệp Sĩ gợi mở từng bước với số liệu thực của em nhé!</p>`;
      }

      return badge(`🔬 Khoa học tự nhiên Lớp ${grade}: Vật lí`, 'Chuyển động – Công thức vận tốc') +
        card('info', '📌 Đề bài của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Công thức cơ bản: $v = \\dfrac{s}{t}$</p>
          <p>• $v$: Vận tốc &nbsp;• $s$: Quãng đường &nbsp;• $t$: Thời gian</p>
        `) +
        card('highlight', '⚔️ Áp dụng vào đề bài của em', formulaHint);
    }

    // ─── NHÓM 7: HÓA HỌC ─────────────────────────────────────────────────────
    if ((hasWord('hóa') && !/(tiến|số|biến|công nghiệp|hiện đại|toàn cầu|đô thị) hóa/u.test(text)) ||
        text.includes('phản ứng') || text.includes('nguyên tử') ||
        text.includes('phân tử') || text.includes('axit') || text.includes('bazơ') ||
        /\b(h2o|hcl|naoh|co2|h2so4|nacl|fe|mg|o2|n2|zn)\b/i.test(text)) {
      return badge(`⚗️ Hóa học Lớp ${grade}`, 'Phân tích câu hỏi thực tế của em') +
        card('info', '📌 Hiệp Sĩ đã đọc câu hỏi của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Hiệp Sĩ nhận ra đây là câu hỏi về <strong>Hóa học</strong>.</p>
          <p>Trước khi giải thích, em cho Hiệp Sĩ biết: Em đang học về chủ đề nào trong Hóa học? (Phản ứng hóa học, Bảng tuần hoàn, Axit – Bazơ, hay Hợp chất hữu cơ?)</p>
        `) +
        card('highlight', '⚔️ Câu hỏi gợi mở', `
          <p>Em hãy viết lại <strong>chính xác câu hỏi hoặc phương trình</strong> cần tìm hiểu để Hiệp Sĩ gợi mở đúng trọng tâm nhé!</p>
          <p>👉 Ví dụ: "Phản ứng Fe + HCl → ? là loại phản ứng gì?" hoặc "Tại sao H₂O là phân tử phân cực?"</p>
        `);
    }

    // ─── NHÓM 8: SINH HỌC ────────────────────────────────────────────────────
    if (text.includes('sinh học') || text.includes('tế bào') || text.includes('quang hợp') ||
        text.includes('hô hấp') || text.includes('di truyền') || hasWord('gen') ||
        text.includes('sinh vật') || text.includes('vi khuẩn') || text.includes('adn') || text.includes('arn')) {
      return badge(`🌿 Sinh học Lớp ${grade}`, 'Phân tích câu hỏi của em') +
        card('info', '📌 Câu hỏi Sinh học của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Hiệp Sĩ nhận ra đây là câu hỏi về <strong>Sinh học</strong>. Trước khi trả lời, em hãy cho Hiệp Sĩ biết: Em đang học chương nào? (Tế bào, Di truyền, Sinh thái, hay Tiến hóa?)</p>
        `) +
        card('highlight', '⚔️ Thử suy nghĩ trước', `
          <p>Em đã biết gì về chủ đề này từ bài học và sách giáo khoa rồi? Chia sẻ để Hiệp Sĩ biết bắt đầu từ đâu cho phù hợp với em nhé!</p>
          <p>👉 Nếu có sơ đồ hoặc hình ảnh trong đề bài, em có thể tải ảnh lên để Hiệp Sĩ cùng phân tích!</p>
        `);
    }

    // ─── NHÓM 9: LỊCH SỬ / ĐỊA LÝ ───────────────────────────────────────────
    if (text.includes('lịch sử') || text.includes('triều đại') || text.includes('chiến tranh') ||
        text.includes('nhân vật') || text.includes('sự kiện') || text.includes('năm nào') ||
        text.includes('địa lý') || text.includes('thủ đô') || text.includes('châu') ||
        text.includes('quốc gia') || text.includes('khí hậu') || text.includes('dân số') ||
        text.includes('sông') || text.includes('núi') || text.includes('biển')) {

      // Trích xuất từ khóa địa danh / sự kiện cụ thể
      const isHistory = text.includes('lịch sử') || text.includes('triều') || text.includes('chiến') || text.includes('nhân vật') || text.includes('sự kiện');
      const isGeo = text.includes('địa lý') || text.includes('thủ đô') || text.includes('châu') || text.includes('quốc gia') || text.includes('khí hậu');

      const topic = isHistory ? 'Lịch sử' : isGeo ? 'Địa lí' : 'Lịch sử & Địa lí';

      return badge(`🗺️ ${topic} Lớp ${grade}`, 'Phân tích câu hỏi thực tế của em') +
        card('info', '📌 Câu hỏi của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Hiệp Sĩ đã đọc câu hỏi về <strong>${topic}</strong>. Trước khi trả lời, em hãy chia sẻ những gì em đã biết về chủ đề này từ sách giáo khoa nhé!</p>
        `) +
        card('highlight', '⚔️ Câu hỏi Socratic gợi mở', `
          <p>Em đã nghe tên <strong>nhân vật / địa danh / sự kiện</strong> này trong bài học nào chưa?</p>
          <p>👉 Hãy chia sẻ những thông tin em đã biết, Hiệp Sĩ sẽ bổ sung và mở rộng thêm cho em!</p>
          <p><em>Lưu ý:</em> Hiệp Sĩ là AI và có thể mắc sai sót về dữ liệu lịch sử cụ thể — luôn đối chiếu với Sách giáo khoa chuẩn của Bộ GD&ĐT nhé!</p>
        `);
    }

    // ─── NHÓM 10: NGỮ VĂN ───────────────────────────────────────────────────
    if (text.includes('ngữ văn') || text.includes('tập làm văn') || text.includes('tả cảnh') ||
        text.includes('lập dàn ý') || text.includes('bài văn') || text.includes('đoạn văn') ||
        text.includes('thể thơ') || text.includes('biện pháp tu từ') || text.includes('phân tích')) {
      return badge(`📖 Ngữ văn THCS Lớp ${grade}`, 'Gợi mở ý tưởng theo phương pháp Socrates') +
        card('info', '📌 Câu hỏi Ngữ văn của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Hiệp Sĩ sẽ <strong>không viết bài văn mẫu</strong> để em chép, vì bài văn hay nhất phải xuất phát từ chính đôi mắt quan sát và trái tim rung động của em.</p>
        `) +
        card('highlight', '⚔️ 4 Câu hỏi gợi mở để tự lập dàn ý', `
          <p>1. <strong>Màu sắc (Thị giác):</strong> Khi quan sát đối tượng này, màu sắc nào làm em ấn tượng nhất?</p>
          <p>2. <strong>Âm thanh (Thính giác):</strong> Em nghe thấy những thanh âm quen thuộc nào xung quanh?</p>
          <p>3. <strong>Hương vị / Mùi (Khứu giác):</strong> Có mùi hương đặc trưng nào gắn liền với kỷ niệm của em?</p>
          <p>4. <strong>Cảm xúc:</strong> Em cảm thấy yêu quý, tự hào hay biết ơn điều gì nhất?</p>
          <p>👉 Hãy thử chọn 1 chi tiết em thích nhất và viết thành 1 câu văn gửi lại cho Hiệp Sĩ sửa nhé!</p>
        `);
    }

    // ─── NHÓM 11: TIẾNG ANH ──────────────────────────────────────────────────
    const isEnglish = subject.toLowerCase().includes('tiếng anh') ||
      text.includes('tiếng anh') || text.includes('grammar') || text.includes('tense') ||
      text.includes('thì hiện tại') || text.includes('thì quá khứ') || text.includes('thì tương lai') ||
      text.includes('present') || text.includes('past') || text.includes('future') ||
      text.includes('vocabulary') || text.includes('từ vựng') || text.includes('câu điều kiện') ||
      text.includes('passive') || text.includes('bị động');

    if (isEnglish) {
      let grammarTopic = 'Ngữ pháp Tiếng Anh';
      let example1 = 'I <strong>have studied</strong> English for 3 years.';
      let example2 = 'She <strong>has just finished</strong> her homework.';
      let challenge = 'Em thử đặt một câu về bản thân dùng thì <strong>Present Perfect</strong> rồi nhắn cho Hiệp Sĩ kiểm tra nhé!';

      if (text.includes('past simple') || text.includes('quá khứ đơn')) {
        grammarTopic = 'Thì Quá khứ Đơn (Past Simple)';
        example1 = 'I <strong>went</strong> to school yesterday.';
        example2 = 'She <strong>studied</strong> hard last night.';
        challenge = 'Em thử kể 1 việc em đã làm hôm qua bằng tiếng Anh, dùng thì <strong>Past Simple</strong> nhé!';
      } else if (text.includes('future') || text.includes('tương lai')) {
        grammarTopic = 'Thì Tương lai (Future)';
        example1 = 'I <strong>will study</strong> hard tomorrow.';
        example2 = 'She <strong>is going to visit</strong> Ha Noi next week.';
        challenge = 'Em viết một câu về kế hoạch cuối tuần này bằng tiếng Anh nhé!';
      } else if (text.includes('câu điều kiện') || text.includes('conditional')) {
        grammarTopic = 'Câu điều kiện (Conditional)';
        example1 = '<strong>If</strong> I study hard, I <strong>will pass</strong> the exam.';
        example2 = '<strong>If</strong> it rains, we <strong>will stay</strong> at home.';
        challenge = 'Em thử đặt một câu điều kiện về ước mơ của em nhé!';
      } else if (text.includes('passive') || text.includes('bị động')) {
        grammarTopic = 'Câu bị động (Passive Voice)';
        example1 = 'This book <strong>was written</strong> by Nam.';
        example2 = 'The homework <strong>is done</strong> by students.';
        challenge = 'Em thử chuyển câu: "She teaches English." sang câu bị động và nhắn cho Hiệp Sĩ kiểm tra nhé!';
      }

      return badge(`🇬🇧 Tiếng Anh THCS Lớp ${grade}`, grammarTopic) +
        card('info', '📌 Câu hỏi Tiếng Anh của em', `
          <p><em>"${shortQ}"</em></p>
          <p>Chủ đề em đang hỏi: <strong>${grammarTopic}</strong></p>
          <p>✅ Ví dụ 1: ${example1}</p>
          <p>✅ Ví dụ 2: ${example2}</p>
          <p><em>Mẹo nhớ:</em> Liên hệ cấu trúc ngữ pháp với tình huống thực trong cuộc sống sẽ nhớ lâu hơn nhiều!</p>
        `) +
        card('highlight', '⚔️ Thử thách tự đặt câu', `
          <p>${challenge}</p>
          <p>Đừng sợ sai – Hiệp Sĩ sẽ sửa và giải thích tại sao nhé! 💪</p>
        `);
    }

    // ─── NHÓM 12: AI AN TOÀN ─────────────────────────────────────────────────
    if (mode === 'ai_safety' || text.includes('an toàn ai') || text.includes('kiểm chứng ai') ||
        text.includes('ai có đúng không') || text.includes('tin ai không')) {
      return badge('🛡️ AI An Toàn & Trách Nhiệm Số', 'Nguyên tắc C-H-A-M-S & Kiểm chứng') +
        card('info', '📋 Câu hỏi rất sâu sắc!', `
          <p><em>"${shortQ}"</em></p>
          <p>Trí tuệ nhân tạo (AI) đôi khi có thể xảy ra hiện tượng "<strong>ảo giác</strong>" — nói những thông tin nghe rất thuyết phục nhưng thực chất chưa chính xác. Vì vậy nguyên tắc quan trọng nhất: <strong>Luôn kiểm chứng độc lập!</strong></p>
        `) +
        card('highlight', '⚔️ 3 Nguồn đối chiếu chuẩn mực', `
          <p>1. <strong>Sách giáo khoa:</strong> Mở SGK chuẩn của Bộ GD&ĐT để so sánh lại định nghĩa và công thức.</p>
          <p>2. <strong>Thầy Cô bộ môn:</strong> Thầy Cô là người thầy đáng tin cậy nhất để kiểm tra phương pháp giải.</p>
          <p>3. <strong>Tự kiểm tra:</strong> Đặt bút thử lại kết quả, xem có mâu thuẫn dữ kiện nào không.</p>
        `);
    }

    // ─── NHÓM 13: HỌC SINH VỪA GỬI KẾT QUẢ TÍNH TOÁN ───────────────────────
    const isContinuation =
      /^(ra|kết quả|em tính|tổng là|bằng|được|x\s*=|em ra)\s*-?\d+/i.test(text) ||
      /^-?\d+(\s*(cm|cm²|m|km|kg|g|mol|lít|s|giây|h|giờ))?$/i.test(text) ||
      /^x\s*=\s*-?\d+/.test(text);

    if (isContinuation) {
      return badge('🎯 Tiến trình Socratic', 'Xác thực kết quả & Bước tiếp theo') +
        card('info', '🎉 Hoan hô tinh thần tự lực của em!', `
          <p>Em đã kiên trì tự mình tính toán và tìm ra kết quả: <strong>${esc(raw)}</strong>. Hiệp Sĩ ghi nhận và khen ngợi sự nỗ lực này của em!</p>
        `) +
        card('highlight', '⚔️ Hướng dẫn chặng tiếp theo', `
          <p>1. Hãy kiểm tra xem con số này đã là đáp số cuối cùng chưa, hay còn cần thế vào công thức khác.</p>
          <p>2. Đừng quên ghi kèm <strong>đơn vị đo</strong> (nếu là bài hình học hoặc vật lý).</p>
          <p>👉 Em hãy viết bước tính kế tiếp hoặc kết luận cuối cùng nhắn cho Hiệp Sĩ nhé!</p>
        `);
    }

    // ─── NHÓM 14: CÂU HỎI TỰ DO / KIẾN THỨC CHUNG (DEFAULT THÔNG MINH) ───────
    // Phân tích nội dung thực của câu hỏi để tạo câu hỏi gợi mở phù hợp
    const hasQuestion = text.includes('?') || text.includes('tại sao') || text.includes('là gì') ||
                        text.includes('như thế nào') || text.includes('thế nào') || text.includes('làm sao') ||
                        text.includes('ở đâu') || text.includes('khi nào') || text.includes('bao nhiêu');
    const hasFormula  = /[+\-*/=÷×]/.test(text) || text.includes('tính') || text.includes('bằng');

    // Nhận diện chủ đề từ nội dung
    let detectedSubject = subject || '';
    let topicHint = '';
    if (!detectedSubject) {
      if (/\b(x|y|z)\b/.test(text) && hasFormula) { detectedSubject = 'Đại số'; topicHint = 'tìm ẩn số'; }
      else if (hasNumbers && hasFormula) { detectedSubject = 'Toán học'; topicHint = 'tính toán'; }
      else if (text.includes('viết') || text.includes('văn')) detectedSubject = 'Ngữ văn';
      else if (/\b(h2o|hcl|naoh|co2)\b/i.test(text)) detectedSubject = 'Hóa học';
      else if (text.includes('sinh vật') || text.includes('tế bào')) detectedSubject = 'Sinh học';
      else if (text.includes('lịch sử') || text.includes('triều đại')) detectedSubject = 'Lịch sử';
      else if (text.includes('địa lý') || text.includes('châu') || text.includes('quốc gia')) detectedSubject = 'Địa lý';
    }

    // Tạo gợi mở DỰA TRÊN nội dung thực
    let socraticHint = '';
    if (hasNumbers && hasFormula) {
      socraticHint = `Hiệp Sĩ thấy trong câu hỏi có các số liệu: <strong>${numbers.slice(0,5).join(', ')}</strong>.<br>
        • Những số nào là dữ kiện đã biết?<br>
        • Em cần tìm/tính đại lượng nào?<br>
        👉 Liệt kê dữ kiện và đại lượng cần tìm để Hiệp Sĩ gợi mở từng bước!`;
    } else if (hasQuestion) {
      // Trích xuất từ khóa chủ đề từ câu hỏi thực
      socraticHint = `Câu hỏi của em rất thú vị! Trước khi Hiệp Sĩ chia sẻ, em thử suy nghĩ trước:<br>
        👉 Em đã biết gì về chủ đề "<strong>${esc(raw.slice(0, 60))}${raw.length > 60 ? '...' : ''}</strong>" từ bài học rồi?<br>
        (Chia sẻ những gì em biết để Hiệp Sĩ biết bắt đầu từ đâu cho phù hợp!)`;
    } else {
      socraticHint = `Em có thể nói thêm:<br>
        1. <strong>Mục tiêu cụ thể:</strong> Em muốn tính/hiểu/viết điều gì từ câu hỏi này?<br>
        2. <strong>Đã thử chưa?</strong> Em đã làm thử bước nào chưa, và vướng mắc ở đâu?<br>
        👉 Hiệp Sĩ sẽ đồng hành từ điểm em đang đứng!`;
    }

    const subjectTag = detectedSubject ? `📚 ${detectedSubject}` : '💬 Tự Vấn Học Tập Socratic';

    return badge(subjectTag, 'Phân tích câu hỏi & Gợi mở từng bước') +
      card('info', '📌 Hiệp Sĩ đã đọc kỹ câu hỏi của em', `
        <p><em>"${shortQ}"</em></p>
        ${detectedSubject ? `<p>🔍 Hiệp Sĩ nhận ra đây có vẻ là câu hỏi về <strong>${detectedSubject}</strong>${topicHint ? ' (' + topicHint + ')' : ''}. Đúng không em?</p>` : ''}
      `) +
      card('highlight', '⚔️ Hiệp Sĩ muốn hỏi em một điều', `<p>${socraticHint}</p>`);
  }
}

module.exports = new GeminiService();
