/**
 * DreamSpeak-SEL: Gemini AI Service & High-Precision Socratic Pedagogical Engine
 * Hỗ trợ Văn bản, Hình ảnh (Multimodal Vision), và Phản hồi Trực tuyến (Streaming)
 * Tích hợp Socratic Engine đa chủ đề theo chuẩn SGK Việt Nam & Khung 5 CHẠM SEL
 */

const https = require('https');
const { aiConfig } = require('../config/aiConfig');

class GeminiService {
  constructor() {
    this.apiKey = aiConfig.apiKey;
    this.model = aiConfig.model;
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
      generationConfig: this.generationConfig
    });

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    return this._makeRequest(apiUrl, payload);
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
      generationConfig: this.generationConfig
    });

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    return this._makeStreamingRequest(apiUrl, payload, onChunk);
  }

  /**
   * Chuẩn bị mảng contents theo chuẩn Google Gemini API
   */
  _buildContents(systemInstruction, userMessage, history, inlineImages) {
    const contents = [];

    // System turn định hình nhân cách Socratic Hiệp Sĩ Tự Vấn
    contents.push({
      role: 'user',
      parts: [{ text: systemInstruction + `

═══════════════════════════════════════════════════════
📌 NHẮC LẠI QUY TẮC VÀNG TUYỆT ĐỐI TRƯỚC KHI TRẢ LỜI:
1. ĐỌC KỸ câu hỏi thực tế của học sinh.
2. NHẮC LẠI chính xác nội dung/số liệu trong câu hỏi đó.
3. PHÂN TÍCH và DẪN DẮT dựa trên NỘI DUNG THỰC của câu hỏi đó.
4. KHÔNG dùng template cứng nhắc, KHÔNG tự bịa ví dụ thay thế.
5. Dùng KaTeX ($...$) cho công thức toán.
═══════════════════════════════════════════════════════` }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: "Tôi đã hiểu rõ sứ mệnh là Hiệp Sĩ Tự Vấn 24/7. Tôi cam kết: (1) luôn đọc kỹ và nhắc lại câu hỏi thực tế của học sinh, (2) phân tích dựa trên số liệu/nội dung thật trong câu hỏi đó, (3) không dùng template chung chung, (4) đồng hành gợi mở tư duy theo phương pháp Socrates, không làm hộ bài tập, (5) hỗ trợ 5 CHẠM SEL một cách cụ thể và chân thành." }]
    });

    // Lịch sử hội thoại (8 lượt gần nhất để AI nhớ ngữ cảnh tốt hơn)
    if (Array.isArray(history) && history.length > 0) {
      const recent = history.slice(-8);
      recent.forEach(item => {
        if (item && (item.sender || item.role) && (item.text || item.content)) {
          const role = (item.sender === 'user' || item.role === 'user') ? 'user' : 'model';
          const text = String(item.text || item.content).slice(0, 800);
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      });
    }

    // Turn hiện tại của học sinh
    const userParts = [];

    // Đính kèm ảnh nếu có (Gemini Multimodal Vision)
    if (Array.isArray(inlineImages) && inlineImages.length > 0) {
      inlineImages.forEach(img => {
        if (img && img.mimeType && img.base64Data) {
          userParts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64Data
            }
          });
        }
      });
    }

    userParts.push({
      text: userMessage || (inlineImages.length > 0 ? "Xin Hiệp Sĩ xem ảnh đề bài này và hướng dẫn em cách làm từng bước theo phương pháp Socrates!" : "")
    });

    contents.push({
      role: 'user',
      parts: userParts
    });

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
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                resolve(text);
              } else {
                reject(new Error('AI phản hồi dữ liệu rỗng.'));
              }
            } catch (e) {
              reject(new Error('Lỗi giải mã phản hồi JSON từ Gemini: ' + e.message));
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

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Yêu cầu tới Google Gemini bị timeout quá 35s.'));
      });

      req.on('error', (err) => {
        reject(new Error('Lỗi kết nối mạng tới Gemini API: ' + err.message));
      });

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
                  const delta = data.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (delta) {
                    fullText += delta;
                    onChunk(delta);
                  }
                } catch (e) {}
              }
            }
          }
        });

        res.on('end', () => {
          resolve(fullText);
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Stream Gemini bị timeout quá 45s.'));
      });

      req.on('error', (err) => {
        reject(new Error('Lỗi kết nối Stream Gemini: ' + err.message));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Socratic Pedagogical Engine (Chính xác theo chủ đề câu hỏi của học sinh)
   * Phiên bản 2.0: Phân tích THỰC tế câu hỏi, không dùng template cứng nhắc.
   * Mọi câu trả lời đều trích dẫn lại nguyên văn/số liệu từ câu hỏi của học sinh.
   */
  generateLocalSocraticResponse(userText, mode = 'study', grade = '7', subject = '') {
    const raw = (userText || '').trim();
    const text = raw.toLowerCase();

    // 1. KIỂM TRA ĐA CHẶNG: Học sinh gửi kết quả của bước tính trước
    const isContinuation =
      /^(ra|kết quả|em tính|em tính ra|tổng là|bằng|em ra|được|vế phải|x\s*=|x=)\s*-?\d+/i.test(text) ||
      /^-?\d+(\s*(cm|cm²|m|km|km\/h|kg|g|mol|lít))?$/i.test(text) ||
      /^(x\s*=\s*-?\d+|x\s*=\s*\d+\/\d+)$/i.test(text) ||
      text.includes('tính ra') || text.includes('kết quả là');

    if (isContinuation) {
      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🎯 Tiến trình Socratic: Xác thực kết quả</span>
          <span class="badge-target">Chặng giải quyết tiếp theo</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">🎉 Hoan hô tinh thần tự lực của em!</div>
          <p>Em đã kiên trì tự mình tính toán và tìm ra kết quả: <strong>${raw}</strong>. Hiệp sĩ ghi nhận và khen ngợi sự nỗ lực, tính tự lập này của em! Việc tự đặt bút tính giúp tư duy của em vững vàng và nhớ kiến thức lâu hơn rất nhiều.</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Hướng dẫn chặng tiếp theo</div>
          <p>Bây giờ ta chuyển sang bước kế tiếp:</p>
          <p>1. Hãy kiểm tra xem con số này đã là đáp số cuối cùng của đề bài chưa, hay còn cần thế vào công thức khác (như tính chu vi, diện tích, hay kết luận nghiệm $x$).</p>
          <p>2. Đừng quên ghi kèm đơn vị đo (nếu là bài toán hình học hoặc đại lượng vật lý).</p>
          <p>👉 Em hãy viết bước tính kế tiếp hoặc kết luận cuối cùng nhắn cho Hiệp Sĩ nhé!</p>
        </div>
      `;
    }

    // 2. CHẾ ĐỘ HIỂU BẠN – GIAO TIẾP (SEL 3 & 4)
    if (mode === 'relationship' || text.includes('cãi nhau') || text.includes('mâu thuẫn') || text.includes('bạn thân') || text.includes('giận không nói')) {
      // Trích xuất tên người, chủ đề mâu thuẫn từ câu hỏi thực
      const matchTenBan = raw.match(/(?:bạn|với)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ][a-zàáâãèéêìíòóôõùúýăđơư]+)/);
      const tenBan = matchTenBan ? matchTenBan[1] : null;

      // Phát hiện nguyên nhân mâu thuẫn
      const causeMatch = text.includes('bài tập') ? 'bài tập' :
        text.includes('nhóm') ? 'bài tập nhóm' :
        text.includes('chơi') ? 'chuyện chơi cùng' :
        text.includes('nói xấu') ? 'chuyện nói xấu' :
        text.includes('tiền') ? 'chuyện tiền bạc' : null;

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🤝 Hiểu Bạn – Giao Tiếp (SEL 3 & 4)</span>
          <span class="badge-target">Thấu cảm & Giảng hòa mâu thuẫn</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">🫂 Hiệp Sĩ hiểu tình huống của em:</div>
          <p><em>"${raw.slice(0, 150)}${raw.length > 150 ? '...' : ''}"</em></p>
          <p>Khi xảy ra mâu thuẫn${tenBan ? ` với bạn <strong>${tenBan}</strong>` : ' với bạn bè'}${causeMatch ? ` vì <strong>${causeMatch}</strong>` : ''}, cảm giác hụt hẫng và buồn bực là điều rất tự nhiên. Tuy nhiên, một tình bạn đẹp luôn đáng để gìn giữ.</p>
          <p>Hãy dành một khoảng lặng để <strong>thấu cảm</strong>: ${tenBan ? `Bạn <strong>${tenBan}</strong>` : 'Bạn ấy'} lúc này có thể cũng đang cảm thấy tổn thương hoặc có hiểu nhầm gì đó chăng?</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Hướng dẫn 3 bước mở lời giảng hòa:</div>
          <p>1. <em>Xác nhận cảm xúc:</em> "Hôm nay chúng mình${causeMatch ? ` cãi nhau vì ${causeMatch}` : ''}, về nhà mình thấy rất buồn."</p>
          <p>2. <em>Khẳng định giá trị:</em> "Mình rất trân trọng tình bạn với ${tenBan || 'bạn'}."</p>
          <p>3. <em>Mời gọi cởi mở:</em> "Khi nào bình tĩnh lại, chúng mình ngồi nói chuyện nhẹ nhàng để hiểu nhau hơn nhé!"</p>
          <p>👉 Em có muốn cùng Hiệp Sĩ điều chỉnh lại câu chữ cho phù hợp với tính cách của ${tenBan ? `bạn <strong>${tenBan}</strong>` : 'bạn ấy'} không?</p>
        </div>
      `;
    }

    // 3. CHẾ ĐỘ AI AN TOÀN & TRÁCH NHIỆM SỐ (C-H-A-M-S)
    if (mode === 'ai_safety' || text.includes('an toàn ai') || text.includes('kiểm chứng') || text.includes('có đúng không')) {
      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🛡️ AI An Toàn & Trách Nhiệm Số</span>
          <span class="badge-target">Nguyên tắc C-H-A-M-S & Kiểm chứng</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📋 Khuyến khích kiểm chứng độc lập</div>
          <p>Câu hỏi của em rất sâu sắc! Trí tuệ nhân tạo (AI) hoạt động dựa trên mô hình ngôn ngữ lớn, nên đôi khi có thể xảy ra hiện tượng "ảo giác" (nói những thông tin nghe rất thuyết phục nhưng thực chất chưa chính xác).</p>
          <p>Vì vậy, nguyên tắc quan trọng nhất là: <strong>Luôn kiểm chứng độc lập mọi thông tin do AI cung cấp!</strong></p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ 3 Nguồn đối chiếu chuẩn mực:</div>
          <p>1. <strong>Đối chiếu Sách giáo khoa chuẩn:</strong> Luôn mở <strong>Sách giáo khoa</strong> của Bộ GD&amp;ĐT để so sánh lại định nghĩa, công thức và ví dụ mẫu.</p>
          <p>2. <strong>Hỏi ý kiến Thầy Cô bộ môn:</strong> <strong>Thầy Cô</strong> là người thầy chỉ dẫn đáng tin cậy nhất để em kiểm tra phương pháp giải và cách lập luận.</p>
          <p>3. <strong>Tự kiểm tra lại từng phép tính:</strong> Đặt bút tự thế số và thử lại kết quả xem có mâu thuẫn dữ kiện nào không.</p>
        </div>
      `;
    }

    // 4. CHẾ ĐỘ RA QUYẾT ĐỊNH CÓ TRÁCH NHIỆM (SEL 5)
    if (mode === 'decision' || text.includes('phân vân') || text.includes('có nên') || text.includes('quyết định')) {
      // Trích xuất tình huống cụ thể từ câu hỏi học sinh
      const shortRaw = raw.slice(0, 180);

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">⚖️ Ra Quyết Định Có Trách Nhiệm (SEL 5)</span>
          <span class="badge-target">Khung phân tích Quyết Định & Hệ quả</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📋 Hiệp Sĩ hiểu tình huống của em:</div>
          <p><em>"${shortRaw}${raw.length > 180 ? '...' : ''}"</em></p>
          <p>Một người trưởng thành là người biết dừng lại suy nghĩ trước khi hành động, dũng cảm nhìn nhận <strong>hệ quả</strong> và tự chịu <strong>trách nhiệm</strong> với lựa chọn của bản thân.</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ 3 Câu hỏi tự vấn trước khi quyết định:</div>
          <p>1. <strong>Hệ quả trực tiếp:</strong> Nếu em chọn làm điều đó ngay bây giờ, ai sẽ bị ảnh hưởng và như thế nào?</p>
          <p>2. <strong>Lâu dài:</strong> 1 tuần hoặc 1 tháng sau, em sẽ cảm thấy thế nào về lựa chọn này?</p>
          <p>3. <strong>Kiểm tra giá trị:</strong> Lựa chọn này có an toàn, có tôn trọng bản thân và người khác không?</p>
          <p>👉 Em thử trả lời 3 câu hỏi trên dựa trên tình huống thực của em rồi nhắn cho Hiệp Sĩ cùng phân tích nhé!</p>
        </div>
      `;
    }

    // 5. CHẾ ĐỘ KHÁM PHÁ CẢM XÚC (SEL 1 & 2)
    const isEmotionKeyword =
      text.includes('áp lực') || text.includes('lo âu') || text.includes('lo lắng') ||
      text.includes('căng thẳng') || text.includes('sợ điểm kém') ||
      text.includes('buồn') || text.includes('chán') || text.includes('mệt') ||
      text.includes('khóc') || text.includes('tủi thân') || text.includes('cô đơn') ||
      text.includes('không có bạn') || text.includes('bị cô lập') ||
      text.includes('điểm kém') || text.includes('điểm thấp') ||
      text.includes('bị điểm') || text.includes('điểm tệ') ||
      text.includes('bị la') || text.includes('bị mắng') ||
      text.includes('thất bại') || text.includes('không hiểu gì') ||
      text.includes('tức giận') || text.includes('bực bội') || text.includes('ghét') ||
      text.includes('không muốn đi học') || text.includes('không thích trường') ||
      text.includes('nhớ nhà') || text.includes('xa nhà') ||
      text.includes('bạo lực') || text.includes('bắt nạt') ||
      text.includes('buồn chán') || text.includes('rất buồn') ||
      text.includes('thấy buồn') || text.includes('em buồn') ||
      text.includes('thấy chán') || text.includes('em chán') ||
      text.includes('thấy mệt') || text.includes('em mệt');

    // Trích xuất cảm xúc CỤ THỂ từ câu hỏi (thay vì dùng label chung)
    // Ưu tiên trích dẫn nguyên văn thay vì gán nhãn chung chung
    let emotionLabel = 'áp lực và lo lắng';
    if (text.includes('buồn') || text.includes('tủi thân') || text.includes('khóc')) emotionLabel = 'buồn và tủi thân';
    else if (text.includes('chán') || text.includes('mệt')) emotionLabel = 'mệt mỏi và chán nản';
    else if (text.includes('cô đơn') || text.includes('không có bạn') || text.includes('bị cô lập')) emotionLabel = 'cô đơn và thiếu kết nối bạn bè';
    else if (text.includes('điểm kém') || text.includes('điểm thấp') || text.includes('bị điểm') || text.includes('điểm tệ')) emotionLabel = 'buồn vì kết quả học tập chưa như mong muốn';
    else if (text.includes('bị la') || text.includes('bị mắng')) emotionLabel = 'tổn thương vì bị la mắng';
    else if (text.includes('tức giận') || text.includes('bực bội') || text.includes('ghét')) emotionLabel = 'tức giận và bực bội';
    else if (text.includes('bắt nạt') || text.includes('bạo lực')) emotionLabel = 'sợ hãi và bất an vì bị bắt nạt';
    else if (text.includes('không muốn đi học') || text.includes('không thích trường')) emotionLabel = 'không muốn đến trường';
    else if (text.includes('nhớ nhà') || text.includes('xa nhà')) emotionLabel = 'nhớ nhà và cô đơn xa gia đình';

    // Trích xuất chi tiết cụ thể: điểm số, môn học, tên người...
    const matchDiem = raw.match(/điểm\s*(\d+)/i);
    const matchMon = raw.match(/(?:môn|bài)\s*(toán|văn|anh|lý|hóa|sinh|sử|địa|gdcd|tiếng anh|khoa học|tin)/i);
    const matchTen = raw.match(/(?:bạn|thầy|cô)\s+([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ][a-zàáâãèéêìíòóôõùúýăđơư]+)/);

    let specificDetail = '';
    if (matchDiem) specificDetail += ` điểm <strong>${matchDiem[0]}</strong>`;
    if (matchMon) specificDetail += ` môn <strong>${matchMon[1]}</strong>`;
    if (matchTen) specificDetail += ` với <strong>${matchTen[0]}</strong>`;

    if (mode === 'emotion' || isEmotionKeyword) {
      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🌿 Khám Phá Cảm Xúc (SEL 1 & 2)</span>
          <span class="badge-target">Chạm Mình & Điều Hòa Cảm Xúc</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">🫂 Hiệp Sĩ luôn lắng nghe và đồng hành cùng em</div>
          <p>Hiệp Sĩ hiểu em vừa chia sẻ: <em>"${raw.slice(0, 120)}${raw.length > 120 ? '...' : ''}"</em></p>
          <p>Em đang cảm thấy <strong>${emotionLabel}</strong>${specificDetail ? ' — liên quan đến' + specificDetail : ''}. Điều đó hoàn toàn tự nhiên và em không hề đơn độc – rất nhiều bạn học sinh Lớp ${grade} cũng trải qua những cảm xúc như vậy.</p>
          <p>Cảm xúc của em là thật và quan trọng. Hiệp Sĩ ở đây để lắng nghe, không phán xét em đâu nhé!</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">💬 Hiệp Sĩ muốn hiểu em hơn:</div>
          <p>👉 <strong>Điều gì cụ thể${specificDetail ? ' về' + specificDetail : ''} đang làm em khó chịu nhất lúc này?</strong></p>
          <p>Em có thể kể thêm cho Hiệp Sĩ nghe không? Đôi khi chỉ cần nói ra, lòng mình đã nhẹ hơn rất nhiều. Hiệp Sĩ sẽ cùng em suy nghĩ xem chúng mình có thể làm gì để cảm thấy tốt hơn nhé! 🌱</p>
        </div>
      `;
    }

    // 6. TOÁN HỌC: PHƯƠNG TRÌNH / TÌM X (Algebra / Equations)
    const isEquation =
      text.includes('phương trình') ||
      text.includes('tìm x') ||
      /\b\d*\.?\d*\s*x\b.*=/.test(text) ||
      /=.*\b\d*\.?\d*\s*x\b/.test(text);

    if (isEquation) {
      // Trích xuất phương trình THỰC TẾ từ câu hỏi học sinh
      // Hỗ trợ dạng: ax + b = c, ax - b = c, ax = c, x + b = c
      const matchLinear = raw.match(/(-?\d*\.?\d*)\s*x\s*([+-])\s*(\d+\.?\d*)\s*=\s*(-?\d+\.?\d*)/i)
        || raw.match(/x\s*([+-])\s*(\d+\.?\d*)\s*=\s*(-?\d+\.?\d*)/i)
        || raw.match(/(-?\d*\.?\d*)\s*x\s*=\s*(-?\d+\.?\d*)/i);

      // Lấy nguyên câu/cụm chứa phương trình để hiển thị
      const equationInText = raw.match(/[\d.]*\s*x[\s\d.+\-*/=]+\d+/i);
      const displayEq = equationInText ? equationInText[0].trim() : raw.slice(0, 60);

      let stepHint = '';
      if (matchLinear) {
        // Dạng ax + b = c
        const a = matchLinear[1] || '1';
        const sign = matchLinear[2];
        const b = matchLinear[3];
        const c = matchLinear[4];
        const oppositeSign = sign === '+' ? '−' : '+';
        const aDisplay = (a === '' || a === '1') ? '' : a;
        stepHint = `
          <p>Với phương trình <strong>${displayEq}</strong>, em áp dụng <strong>quy tắc chuyển vế</strong>:</p>
          <p style="text-align:center; font-size:1.1rem; font-weight:600;">$${aDisplay}x = ${c} ${oppositeSign} ${b}$</p>
          <p>👉 Em hãy tính vế phải: $${c} ${oppositeSign} ${b} = ?$ rồi nhắn kết quả cho Hiệp Sĩ nhé!</p>
        `;
      } else {
        stepHint = `
          <p>Em đã nhắc đến phương trình: <strong>"${displayEq}"</strong></p>
          <p>👉 Em hãy viết lại nguyên phương trình đó (dạng: ...x + ... = ...) để Hiệp Sĩ cùng giải từng bước với em nhé!</p>
        `;
      }

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">📐 Toán học Lớp ${grade}: Phương trình một ẩn</span>
          <span class="badge-target">Phân tích đề bài thực tế của em</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Hiệp Sĩ đã đọc câu hỏi của em:</div>
          <p><em>"${raw.slice(0, 150)}${raw.length > 150 ? '...' : ''}"</em></p>
          <p>Đây là dạng bài <strong>Phương trình bậc nhất một ẩn</strong> — tìm giá trị của $x$. Hiệp Sĩ sẽ gợi mở từng bước để em tự tìm ra kết quả!</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Bước 1 — Chuyển vế:</div>
          ${stepHint}
        </div>
      `;
    }

    // 7. TOÁN HỌC: HÌNH VUÔNG / HÌNH CHỮ NHẬT / TAM GIÁC
    if (text.includes('hình vuông')) {
      // Trích xuất số đo cạnh THỰC từ câu hỏi
      const matchSide = raw.match(/cạnh\s*(bằng|là|dài|=)?\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i)
        || raw.match(/(\d+\.?\d*)\s*(cm|m|dm|mm)/i);
      const side = matchSide ? (matchSide[2] || matchSide[1]) : null;
      const unit = matchSide ? (matchSide[3] || matchSide[2] || 'cm') : 'cm';
      const sideDisplay = side ? `${side} ${unit}` : '(số đo chưa rõ)';

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">📐 Toán học Lớp ${grade}: Hình học phẳng</span>
          <span class="badge-target">Hình vuông — Chu vi & Diện tích</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Hiệp Sĩ đọc câu hỏi của em:</div>
          <p><em>"${raw.slice(0, 150)}${raw.length > 150 ? '...' : ''}"</em></p>
          ${side
            ? `<p>Hiệp Sĩ thấy hình vuông trong đề bài có cạnh $a = ${side}\\text{ ${unit}}$. Hai công thức cần nhớ:</p>
               <p>1. Chu vi: $P = 4 \\times a$</p>
               <p>2. Diện tích: $S = a^2$</p>`
            : `<p>Em có thể cho Hiệp Sĩ biết <strong>cạnh của hình vuông bằng bao nhiêu</strong> không? Hiệp Sĩ sẽ gợi mở từng bước!</p>`
          }
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Thử thách bước 1:</div>
          ${side
            ? `<p>Em hãy thay $a = ${side}$ vào công thức chu vi:</p>
               <p style="text-align:center; font-size:1.1rem; font-weight:600;">$P = 4 \\times ${side} = ?$</p>
               <p>👉 Em tính kết quả rồi nhắn cho Hiệp Sĩ nhé! (đơn vị: ${unit})</p>`
            : `<p>👉 Hãy cho Hiệp Sĩ biết số đo cạnh hình vuông để cùng giải nhé!</p>`
          }
        </div>
      `;
    }

    if (text.includes('hình chữ nhật')) {
      // Trích xuất chiều dài và chiều rộng
      const matchDims = raw.match(/(\d+\.?\d*)\s*(cm|m|dm|mm)?\s*[,×xvà]\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i);
      const matchDai = raw.match(/(?:dài|chiều dài)\s*(?:bằng|là|=)?\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i);
      const matchRong = raw.match(/(?:rộng|chiều rộng)\s*(?:bằng|là|=)?\s*(\d+\.?\d*)\s*(cm|m|dm|mm)?/i);

      const dai = matchDai ? matchDai[1] : (matchDims ? matchDims[1] : null);
      const rong = matchRong ? matchRong[1] : (matchDims ? matchDims[3] : null);
      const unit = (matchDai && matchDai[2]) || (matchDims && matchDims[2]) || 'cm';

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">📐 Toán học Lớp ${grade}: Hình học phẳng</span>
          <span class="badge-target">Hình chữ nhật — Chu vi & Diện tích</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Đề bài của em:</div>
          <p><em>"${raw.slice(0, 150)}${raw.length > 150 ? '...' : ''}"</em></p>
          ${(dai && rong)
            ? `<p>Hiệp Sĩ thấy hình chữ nhật có: chiều dài $a = ${dai}\\text{ ${unit}}$, chiều rộng $b = ${rong}\\text{ ${unit}}$.</p>
               <p>• Chu vi: $P = 2 \\times (a + b)$</p>
               <p>• Diện tích: $S = a \\times b$</p>`
            : `<p>Cho Hiệp Sĩ biết <strong>chiều dài và chiều rộng</strong> của hình chữ nhật để cùng tính nhé!</p>`
          }
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Thử thách bước 1:</div>
          ${(dai && rong)
            ? `<p>Em hãy tính tổng hai kích thước trước: $${dai} + ${rong} = ?$</p>
               <p>👉 Nhắn kết quả cho Hiệp Sĩ, chúng mình sẽ tiếp tục bước 2!</p>`
            : `<p>👉 Viết chiều dài và chiều rộng (ví dụ: "dài 8cm, rộng 5cm") để Hiệp Sĩ gợi mở nhé!</p>`
          }
        </div>
      `;
    }

    if (text.includes('tam giác') && (text.includes('vuông') || text.includes('pythagore') || text.includes('cạnh huyền'))) {
      // Trích xuất hai cạnh góc vuông thực tế
      const nums = raw.match(/\d+\.?\d*/g) || [];
      const hasRealNums = nums.length >= 2;

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">📐 Toán học Lớp ${grade}: Định lý Pythagore</span>
          <span class="badge-target">Tam giác vuông & Cạnh huyền</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Đề bài của em:</div>
          <p><em>"${raw.slice(0, 150)}${raw.length > 150 ? '...' : ''}"</em></p>
          <p>Định lý Pythagore: Trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông:</p>
          <p style="text-align:center; font-size:1.15rem; font-weight:700;">$c^2 = a^2 + b^2$</p>
          ${hasRealNums
            ? `<p>Hiệp Sĩ thấy trong đề bài có các số: <strong>${nums.slice(0, 4).join(', ')}</strong>. Em xác định xem số nào là hai cạnh góc vuông nhé!</p>`
            : `<p>Em cho Hiệp Sĩ biết các cạnh của tam giác để cùng áp dụng định lý nhé!</p>`
          }
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Thử thách bước 1:</div>
          ${hasRealNums
            ? `<p>Em hãy thay hai cạnh góc vuông $a$ và $b$ vào và tính $a^2 + b^2 = ?$</p>
               <p>👉 Nhắn kết quả tính được cho Hiệp Sĩ kiểm tra nhé!</p>`
            : `<p>👉 Em hãy viết: "Hai cạnh góc vuông là ... và ..., tìm cạnh huyền" để Hiệp Sĩ gợi mở từng bước!</p>`
          }
        </div>
      `;
    }

    // 8. KHOA HỌC TỰ NHIÊN / VẬT LÝ: CÔNG THỨC VẬN TỐC
    if (text.includes('vận tốc') || text.includes('tốc độ') || text.includes('chuyển động')) {
      // Trích xuất số liệu thực từ bài toán
      const matchS = raw.match(/(?:quãng đường|s)\s*[=:bằng là]\s*(\d+\.?\d*)\s*(m|km|cm)?/i);
      const matchT = raw.match(/(?:thời gian|t)\s*[=:bằng là]\s*(\d+\.?\d*)\s*(s|giây|phút|giờ|h)?/i);
      const matchV = raw.match(/(?:vận tốc|tốc độ|v)\s*[=:bằng là]\s*(\d+\.?\d*)\s*(m\/s|km\/h|m.s)?/i);

      // Phát hiện câu hỏi yêu cầu tính đại lượng nào
      const findV = text.includes('tính vận tốc') || text.includes('tính tốc độ') || (matchS && matchT && !matchV);
      const findS = text.includes('tính quãng đường') || (matchV && matchT && !matchS);
      const findT = text.includes('tính thời gian') || (matchV && matchS && !matchT);

      let formulaHint = '';
      if (findV && matchS && matchT) {
        formulaHint = `<p>Em cần tính vận tốc, với $s = ${matchS[1]}\\text{ ${matchS[2] || 'm'}}$ và $t = ${matchT[1]}\\text{ ${matchT[2] || 's'}}$:</p>
          <p style="text-align:center; font-size:1.1rem; font-weight:600;">$v = \\frac{s}{t} = \\frac{${matchS[1]}}{${matchT[1]}} = ?$</p>
          <p>👉 Em tính phép chia rồi nhắn kết quả (kèm đơn vị) cho Hiệp Sĩ nhé!</p>`;
      } else if (findS && matchV && matchT) {
        formulaHint = `<p>Em cần tính quãng đường, với $v = ${matchV[1]}$ và $t = ${matchT[1]}$:</p>
          <p style="text-align:center; font-size:1.1rem; font-weight:600;">$s = v \\times t = ${matchV[1]} \\times ${matchT[1]} = ?$</p>
          <p>👉 Em thực hiện phép nhân rồi nhắn kết quả (kèm đơn vị) cho Hiệp Sĩ nhé!</p>`;
      } else if (findT && matchV && matchS) {
        formulaHint = `<p>Em cần tính thời gian, với $s = ${matchS[1]}$ và $v = ${matchV[1]}$:</p>
          <p style="text-align:center; font-size:1.1rem; font-weight:600;">$t = \\frac{s}{v} = \\frac{${matchS[1]}}{${matchV[1]}} = ?$</p>
          <p>👉 Em tính phép chia rồi nhắn kết quả cho Hiệp Sĩ nhé!</p>`;
      } else {
        formulaHint = `<p>Em hãy cho Hiệp Sĩ biết:</p>
          <p>• Đề bài <strong>đã cho</strong> những đại lượng nào (s, t, hay v)?</p>
          <p>• Đề bài <strong>yêu cầu tính</strong> đại lượng nào?</p>
          <p>👉 Nhắn thêm thông tin để Hiệp Sĩ gợi mở từng bước với số liệu thực của em nhé!</p>`;
      }

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🔬 Khoa học tự nhiên Lớp ${grade}: Vật lí</span>
          <span class="badge-target">Chuyển động — Công thức vận tốc</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Đề bài của em:</div>
          <p><em>"${raw.slice(0, 150)}${raw.length > 150 ? '...' : ''}"</em></p>
          <p>Công thức cơ bản:</p>
          <p style="text-align:center; font-size:1.25rem; font-weight:700;">$v = \\frac{s}{t}$</p>
          <p>• $v$: Vận tốc ($\\text{m/s}$ hoặc $\\text{km/h}$) &nbsp;• $s$: Quãng đường ($\\text{m}$ hoặc $\\text{km}$) &nbsp;• $t$: Thời gian ($\\text{s}$ hoặc $\\text{h}$)</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Áp dụng vào đề bài của em:</div>
          ${formulaHint}
        </div>
      `;
    }

    // 9. LỊCH SỬ & ĐỊA LÝ / KIẾN THỨC: THỦ ĐÔ NƯỚC PHÁP / VIỆT NAM
    if (text.includes('thủ đô') && (text.includes('pháp') || text.includes('france'))) {
      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🗺️ Lịch sử & Địa lí: Địa lí Thế giới</span>
          <span class="badge-target">Thủ đô các quốc gia</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">🏛️ Câu trả lời chính xác:</div>
          <p>Thủ đô của nước Pháp là thành phố <strong>Paris</strong>.</p>
          <p>Paris còn được mệnh danh là <em>"Kinh đô Ánh sáng"</em>, nằm bên bờ dòng sông Seine thơ mộng và là một trong những trung tâm văn hóa, nghệ thuật, kinh tế lớn nhất của châu Âu và thế giới.</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Câu hỏi gợi mở khám phá:</div>
          <p>Em có biết công trình kiến trúc bằng thép biểu tượng nổi tiếng thế giới được xây dựng tại Paris nhân dịp Triển lãm Thế giới năm 1889 là công trình nào không?</p>
          <p>👉 Hãy nhắn tên công trình đó cho Hiệp Sĩ nhé!</p>
        </div>
      `;
    }

    if (text.includes('thủ đô') && (text.includes('việt nam') || text.includes('nước ta'))) {
      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🗺️ Lịch sử & Địa lí: Địa lí Việt Nam</span>
          <span class="badge-target">Thủ đô Hà Nội nghìn năm văn hiến</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">🏛️ Câu trả lời chính xác:</div>
          <p>Thủ đô của nước Cộng hòa Xã hội Chủ nghĩa Việt Nam là thành phố <strong>Hà Nội</strong>.</p>
          <p>Hà Nội là trái tim của cả nước, trung tâm chính trị, văn hóa, giáo dục và khoa học lớn với hơn 1000 năm lịch sử kể từ mốc Chiếu dời đô của vua Lý Thái Tổ năm 1010.</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Thử thách mở rộng:</div>
          <p>Tên gọi trước đây của Hà Nội gắn liền với truyền thuyết rồng vàng bay lên là gì, em có nhớ không?</p>
        </div>
      `;
    }

    // 10. NGỮ VĂN
    if (text.includes('tập làm văn') || text.includes('tả cảnh') || text.includes('lập dàn ý') || text.includes('ngữ văn')) {
      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">📖 Ngữ văn THCS: Kỹ năng Viết bài</span>
          <span class="badge-target">Gợi mở ý tưởng theo phương pháp Socrates</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Nguyên tắc làm văn chân thực & sáng tạo:</div>
          <p>Hiệp Sĩ sẽ không viết bài văn mẫu sẵn để em chép, vì bài văn hay nhất phải xuất phát từ chính đôi mắt quan sát và trái tim rung động của em.</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ 4 Câu hỏi gợi mở để em tự lập dàn ý:</div>
          <p>1. <strong>Màu sắc (Thị giác):</strong> Khi quan sát đối tượng này, màu sắc nào làm em ấn tượng nhất?</p>
          <p>2. <strong>Âm thanh (Thính giác):</strong> Em nghe thấy những thanh âm quen thuộc nào xung quanh?</p>
          <p>3. <strong>Hương vị (Khứu giác):</strong> Có mùi hương đặc trưng nào gắn liền với kỷ niệm của em?</p>
          <p>4. <strong>Cảm xúc:</strong> Em cảm thấy yêu quý, tự hào hay biết ơn điều gì nhất?</p>
          <p>👉 Hãy thử chọn 1 chi tiết em thích nhất và viết thành 1 câu văn gửi lại cho Hiệp Sĩ sửa nhé!</p>
        </div>
      `;
    }

    // 11. TIẾNG ANH: Ngữ pháp, Thì, Từ vựng
    const isEnglish =
      subject.toLowerCase().includes('tiếng anh') ||
      text.includes('grammar') || text.includes('tiếng anh') || text.includes('english') ||
      text.includes('tense') || text.includes('thì hiện tại') || text.includes('thì quá khứ') ||
      text.includes('thì tương lai') || text.includes('present perfect') ||
      text.includes('past simple') || text.includes('future') ||
      text.includes('vocabulary') || text.includes('từ vựng') ||
      text.includes('câu điều kiện') || text.includes('passive voice') ||
      text.includes('mệnh đề') || text.includes('động từ') && text.includes('anh');

    if (isEnglish) {
      // Nhận diện thì cụ thể để ví dụ phù hợp
      let grammarTopic = 'ngữ pháp tiếng Anh';
      let example1 = 'I <strong>have studied</strong> English for 3 years. (Tôi đã học tiếng Anh được 3 năm.)';
      let example2 = 'She <strong>has just finished</strong> her homework. (Cô ấy vừa mới làm xong bài tập.)';
      let selfPractice = 'Em hãy thử đặt một câu về bản thân em dùng thì <strong>Present Perfect</strong> (Hiện tại hoàn thành) rồi nhắn cho Hiệp Sĩ kiểm tra nhé!';

      if (text.includes('past simple') || text.includes('quá khứ đơn')) {
        grammarTopic = 'Thì Quá khứ Đơn (Past Simple)';
        example1 = 'I <strong>went</strong> to school yesterday. (Hôm qua tôi đã đi học.)';
        example2 = 'She <strong>studied</strong> hard last night. (Tối qua cô ấy đã học chăm chỉ.)';
        selfPractice = 'Em hãy thử kể một việc em đã làm hôm qua bằng tiếng Anh, dùng thì <strong>Past Simple</strong> nhé!';
      } else if (text.includes('future') || text.includes('tương lai')) {
        grammarTopic = 'Thì Tương lai (Future)';
        example1 = 'I <strong>will study</strong> hard tomorrow. (Ngày mai tôi sẽ học chăm chỉ.)';
        example2 = 'She <strong>is going to visit</strong> Ha Noi next week. (Tuần tới cô ấy sẽ đến thăm Hà Nội.)';
        selfPractice = 'Em hãy viết một câu về kế hoạch của em vào cuối tuần này bằng tiếng Anh nhé!';
      } else if (text.includes('câu điều kiện') || text.includes('conditional')) {
        grammarTopic = 'Câu điều kiện (Conditional)';
        example1 = '<strong>If</strong> I study hard, I <strong>will pass</strong> the exam. (Nếu tôi học chăm, tôi sẽ thi đỗ.)';
        example2 = '<strong>If</strong> it rains, we <strong>will stay</strong> at home. (Nếu trời mưa, chúng tôi sẽ ở nhà.)';
        selfPractice = 'Em hãy thử đặt một câu điều kiện về ước mơ hoặc dự định của em rồi nhắn cho Hiệp Sĩ nhé!';
      } else if (text.includes('passive') || text.includes('bị động')) {
        grammarTopic = 'Câu bị động (Passive Voice)';
        example1 = 'This book <strong>was written</strong> by Nam. (Quyển sách này được Nam viết.)';
        example2 = 'The homework <strong>is done</strong> by students. (Bài tập được làm bởi học sinh.)';
        selfPractice = 'Em hãy thử chuyển câu chủ động sau sang câu bị động: "She teaches English." rồi nhắn cho Hiệp Sĩ kiểm tra nhé!';
      }

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🇬🇧 Tiếng Anh THCS: Ngữ pháp</span>
          <span class="badge-target">${grammarTopic}</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Giải thích bằng ví dụ thực tế:</div>
          <p>Chủ đề em đang hỏi là <strong>${grammarTopic}</strong>. Hiệp Sĩ sẽ giải thích qua ví dụ gần gũi nhé!</p>
          <p>✅ Ví dụ 1: ${example1}</p>
          <p>✅ Ví dụ 2: ${example2}</p>
          <p><em>Mẹo nhớ nhanh:</em> Hãy liên hệ cấu trúc ngữ pháp với những tình huống thật trong cuộc sống hằng ngày của em – sẽ nhớ lâu hơn nhiều so với học thuộc lòng!</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Thử thách tự đặt câu:</div>
          <p>${selfPractice}</p>
          <p>Đừng sợ sai – Hiệp Sĩ sẽ sửa và giải thích tại sao nhé! 💪</p>
        </div>
      `;
    }

    // 12. VẬT LÝ: Khái niệm cơ bản (Lực, Áp suất, Nhiệt độ, Điện trở)
    const isPhysicsConcept =
      text.includes('lực là gì') || text.includes('lực tác dụng') ||
      text.includes('lực kéo') || text.includes('lực đẩy') ||
      text.includes('lực ma sát') || text.includes('ma sát là') ||
      text.includes('áp suất là gì') || text.includes('áp suất') ||
      text.includes('nhiệt độ là') || text.includes('nhiệt độ') && (text.includes('là gì') || text.includes('định nghĩa')) ||
      text.includes('điện trở là') || text.includes('điện trở') && (text.includes('là gì') || text.includes('định nghĩa')) ||
      text.includes('định luật newton') || text.includes('trọng lực') || text.includes('trọng lượng là');

    if (isPhysicsConcept) {
      let physTopic = 'Lực trong Vật lí';
      let physDef = 'Lực là tác dụng của vật này lên vật khác, có thể làm vật <strong>thay đổi vận tốc</strong> (tăng tốc, giảm tốc, đổi hướng) hoặc làm vật <strong>biến dạng</strong>.';
      let physExample = '• Em đẩy cánh cửa → lực đẩy làm cửa chuyển động.<br>• Trái cây rơi xuống đất → trọng lực kéo trái cây về phía tâm Trái Đất.<br>• Hai tay xoa vào nhau → lực ma sát tạo ra nhiệt.';
      let physChallenge = 'Em hãy tìm 1 ví dụ về lực trong cuộc sống hằng ngày (ở nhà, trường học, trên đường) rồi kể cho Hiệp Sĩ nghe nhé!';

      if (text.includes('ma sát')) {
        physTopic = 'Lực Ma sát';
        physDef = 'Lực ma sát là lực cản trở chuyển động, xuất hiện khi hai bề mặt tiếp xúc và có xu hướng trượt lên nhau. Lực ma sát có thể <strong>có lợi</strong> hoặc <strong>có hại</strong> tùy tình huống.';
        physExample = '• <strong>Có lợi:</strong> Ma sát giúp ta đi lại mà không bị trượt ngã, giúp xe phanh lại được.<br>• <strong>Có hại:</strong> Ma sát làm mòn bánh xe, làm nóng các bộ phận máy móc.';
        physChallenge = 'Em hãy kể 1 ví dụ ma sát có lợi và 1 ví dụ ma sát có hại trong cuộc sống rồi nhắn cho Hiệp Sĩ nhé!';
      } else if (text.includes('áp suất')) {
        physTopic = 'Áp suất';
        physDef = 'Áp suất là lực tác dụng <strong>vuông góc</strong> lên một đơn vị diện tích bề mặt bị ép. Công thức: <strong>p = F / S</strong> (trong đó F là lực ép, S là diện tích bị ép).';
        physExample = '• Mũi kim nhọn tạo áp suất lớn hơn đầu ngón tay dù cùng lực bóp.<br>• Người đi trên tuyết dùng ván trượt rộng để giảm áp suất, không lún sâu.<br>• Đơn vị áp suất: Pascal (Pa).';
        physChallenge = 'Tại sao dao cắt lại cần lưỡi sắc bén? Em hãy giải thích bằng khái niệm áp suất nhé!';
      } else if (text.includes('nhiệt độ')) {
        physTopic = 'Nhiệt độ';
        physDef = 'Nhiệt độ là đại lượng vật lí đo mức độ <strong>nóng hay lạnh</strong> của một vật. Đơn vị thường dùng là <strong>độ Celsius (°C)</strong> hoặc Kelvin (K).';
        physExample = '• Nước sôi ở 100°C, nước đá tan ở 0°C.<br>• Nhiệt kế y tế đo thân nhiệt người bình thường khoảng 36,5°C–37°C.';
        physChallenge = 'Em hãy kể một dụng cụ trong gia đình có liên quan đến nhiệt độ và nó hoạt động dựa trên nguyên tắc gì nhé!';
      } else if (text.includes('điện trở')) {
        physTopic = 'Điện trở';
        physDef = 'Điện trở là đại lượng đặc trưng cho sự cản trở dòng điện của một vật dẫn. Ký hiệu: <strong>R</strong>, đơn vị: <strong>Ohm (Ω)</strong>. Công thức Định luật Ohm: <strong>U = I × R</strong>.';
        physExample = '• Dây đồng có điện trở nhỏ → dẫn điện tốt.<br>• Thanh than (graphite) có điện trở lớn hơn → dùng làm điện trở trong mạch điện.';
        physChallenge = 'Nếu điện trở R = 10Ω và cường độ dòng điện I = 2A, em hãy tính hiệu điện thế U bằng công thức U = I × R nhé!';
      }

      return `
        <div class="socratic-problem-badge">
          <span class="badge-type">🔬 Khoa học tự nhiên: Vật lí</span>
          <span class="badge-target">${physTopic}</span>
        </div>
        <div class="socratic-stage-card info">
          <div class="socratic-stage-title">📌 Định nghĩa & Ví dụ thực tế:</div>
          <p>${physDef}</p>
          <p><strong>Ví dụ trong cuộc sống:</strong></p>
          <p>${physExample}</p>
        </div>
        <div class="socratic-stage-card highlight">
          <div class="socratic-stage-title">⚔️ Thử thách tư duy:</div>
          <p>👉 ${physChallenge}</p>
        </div>
      `;
    }

    // 13. MẶC ĐỊNH: Phân tích thông minh câu hỏi thực tế của học sinh
    // Phân tích số liệu và từ khóa cụ thể trong câu hỏi để trả lời sát hơn
    const numbers = (raw.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const hasNumbers = numbers.length > 0;
    const hasFormula = /[+\-*/=÷×]/.test(text) || text.includes('bằng') || text.includes('tính');
    const hasQuestion = text.includes('?') || text.includes('tại sao') || text.includes('là gì') || text.includes('như thế nào') || text.includes('làm thế nào');

    // Phát hiện chủ đề từ nội dung thực tế
    let detectedSubject = subject || '';
    let topicHint = '';

    if (!detectedSubject) {
      if (text.match(/\b(x|y|z)\b.*[=+\-]|[=+\-].*\b(x|y|z)\b/)) {
        detectedSubject = 'Đại số';
        topicHint = 'tìm ẩn số';
      } else if (hasNumbers && hasFormula) {
        detectedSubject = 'Toán học';
        topicHint = 'tính toán';
      } else if (text.includes('viết') || text.includes('văn') || text.includes('đoạn') || text.includes('bài văn')) {
        detectedSubject = 'Ngữ văn';
      } else if (text.match(/\b(h2o|hcl|naoh|co2|o2|n2|fe|ca|mg)\b/i)) {
        detectedSubject = 'Hóa học';
      } else if (text.includes('sinh vật') || text.includes('tế bào') || text.includes('quang hợp') || text.includes('hô hấp')) {
        detectedSubject = 'Sinh học';
      } else if (text.includes('lịch sử') || text.includes('triều đại') || text.includes('chiến tranh') || text.includes('nhân vật lịch sử')) {
        detectedSubject = 'Lịch sử';
      } else if (text.includes('địa lý') || text.includes('châu') || text.includes('quốc gia') || text.includes('khí hậu') || text.includes('dân số')) {
        detectedSubject = 'Địa lý';
      }
    }

    const subjectTag = detectedSubject ? `📚 ${detectedSubject}` : '📐 Tự Vấn Học Tập Socratic';
    const shortQuestion = raw.slice(0, 200) + (raw.length > 200 ? '...' : '');

    // Tạo câu hỏi gợi mở DỰA TRÊN nội dung thực của câu hỏi
    let socraticPrompt = '';
    if (hasNumbers && hasFormula) {
      const numList = numbers.slice(0, 4).join(', ');
      socraticPrompt = `Trong câu hỏi này, Hiệp Sĩ thấy có các số liệu: <strong>${numList}</strong>. Em hãy xác định xem:<br>
        • Những số nào là dữ kiện đã biết?<br>
        • Em cần tìm/tính đại lượng nào?<br>
        👉 Hãy liệt kê dữ kiện và đại lượng cần tìm cho Hiệp Sĩ, chúng mình sẽ cùng giải từng bước!`;
    } else if (hasQuestion) {
      socraticPrompt = `Câu hỏi của em rất hay! Trước khi Hiệp Sĩ giải thích, em thử suy nghĩ trước:<br>
        👉 Em đã biết gì về chủ đề này từ bài học hoặc sách giáo khoa rồi?<br>
        (Chia sẻ những gì em biết để Hiệp Sĩ biết bắt đầu từ đâu cho phù hợp với em nhé!)`;
    } else {
      socraticPrompt = `Em có thể nói thêm:<br>
        1. <strong>Mục tiêu cụ thể</strong>: Em muốn tính/hiểu/viết điều gì từ câu hỏi này?<br>
        2. <strong>Đã thử chưa?</strong> Em đã làm thử bước nào chưa, và vướng mắc ở đâu?<br>
        👉 Hiệp Sĩ sẽ đồng hành từ điểm em đang đứng!`;
    }

    return `
      <div class="socratic-problem-badge">
        <span class="badge-type">${subjectTag}</span>
        <span class="badge-target">Phân tích câu hỏi & Gợi mở từng bước</span>
      </div>
      <div class="socratic-stage-card info">
        <div class="socratic-stage-title">📌 Hiệp Sĩ đã đọc kỹ câu hỏi của em:</div>
        <p><em>"${shortQuestion}"</em></p>
        ${detectedSubject ? `<p>🔍 Hiệp Sĩ nhận ra đây có vẻ là câu hỏi về <strong>${detectedSubject}</strong>${topicHint ? ' (' + topicHint + ')' : ''}. Đúng không em?</p>` : ''}
      </div>
      <div class="socratic-stage-card highlight">
        <div class="socratic-stage-title">⚔️ Hiệp Sĩ muốn hỏi em một điều:</div>
        <p>${socraticPrompt}</p>
      </div>
    `;
  }
}

module.exports = new GeminiService();
