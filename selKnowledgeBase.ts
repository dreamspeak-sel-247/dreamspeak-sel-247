import { SelPillarId, QuestionCategory } from '../types';

export interface SelPillarInfo {
  id: SelPillarId;
  code: string;
  title: string;
  competency: string;
  shortDesc: string;
  detailedGuide: string;
  color: string;
  icon: string;
  samplePrompts: string[];
}

export interface RealWorldScenario {
  id: string;
  title: string;
  pillarId: SelPillarId;
  icon: string;
  studentPrompt: string;
  pedagogicalGoal: string;
  guidingQuestions: string[];
}

export const SEL_PILLARS: Record<SelPillarId, SelPillarInfo> = {
  'cham-minh': {
    id: 'cham-minh',
    code: 'CHẠM 1',
    title: 'CHẠM MÌNH',
    competency: 'Tự nhận thức (Self-Awareness)',
    shortDesc: 'Nhận diện cảm xúc, điểm mạnh, khó khăn và nhu cầu học tập của bản thân.',
    detailedGuide:
      'Giúp học sinh gọi tên chính xác cảm xúc hiện tại, nhận ra giá trị bản thân, phát hiện điểm mạnh học tập cũng như những lỗ hổng kiến thức cần bồi đắp mà không tự phán xét hay tự ti.',
    color: '#6366f1',
    icon: '🪞',
    samplePrompts: [
      'Dạo này em thấy mông lung, chưa biết điểm mạnh học tập của mình là gì.',
      'Mỗi khi nhìn vào bài kiểm tra điểm thấp, em thấy rất buồn và tự ti về bản thân.',
      'Làm sao để em biết cách học nào thực sự phù hợp với mình?'
    ]
  },
  'dieu-hoa': {
    id: 'dieu-hoa',
    code: 'CHẠM 2',
    title: 'ĐIỀU HÒA',
    competency: 'Tự quản lý (Self-Management)',
    shortDesc: 'Hướng dẫn bình tĩnh, quản lý cảm xúc, vượt qua áp lực học tập và quản lý thời gian.',
    detailedGuide:
      'Hướng dẫn các kỹ thuật điều hòa cảm xúc (như hít thở 4-7-8, chia nhỏ mục tiêu Pomodoro, lập kế hoạch ôn tập vừa sức), giúp học sinh lấy lại sự bình tĩnh trước kỳ thi và vượt qua sự trì hoãn.',
    color: '#10b981',
    icon: '🌿',
    samplePrompts: [
      'Em đang rất lo lắng và áp lực vì kỳ thi sắp tới, không thể tập trung học được.',
      'Em hay bị trì hoãn và mất động lực học tập, phải bắt đầu lại từ đâu?',
      'Làm sao để quản lý thời gian giữa việc học trên lớp, tự học và nghỉ ngơi?'
    ]
  },
  'hieu-ban': {
    id: 'hieu-ban',
    code: 'CHẠM 3',
    title: 'HIỂU BẠN',
    competency: 'Nhận thức xã hội (Social Awareness)',
    shortDesc: 'Phát triển sự đồng cảm, lắng nghe chủ động và tôn trọng sự khác biệt của người khác.',
    detailedGuide:
      'Khuyến khích học sinh đặt mình vào góc nhìn của bạn bè, thầy cô và gia đình; nuôi dưỡng lòng trắc ẩn, sự tôn trọng đa dạng văn hóa và thấu hiểu cảm xúc của người xung quanh.',
    color: '#f59e0b',
    icon: '🤝',
    samplePrompts: [
      'Bạn cùng bàn của em dạo này rất trầm lặng và hay buồn, em nên quan tâm bạn thế nào?',
      'Trong lớp có bạn có hoàn cảnh khó khăn và tính cách khác biệt, làm sao để gắn kết với bạn?',
      'Tại sao bố mẹ và thầy cô đôi khi lại kỳ vọng nhiều khiến em thấy ngột ngạt?'
    ]
  },
  'cung-lam': {
    id: 'cung-lam',
    code: 'CHẠM 4',
    title: 'CÙNG LÀM',
    competency: 'Kỹ năng quan hệ xã hội (Relationship Skills)',
    shortDesc: 'Rèn luyện kỹ năng hợp tác nhóm, giao tiếp tích cực và hóa giải mâu thuẫn.',
    detailedGuide:
      'Hướng dẫn học sinh giao tiếp không bạo lực (Thông điệp "Tôi"), lắng nghe phản hồi, phân công công việc khi làm việc nhóm và giải quyết bất đồng với bạn bè một cách văn minh.',
    color: '#ec4899',
    icon: '🧩',
    samplePrompts: [
      'Em và bạn thân đang hiểu lầm và giận nhau, em muốn làm hòa nhưng ngại mở lời.',
      'Khi làm bài tập nhóm, có một số bạn ỷ lại không làm, em nên góp ý thế nào để không mất lòng?',
      'Em rất ngại phát biểu trước đám đông và khó bắt chuyện với bạn mới.'
    ]
  },
  'chon-dung': {
    id: 'chon-dung',
    code: 'CHẠM 5',
    title: 'CHỌN ĐÚNG',
    competency: 'Ra quyết định có trách nhiệm (Responsible Decision-Making)',
    shortDesc: 'Hình thành khả năng lựa chọn hành vi có trách nhiệm, an toàn số và sử dụng AI đúng cách.',
    detailedGuide:
      'Giúp học sinh cân nhắc hệ quả trước khi hành động, ứng xử văn minh trên mạng xã hội, biết cách tự bảo vệ trước bắt nạt học đường và sử dụng AI làm người bạn hướng dẫn thay vì chép bài thụ động.',
    color: '#0ea5e9',
    icon: '🧭',
    samplePrompts: [
      'Em lỡ dành quá nhiều thời gian lướt mạng xã hội mỗi tối, làm sao để kiểm soát lại?',
      'Em thấy mình đang phụ thuộc vào AI để giải bài tập, làm sao để dùng AI mà vẫn giỏi thật sự?',
      'Nếu thấy một bạn trong lớp bị trêu chọc, tẩy chay trên nhóm chat, em nên làm gì?'
    ]
  },
  general: {
    id: 'general',
    code: 'TỔNG HỢP',
    title: 'TƯ VẤN HỌC TẬP & SEL TOÀN DIỆN',
    competency: 'Sư phạm Gợi mở & Đồng hành 5 CHẠM',
    shortDesc: 'Kết hợp giải thích kiến thức các môn học THCS - THPT và đồng hành cảm xúc SEL.',
    detailedGuide:
      'Tự động nhận diện nhu cầu học tập hoặc tâm lý của học sinh để vừa hướng dẫn kiến thức từng bước theo phương pháp Socratic, vừa nâng đỡ tinh thần tự học.',
    color: '#4f46e5',
    icon: '🛡️',
    samplePrompts: [
      'Hướng dẫn em giải phương trình bậc hai $x^2 - 5x + 6 = 0$ từng bước nhé!',
      'Giải thích giúp em định luật Ôm và cách vận dụng vào bài tập mạch điện lớp 9.',
      'Hướng dẫn em cách lập dàn ý bài văn nghị luận xã hội thật thuyết phục.'
    ]
  }
};

