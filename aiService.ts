import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';
import {
  ChatRequest,
  ChatResponse,
  PedagogyMode,
  QuestionCategory,
  SelPillarId
} from '../types';
import {
  SEL_PILLARS,
  buildCrisisInterventionResponse,
  buildSystemPrompt,
  classifyQuestion,
  detectBestSelPillar,
  detectCrisisRisk
} from '../config/selKnowledgeBase';
import { getBudgetStatus, recordChatSuccess, recordError } from './metricsService';

const RUNTIME_SECRET_FILE = path.join(process.cwd(), '.runtime-secrets.json');

let runtimeGeminiKey: string | null = null;

function loadRuntimeKey(): string {
  if (runtimeGeminiKey) return runtimeGeminiKey;
  if (
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your_google_gemini_api_key_here'
  ) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    if (fs.existsSync(RUNTIME_SECRET_FILE)) {
      const data = JSON.parse(fs.readFileSync(RUNTIME_SECRET_FILE, 'utf-8'));
      if (data.geminiApiKey && typeof data.geminiApiKey === 'string') {
        runtimeGeminiKey = data.geminiApiKey.trim();
        return runtimeGeminiKey || '';
      }
    }
  } catch {
    // Ignore read error
  }
  return '';
}

export async function setAndVerifyGeminiApiKey(apiKey: string): Promise<{
  valid: boolean;
  modelTested: string;
  message: string;
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey || cleanKey.length < 20) {
    return {
      valid: false,
      modelTested: 'none',
      message: 'Khóa API không hợp lệ (độ dài quá ngắn).'
    };
  }

  const modelsToTry = [
    process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.5-flash',
    process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.0-flash'
  ];

  for (const modelName of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: 'Trả lời ngắn gọn 1 câu tiếng Việt: Xin chào DREAMSPEAK-SEL!'
      });
      if (response && response.text) {
        runtimeGeminiKey = cleanKey;
        process.env.GEMINI_API_KEY = cleanKey;
        try {
          fs.writeFileSync(
            RUNTIME_SECRET_FILE,
            JSON.stringify({ geminiApiKey: cleanKey, updatedAt: new Date().toISOString() }, null, 2),
            'utf-8'
          );
        } catch {
          // Ignore file write error on read-only fs
        }
        return {
          valid: true,
          modelTested: modelName,
          message: `Đã xác thực và kích hoạt thành công Google Gemini API (${modelName})!`
        };
      }
    } catch (err: any) {
      // Try next model
    }
  }

  return {
    valid: false,
    modelTested: modelsToTry[0],
    message: 'Không thể xác thực khóa với Google Gemini API. Vui lòng kiểm tra lại khóa từ Google AI Studio.'
  };
}

export function getAiServiceStatus(): {
  online: boolean;
  primaryProvider: string;
  activeProvider: string;
  geminiKeyConfigured: boolean;
  supportedModels: string[];
  visionEnabled: boolean;
  mathLatexEnabled: boolean;
  selFrameworkVersion: string;
} {
  const hasGeminiKey = Boolean(loadRuntimeKey());
  return {
    online: true,
    primaryProvider: 'Google Gemini API (@google/genai)',
    activeProvider: hasGeminiKey
      ? `Google Gemini API (${process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.5-flash'})`
      : 'DREAMSPEAK-SEL Cloud AI Hybrid Engine (Live LLM + Vision OCR + Gemini Ready)',
    geminiKeyConfigured: hasGeminiKey,
    supportedModels: ['gemini-2.5-flash', 'gemini-2.0-flash', 'openai-gpt-oss-20b-cloud'],
    visionEnabled: true,
    mathLatexEnabled: true,
    selFrameworkVersion: 'DREAMSPEAK-SEL 5 CHẠM (NCKH 26-27)'
  };
}

async function callGoogleGemini(params: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<{ text: string; model: string; provider: string }> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const models = [
    process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.5-flash',
    process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.0-flash'
  ];

  const contents: any[] = [];
  for (const turn of (params.history || []).slice(-10)) {
    if (turn.content && turn.content.trim()) {
      contents.push({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }]
      });
    }
  }

  const currentParts: any[] = [];
  if (params.imageBase64) {
    const cleanBase64 = params.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    currentParts.push({
      inlineData: {
        mimeType: params.imageMimeType || 'image/jpeg',
        data: cleanBase64
      }
    });
  }
  currentParts.push({ text: params.userMessage });

  contents.push({
    role: 'user',
    parts: currentParts
  });

  let lastError: any = null;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: params.systemPrompt,
          temperature: 0.45,
          maxOutputTokens: 2048
        }
      });
      if (response && response.text) {
        return {
          text: response.text,
          model,
          provider: 'Google Gemini API'
        };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Gemini API call failed');
}

