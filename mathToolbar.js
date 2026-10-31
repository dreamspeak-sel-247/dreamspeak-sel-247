// ============================================================================
// THANH CÔNG CỤ CÔNG THỨC TOÁN HỌC TRỰC QUAN (MATHLIVE + KATEX)
// Đáp ứng đầy đủ 15 nhóm ký hiệu THCS & THPT và 7 mẫu biểu thức kiểm thử chuẩn
// ============================================================================

window.MATH_TOOLBAR_CATEGORIES = [
  {
    id: 'algebra',
    name: 'Phân số, Căn & Lũy thừa',
    symbols: [
      { label: 'Phân số', display: '\\frac{a}{b}', latex: '\\frac{a}{b}' },
      { label: 'Hỗn số', display: 'a\\frac{b}{c}', latex: 'a\\frac{b}{c}' },
      { label: 'Căn bậc 2', display: '\\sqrt{x}', latex: '\\sqrt{x}' },
      { label: 'Căn bậc 3', display: '\\sqrt[3]{x}', latex: '\\sqrt[3]{x}' },
      { label: 'Căn bậc n', display: '\\sqrt[n]{x}', latex: '\\sqrt[n]{x}' },
      { label: 'Bình phương', display: 'x^2', latex: 'x^2' },
      { label: 'Lũy thừa', display: 'x^n', latex: 'x^{n}' },
      { label: 'Chỉ số dưới', display: 'x_i', latex: 'x_{i}' },
      { label: 'Trị tuyệt đối', display: '|x|', latex: '\\left|x\\right|' },
      { label: 'Ngoặc tròn', display: '(a+b)', latex: '\\left(a+b\\right)' },
      { label: 'Ngoặc vuông', display: '[a,b]', latex: '\\left[a,b\\right]' },
      { label: 'Cộng trừ', display: '\\pm', latex: '\\pm ' }
    ]
  },
  {
    id: 'equations',
    name: 'Phương trình, Hệ PT & Bất PT',
    symbols: [
      { label: 'PT bậc hai', display: 'ax^2+bx+c=0', latex: 'ax^2 + bx + c = 0' },
      { label: 'Biệt thức Δ', display: '\\Delta=b^2-4ac', latex: '\\Delta = b^2 - 4ac' },
      {
        label: 'Hệ PT 2 ẩn',
        display: '\\begin{cases} x+y=a \\\\ x-y=b \\end{cases}',
        latex: '\\begin{cases} ax + by = c \\\\ a\'x + b\'y = c\' \\end{cases}'
      },
      {
        label: 'Hệ PT 3 ẩn',
        display: '\\begin{cases} x+y+z=1 \\\\ ... \\end{cases}',
        latex: '\\begin{cases} x + y + z = 6 \\\\ 2x - y + z = 3 \\\\ x + 2y - z = 2 \\end{cases}'
      },
      { label: 'Nhỏ hơn/bằng', display: '\\le', latex: ' \\le ' },
      { label: 'Lớn hơn/bằng', display: '\\ge', latex: ' \\ge ' },
      { label: 'Khác', display: '\\neq', latex: ' \\neq ' },
      { label: 'Xấp xỉ', display: '\\approx', latex: ' \\approx ' },
      { label: 'Tương đương', display: '\\iff', latex: ' \\iff ' },
      { label: 'Suy ra', display: '\\Rightarrow', latex: ' \\Rightarrow ' },
      { label: 'Hoặc (BPT)', display: '\\left[\\begin{matrix}A\\\\B\\end{matrix}\\right.', latex: '\\left[\\begin{matrix} x > a \\\\ x < b \\end{matrix}\\right.' },
      { label: 'Và (Hệ ĐK)', display: '\\begin{cases}A\\\\B\\end{cases}', latex: '\\begin{cases} x \\ge 0 \\\\ x \\neq 1 \\end{cases}' }
    ]
  },
  {
    id: 'calculus',
    name: 'Hàm số, Giới hạn, Tổng & Tích phân',
    symbols: [
      { label: 'Hàm số', display: 'y=f(x)', latex: 'y = f(x)' },
      { label: 'Đạo hàm', display: "f'(x)", latex: "f'(x)" },
      { label: 'Giới hạn', display: '\\lim_{x\\to x_0}', latex: '\\lim_{x \\to x_0} f(x)' },
      { label: 'Lim vô cực', display: '\\lim_{x\\to+\\infty}', latex: '\\lim_{x \\to +\\infty} f(x)' },
      { label: 'Tổng Sigma', display: '\\sum_{i=1}^n', latex: '\\sum_{i=1}^{n} a_i' },
      { label: 'Tích Pi', display: '\\prod_{i=1}^n', latex: '\\prod_{i=1}^{n} a_i' },
      { label: 'Nguyên hàm', display: '\\int f(x)dx', latex: '\\int f(x)\\,dx' },
      { label: 'Tích phân', display: '\\int_a^b f(x)dx', latex: '\\int_{a}^{b} f(x)\\,dx' },
      { label: 'Logarit', display: '\\log_a b', latex: '\\log_{a}(b)' },
      { label: 'Log tự nhiên', display: '\\ln x', latex: '\\ln(x)' },
      { label: 'Vô cực', display: '\\infty', latex: '\\infty' },
      { label: 'Tổ hợp C', display: 'C_n^k', latex: 'C_{n}^{k}' }
    ]
  },
  {
    id: 'geometry_trig',
    name: 'Lượng giác, Hình học, Góc & Vectơ',
    symbols: [
      { label: 'Sin', display: '\\sin\\alpha', latex: '\\sin(\\alpha)' },
      { label: 'Cos', display: '\\cos\\alpha', latex: '\\cos(\\alpha)' },
      { label: 'Tan', display: '\\tan\\alpha', latex: '\\tan(\\alpha)' },
      { label: 'Cot', display: '\\cot\\alpha', latex: '\\cot(\\alpha)' },
      { label: 'Số Pi', display: '\\pi', latex: '\\pi' },
      { label: 'Góc ABC', display: '\\widehat{ABC}', latex: '\\widehat{ABC}' },
      { label: 'Độ', display: '90^\\circ', latex: '90^{\\circ}' },
      { label: 'Vectơ AB', display: '\\overrightarrow{AB}', latex: '\\overrightarrow{AB}' },
      { label: 'Vectơ u', display: '\\vec{u}', latex: '\\vec{u}' },
      { label: 'Vuông góc', display: '\\perp', latex: ' \\perp ' },
      { label: 'Song song', display: '\\parallel', latex: ' \\parallel ' },
      { label: 'Tam giác', display: '\\triangle ABC', latex: '\\triangle ABC' },
      { label: 'Đồng dạng', display: '\\sim', latex: ' \\sim ' },
      { label: 'Bằng nhau', display: '\\cong', latex: ' \\cong ' }
    ]
  },
  {
    id: 'sets_matrix',
    name: 'Tập hợp & Ma trận',
    symbols: [
      { label: 'Thuộc', display: '\\in', latex: ' \\in ' },
      { label: 'Không thuộc', display: '\\notin', latex: ' \\notin ' },
      { label: 'Tập con', display: '\\subset', latex: ' \\subset ' },
      { label: 'Con hoặc =', display: '\\subseteq', latex: ' \\subseteq ' },
      { label: 'Hợp', display: '\\cup', latex: ' \\cup ' },
      { label: 'Giao', display: '\\cap', latex: ' \\cap ' },
      { label: 'Tập rỗng', display: '\\emptyset', latex: '\\emptyset' },
      { label: 'Tập số thực', display: '\\mathbb{R}', latex: '\\mathbb{R}' },
      { label: 'Tập số nguyên', display: '\\mathbb{Z}', latex: '\\mathbb{Z}' },
      { label: 'Với mọi', display: '\\forall', latex: '\\forall ' },
      { label: 'Tồn tại', display: '\\exists', latex: '\\exists ' },
      {
        label: 'Ma trận 2x2',
        display: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
        latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'
      },
      {
        label: 'Ma trận 3x3',
        display: 'A_{3\\times 3}',
        latex: '\\begin{pmatrix} a_{11} & a_{12} & a_{13} \\\\ a_{21} & a_{22} & a_{23} \\\\ a_{31} & a_{32} & a_{33} \\end{pmatrix}'
      }
    ]
  },
  {
    id: 'templates',
    name: '⭐ 7 Mẫu Kiểm thử Nhanh (THCS/THPT)',
    symbols: [
      {
        label: '1. PT bậc hai',
        display: 'x^2-5x+6=0',
        latex: 'x^2 - 5x + 6 = 0',
        questionPrompt: 'Hướng dẫn em từng bước giải phương trình bậc hai sau:'
      },
      {
        label: '2. Hệ PT 2 ẩn',
        display: '\\begin{cases}2x+y=5\\\\x-y=1\\end{cases}',
        latex: '\\begin{cases} 2x + y = 5 \\\\ x - y = 1 \\end{cases}',
        questionPrompt: 'Hướng dẫn em giải hệ phương trình hai ẩn sau bằng phương pháp thế hoặc cộng đại số:'
      },
      {
        label: '3. Phân thức',
        display: 'P=\\frac{x^2-1}{x+1}',
        latex: 'P = \\frac{x^2 - 4}{x - 2} + \\frac{2x + 1}{x + 1}',
        questionPrompt: 'Hướng dẫn em tìm điều kiện xác định và rút gọn biểu thức phân thức đại số sau:'
      },
      {
        label: '4. Căn thức',
        display: 'A=\\sqrt{x+2\\sqrt{x-1}}',
        latex: 'A = \\frac{\\sqrt{x} + 1}{\\sqrt{x} - 1} + \\frac{\\sqrt{x} - 1}{\\sqrt{x} + 1}',
        questionPrompt: 'Hướng dẫn em rút gọn biểu thức chứa căn thức bậc hai sau (với $x \\ge 0, x \\neq 1$):'
      },
      {
        label: '5. Bất PT',
        display: '2x-3 \\le 5',
        latex: '\\frac{2x - 3}{x + 1} \\le 1',
        questionPrompt: 'Hướng dẫn em lập bảng xét dấu hoặc biến đổi tương đương để giải bất phương trình sau:'
      },
      {
        label: '6. Lượng giác',
        display: '\\sin^2 x+\\cos^2 x=1',
        latex: '2\\sin^2 x - 3\\sin x + 1 = 0',
        questionPrompt: 'Hướng dẫn em giải phương trình lượng giác sau:'
      },
      {
        label: '7. Hình học',
        display: 'AB^2+AC^2=BC^2',
        latex: '\\triangle ABC \\text{ vuông tại } A, AH \\perp BC, AB = 6\\text{ cm}, AC = 8\\text{ cm}. \\text{ Tính } BC, AH.',
        questionPrompt: 'Hướng dẫn em áp dụng định lý Pythagore và hệ thức lượng trong tam giác vuông để giải bài toán hình học sau:'
      }
    ]
  }
];