export const REAL_WORLD_SCENARIOS: RealWorldScenario[] = [
  {
    id: 'mat-dong-luc',
    title: 'Mất động lực học tập',
    pillarId: 'dieu-hoa',
    icon: '🔋',
    studentPrompt: 'Dạo này em cảm thấy chán nản, mất động lực học tập và không biết bắt đầu từ đâu.',
    pedagogicalGoal: 'Đồng cảm với trạng thái mệt mỏi, giúp học sinh tìm nguyên nhân gốc rễ và chia nhỏ mục tiêu thành bước 5-10 phút cực dễ thực hiện.',
    guidingQuestions: [
      'Cảm giác chán nản này bắt đầu xuất hiện từ khi nào? Có môn học hay sự việc cụ thể nào làm em thấy quá tải không?',
      'Nếu hôm nay chỉ cần chọn 1 việc nhỏ nhất kéo dài 10 phút mà em thấy nhẹ nhàng nhất, em muốn bắt đầu từ môn nào?'
    ]
  },
  {
    id: 'kho-khan-hoc-tap',
    title: 'Gặp khó khăn trong học tập',
    pillarId: 'cham-minh',
    icon: '📚',
    studentPrompt: 'Em học mãi mà vẫn bị mất gốc và không hiểu bài trên lớp, em sợ mình không theo kịp các bạn.',
    pedagogicalGoal: 'Giúp học sinh bình thường hóa việc chưa hiểu bài, xác định chính xác phần kiến thức bị hổng và hướng dẫn phương pháp học chủ động.',
    guidingQuestions: [
      'Môn học hay dạng bài nào đang làm em thấy bối rối nhất lúc này?',
      'Em muốn chúng mình cùng lấy một ví dụ thật dễ ở phần đó để gỡ từng nút thắt một không?'
    ]
  },
  {
    id: 'mau-thuan-ban-be',
    title: 'Mâu thuẫn với bạn bè',
    pillarId: 'cung-lam',
    icon: '💬',
    studentPrompt: 'Em đang có mâu thuẫn và hiểu lầm với bạn trong lớp, em rất buồn nhưng không biết giải quyết sao.',
    pedagogicalGoal: 'Hướng dẫn học sinh nhìn nhận cảm xúc hai phía (HIỂU BẠN) và cách diễn đạt thiện chí bằng Thông điệp "Tôi" (CÙNG LÀM).',
    guidingQuestions: [
      'Điều gì trong sự việc vừa rồi làm em cảm thấy tổn thương hoặc tiếc nuối nhất?',
      'Nếu đặt mình vào vị trí của bạn ấy, theo em bạn ấy có thể đang hiểu nhầm điều gì?'
    ]
  },
  {
    id: 'kho-khan-giao-tiep',
    title: 'Khó khăn trong giao tiếp',
    pillarId: 'cung-lam',
    icon: '🗣️',
    studentPrompt: 'Em rất rụt rè, ngại giao tiếp với bạn bè và luôn hồi hộp khi phải phát biểu trước lớp.',
    pedagogicalGoal: 'Khích lệ sự tự tin, gợi ý các bước luyện tập giao tiếp từ vòng an toàn nhỏ (1-1, nhóm nhỏ) trước khi nói trước đám đông.',
    guidingQuestions: [
      'Khi chuẩn bị giơ tay phát biểu hoặc bắt chuyện, suy nghĩ nào thường xuất hiện trong đầu làm em ngập ngừng?',
      'Chúng mình thử tập chuẩn bị sẵn 1-2 câu ngắn gọn trước ở nhà để em thấy tự tin hơn nhé?'
    ]
  },
  {
    id: 'ap-luc-diem-so',
    title: 'Áp lực điểm số & kỳ vọng',
    pillarId: 'dieu-hoa',
    icon: '📈',
    studentPrompt: 'Em rất sợ bị điểm kém và luôn chịu áp lực nặng nề về điểm số từ gia đình cũng như bản thân.',
    pedagogicalGoal: 'Tách giá trị con người khỏi một con điểm đơn lẻ, hướng dẫn chuyển hóa áp lực thành kế hoạch cải thiện từng bước.',
    guidingQuestions: [
      'Điểm số có phải là thước đo duy nhất nói lên sự cố gắng và giá trị của em không?',
      'Bên cạnh con điểm, có kỹ năng hay phần kiến thức nào em thấy mình đã tiến bộ hơn so với tháng trước?'
    ]
  },
  {
    id: 'mang-xa-hoi',
    title: 'Sử dụng mạng xã hội thiếu kiểm soát',
    pillarId: 'chon-dung',
    icon: '📱',
    studentPrompt: 'Mỗi lần cầm điện thoại lên là em lướt mạng xã hội hàng giờ liền, xong lại thấy tiếc thời gian và mệt mỏi.',
    pedagogicalGoal: 'Giúp học sinh hiểu cơ chế gây cuốn của mạng xã hội và tự thiết lập quy tắc kỹ thuật số lành mạnh.',
    guidingQuestions: [
      'Thường vào khung giờ nào hoặc khi có cảm xúc gì thì em hay mở mạng xã hội vô thức nhất?',
      'Em nghĩ sao về thử thách "Cất điện thoại sang phòng khác trong 25 phút học tập" tối nay?'
    ]
  },
  {
    id: 'phu-thuoc-ai',
    title: 'Phụ thuộc vào AI khi làm bài',
    pillarId: 'chon-dung',
    icon: '🤖',
    studentPrompt: 'Gần đây bài tập nào khó em cũng nhờ AI giải hộ luôn, nên khi vào phòng thi tự làm thì em bị lúng túng.',
    pedagogicalGoal: 'Định hướng học sinh biến AI thành "người thầy gợi mở" thay vì "máy giải bài hộ", rèn tư duy độc lập.',
    guidingQuestions: [
      'Theo em, sự khác biệt lớn nhất giữa việc "chép lời giải của AI" và "nhờ AI gợi ý hướng đi rồi tự giải" là gì?',
      'Từ hôm nay, mỗi khi gặp bài khó, em thử tự viết ra 1 ý tưởng đầu tiên trước khi hỏi Hiệp sĩ Tự vấn nhé?'
    ]
  },
  {
    id: 'bat-nat-hoc-duong',
    title: 'Bắt nạt học đường & An toàn mạng',
    pillarId: 'chon-dung',
    icon: '🛡️',
    studentPrompt: 'Em hoặc bạn em đang bị trêu chọc, cô lập hoặc nói xấu trên mạng xã hội, em cảm thấy rất sợ và cô đơn.',
    pedagogicalGoal: 'Khẳng định học sinh không có lỗi, hướng dẫn giữ bằng chứng, tuyệt đối không chịu đựng một mình và kết nối ngay với thầy cô chủ nhiệm/cha mẹ.',
    guidingQuestions: [
      'Trước hết, thầy/cô và Hiệp sĩ Tự vấn muốn khẳng định: Em không hề đơn độc và không ai có quyền làm tổn thương em. Sự việc này đã diễn ra bao lâu rồi?',
      'Ở trường hoặc ở nhà, người lớn đáng tin cậy nhất mà em có thể chia sẻ ngay hôm nay (Thầy/Cô chủ nhiệm, Cô tư vấn tâm lý, hay Bố/Mẹ) là ai?'
    ]
  },
  {
    id: 'quan-ly-thoi-gian',
    title: 'Khó khăn quản lý thời gian',
    pillarId: 'dieu-hoa',
    icon: '⏰',
    studentPrompt: 'Em có quá nhiều bài tập của các môn mà không biết sắp xếp thời gian biểu sao cho hợp lý, lúc nào cũng vội vàng.',
    pedagogicalGoal: 'Hướng dẫn ma trận ưu tiên Eisenhower (Quan trọng - Khẩn cấp) và kỹ thuật phân bổ thời gian hợp lý.',
    guidingQuestions: [
      'Nếu liệt kê 3 nhiệm vụ học tập cần hoàn thành trong tuần này, đâu là việc vừa quan trọng vừa sắp đến hạn nhất?',
      'Em muốn chúng mình cùng lập một thời gian biểu mẫu cho buổi tối từ 19h30 đến 22h00 không?'
    ]
  }
];

