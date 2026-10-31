// ============================================================================
// DREAMSPEAK-SEL – HIỆP SĨ TỰ VẤN 24/7: FRONTEND APPLICATION ENGINE
// ============================================================================

(function () {
  const state = {
    sessionId: localStorage.getItem('dreamspeak_session_id') || 'anon_' + Math.random().toString(36).slice(2) + '_' + Date.now(),
    grade: 'Lớp 9',
    subject: 'Toán học',
    selPillar: 'general',
    pedagogyMode: 'socratic',
    history: [],
    selectedImageBase64: null,
    selectedImageMime: null,
    selectedImageName: null,
    activeMathTab: 'algebra',
    publicUrl: window.location.origin,
    qrDataUrl: '',
    abortController: null
  };

  localStorage.setItem('dreamspeak_session_id', state.sessionId);

  // DOM Elements
  const chatContainer = document.getElementById('chatMessagesContainer');
  const chatInput = document.getElementById('chatInputTextarea');
  const btnSend = document.getElementById('btnSendMessage');
  const btnStop = document.getElementById('btnStopGenerating');
  const selectGrade = document.getElementById('selectGrade');
  const selectSubject = document.getElementById('selectSubject');
  const selectPedagogyMode = document.getElementById('selectPedagogyMode');
  const pillarListContainer = document.getElementById('pillarListContainer');
  const scenarioListContainer = document.getElementById('scenarioListContainer');
  const mathDrawer = document.getElementById('mathDrawer');
  const mathTabsBar = document.getElementById('mathTabsBar');
  const mathSymbolsGrid = document.getElementById('mathSymbolsGrid');
  const mathLiveField = document.getElementById('mathLiveField');
  const latexRawInput = document.getElementById('latexRawInput');
  const katexLivePreview = document.getElementById('katexLivePreview');
  const imagePreviewBar = document.getElementById('imagePreviewBar');
  const imagePreviewThumb = document.getElementById('imagePreviewThumb');
  const imagePreviewName = document.getElementById('imagePreviewName');
  const imagePreviewMeta = document.getElementById('imagePreviewMeta');
  const fileImageInput = document.getElementById('fileImageInput');

  // 1. Safe Markdown + LaTeX (KaTeX) Renderer
  function renderRichMarkdownWithLatex(rawText) {
    if (!rawText) return '';
    const mathBlocks = [];

    // Extract display math $$...$$ and \[...\]
    let processed = rawText.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, m1, m2) => {
      const latex = (m1 || m2 || '').trim();
      const id = `@@MATH_BLOCK_${mathBlocks.length}@@`;
      mathBlocks.push({ latex, displayMode: true });
      return id;
    });

    // Extract inline math $...$ and \(...\)
    processed = processed.replace(/\$([^\$\n]+?)\$|\\\(([\s\S]+?)\\\)/g, (_, m1, m2) => {
      const latex = (m1 || m2 || '').trim();
      const id = `@@MATH_BLOCK_${mathBlocks.length}@@`;
      mathBlocks.push({ latex, displayMode: false });
      return id;
    });

    // Escape HTML entities safely
    processed = processed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Format Markdown headings, bold, italic, quotes, lists, code
    processed = processed
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    // Paragraphs & line breaks
    const lines = processed.split('\n');
    let htmlLines = [];
    let inList = false;

    for (let line of lines) {
      const trimmed = line.trim();
      if (/^[-•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        if (!inList) {
          htmlLines.push('<ul>');
          inList = true;
        }
        htmlLines.push('<li>' + trimmed.replace(/^([-•]|\d+\.)\s+/, '') + '</li>');
      } else {
        if (inList) {
          htmlLines.push('</ul>');
          inList = false;
        }
        if (trimmed === '---') {
          htmlLines.push('<hr style="border:none;border-top:1px solid var(--border-color);margin:0.6rem 0;" />');
        } else if (trimmed.startsWith('<h') || trimmed.startsWith('<blockquote')) {
          htmlLines.push(trimmed);
        } else if (trimmed.length > 0) {
          htmlLines.push('<p>' + trimmed + '</p>');
        }
      }
    }
    if (inList) htmlLines.push('</ul>');

    let finalHtml = htmlLines.join('\n');

    // Restore and render KaTeX blocks
    finalHtml = finalHtml.replace(/@@MATH_BLOCK_(\d+)@@/g, (_, idxStr) => {
      const item = mathBlocks[Number(idxStr)];
      if (!item) return '';
      if (window.katex) {
        try {
          return window.katex.renderToString(item.latex, {
            displayMode: item.displayMode,
            throwOnError: false,
            strict: false
          });
        } catch {
          return `<code>${item.latex}</code>`;
        }
      }
      return `<code>${item.latex}</code>`;
    });

    return finalHtml;
  }

  // 2. Render Math Toolbar
  function initMathToolbar() {
    const categories = window.MATH_TOOLBAR_CATEGORIES || [];
    mathTabsBar.innerHTML = '';

    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'math-tab-btn' + (cat.id === state.activeMathTab ? ' active' : '');
      btn.textContent = cat.name;
      btn.addEventListener('click', () => {
        state.activeMathTab = cat.id;
        initMathToolbar();
      });
      mathTabsBar.appendChild(btn);
    });

    const activeCat = categories.find((c) => c.id === state.activeMathTab) || categories[0];
    mathSymbolsGrid.innerHTML = '';

    if (activeCat) {
      activeCat.symbols.forEach((sym) => {
        const btn = document.createElement('button');
        btn.className = 'math-sym-btn';
        btn.title = sym.label + ' (' + sym.latex + ')';

        const mathSpan = document.createElement('div');
        if (window.katex) {
          try {
            mathSpan.innerHTML = window.katex.renderToString(sym.display, {
              displayMode: false,
              throwOnError: false
            });
          } catch {
            mathSpan.textContent = sym.display;
          }
        } else {
          mathSpan.textContent = sym.display;
        }

        const labelSpan = document.createElement('span');
        labelSpan.className = 'math-sym-label';
        labelSpan.textContent = sym.label;

        btn.appendChild(mathSpan);
        btn.appendChild(labelSpan);

        btn.addEventListener('click', () => {
          if (sym.questionPrompt) {
            latexRawInput.value = sym.latex;
            if (mathLiveField && typeof mathLiveField.setValue === 'function') {
              mathLiveField.setValue(sym.latex);
            }
            chatInput.value = `${sym.questionPrompt} $$${sym.latex}$$`;
          } else {
            const start = latexRawInput.selectionStart || latexRawInput.value.length;
            const end = latexRawInput.selectionEnd || latexRawInput.value.length;
            const current = latexRawInput.value;
            const updated = current.slice(0, start) + sym.latex + current.slice(end);
            latexRawInput.value = updated;
            if (mathLiveField && typeof mathLiveField.setValue === 'function') {
              mathLiveField.setValue(updated);
            }
          }
          updateLiveKatexPreview();
        });

        mathSymbolsGrid.appendChild(btn);
      });
    }

    updateLiveKatexPreview();
  }

  function updateLiveKatexPreview() {
    const latex = (latexRawInput.value || '').trim();
    if (!latex) {
      katexLivePreview.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem;">Nhập hoặc chọn ký hiệu toán học để xem trước...</span>';
      return;
    }
    if (window.katex) {
      try {
        katexLivePreview.innerHTML = window.katex.renderToString(latex, {
          displayMode: true,
          throwOnError: false
        });
      } catch (e) {
        katexLivePreview.textContent = latex;
      }
    } else {
      katexLivePreview.textContent = latex;
    }
  }

  if (latexRawInput) {
    latexRawInput.addEventListener('input', () => {
      if (mathLiveField && typeof mathLiveField.setValue === 'function') {
        mathLiveField.setValue(latexRawInput.value, { suppressChangeNotifications: true });
      }
      updateLiveKatexPreview();
    });
  }

  if (mathLiveField) {
    mathLiveField.addEventListener('input', () => {
      latexRawInput.value = mathLiveField.value || '';
      updateLiveKatexPreview();
    });
  }

  // 3. Image Upload & Client-Side Optimization
  function optimizeAndLoadImage(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      alert('Vui lòng chọn file hình ảnh hợp lệ (JPG, PNG, WEBP hoặc GIF).');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      alert('Ảnh có dung lượng quá lớn (>12MB). Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const maxDim = 1280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
        state.selectedImageBase64 = optimizedDataUrl;
        state.selectedImageMime = 'image/jpeg';
        state.selectedImageName = file.name || 'bai-tap.jpg';

        const kb = Math.round((optimizedDataUrl.length * 0.75) / 1024);
        imagePreviewThumb.src = optimizedDataUrl;
        imagePreviewName.textContent = `${state.selectedImageName} (${w}x${h}px)`;
        imagePreviewMeta.textContent = `Đã tối ưu dung lượng (${kb} KB) • Sẵn sàng phân tích bằng AI Vision`;
        imagePreviewBar.classList.add('active');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function generateSampleExerciseImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    ctx.fillStyle = '#1e1b4b';
    ctx.font = 'bold 24px Inter, Arial, sans-serif';
    ctx.fillText('PHIẾU BÀI TẬP TOÁN HỌC LỚP 9 - ĐỀ KIỂM TRA', 36, 58);

    ctx.fillStyle = '#0f172a';
    ctx.font = '21px Arial, sans-serif';
    ctx.fillText('Câu 1: Giải phương trình bậc hai:  x^2 - 5x + 6 = 0', 36, 115);
    ctx.fillText('Câu 2: Giải hệ phương trình:  2x + y = 7  và  x - y = 2', 36, 165);
    ctx.fillText('Câu 3: Cho tam giác ABC vuông tại A, biết AB = 6 cm, AC = 8 cm.', 36, 215);
    ctx.fillText('Tính độ dài cạnh huyền BC và đường cao AH.', 36, 255);

    const dataUrl = canvas.toDataURL('image/png');
    state.selectedImageBase64 = dataUrl;
    state.selectedImageMime = 'image/png';
    state.selectedImageName = 'de-toan-mau-lop-9.png';

    imagePreviewThumb.src = dataUrl;
    imagePreviewName.textContent = 'de-toan-mau-lop-9.png (Ảnh đề toán mẫu)';
    imagePreviewMeta.textContent = 'Ảnh đề kiểm tra mẫu gồm 3 câu (Đại số & Hình học) • Bấm Gửi để AI đọc ảnh!';
    imagePreviewBar.classList.add('active');

    if (!chatInput.value.trim()) {
      chatInput.value = 'Hãy đọc nội dung đề bài trong ảnh này và hướng dẫn em giải từng câu theo phương pháp gợi mở nhé!';
    }
  }

  // 4. Append Messages to UI
  function appendMessage(params) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + params.role;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = params.role === 'assistant' ? '🛡️' : '🧑‍🎓';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (params.role === 'assistant' && params.metadata) {
      const metaTop = document.createElement('div');
      metaTop.className = 'msg-meta-top';
      metaTop.innerHTML = `
        <span class="meta-tag">${params.metadata.selPillarName || 'DREAMSPEAK-SEL'}</span>
        <span>• ${params.metadata.grade || state.grade} (${params.metadata.subject || state.subject})</span>
        <span>• ⚡ ${(params.metadata.latencyMs / 1000).toFixed(1)}s</span>
      `;
      bubble.appendChild(metaTop);
    }

    if (params.imageUrl) {
      const img = document.createElement('img');
      img.className = 'msg-uploaded-img';
      img.src = params.imageUrl;
      img.alt = 'Ảnh đính kèm';
      bubble.appendChild(img);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.innerHTML = renderRichMarkdownWithLatex(params.content);
    bubble.appendChild(contentDiv);

    if (params.role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      const btnCopy = document.createElement('button');
      btnCopy.className = 'action-chip';
      btnCopy.innerHTML = '📋 Sao chép';
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(params.content);
        btnCopy.innerHTML = '✓ Đã chép';
        setTimeout(() => (btnCopy.innerHTML = '📋 Sao chép'), 2000);
      });

      const btnSimpler = document.createElement('button');
      btnSimpler.className = 'action-chip';
      btnSimpler.innerHTML = '💡 Giải thích đơn giản hơn';
      btnSimpler.addEventListener('click', () => {
        selectPedagogyMode.value = 'simplified';
        state.pedagogyMode = 'simplified';
        sendStudentQuestion('Em vẫn chưa hiểu rõ lắm, hãy giải thích lại thật đơn giản kèm ví dụ thực tế dễ hiểu hơn giúp em nhé!');
      });

      const btnVerify = document.createElement('button');
      btnVerify.className = 'action-chip';
      btnVerify.innerHTML = '✅ Đối chiếu lời giải đầy đủ';
      btnVerify.addEventListener('click', () => {
        selectPedagogyMode.value = 'verify-solution';
        state.pedagogyMode = 'verify-solution';
        sendStudentQuestion('Em đã tự suy nghĩ và nháp xong rồi, hãy cho em xem lời giải chi tiết từng bước để em đối chiếu kết quả nhé!');
      });

      const btnLike = document.createElement('button');
      btnLike.className = 'action-chip';
      btnLike.innerHTML = '👍 Hữu ích';
      btnLike.addEventListener('click', () => submitFeedback(params.messageId, 'positive', btnLike));

      const btnDislike = document.createElement('button');
      btnDislike.className = 'action-chip';
      btnDislike.innerHTML = '👎 Cần cải thiện';
      btnDislike.addEventListener('click', () => submitFeedback(params.messageId, 'negative', btnDislike));

      actions.appendChild(btnCopy);
      actions.appendChild(btnSimpler);
      actions.appendChild(btnVerify);
      actions.appendChild(btnLike);
      actions.appendChild(btnDislike);
      bubble.appendChild(actions);

      if (params.metadata && Array.isArray(params.metadata.suggestedFollowUps) && params.metadata.suggestedFollowUps.length > 0) {
        const followBox = document.createElement('div');
        followBox.className = 'followup-box';
        params.metadata.suggestedFollowUps.forEach((suggestion) => {
          const fBtn = document.createElement('button');
          fBtn.className = 'followup-btn';
          fBtn.innerHTML = renderRichMarkdownWithLatex(suggestion).replace(/<\/?p>/g, '');
          fBtn.addEventListener('click', () => sendStudentQuestion(suggestion));
          followBox.appendChild(fBtn);
        });
        bubble.appendChild(followBox);
      }
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatContainer.appendChild(row);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  async function submitFeedback(messageId, rating, btnEl) {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: messageId || 'msg_live',
          rating,
          grade: state.grade,
          subject: state.subject
        })
      });
      btnEl.innerHTML = rating === 'positive' ? '💖 Cảm ơn em!' : '📝 Đã ghi nhận';
    } catch {
      // Ignore error
    }
  }

  // 5. Send Question to Backend (/api/chat or /api/chat/image)
  async function sendStudentQuestion(overrideText) {
    const text = (typeof overrideText === 'string' ? overrideText : chatInput.value).trim();
    const hasImage = Boolean(state.selectedImageBase64);

    if (!text && !hasImage) {
      chatInput.focus();
      return;
    }

    const displayMessage = text || 'Nhờ Hiệp sĩ Tự vấn phân tích hình ảnh bài tập này và hướng dẫn em từng bước nhé!';
    const attachedImage = state.selectedImageBase64;
    const attachedMime = state.selectedImageMime;

    // Clear composer
    if (typeof overrideText !== 'string') {
      chatInput.value = '';
      chatInput.style.height = 'auto';
    }
    state.selectedImageBase64 = null;
    state.selectedImageMime = null;
    imagePreviewBar.classList.remove('active');
    mathDrawer.classList.remove('open');

    // Append user bubble
    appendMessage({
      role: 'user',
      content: displayMessage,
      imageUrl: attachedImage
    });

    // Show thinking indicator
    const thinkingRow = document.createElement('div');
    thinkingRow.className = 'msg-row assistant';
    thinkingRow.innerHTML = `
      <div class="msg-avatar">🛡️</div>
      <div class="thinking-box">
        <div class="dots-loader"><span></span><span></span><span></span></div>
        <span>Hiệp sĩ Tự vấn đang phân tích theo phương pháp gợi mở...</span>
      </div>
    `;
    chatContainer.appendChild(thinkingRow);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    state.abortController = new AbortController();
    btnSend.style.display = 'none';
    btnStop.style.display = 'inline-flex';

    try {
      const endpoint = attachedImage ? '/api/chat/image' : '/api/chat';
      const payload = {
        message: displayMessage,
        sessionId: state.sessionId,
        grade: selectGrade.value,
        subject: selectSubject.value,
        selPillar: state.selPillar,
        pedagogyMode: selectPedagogyMode.value,
        history: state.history.slice(-10),
        imageBase64: attachedImage || undefined,
        imageMimeType: attachedMime || undefined
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: state.abortController.signal
      });

      const data = await res.json();
      thinkingRow.remove();

      if (data && data.reply) {
        state.history.push({ role: 'user', content: displayMessage });
        state.history.push({ role: 'assistant', content: data.reply });
        localStorage.setItem('dreamspeak_chat_history', JSON.stringify(state.history.slice(-20)));

        appendMessage({
          role: 'assistant',
          content: data.reply,
          messageId: data.messageId,
          metadata: data.metadata
        });
      } else {
        appendMessage({
          role: 'assistant',
          content: `⚠️ **Thông báo:** ${data.message || 'Hệ thống AI đang bận, em vui lòng thử lại sau vài giây nhé!'}`
        });
      }
    } catch (err) {
      thinkingRow.remove();
      if (err.name === 'AbortError') {
        appendMessage({
          role: 'assistant',
          content: '⏹ *Đã dừng phản hồi theo yêu cầu của em. Em có thể đặt câu hỏi mới bất cứ lúc nào nhé!*'
        });
      } else {
        appendMessage({
          role: 'assistant',
          content: '⚠️ **Kết nối tạm thời gián đoạn:** Em vui lòng kiểm tra mạng hoặc bấm gửi lại câu hỏi nhé!'
        });
      }
    } finally {
      state.abortController = null;
      btnSend.style.display = 'inline-flex';
      btnStop.style.display = 'none';
    }
  }

  // 6. Load Public Configuration & Populate 5 CHẠM + 9 Scenarios
  async function loadPublicConfig() {
    try {
      const res = await fetch('/api/config/public');
      const cfg = await res.json();
      if (!cfg || !cfg.success) return;

      state.publicUrl = cfg.publicUrl || window.location.origin;
      state.qrDataUrl = cfg.qrDataUrl || '';

      const shareUrlInput = document.getElementById('sharePublicUrlInput');
      const shareQrImg = document.getElementById('shareQrImage');
      if (shareUrlInput) shareUrlInput.value = state.publicUrl;
      if (shareQrImg && state.qrDataUrl) shareQrImg.src = state.qrDataUrl;

      // Render 5 CHẠM Pillars
      if (Array.isArray(cfg.selPillars)) {
        pillarListContainer.innerHTML = '';
        cfg.selPillars.forEach((p) => {
          const card = document.createElement('button');
          card.className = 'pillar-card' + (p.id === state.selPillar ? ' active' : '');
          card.innerHTML = `
            <div class="pillar-icon">${p.icon}</div>
            <div class="pillar-info">
              <div class="pillar-name">
                <span class="pillar-badge" style="background:${p.color}">${p.code}</span>
                <span>${p.title}</span>
              </div>
              <div class="pillar-desc">${p.shortDesc}</div>
            </div>
          `;
          card.addEventListener('click', () => {
            state.selPillar = p.id;
            document.querySelectorAll('.pillar-card').forEach((el) => el.classList.remove('active'));
            card.classList.add('active');
            document.getElementById('sidebarPanel').classList.remove('mobile-open');

            if (p.id !== 'general' && Array.isArray(p.samplePrompts) && p.samplePrompts[0]) {
              chatInput.value = p.samplePrompts[0];
              chatInput.focus();
            }
          });
          pillarListContainer.appendChild(card);
        });
      }

      // Render 9 Real-World Scenarios
      if (Array.isArray(cfg.scenarios)) {
        scenarioListContainer.innerHTML = '';
        cfg.scenarios.forEach((sc) => {
          const btn = document.createElement('button');
          btn.className = 'scenario-btn';
          btn.innerHTML = `<span>${sc.icon}</span><span>${sc.title}</span>`;
          btn.addEventListener('click', () => {
            state.selPillar = sc.pillarId;
            document.getElementById('sidebarPanel').classList.remove('mobile-open');
            sendStudentQuestion(sc.studentPrompt);
          });
          scenarioListContainer.appendChild(btn);
        });
      }
    } catch {
      // Ignore config fetch error
    }
  }

  // 7. Wire Up Event Listeners
  btnSend.addEventListener('click', () => sendStudentQuestion());
  btnStop.addEventListener('click', () => {
    if (state.abortController) state.abortController.abort();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendStudentQuestion();
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 130) + 'px';
  });

  // Paste image directly from clipboard
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData)?.items || [];
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        optimizeAndLoadImage(file);
      }
    }
  });

  fileImageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      optimizeAndLoadImage(e.target.files[0]);
    }
  });

  document.getElementById('btnSampleImageTest').addEventListener('click', generateSampleExerciseImage);

  document.getElementById('btnRemoveImage').addEventListener('click', () => {
    state.selectedImageBase64 = null;
    state.selectedImageMime = null;
    fileImageInput.value = '';
    imagePreviewBar.classList.remove('active');
  });

  // Math Toolbar Buttons
  document.getElementById('btnToggleMath').addEventListener('click', () => {
    mathDrawer.classList.toggle('open');
    if (mathDrawer.classList.contains('open')) {
      initMathToolbar();
    }
  });

  document.getElementById('btnCloseMathDrawer').addEventListener('click', () => {
    mathDrawer.classList.remove('open');
  });

  document.getElementById('btnClearMath').addEventListener('click', () => {
    latexRawInput.value = '';
    if (mathLiveField && typeof mathLiveField.setValue === 'function') {
      mathLiveField.setValue('');
    }
    updateLiveKatexPreview();
  });

  document.getElementById('btnInsertMathToInput').addEventListener('click', () => {
    const latex = latexRawInput.value.trim();
    if (!latex) return;
    const isMultiline = latex.includes('\\begin') || latex.includes('\\frac');
    const wrapped = isMultiline ? `$$${latex}$$` : `$${latex}$`;
    chatInput.value = (chatInput.value ? chatInput.value + ' ' : 'Hướng dẫn em giải biểu thức: ') + wrapped;
    chatInput.focus();
  });

  document.getElementById('btnSendMathDirectly').addEventListener('click', () => {
    const latex = latexRawInput.value.trim();
    if (!latex) return;
    sendStudentQuestion(`Hướng dẫn em từng bước giải hoặc rút gọn biểu thức toán học sau: $$${latex}$$`);
  });

  // Quick Prompt Chips
  document.querySelectorAll('[data-quick-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendStudentQuestion(btn.getAttribute('data-quick-prompt'));
    });
  });

  // Refresh & Clear History
  document.getElementById('btnNewChat').addEventListener('click', () => {
    state.history = [];
    document.querySelectorAll('.msg-row').forEach((el) => el.remove());
  });

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    state.history = [];
    localStorage.removeItem('dreamspeak_chat_history');
    document.querySelectorAll('.msg-row').forEach((el) => el.remove());
  });

  // Modals (Share & Guide)
  document.getElementById('btnShareModal').addEventListener('click', () => {
    loadPublicConfig();
    document.getElementById('modalShare').classList.add('open');
  });

  document.getElementById('btnGuideModal').addEventListener('click', () => {
    document.getElementById('modalGuide').classList.add('open');
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-close-modal')).classList.remove('open');
    });
  });

  document.getElementById('btnCopyShareUrl').addEventListener('click', () => {
    const urlInput = document.getElementById('sharePublicUrlInput');
    navigator.clipboard.writeText(urlInput.value);
    const btn = document.getElementById('btnCopyShareUrl');
    btn.textContent = '✓ Đã sao chép!';
    setTimeout(() => (btn.textContent = '📋 Sao chép Link'), 2000);
  });

  document.getElementById('btnDownloadQr').addEventListener('click', () => {
    if (!state.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = state.qrDataUrl;
    a.download = 'DREAMSPEAK-SEL-QRCode.png';
    a.click();
  });

  document.getElementById('btnShareZalo').addEventListener('click', () => {
    window.open(`https://zalo.me/share?url=${encodeURIComponent(state.publicUrl)}`, '_blank');
  });

  document.getElementById('btnShareFacebook').addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(state.publicUrl)}`, '_blank');
  });

  // Breathing Exercise 4-7-8
  document.getElementById('btnBreathingExercise').addEventListener('click', () => {
    const statusEl = document.getElementById('breathingStatus');
    statusEl.style.display = 'block';
    const steps = [
      '🌬️ Hít vào nhẹ nhàng bằng mũi... (4 giây)',
      '⏸️ Giữ hơi thở bình tĩnh... (7 giây)',
      '🍃 Thở ra từ từ bằng miệng... (8 giây)',
      '✨ Tuyệt vời! Em đã thấy tâm trí dịu lại hơn chưa?'
    ];
    let idx = 0;
    statusEl.textContent = steps[0];
    const timer = setInterval(() => {
      idx++;
      if (idx < steps.length) {
        statusEl.textContent = steps[idx];
      } else {
        clearInterval(timer);
      }
    }, 4000);
  });

  // Mobile Menu & Theme Toggle
  document.getElementById('btnMobileMenu').addEventListener('click', () => {
    document.getElementById('sidebarPanel').classList.toggle('mobile-open');
  });

  const savedTheme = localStorage.getItem('dreamspeak_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('btnThemeToggle').textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dreamspeak_theme', next);
    document.getElementById('btnThemeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // Initialize on Window Load
  window.addEventListener('load', () => {
    loadPublicConfig();
    initMathToolbar();
    // Render KaTeX in quick chips
    document.querySelectorAll('.chip-btn').forEach((chip) => {
      chip.innerHTML = renderRichMarkdownWithLatex(chip.textContent).replace(/<\/?p>/g, '');
    });
  });
})();