async function extractTextFromImageViaOcr(imageBase64: string): Promise<string> {
  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await Promise.race([
      Tesseract.recognize(buffer, 'vie+eng'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000))
    ]);
    if (result && result.data && result.data.text) {
      return result.data.text.trim();
    }
  } catch {
    // Ignore OCR error
  }
  return '';
}

async function callLiveCloudAi(params: {
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ text: string; model: string; provider: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: params.systemPrompt }
  ];

  for (const turn of (params.history || []).slice(-8)) {
    if (turn.content && turn.content.trim()) {
      messages.push({
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        content: turn.content
      });
    }
  }

  messages.push({
    role: 'user',
    content: params.userMessage
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22000);

  try {
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai',
        messages,
        temperature: 0.45
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Cloud AI HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === 'string' && content.trim().length > 0) {
      return {
        text: content.trim(),
        model: data?.model || 'gpt-oss-20b-instruct',
        provider: 'DREAMSPEAK-SEL Cloud AI'
      };
    }
    throw new Error('Empty response from Cloud AI');
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSocraticResilienceFallback(params: {
  message: string;
  grade: string;
  subject: string;
  selPillar: SelPillarId;
  category: QuestionCategory;
  extractedImageText?: string;
}): string {
  const pillarInfo = SEL_PILLARS[params.selPillar] || SEL_PILLARS.general;

  if (params.category === 'sel-counseling' || params.category === 'study-skills') {
    return `### ${pillarInfo.icon} Đồng hành cùng em (${pillarInfo.code} – ${pillarInfo.title})

Cảm ơn em đã tin tưởng chia sẻ với **Hiệp sĩ Tự vấn 24/7**! Mình lắng nghe và rất thấu hiểu điều em đang trăn trở: *"${params.message.slice(0, 140)}"*.

#### 1. Chạm & Thấu hiểu cảm xúc
Trong hành trình học tập ở **${params.grade}**, việc đôi lúc cảm thấy áp lực, bối rối hay mỏi mệt là phản ứng hoàn toàn tự nhiên. Điều quan trọng nhất là em đã nhận ra cảm xúc của mình thay vì giữ kín một mình.

#### 2. Gợi mở định hướng (${pillarInfo.competency})
Để chúng mình cùng tháo gỡ từng nút thắt một, em hãy suy ngẫm 2 câu hỏi nhỏ này nhé:
1. **Nhận diện cốt lõi:** Trong tình huống hiện tại, điều gì đang khiến em bận tâm nhất mà **em có thể chủ động kiểm soát hoặc thay đổi được** ngay hôm nay?
2. **Bước nhỏ đầu tiên:** Nếu chọn **1 hành động nhỏ kéo dài 10–15 phút** giúp em thấy nhẹ lòng hoặc dễ bắt đầu nhất, em muốn chọn việc gì?

💡 *Em hãy trả lời 1 trong 2 câu hỏi trên để Hiệp sĩ Tự vấn cùng em lập kế hoạch chi tiết tiếp theo nhé!*`;
  }

  return `### 🛡️ Hướng dẫn Sư phạm Từng bước (${params.subject} – ${params.grade})

Hiệp sĩ Tự vấn đã nhận được câu hỏi của em${
    params.extractedImageText ? ` kèm nội dung trích xuất từ ảnh: *"${params.extractedImageText.slice(0, 150)}"*` : ''
  }. Chúng mình cùng phân tích theo phương pháp gợi mở nhé:

#### Bước 1: Xác định yêu cầu và dữ kiện bài toán
- **Nội dung câu hỏi:** ${params.message}
- Em hãy kiểm tra xem đâu là **giả thiết (dữ kiện đã cho)** và đâu là **kết luận (đại lượng cần tìm hoặc điều cần chứng minh)**.

#### Bước 2: Kiến thức nền tảng cần kết nối
- Với dạng toán/bài tập thuộc chương trình **${params.grade}**, nếu gặp phương trình bậc hai $ax^2 + bx + c = 0$ ($a \\neq 0$), ta xét biệt thức:
  $$\\Delta = b^2 - 4ac$$
- Nếu gặp hệ phương trình bậc nhất hai ẩn $\\begin{cases} a_1x + b_1y = c_1 \\\\ a_2x + b_2y = c_2 \\end{cases}$, ta có thể dùng **phương pháp thế** hoặc **phương pháp cộng đại số**.
- Nếu gặp biểu thức chứa căn $\\sqrt{A(x)}$ hoặc phân thức $\\frac{P(x)}{Q(x)}$, bước đầu tiên luôn là tìm **Điều kiện xác định (ĐKXĐ)**: $A(x) \\ge 0$ và $Q(x) \\neq 0$.

#### Bước 3: Câu hỏi gợi mở cho em
👉 Theo em, ở bước biến đổi đầu tiên của bài này, chúng ta nên áp dụng công thức hay phép biến đổi nào trước? Em hãy viết thử bước 1 của em ra để mình kiểm tra và hướng dẫn tiếp nhé!`;
}

function generateFollowUpSuggestions(
  category: QuestionCategory,
  selPillar: SelPillarId,
  subject: string
): string[] {
  if (category === 'crisis') {
    return [
      'Hướng dẫn em bài tập hít thở 4-7-8 để bình tĩnh lại ngay lúc này',
      'Em muốn biết cách mở lời để chia sẻ khó khăn với thầy cô chủ nhiệm hoặc bố mẹ'
    ];
  }
  if (category === 'sel-counseling' || category === 'study-skills') {
    const pillar = SEL_PILLARS[selPillar] || SEL_PILLARS['dieu-hoa'];
    return [
      ...pillar.samplePrompts.slice(0, 2),
      'Giúp em lập kế hoạch hành động 3 bước nhỏ ngay tối nay nhé!'
    ];
  }
  return [
    'Em chưa hiểu rõ bước này, hãy giải thích đơn giản hơn kèm ví dụ dễ hiểu nhé!',
    'Em đã tự tính thử rồi, hãy cho em xem lời giải chi tiết để đối chiếu kết quả.',
    `Cho em thêm 1 bài tập tương tự môn ${subject} để em tự luyện tập nhé!`
  ];
}

export async function processStudentChat(req: ChatRequest): Promise<ChatResponse> {
  const startTime = Date.now();
  const grade = req.grade || 'Lớp 9';
  const subject = req.subject || 'Toán học & Tư vấn SEL';
  const pedagogyMode: PedagogyMode = req.pedagogyMode || 'socratic';

  const combinedInput = req.latexFormula
    ? `${req.message}\n\nCông thức toán học đính kèm: $$${req.latexFormula}$$`
    : req.message;

  const detectedCategory = classifyQuestion(combinedInput, req.selPillar);
  const activeSelPillar = detectBestSelPillar(combinedInput, req.selPillar);
  const pillarInfo = SEL_PILLARS[activeSelPillar] || SEL_PILLARS.general;
  const hasMath = /\$|\\frac|\\sqrt|\\sum|\\int|\\begin\{cases\}|\^|=/.test(combinedInput);
  const hasImage = Boolean(req.imageBase64);

  // 1. Check Crisis Intervention Guardrail immediately
  if (detectedCategory === 'crisis' || detectCrisisRisk(combinedInput)) {
    const crisisReply = buildCrisisInterventionResponse(combinedInput);
    const latencyMs = Date.now() - startTime;
    recordChatSuccess({
      selPillar: 'dieu-hoa',
      subject,
      grade,
      hasImage,
      hasMath,
      estimatedTokens: 180,
      isCrisis: true
    });
    return {
      success: true,
      reply: crisisReply,
      messageId: `crisis_${Date.now()}`,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: 'DREAMSPEAK-SEL Child Safety Guardrail',
        model: 'sel-crisis-protection-v2',
        detectedCategory: 'crisis',
        activeSelPillar: 'dieu-hoa',
        selPillarName: SEL_PILLARS['dieu-hoa'].title,
        pedagogyMode,
        grade,
        subject,
        isCrisisAlert: true,
        latencyMs,
        estimatedTokens: 180,
        suggestedFollowUps: generateFollowUpSuggestions('crisis', 'dieu-hoa', subject)
      }
    };
  }

  // 2. Check Daily Token Budget
  const budget = getBudgetStatus();
  if (budget.isExceeded) {
    return {
      success: true,
      reply:
        '⚠️ **Thông báo Hệ thống Kiểm soát Chi phí 24/7:**\n\nHạn mức sử dụng AI trong ngày của hệ thống đã đạt ngưỡng bảo vệ ngân sách. Vui lòng liên hệ Giáo viên Quản trị hoặc thử lại sau ít phút.',
      messageId: `budget_${Date.now()}`,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: 'Budget Guard',
        model: 'system-guard',
        detectedCategory,
        activeSelPillar,
        selPillarName: pillarInfo.title,
        pedagogyMode,
        grade,
        subject,
        isCrisisAlert: false,
        latencyMs: Date.now() - startTime,
        estimatedTokens: 0,
        suggestedFollowUps: []
      }
    };
  }

  const systemPrompt = buildSystemPrompt({
    grade,
    subject,
    selPillar: activeSelPillar,
    pedagogyMode,
    category: detectedCategory
  });

  let extractedImageText = '';
  let promptWithImageContext = combinedInput;

  // 3. Try Primary Provider: Official Google Gemini API if key is configured
  const geminiKey = loadRuntimeKey();
  if (geminiKey) {
    try {
      const geminiResult = await callGoogleGemini({
        apiKey: geminiKey,
        systemPrompt,
        userMessage: promptWithImageContext,
        history: req.history || [],
        imageBase64: req.imageBase64,
        imageMimeType: req.imageMimeType
      });

      const latencyMs = Date.now() - startTime;
      const estimatedTokens = Math.ceil(
        (systemPrompt.length + promptWithImageContext.length + geminiResult.text.length) / 3.5
      );

      recordChatSuccess({
        selPillar: activeSelPillar,
        subject,
        grade,
        hasImage,
        hasMath,
        estimatedTokens,
        isCrisis: false
      });

      return {
        success: true,
        reply: geminiResult.text,
        messageId: `msg_${Date.now()}`,
        timestamp: new Date().toISOString(),
        metadata: {
          provider: geminiResult.provider,
          model: geminiResult.model,
          detectedCategory,
          activeSelPillar,
          selPillarName: pillarInfo.title,
          pedagogyMode,
          grade,
          subject,
          isCrisisAlert: false,
          latencyMs,
          estimatedTokens,
          suggestedFollowUps: generateFollowUpSuggestions(detectedCategory, activeSelPillar, subject)
        }
      };
    } catch (err: any) {
      recordError('/api/chat (Gemini Primary)', 'GEMINI_API_ERROR', err?.message || 'Unknown error');
      // Continue automatically to Live Cloud AI Fallback below
    }
  }

  // 4. If image is attached and we are using Live Cloud AI Fallback, run real OCR on image first
  if (req.imageBase64) {
    extractedImageText = await extractTextFromImageViaOcr(req.imageBase64);
    if (extractedImageText) {
      promptWithImageContext = `${combinedInput}\n\n[NỘI DUNG VĂN BẢN / ĐỀ BÀI ĐỌC ĐƯỢC TỪ HÌNH ẢNH HỌC SINH GỬI LÊN]:\n"""\n${extractedImageText}\n"""\nHãy phân tích nội dung đề bài trong ảnh này và hướng dẫn học sinh từng bước theo phương pháp sư phạm gợi mở.`;
    } else {
      promptWithImageContext = `${combinedInput}\n\n[Học sinh vừa tải lên một hình ảnh bài tập/sơ đồ học tập môn ${subject} (${grade})]. Hãy hướng dẫn phương pháp phân tích đề bài, công thức cốt lõi và đặt câu hỏi gợi mở để học sinh đối chiếu các số liệu trên hình.`;
    }
  }

  // 5. Call Live Cloud AI Engine
  try {
    const cloudResult = await callLiveCloudAi({
      systemPrompt,
      userMessage: promptWithImageContext,
      history: req.history || []
    });

    const latencyMs = Date.now() - startTime;
    const estimatedTokens = Math.ceil(
      (systemPrompt.length + promptWithImageContext.length + cloudResult.text.length) / 3.5
    );

    recordChatSuccess({
      selPillar: activeSelPillar,
      subject,
      grade,
      hasImage,
      hasMath,
      estimatedTokens,
      isCrisis: false
    });

    return {
      success: true,
      reply: cloudResult.text,
      messageId: `msg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: cloudResult.provider,
        model: cloudResult.model,
        detectedCategory,
        activeSelPillar,
        selPillarName: pillarInfo.title,
        pedagogyMode,
        grade,
        subject,
        isCrisisAlert: false,
        latencyMs,
        estimatedTokens,
        suggestedFollowUps: generateFollowUpSuggestions(detectedCategory, activeSelPillar, subject),
        extractedImageText: extractedImageText || undefined
      }
    };
  } catch (err: any) {
    recordError('/api/chat (Cloud AI)', 'CLOUD_AI_ERROR', err?.message || 'Cloud AI timeout');

    // 6. Socratic Resilience Layer (Never crash)
    const fallbackReply = buildSocraticResilienceFallback({
      message: combinedInput,
      grade,
      subject,
      selPillar: activeSelPillar,
      category: detectedCategory,
      extractedImageText
    });

    const latencyMs = Date.now() - startTime;
    recordChatSuccess({
      selPillar: activeSelPillar,
      subject,
      grade,
      hasImage,
      hasMath,
      estimatedTokens: 250,
      isCrisis: false
    });

    return {
      success: true,
      reply: fallbackReply,
      messageId: `msg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      metadata: {
        provider: 'DREAMSPEAK-SEL Socratic Engine',
        model: 'socratic-pedagogy-resilience',
        detectedCategory,
        activeSelPillar,
        selPillarName: pillarInfo.title,
        pedagogyMode,
        grade,
        subject,
        isCrisisAlert: false,
        latencyMs,
        estimatedTokens: 250,
        suggestedFollowUps: generateFollowUpSuggestions(detectedCategory, activeSelPillar, subject),
        extractedImageText: extractedImageText || undefined
      }
    };
  }
}