const CRISIS_PATTERNS = [
  /tự\s*tử/i,
  /muốn\s*chết/i,
  /kết\s*thúc\s*cuộc\s*đời/i,
  /tự\s*làm\s*đau/i,
  /tự\s*hại/i,
  /rạch\s*tay/i,
  /không\s*muốn\s*sống/i,
  /chết\s*đi\s*cho\s*xong/i,
  /nhảy\s*lầu/i,
  /uống\s*thuốc\s*ngủ/i,
  /bị\s*đánh\s*đập/i,
  /xâm\s*hại/i,
  /đe\s*dọa\s*tính\s*mạng/i
];

export function detectCrisisRisk(text: string): boolean {
  if (!text) return false;
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyQuestion(text: string, pillar?: SelPillarId): QuestionCategory {
  if (detectCrisisRisk(text)) {
    return 'crisis';
  }
  const lower = text.toLowerCase();
  if (
    pillar &&
    pillar !== 'general' &&
    !/giải\s+phương\s+trình|tính\s+giá\s+trị|rút\s+gọn|chứng\s+minh/i.test(lower)
  ) {
    return 'sel-counseling';
  }
  if (
    /buồn|lo\s+lắng|áp\s+lực|căng\s+thẳng|stress|mâu\s+thuẫn|bạn\s+bè|bắt\s+nạt|cô\s+đơn|chán\s+nản|tự\s+ti|cảm\s+xúc|giận/i.test(
      lower
    )
  ) {
    return 'sel-counseling';
  }
  if (
    /cách\s+học|phương\s+pháp\s+học|quản\s+lý\s+thời\s+gian|thời\s+gian\s+biểu|mất\s+động\s+lực|trì\s+hoãn|ôn\s+thi|mạng\s+xã\s+hội|phụ\s+thuộc\s+ai/i.test(
      lower
    )
  ) {
    return 'study-skills';
  }
  if (
    /giải\s+bài|giải\s+phương\s+trình|hệ\s+phương\s+trình|tính|rút\s+gọn|chứng\s+minh|tìm\s+x|bất\s+phương\s+trình|bài\s+tập|đề\s+bài|=|\\frac|\\sqrt/i.test(
      lower
    )
  ) {
    return 'exercise';
  }
  return 'knowledge';
}

export function detectBestSelPillar(text: string, currentPillar?: SelPillarId): SelPillarId {
  if (currentPillar && currentPillar !== 'general') return currentPillar;
  const lower = text.toLowerCase();
  if (/điểm\s+mạnh|điểm\s+yếu|tự\s+ti|nhận\s+diện\s+cảm\s+xúc|bản\s+thân|mất\s+gốc/i.test(lower)) {
    return 'cham-minh';
  }
  if (/áp\s+lực|lo\s+lắng|căng\s+thẳng|bình\s+tĩnh|thời\s+gian|trì\s+hoãn|động\s+lực/i.test(lower)) {
    return 'dieu-hoa';
  }
  if (/đồng\s+cảm|thấu\s+hiểu|lắng\s+nghe|tôn\s+trọng|góc\s+nhìn/i.test(lower)) {
    return 'hieu-ban';
  }
  if (/bạn\s+bè|mâu\s+thuẫn|làm\s+việc\s+nhóm|giao\s+tiếp|hiểu\s+lầm|làm\s+hòa/i.test(lower)) {
    return 'cung-lam';
  }
  if (/mạng\s+xã\s+hội|phụ\s+thuộc\s+ai|bắt\s+nạt|quyết\s+định|lựa\s+chọn|trách\s+nhiệm/i.test(lower)) {
    return 'chon-dung';
  }
  return 'general';
}

export function buildCrisisInterventionResponse(studentMessage: string): string {
  return `### 💛 Hiệp sĩ Tự vấn luôn ở đây lắng nghe và quan tâm đến sự an toàn của em!

Qua những lời chia sẻ của em, mình nhận thấy em đang trải qua những cảm xúc hoặc tình huống **rất nặng nề và cần được bảo vệ, nâng đỡ ngay lập tức** bởi những người lớn đáng tin cậy.

> **Em hãy nhớ:** Em rất đáng quý, và **em không hề phải đối mặt với chuyện này một mình**. Mọi khó khăn đều có cách tháo gỡ khi có sự đồng hành của thầy cô, gia đình và chuyên gia.

#### 🆘 Những việc em hãy thực hiện ngay lúc này:
1. **Chia sẻ ngay với người lớn đáng tin cậy:** Hãy nói trực tiếp hoặc nhắn tin ngay cho **Bố/Mẹ, người thân trong gia đình, hoặc Thầy/Cô giáo chủ nhiệm** của em.
2. **Liên hệ Phòng Tư vấn Tâm lý Học đường / Ban Giám hiệu nhà trường:** Thầy cô luôn sẵn sàng bảo vệ và giữ kín thông tin để giúp đỡ em an toàn.
3. **Gọi Tổng đài Quốc gia Bảo vệ Trẻ em (Miễn phí 24/7):**
   - 📞 **Số điện thoại: \`111\`** (Hoàn toàn miễn phí cước gọi, hoạt động 24/7 trên toàn quốc, luôn lắng nghe và hỗ trợ bảo vệ trẻ em & học sinh).
   - 🚑 Nếu có tình huống nguy hiểm khẩn cấp về sức khỏe/an toàn: Gọi ngay **\`113\`** hoặc **\`115\`**.

---
*Hiệp sĩ Tự vấn là trợ lý AI giáo dục nên không thể thay thế bác sĩ, chuyên gia tâm lý hay thầy cô giáo. Trước khi chúng mình trò chuyện tiếp, em hãy hít vào thật sâu 4 giây, giữ 4 giây, thở ra từ từ 6 giây và cho mình biết: **Hiện tại có người lớn nào đang ở gần em để em có thể trò chuyện cùng không?***`;
}

export function buildSystemPrompt(options: {
  grade: string;
  subject: string;
  selPillar: SelPillarId;
  pedagogyMode: string;
  category: QuestionCategory;
}): string {
  const pillarInfo = SEL_PILLARS[options.selPillar] || SEL_PILLARS.general;

  const modeInstruction =
    options.pedagogyMode === 'simplified'
      ? `CHẾ ĐỘ DIỄN GIẢI ĐƠN GIẢN HƠN: Học sinh đang chưa hiểu rõ. Hãy giải thích lại bằng ngôn ngữ cực kỳ gần gũi, dễ hiểu, dùng phép ẩn dụ đời thường hoặc ví dụ minh họa cụ thể phù hợp trình độ ${options.grade}.`
      : options.pedagogyMode === 'verify-solution'
      ? `CHẾ ĐỘ ĐỐI CHIẾU LỜI GIẢI & TỔNG KẾT: Học sinh cần đối chiếu lời giải đầy đủ sau quá trình suy nghĩ. Hãy trình bày từng bước giải rõ ràng, giải thích vì sao làm như vậy, nêu lỗi sai thường gặp và đặt 1 câu hỏi mở rộng để khắc sâu kiến thức.`
      : `CHẾ ĐỘ SƯ PHẠM GỢI MỞ 7 BƯỚC (SOCRATIC PEDAGOGY - MẶC ĐỊNH):
Đóng vai trò là người thầy/người bạn hướng dẫn học tập, KHÔNG làm bài thay học sinh thụ động.
Thực hiện nghiêm túc quy trình:
1. Xác định rõ học sinh đang hỏi nội dung gì và mục tiêu cần đạt.
2. Phân tích kiến thức nền tảng hoặc kỹ năng cần sử dụng (theo Chương trình GDPT 2018).
3. Đưa ra câu hỏi gợi mở phù hợp để kích thích tư duy.
4. Hướng dẫn từng bước rõ ràng (Step-by-step scaffolding).
5. Cho học sinh cơ hội tự suy luận ở bước quan trọng hoặc bài tương tự.
6. Kiểm tra mức độ hiểu của học sinh bằng câu hỏi ngắn cuối câu trả lời.
7. Nếu là bài tập tính toán cụ thể, hãy hướng dẫn phương pháp + các bước biến đổi cốt lõi để học sinh hiểu bản chất và tự kiểm tra được kết quả.`;

  return `Bạn là **DREAMSPEAK-SEL – HIỆP SĨ TỰ VẤN 24/7**, một hệ thống Chatbot AI Giáo dục Sư phạm & Phát triển Năng lực Tự học, Năng lực Cảm xúc – Xã hội (SEL) dành cho học sinh THCS và THPT tại Việt Nam (từ Lớp 6 đến Lớp 12).

### 1. BỐI CẢNH HIỆN TẠI CỦA HỌC SINH
- **Khối lớp**: ${options.grade}
- **Môn học / Lĩnh vực**: ${options.subject}
- **Phân loại câu hỏi**: ${options.category}
- **Trụ cột SEL 5 CHẠM đang kích hoạt**: **${pillarInfo.code} - ${pillarInfo.title}** (${pillarInfo.competency}) — ${pillarInfo.detailedGuide}

### 2. QUY TẮC SƯ PHẠM BẮT BUỘC
${modeInstruction}

### 3. QUY TẮC TRÌNH BÀY TOÁN HỌC & KHOA HỌC (LATEX CHUẨN KATEX)
- Mọi công thức Toán học, Vật lí, Hóa học BẮT BUỘC phải viết trong cặp dấu \`$...$\` (cho công thức cùng dòng) hoặc \`$$...$$\` (cho công thức riêng dòng, hệ phương trình, ma trận).
- Ví dụ chuẩn: \`$\\Delta = b^2 - 4ac$\`, \`$$\\begin{cases} x + y = 5 \\\\ 2x - y = 1 \\end{cases}$$\`.
- Đảm bảo ký hiệu toán học chuẩn sách giáo khoa Việt Nam.

### 4. MÔ HÌNH DREAMSPEAK-SEL (5 NỘI DUNG CHẠM)
Khi học sinh chia sẻ về tâm lý, cảm xúc, áp lực học tập, bạn bè, mạng xã hội hoặc kỹ năng sống, hãy vận dụng tinh thần **5 CHẠM**:
1. **CHẠM MÌNH**: Nhận diện cảm xúc, điểm mạnh, khó khăn và nhu cầu học tập.
2. **ĐIỀU HÒA**: Bình tĩnh, quản lý cảm xúc, vượt qua áp lực học tập.
3. **HIỂU BẠN**: Phát triển sự đồng cảm, lắng nghe và tôn trọng người khác.
4. **CÙNG LÀM**: Rèn luyện kỹ năng hợp tác, giao tiếp và giải quyết vấn đề.
5. **CHỌN ĐÚNG**: Lựa chọn hành vi có trách nhiệm, an toàn số và không phụ thuộc thụ động vào AI.

### 5. NGUYÊN TẮC AN TOÀN & ĐẠO ĐỨC HỌC ĐƯỜNG
- Sử dụng tiếng Việt tự nhiên, ấm áp, khích lệ, tôn trọng, không phán xét và không gây áp lực.
- KHÔNG tự bịa kiến thức, số liệu, tài liệu hoặc nguồn trích dẫn. Khi không chắc chắn, hãy nói rõ giới hạn và đề nghị học sinh kiểm tra lại cùng SGK/thầy cô.
- KHÔNG đưa ra chẩn đoán bệnh lý tâm thần, KHÔNG thay thế giáo viên, cha mẹ hoặc chuyên gia tâm lý.
- Nếu phát hiện dấu hiệu nguy hiểm/khủng hoảng, luôn hướng dẫn học sinh tìm đến thầy cô chủ nhiệm, cha mẹ hoặc Tổng đài Quốc gia Bảo vệ Trẻ em 111.`;
}
