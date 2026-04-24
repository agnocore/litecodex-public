export function normalizePrompt(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "heic", "heif", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "avi", "webm", "mkv", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "oga", "opus"]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "rtf", "odt"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx", "csv", "tsv", "ods"]);
const SLIDE_EXTENSIONS = new Set(["ppt", "pptx", "key"]);
const TEXT_EXTENSIONS = new Set(["md", "txt", "log"]);
const CODE_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "py", "java", "go", "rs", "c", "cc", "cpp", "h", "hpp",
  "cs", "php", "rb", "swift", "kt", "kts", "scala", "dart",
  "sh", "bash", "zsh", "ps1", "sql",
  "html", "css", "scss", "sass", "less",
  "json", "jsonl", "yaml", "yml", "xml", "toml", "ini"
]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"]);
const DATA_EXTENSIONS = new Set(["parquet", "feather", "ndjson", "db", "sqlite", "sqlite3"]);

const SOCIAL_ONLY_PATTERNS = [
  /^(你好|您好|早上好|中午好|下午好|晚上好|晚安|在吗|嗨|哈喽|嘿)[!！,.，。?？ ]*$/i,
  /^(hi|hello|hey|good\s*(morning|afternoon|evening|night))[!！,.，。?？ ]*$/i,
  /^(谢谢|感谢|辛苦了|麻烦你了|收到)[!！,.，。?？ ]*$/i,
  /^(thanks?|thank\s*you|appreciate\s+it|got\s+it)[!！,.，。?？ ]*$/i,
  /^(再见|拜拜|回头见|明天见|先这样)[!！,.，。?？ ]*$/i,
  /^(bye|goodbye|see\s*you|talk\s+later)[!！,.，。?？ ]*$/i
];

const REQUEST_PREFIX_HINTS = [
  /^(请|请你|帮我|麻烦|劳烦|需要你|给我|替我|协助我|直接|先|继续|接着|按上面)/i,
  /^(please|can\s+you|could\s+you|help\s+me|need\s+you|continue|keep\s+going|based\s+on\s+the\s+above)/i
];

const DIRECT_COPY_REQUEST_PATTERNS = [
  /复制粘贴|可直接复制|可直接使用|一键使用|直接运行|完整代码|完整源码/i,
  /\bcopy\s*paste\b|\bready\s*to\s*run\b|\bfull\s*source\s*code\b/i
];

const CODE_PROTECTION_REQUEST_PATTERNS = [
  /保护代码|代码保护|权限边界|边界|授权|许可证|license|签名|防拷贝|不可复制|kernel/i,
  /\bobfuscat(e|ion)\b|\bcode\s+protection\b|\bsigned\s+bundle\b|\bruntime\s+attestation\b/i
];

const CODE_CONTEXT_PATTERNS = [
  /```[\s\S]*?```/,
  /function\s+[A-Za-z_$][\w$]*\s*\(/,
  /const\s+[A-Za-z_$][\w$]*\s*=/,
  /class\s+[A-Za-z_$][\w$]*/,
  /<\/?[a-z][^>]*>/i,
  /\bSELECT\b[\s\S]*\bFROM\b/i,
  /\bINSERT\b[\s\S]*\bINTO\b/i,
  /\bUPDATE\b[\s\S]*\bSET\b/i,
  /\bDELETE\b[\s\S]*\bFROM\b/i,
  /\bimport\b[\s\S]*\bfrom\b/i,
  /\bexport\s+(default|function|const|class)\b/i,
  /\bpubspec\.yaml\b/i,
  /\bbuild\.gradle\b/i,
  /\bPodfile\b/i,
  /\bwrangler\.toml\b/i,
  /\bDockerfile\b/i,
  /\bkubernetes\b|\bk8s\b/i
];

export const PLATFORM_REGISTRY = {
  domains: [
    {
      id: "general.chat",
      weight: 0.5,
      keywords: ["闲聊", "聊天", "问候", "寒暄", "casual chat", "small talk"]
    },
    {
      id: "frontend.web",
      weight: 1.2,
      keywords: [
        "html", "css", "scss", "sass", "less", "javascript", "typescript", "dom",
        "browser", "frontend", "前端", "页面", "网页", "浏览器", "vite", "webpack",
        "tailwind", "bootstrap", "responsive", "响应式", "布局", "动画", "轮播"
      ],
      patterns: [
        /\breact\b|\bnext\.?js\b|\bvue\b|\bnuxt\b|\bangular\b|\bsvelte\b/i,
        /前端|页面|网页|浏览器|轮播|响应式|布局|动画/i
      ]
    },
    {
      id: "mobile.flutter",
      weight: 1.3,
      keywords: [
        "flutter", "dart", "widget", "cupertino", "materialapp", "statefulwidget",
        "statelesswidget", "pubspec", "hot reload"
      ],
      patterns: [
        /\bflutter\b|\bdart\b|\bpubspec\.ya?ml\b|\bstatefulwidget\b|\bstatelesswidget\b/i
      ]
    },
    {
      id: "mobile.android.kotlin",
      weight: 1.3,
      keywords: [
        "android", "kotlin", "gradle", "apk", "aab", "android studio",
        "jetpack", "compose", "manifest", "adb", "activity", "fragment"
      ],
      patterns: [
        /\bkotlin\b|\bandroid\b|\bjetpack\s+compose\b|\bbuild\.gradle\b|\badb\b/i
      ]
    },
    {
      id: "mobile.ios.swift",
      weight: 1.3,
      keywords: [
        "ios", "swift", "swiftui", "uikit", "xcode", "cocoapods", "podfile",
        "ipa", "xcworkspace", "storyboard"
      ],
      patterns: [
        /\bios\b|\bswift(ui)?\b|\bxcode\b|\bcocoapods\b|\bpodfile\b/i
      ]
    },
    {
      id: "mobile.react_native",
      weight: 1.2,
      keywords: [
        "react native", "expo", "metro", "rn", "native module", "app.json"
      ],
      patterns: [
        /\breact\s+native\b|\bexpo\b|\bmetro\b/i
      ]
    },
    {
      id: "backend.node",
      weight: 1.2,
      keywords: [
        "node", "nodejs", "npm", "pnpm", "yarn", "express", "koa", "nest",
        "backend", "后端", "api", "server", "middleware", "pm2"
      ],
      patterns: [
        /\bnode\.?js\b|\bexpress\b|\bkoa\b|\bnest(js)?\b|\bpm2\b/i
      ]
    },
    {
      id: "backend.python",
      weight: 1.2,
      keywords: [
        "python", "fastapi", "django", "flask", "uvicorn", "gunicorn", "celery", "pip"
      ],
      patterns: [
        /\bpython\b|\bfastapi\b|\bdjango\b|\bflask\b|\buvicorn\b|\bcelery\b/i
      ]
    },
    {
      id: "backend.java",
      weight: 1.2,
      keywords: [
        "java", "spring", "spring boot", "maven", "jvm", "tomcat", "gradle", "mybatis"
      ],
      patterns: [
        /\bjava\b|\bspring(\s+boot)?\b|\bmaven\b|\bjvm\b|\btomcat\b|\bmybatis\b/i
      ]
    },
    {
      id: "backend.go",
      weight: 1.2,
      keywords: ["golang", "go", "gin", "fiber", "goroutine", "go mod"],
      patterns: [/\bgolang\b|\bgo\s+mod\b|\bgoroutine\b|\bgin\b|\bfiber\b/i]
    },
    {
      id: "backend.rust",
      weight: 1.2,
      keywords: ["rust", "cargo", "tokio", "actix", "axum"],
      patterns: [/\brust\b|\bcargo\b|\btokio\b|\bactix\b|\baxum\b/i]
    },
    {
      id: "backend.php",
      weight: 1.0,
      keywords: ["php", "laravel", "symfony", "composer"],
      patterns: [/\bphp\b|\blaravel\b|\bsymfony\b|\bcomposer\b/i]
    },
    {
      id: "infra.cloudflare",
      weight: 1.4,
      keywords: [
        "cloudflare", "worker", "workers", "durable object", "durable objects",
        "wrangler", "kv", "r2", "d1", "queues", "vectorize", "turnstile", "pages"
      ],
      patterns: [
        /\bcloudflare\b|\bwrangler\b|\bdurable\s+objects?\b|\bturnstile\b|\bvectorize\b/i
      ]
    },
    {
      id: "infra.aws",
      weight: 1.4,
      keywords: [
        "aws", "iam", "kms", "secrets manager", "cloudtrail", "step functions",
        "eventbridge", "ecs", "fargate", "lambda", "s3", "rds", "dynamodb", "cloudwatch"
      ],
      patterns: [
        /\baws\b|\biam\b|\bkms\b|\bcloudtrail\b|\bstep\s+functions\b|\beventbridge\b|\bfargate\b/i
      ]
    },
    {
      id: "infra.docker_k8s",
      weight: 1.3,
      keywords: [
        "docker", "container", "containers", "kubernetes", "k8s", "helm",
        "deployment", "service", "ingress", "namespace", "pod", "compose"
      ],
      patterns: [
        /\bdocker\b|\bkubernetes\b|\bk8s\b|\bhelm\b|\bpod\b|\bdocker\s+compose\b/i
      ]
    },
    {
      id: "infra.cicd",
      weight: 1.2,
      keywords: [
        "ci", "cd", "pipeline", "github actions", "gitlab ci", "jenkins", "buildkite", "workflow"
      ],
      patterns: [
        /\bgithub\s+actions\b|\bgitlab\s+ci\b|\bjenkins\b|\bbuildkite\b|\bci\/cd\b/i
      ]
    },
    {
      id: "hosting.vercel_netlify",
      weight: 1.0,
      keywords: ["vercel", "netlify", "deployment preview", "edge function"],
      patterns: [/\bvercel\b|\bnetlify\b|\bedge\s+function\b/i]
    },
    {
      id: "data.sql",
      weight: 1.3,
      keywords: [
        "sql", "mysql", "postgres", "postgresql", "sqlite", "database", "db",
        "schema", "migration", "index", "query", "table", "supabase", "redis"
      ],
      patterns: [
        /\bsql\b|\bmysql\b|\bpostgres(ql)?\b|\bsqlite\b|\bsupabase\b|\bredis\b|\bschema\b/i
      ]
    },
    {
      id: "data.analytics",
      weight: 1.1,
      keywords: ["pandas", "numpy", "dataframe", "etl", "analysis", "analytics", "报表", "数据分析"],
      patterns: [/\bpandas\b|\bnumpy\b|\bdataframe\b|\betl\b|数据分析|报表/i]
    },
    {
      id: "ai.llm_agents",
      weight: 1.4,
      keywords: [
        "openai", "gpt", "claude", "llm", "agent", "agents", "rag", "embedding", "vector",
        "langchain", "langgraph", "prompt", "tool calling", "workflow", "mcp", "whisper", "tts"
      ],
      patterns: [
        /\bopenai\b|\bgpt[-\s]?\d|\bclaude\b|\bllm\b|\brag\b|\bembedding(s)?\b|\blangchain\b|\blanggraph\b|\bmcp\b|\bwhisper\b|\btts\b/i
      ]
    },
    {
      id: "docs.office",
      weight: 1.0,
      keywords: ["pdf", "docx", "ppt", "pptx", "excel", "xlsx", "csv", "文档", "表格", "报告", "合同", "简历"],
      patterns: [/\bpdf\b|\bdocx?\b|\bpptx?\b|\bxlsx?\b|\bcsv\b|文档|表格|报告|合同|简历/i]
    },
    {
      id: "media.vision_audio_video",
      weight: 1.0,
      keywords: ["image", "photo", "picture", "screenshot", "视频", "音频", "录音", "图片", "截图", "照片", "转写", "字幕"],
      patterns: [/\bimage\b|\bphoto\b|\bpicture\b|\bscreenshot\b|图片|截图|照片|视频|音频|录音|字幕|转写/i]
    },
    {
      id: "product.business",
      weight: 0.9,
      keywords: ["需求", "prd", "产品", "roadmap", "strategy", "策略", "商业", "业务", "运营", "market"],
      patterns: [/\bprd\b|\broadmap\b|\bstrategy\b|产品|需求|策略|商业|业务|运营/i]
    },
    {
      id: "legal.compliance",
      weight: 0.8,
      keywords: ["合同", "条款", "政策", "compliance", "privacy", "gdpr", "license", "许可证", "法务"],
      patterns: [/\bcompliance\b|\bprivacy\b|\bgdpr\b|\blicen[sc]e\b|合同|条款|政策|法务/i]
    }
  ],

  actions: [
    {
      id: "social.greeting",
      intent: "greeting",
      mode: "social",
      laneBias: "chat",
      weight: 4,
      keywords: ["你好", "您好", "早上好", "晚上好", "hi", "hello", "hey", "good morning", "good night"],
      patterns: [/\bhi\b|\bhello\b|\bhey\b|你好|您好|早上好|晚上好|晚安/i]
    },
    {
      id: "social.thanks",
      intent: "thanks",
      mode: "social",
      laneBias: "chat",
      weight: 4,
      keywords: ["谢谢", "感谢", "thanks", "thank you", "appreciate it"],
      patterns: [/谢谢|感谢|\bthanks?\b|thank\s*you|appreciate\s+it/i]
    },
    {
      id: "social.farewell",
      intent: "farewell",
      mode: "social",
      laneBias: "chat",
      weight: 4,
      keywords: ["再见", "拜拜", "bye", "goodbye", "see you"],
      patterns: [/再见|拜拜|\bbye\b|goodbye|see\s*you/i]
    },
    {
      id: "qa.ask",
      intent: "qa",
      mode: "qa",
      laneBias: "chat",
      weight: 2.5,
      keywords: ["什么", "为何", "为什么", "怎么", "如何", "是否", "能否", "可否", "哪个", "哪种", "多少", "who", "what", "why", "how", "which", "whether"],
      patterns: [/什么|为何|为什么|怎么|如何|是否|能否|可否|哪个|哪种|多少|谁|哪里/i, /\bwhat\b|\bwhy\b|\bhow\b|\bwhich\b|\bwhether\b|\bwho\b|\bwhere\b/i]
    },
    {
      id: "analysis.summarize",
      intent: "summarize",
      mode: "analysis",
      laneBias: "chat",
      weight: 4.2,
      keywords: ["总结", "概述", "摘要", "summarize", "summary", "overview", "概括"],
      patterns: [/总结|概述|摘要|概括/i, /\bsummar(?:ize|y)\b|\boverview\b/i]
    },
    {
      id: "analysis.extract",
      intent: "extract",
      mode: "analysis",
      laneBias: "chat",
      weight: 4,
      keywords: ["提取", "抽取", "识别", "ocr", "extract", "identify", "parse"],
      patterns: [/提取|抽取|识别|ocr/i, /\bextract\b|\bidentify\b|\bparse\b/i]
    },
    {
      id: "analysis.explain",
      intent: "explain",
      mode: "analysis",
      laneBias: "chat",
      weight: 3.8,
      keywords: ["解释", "说明", "讲解", "describe", "explain", "interpret"],
      patterns: [/解释|说明|讲解|解读/i, /\bdescribe\b|\bexplain\b|\binterpret\b/i]
    },
    {
      id: "analysis.compare",
      intent: "compare",
      mode: "analysis",
      laneBias: "chat",
      weight: 3.8,
      keywords: ["对比", "比较", "compare", "comparison", "versus", "vs"],
      patterns: [/对比|比较/i, /\bcompare\b|\bcomparison\b|\bversus\b|\bvs\b/i]
    },
    {
      id: "analysis.review",
      intent: "review",
      mode: "analysis",
      laneBias: "chat",
      weight: 4.2,
      keywords: ["审查", "评审", "review", "点评", "分析一下", "看一下", "看看"],
      patterns: [/审查|评审|点评|分析一下|看一下|看看/i, /\breview\b/i]
    },
    {
      id: "transform.translate",
      intent: "translate",
      mode: "analysis",
      laneBias: "chat",
      weight: 4.5,
      keywords: ["翻译", "translate", "本地化", "localize"],
      patterns: [/翻译|本地化/i, /\btranslate\b|\blocali[sz]e\b/i]
    },
    {
      id: "transform.rewrite",
      intent: "rewrite",
      mode: "analysis",
      laneBias: "chat",
      weight: 4.5,
      keywords: ["改写", "重写", "润色", "优化表达", "rewrite", "polish", "rewrite this"],
      patterns: [/改写|重写|润色|优化表达/i, /\brewrite\b|\bpolish\b/i]
    },
    {
      id: "plan.design",
      intent: "plan",
      mode: "planning",
      laneBias: "task",
      weight: 4.8,
      keywords: ["方案", "计划", "路线", "步骤", "清单", "架构", "设计", "实施", "推进", "拆解", "评估", "选型", "治理", "闭环"],
      patterns: [/方案|计划|路线|步骤|清单|架构|设计|实施|推进|拆解|评估|选型|治理|闭环/i, /\bplan\b|\broadmap\b|\barchitecture\b|\bdesign\b|\brollout\b|\bevaluation\b/i]
    },
    {
      id: "task.fix",
      intent: "troubleshoot",
      mode: "execution",
      laneBias: "task",
      weight: 6.5,
      keywords: ["修复", "排查", "定位", "报错", "错误", "异常", "崩溃", "白屏", "不生效", "无法", "失败", "根因", "debug", "fix", "bug", "issue", "error", "troubleshoot"],
      patterns: [/修复|排查|定位|报错|错误|异常|崩溃|白屏|不生效|无法|失败|根因/i, /\bdebug\b|\bfix\b|\bbug\b|\bissue\b|\berror\b|\btroubleshoot\b|\broot\s*cause\b/i]
    },
    {
      id: "task.implement",
      intent: "implement",
      mode: "execution",
      laneBias: "task",
      weight: 6.2,
      keywords: ["实现", "开发", "接入", "联调", "落地", "写代码", "出完整代码", "可直接复制粘贴", "implement", "build", "wire", "integrate"],
      patterns: [/实现|开发|接入|联调|落地|写代码|完整代码|可直接复制粘贴/i, /\bimplement\b|\bbuild\b|\bwire\b|\bintegrat(e|ion)\b/i]
    },
    {
      id: "task.generate",
      intent: "generate",
      mode: "execution",
      laneBias: "task",
      weight: 5.8,
      keywords: ["生成", "创建", "新增", "输出", "写一份", "做一份", "generate", "create"],
      patterns: [/生成|创建|新增|输出|写一份|做一份/i, /\bgenerate\b|\bcreate\b/i]
    },
    {
      id: "task.modify",
      intent: "modify",
      mode: "execution",
      laneBias: "task",
      weight: 5.8,
      keywords: ["修改", "改", "调整", "补全", "完善", "扩展", "替换", "新增字段", "接上", "modify", "update", "adjust"],
      patterns: [/修改|调整|补全|完善|扩展|替换|新增字段|接上/i, /\bmodify\b|\bupdate\b|\badjust\b/i]
    },
    {
      id: "task.refactor",
      intent: "refactor",
      mode: "execution",
      laneBias: "task",
      weight: 5.5,
      keywords: ["重构", "收紧", "优化结构", "拆分", "模块化", "refactor", "modularize"],
      patterns: [/重构|收紧|优化结构|拆分|模块化/i, /\brefactor\b|\bmodulari[sz]e\b/i]
    },
    {
      id: "task.install_configure",
      intent: "configure",
      mode: "workflow",
      laneBias: "task",
      weight: 5.5,
      keywords: ["安装", "配置", "设置", "绑定", "注入", "登录", "授权", "install", "configure", "setup", "bind", "oauth", "token"],
      patterns: [/安装|配置|设置|绑定|注入|登录|授权/i, /\binstall\b|\bconfigure\b|\bsetup\b|\bbind\b|\boauth\b|\btoken\b/i]
    },
    {
      id: "task.run_test_verify",
      intent: "verify",
      mode: "workflow",
      laneBias: "task",
      weight: 5.7,
      keywords: ["运行", "执行", "测试", "验证", "编译", "构建", "打包", "run", "execute", "test", "verify", "build", "compile"],
      patterns: [/运行|执行|测试|验证|编译|构建|打包/i, /\brun\b|\bexecute\b|\btest\b|\bverify\b|\bbuild\b|\bcompile\b/i]
    },
    {
      id: "task.deploy_release",
      intent: "deploy",
      mode: "workflow",
      laneBias: "task",
      weight: 6.4,
      keywords: ["部署", "发布", "上线", "回滚", "deploy", "release", "ship", "rollback"],
      patterns: [/部署|发布|上线|回滚/i, /\bdeploy\b|\brelease\b|\bship\b|\brollback\b/i]
    },
    {
      id: "task.migrate",
      intent: "migrate",
      mode: "workflow",
      laneBias: "task",
      weight: 6.0,
      keywords: ["迁移", "升级", "替换架构", "migrate", "upgrade"],
      patterns: [/迁移|升级|替换架构/i, /\bmigrat(e|ion)\b|\bupgrade\b/i]
    },
    {
      id: "media.analyze",
      intent: "media_analysis",
      mode: "analysis",
      laneBias: "chat",
      weight: 4.3,
      keywords: ["看图", "图片", "截图", "照片", "图里", "图中", "视频", "音频", "录音", "字幕", "转写"],
      patterns: [/看图|图片|截图|照片|图里|图中|视频|音频|录音|字幕|转写/i, /\bimage\b|\bscreenshot\b|\bphoto\b|\bvideo\b|\baudio\b|\btranscrib(e|ing)\b|\bsubtitle\b/i]
    },
    {
      id: "media.edit",
      intent: "media_edit",
      mode: "execution",
      laneBias: "task",
      weight: 5.3,
      keywords: ["修图", "改图", "裁剪", "抠图", "换背景", "标注", "去水印", "crop", "retouch", "annotate", "remove background"],
      patterns: [/修图|改图|裁剪|抠图|换背景|标注|去水印/i, /\bcrop\b|\bretouch\b|\bannotat(e|ion)\b|\bremove\s+background\b/i]
    },
    {
      id: "docs.transform",
      intent: "document_transform",
      mode: "execution",
      laneBias: "task",
      weight: 5.0,
      keywords: ["整理成", "提取成表格", "转成", "导出", "生成报告", "做成ppt", "做成表格", "convert", "export"],
      patterns: [/整理成|提取成表格|转成|导出|生成报告|做成ppt|做成表格/i, /\bconvert\b|\bexport\b|\bturn\s+into\b/i]
    }
  ],

  artifacts: [
    {
      id: "artifact.code",
      weight: 2.5,
      keywords: ["代码", "脚本", "源码", "repo", "仓库", "代码库", "api", "接口", "函数", "类", "组件"],
      patterns: [
        /代码|脚本|源码|仓库|代码库|接口|函数|类|组件/i,
        /```[\s\S]*?```/,
        /\bfunction\b|\bclass\b|\bimport\b|\bexport\b|\bapi\b|\brepo\b/i
      ],
      attachmentKinds: ["code", "archive", "text"]
    },
    {
      id: "artifact.document",
      weight: 2.4,
      keywords: ["文档", "合同", "简历", "报告", "论文", "pdf", "word", "docx"],
      patterns: [/文档|合同|简历|报告|论文/i, /\bpdf\b|\bdocx?\b|\bword\b/i],
      attachmentKinds: ["document", "text"]
    },
    {
      id: "artifact.spreadsheet",
      weight: 2.4,
      keywords: ["表格", "excel", "csv", "sheet", "xlsx", "数据表"],
      patterns: [/表格|数据表/i, /\bexcel\b|\bcsv\b|\bsheet\b|\bxlsx?\b/i],
      attachmentKinds: ["spreadsheet", "data"]
    },
    {
      id: "artifact.slide",
      weight: 2.2,
      keywords: ["ppt", "幻灯片", "slides", "deck", "presentation"],
      patterns: [/幻灯片/i, /\bpptx?\b|\bslides?\b|\bdeck\b|\bpresentation\b/i],
      attachmentKinds: ["slide"]
    },
    {
      id: "artifact.image",
      weight: 2.4,
      keywords: ["图片", "截图", "照片", "image", "photo", "picture", "screenshot"],
      patterns: [/图片|截图|照片/i, /\bimage\b|\bphoto\b|\bpicture\b|\bscreenshot\b/i],
      attachmentKinds: ["image"]
    },
    {
      id: "artifact.video",
      weight: 2.3,
      keywords: ["视频", "video", "clip"],
      patterns: [/视频/i, /\bvideo\b|\bclip\b/i],
      attachmentKinds: ["video"]
    },
    {
      id: "artifact.audio",
      weight: 2.3,
      keywords: ["音频", "录音", "audio", "voice"],
      patterns: [/音频|录音/i, /\baudio\b|\bvoice\b/i],
      attachmentKinds: ["audio"]
    },
    {
      id: "artifact.url",
      weight: 1.8,
      keywords: ["链接", "url", "网站", "网页"],
      patterns: [/链接|网站|网页/i, /https?:\/\/[^\s]+/i],
      attachmentKinds: []
    },
    {
      id: "artifact.data",
      weight: 2.1,
      keywords: ["数据", "dataset", "schema", "日志", "log", "json"],
      patterns: [/数据|日志/i, /\bdataset\b|\bschema\b|\blog\b|\bjson\b/i],
      attachmentKinds: ["data"]
    }
  ],

  risks: [
    {
      id: "risk.destructive",
      weight: 3.5,
      keywords: ["删除", "清空", "覆盖", "重置", "销毁", "drop table", "truncate", "rm -rf", "revoke", "purge"],
      patterns: [/删除|清空|覆盖|重置|销毁/i, /\bdrop\s+table\b|\btruncate\b|\brm\s+-rf\b|\brevoke\b|\bpurge\b/i]
    },
    {
      id: "risk.production",
      weight: 3.2,
      keywords: ["生产", "线上", "prod", "production", "正式环境", "真实用户"],
      patterns: [/生产|线上|正式环境|真实用户/i, /\bprod(uction)?\b/i]
    },
    {
      id: "risk.secret",
      weight: 2.8,
      keywords: ["密钥", "token", "secret", "private key", "密码", "凭证"],
      patterns: [/密钥|密码|凭证/i, /\btoken\b|\bsecret\b|\bprivate\s+key\b/i]
    }
  ],

  policies: {
    laneBias: {
      social: "chat",
      qa: "chat",
      analysis: "chat",
      planning: "task",
      execution: "task",
      workflow: "task"
    }
  }
};

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function mergeRegistry(defaultRegistry, overrides) {
  if (!isPlainObject(overrides)) return defaultRegistry;

  const merged = { ...defaultRegistry };

  for (const key of Object.keys(defaultRegistry)) {
    const baseValue = defaultRegistry[key];
    const overrideValue = overrides[key];

    if (Array.isArray(baseValue)) {
      if (Array.isArray(overrideValue)) {
        merged[key] = [...baseValue, ...overrideValue];
      } else {
        merged[key] = [...baseValue];
      }
      continue;
    }

    if (isPlainObject(baseValue)) {
      merged[key] = {
        ...baseValue,
        ...(isPlainObject(overrideValue) ? overrideValue : {})
      };
      continue;
    }

    merged[key] = overrideValue ?? baseValue;
  }

  return merged;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeForMatch(value) {
  return normalizePrompt(value).toLowerCase();
}

function getInputAttachments(input = {}) {
  if (Array.isArray(input.attachments)) return input.attachments;
  if (Array.isArray(input.files)) return input.files;
  if (Array.isArray(input.images)) return input.images;
  if (Array.isArray(input.assets)) return input.assets;
  return [];
}

function getInputMessages(input = {}) {
  if (Array.isArray(input.messages)) return input.messages;
  if (Array.isArray(input.history)) return input.history;
  if (Array.isArray(input.turns)) return input.turns;
  return [];
}

function getExtension(filename) {
  const name = normalizePrompt(filename).toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function detectAttachmentKind(name, mime = "") {
  const ext = getExtension(name);
  const type = String(mime || "").toLowerCase();

  if (type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "image";
  if (type.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "video";
  if (type.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext)) return "audio";

  if (type.includes("spreadsheet") || type.includes("excel") || SPREADSHEET_EXTENSIONS.has(ext)) {
    return "spreadsheet";
  }

  if (type.includes("presentation") || type.includes("powerpoint") || SLIDE_EXTENSIONS.has(ext)) {
    return "slide";
  }

  if (type.includes("pdf") || type.includes("word") || DOCUMENT_EXTENSIONS.has(ext)) {
    return "document";
  }

  if (type.includes("zip") || type.includes("archive") || type.includes("compressed") || ARCHIVE_EXTENSIONS.has(ext)) {
    return "archive";
  }

  if (DATA_EXTENSIONS.has(ext)) return "data";

  if (TEXT_EXTENSIONS.has(ext) || type === "text/plain" || type === "text/markdown") {
    return "text";
  }

  if (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("javascript") ||
    type.includes("typescript") ||
    type.includes("shell") ||
    CODE_EXTENSIONS.has(ext)
  ) {
    return CODE_EXTENSIONS.has(ext) ? "code" : "text";
  }

  return "unknown";
}

function normalizeAttachment(item = {}) {
  const name = normalizePrompt(item.name || item.filename || item.fileName || item.title || "");
  const mime = normalizePrompt(item.type || item.mime || item.mimeType || item.contentType || "").toLowerCase();
  return {
    ...item,
    name,
    mime,
    kind: detectAttachmentKind(name, mime)
  };
}

function summarizeAttachmentKinds(attachments) {
  const summary = {
    image: 0,
    video: 0,
    audio: 0,
    document: 0,
    spreadsheet: 0,
    slide: 0,
    code: 0,
    archive: 0,
    data: 0,
    text: 0,
    unknown: 0
  };

  for (const item of attachments) {
    summary[item.kind] = (summary[item.kind] || 0) + 1;
  }

  return summary;
}

function buildContextText(input = {}) {
  const parts = [];

  if (input.contextSummary) parts.push(normalizePrompt(input.contextSummary));
  if (input.previousPrompt) parts.push(normalizePrompt(input.previousPrompt));
  if (input.previousAssistantReply) parts.push(normalizePrompt(input.previousAssistantReply));
  if (input.workspaceLabel) parts.push(normalizePrompt(input.workspaceLabel));

  const messages = getInputMessages(input).slice(-8);
  for (const msg of messages) {
    if (typeof msg === "string") {
      parts.push(normalizePrompt(msg));
      continue;
    }
    if (msg && typeof msg === "object") {
      parts.push(normalizePrompt(msg.content || msg.text || msg.message || ""));
    }
  }

  return normalizePrompt(parts.filter(Boolean).join(" "));
}

function isAsciiWordLike(keyword) {
  return /^[a-z0-9._:+#\-/ ]+$/i.test(keyword);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatch(text, keyword) {
  if (!text || !keyword) return false;
  const k = normalizeForMatch(keyword);
  if (!k) return false;

  if (isAsciiWordLike(k)) {
    const pattern = new RegExp(`(^|[^a-z0-9_])${escapeRegExp(k)}([^a-z0-9_]|$)`, "i");
    return pattern.test(text);
  }

  return text.includes(k);
}

function patternsMatch(text, patterns) {
  if (!text || !Array.isArray(patterns) || !patterns.length) return false;
  return patterns.some((pattern) => pattern instanceof RegExp && pattern.test(text));
}

function keywordsMatch(text, keywords) {
  if (!text || !Array.isArray(keywords) || !keywords.length) return false;
  return keywords.some((keyword) => keywordMatch(text, keyword));
}

function anyMatch(text, entry = {}) {
  return keywordsMatch(text, entry.keywords) || patternsMatch(text, entry.patterns);
}

function attachmentKindMatch(entry, attachmentSummary) {
  if (!entry || !Array.isArray(entry.attachmentKinds) || !entry.attachmentKinds.length) return false;
  return entry.attachmentKinds.some((kind) => (attachmentSummary[kind] || 0) > 0);
}

function scoreRegistry(text, registry, options = {}) {
  const {
    attachmentSummary = null,
    maxScorePerEntry = null
  } = options;

  const matched = [];
  let score = 0;

  for (const entry of registry) {
    const byText = anyMatch(text, entry);
    const byAttachment = attachmentSummary ? attachmentKindMatch(entry, attachmentSummary) : false;

    if (!byText && !byAttachment) continue;

    const entryScore = typeof entry.weight === "number" ? entry.weight : 1;
    score += maxScorePerEntry ? Math.min(entryScore, maxScorePerEntry) : entryScore;
    matched.push({
      id: entry.id,
      score: entryScore,
      via: byText && byAttachment ? ["text", "attachment"] : byText ? ["text"] : ["attachment"],
      intent: entry.intent || null,
      mode: entry.mode || null,
      laneBias: entry.laneBias || null
    });
  }

  return { matched, score };
}

function hasCodeLikeContext(prompt) {
  return CODE_CONTEXT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function isSocialOnly(prompt) {
  if (!prompt) return false;
  return SOCIAL_ONLY_PATTERNS.some((pattern) => pattern.test(prompt));
}

function previewText(value, maxLength = 120) {
  const text = normalizePrompt(value);
  if (!text) return "";
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function getAttachmentTypeLabels(summary) {
  const labels = [];
  if (summary.image) labels.push("图片");
  if (summary.video) labels.push("视频");
  if (summary.audio) labels.push("音频");
  if (summary.document) labels.push("文档");
  if (summary.spreadsheet) labels.push("表格");
  if (summary.slide) labels.push("演示文稿");
  if (summary.code) labels.push("代码");
  if (summary.archive) labels.push("压缩包");
  if (summary.data) labels.push("数据文件");
  if (summary.text) labels.push("文本");
  if (summary.unknown) labels.push("其它文件");
  return labels;
}

function buildAttachmentHint(attachments, summary) {
  if (!attachments.length) return "";

  const named = attachments.map((item) => normalizePrompt(item.name)).filter(Boolean);
  const visibleNames = named.slice(0, 3);
  const moreCount = Math.max(0, attachments.length - visibleNames.length);
  const namePart = visibleNames.length
    ? `${visibleNames.join("、")}${moreCount > 0 ? ` 等 ${attachments.length} 个附件` : ""}`
    : "未命名附件";

  const typeLabels = getAttachmentTypeLabels(summary);
  const typePart = typeLabels.length ? `；类型：${typeLabels.join("、")}` : "";

  return ` 我已接收 ${attachments.length} 个附件（${namePart}${typePart}）。`;
}

function summarizeMatchedIds(items = []) {
  return unique(items.map((item) => item.id));
}

function buildModeScores(actionMatches, policies) {
  const scores = {
    social: 0,
    qa: 0,
    analysis: 0,
    planning: 0,
    execution: 0,
    workflow: 0
  };

  for (const match of actionMatches) {
    if (match.mode && scores[match.mode] != null) {
      scores[match.mode] += match.score;
      continue;
    }
    const laneBias = match.laneBias || (match.mode ? policies.laneBias[match.mode] : null);
    if (laneBias === "task") {
      scores.execution += match.score;
    } else {
      scores.analysis += match.score;
    }
  }

  return scores;
}

function pickTopKey(scoreMap, fallback) {
  const entries = Object.entries(scoreMap || {});
  if (!entries.length) return fallback;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] <= 0) return fallback;
  return entries[0][0];
}

function deriveIntentFromMatches(actionMatches, prompt, attachmentSummary, hasAttachments, previousClassification) {
  const intentScores = {};

  for (const match of actionMatches) {
    if (!match.intent) continue;
    intentScores[match.intent] = (intentScores[match.intent] || 0) + match.score;
  }

  if (!prompt && hasAttachments) {
    if (attachmentSummary.code > 0 || attachmentSummary.archive > 0) {
      intentScores.project_attachment = (intentScores.project_attachment || 0) + 6;
    } else if (attachmentSummary.document > 0 || attachmentSummary.spreadsheet > 0 || attachmentSummary.slide > 0) {
      intentScores.document_analysis = (intentScores.document_analysis || 0) + 5;
    } else if (attachmentSummary.image > 0 || attachmentSummary.video > 0 || attachmentSummary.audio > 0) {
      intentScores.media_analysis = (intentScores.media_analysis || 0) + 5;
    }
  }

  if ((attachmentSummary.image > 0 || attachmentSummary.video > 0 || attachmentSummary.audio > 0) && !intentScores.media_analysis && !intentScores.media_edit) {
    intentScores.media_analysis = (intentScores.media_analysis || 0) + 1.5;
  }

  if ((attachmentSummary.document > 0 || attachmentSummary.spreadsheet > 0 || attachmentSummary.slide > 0) && !intentScores.document_transform) {
    intentScores.document_analysis = (intentScores.document_analysis || 0) + 1.5;
  }

  if (!Object.keys(intentScores).length && previousClassification?.intent) {
    intentScores[previousClassification.intent] = 1;
  }

  return pickTopKey(intentScores, "generic_chat");
}

function deriveExecutionMode({ lane, mode, intent, riskScore, hasAttachments, prompt, actionIds }) {
  if (lane === "chat" && (mode === "social" || intent === "greeting" || intent === "thanks" || intent === "farewell")) {
    return "answer_only";
  }

  if (riskScore >= 5) return "stepwise";

  if (
    actionIds.some((id) =>
      [
        "task.deploy_release",
        "task.install_configure",
        "task.run_test_verify",
        "task.migrate"
      ].includes(id)
    )
  ) {
    return "stepwise";
  }

  if (
    actionIds.some((id) =>
      [
        "task.implement",
        "task.generate",
        "task.modify",
        "task.refactor",
        "docs.transform",
        "media.edit"
      ].includes(id)
    )
  ) {
    return "direct_action";
  }

  if (hasAttachments && prompt) return "draft";
  return "answer_only";
}

function buildArtifactIds(artifactMatches, attachmentSummary) {
  const ids = new Set(summarizeMatchedIds(artifactMatches));

  if (attachmentSummary.code) ids.add("artifact.code");
  if (attachmentSummary.archive) ids.add("artifact.code");
  if (attachmentSummary.document) ids.add("artifact.document");
  if (attachmentSummary.spreadsheet) ids.add("artifact.spreadsheet");
  if (attachmentSummary.slide) ids.add("artifact.slide");
  if (attachmentSummary.image) ids.add("artifact.image");
  if (attachmentSummary.video) ids.add("artifact.video");
  if (attachmentSummary.audio) ids.add("artifact.audio");
  if (attachmentSummary.data) ids.add("artifact.data");
  if (attachmentSummary.text) ids.add("artifact.document");

  return [...ids];
}

function classifyRiskLevel(riskScore) {
  if (riskScore >= 6) return "approval_required";
  if (riskScore >= 3) return "guarded";
  return "low";
}

function requiresTools({ artifactIds, lane, actionIds, hasAttachments }) {
  if (hasAttachments) return true;
  if (artifactIds.some((id) => ["artifact.code", "artifact.document", "artifact.spreadsheet", "artifact.slide", "artifact.image", "artifact.video", "artifact.audio", "artifact.data", "artifact.url"].includes(id))) {
    return true;
  }
  if (lane === "task") return true;
  if (actionIds.some((id) => ["task.run_test_verify", "task.deploy_release", "task.install_configure", "task.migrate"].includes(id))) {
    return true;
  }
  return false;
}

function deriveBoundaryPolicy({ prompt, actionIds = [], artifactIds = [], riskScore = 0 }) {
  const text = normalizePrompt(prompt);
  const wantsDirectCopy = DIRECT_COPY_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
  const wantsProtection = CODE_PROTECTION_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
  const codeCentric =
    artifactIds.includes("artifact.code") ||
    actionIds.some((id) => ["task.implement", "task.generate", "task.modify", "task.refactor"].includes(id));

  const protectedRuntime = codeCentric && (wantsProtection || wantsDirectCopy);
  const baselineBoundaries = ["path_jail", "tool_allowlist", "scoped_tokens"];
  const protectedBoundaries = ["signed_bundle_only", "runtime_attestation", "integrity_check", ...baselineBoundaries];

  return {
    profile: protectedRuntime ? "protected_runtime" : "standard",
    delivery: protectedRuntime ? "signed_runtime_bundle" : "source_or_patch",
    copyPolicy: protectedRuntime ? "deny_plain_source_distribution" : "allow_plain_source_distribution",
    kernel: protectedRuntime ? "isolated_worker_kernel" : "default_worker_kernel",
    boundaries: protectedRuntime ? protectedBoundaries : baselineBoundaries,
    riskHint: riskScore >= 6 ? "approval_required" : riskScore >= 3 ? "guarded" : "low"
  };
}

function buildLaneScores({ modeScores, actionMatches, artifactIds, attachmentSummary, prompt, previousClassification }) {
  const scores = { chat: 0, task: 0 };
  const reasons = [];

  scores.chat += modeScores.social + modeScores.qa + modeScores.analysis;
  scores.task += modeScores.execution + modeScores.workflow;

  if (modeScores.planning > 0) {
    if (REQUEST_PREFIX_HINTS.some((pattern) => pattern.test(prompt)) || modeScores.execution + modeScores.workflow > 0) {
      scores.task += modeScores.planning;
      reasons.push("planning_request_bias_task");
    } else {
      scores.chat += modeScores.planning * 0.8;
      reasons.push("planning_question_bias_chat");
    }
  }

  if (artifactIds.includes("artifact.code")) {
    scores.task += 2.6;
    reasons.push("artifact_code_bias_task");
  }

  if (artifactIds.includes("artifact.document") || artifactIds.includes("artifact.spreadsheet") || artifactIds.includes("artifact.slide")) {
    scores.chat += 1.6;
    reasons.push("document_like_artifact_bias_chat");
  }

  if (artifactIds.includes("artifact.image") || artifactIds.includes("artifact.video") || artifactIds.includes("artifact.audio")) {
    const mediaEdit = actionMatches.some((x) => x.id === "media.edit");
    scores[mediaEdit ? "task" : "chat"] += 1.8;
    reasons.push(mediaEdit ? "media_edit_bias_task" : "media_analysis_bias_chat");
  }

  if (!prompt && (attachmentSummary.code > 0 || attachmentSummary.archive > 0)) {
    scores.task += 6;
    reasons.push("attachment_only_project_input");
  } else if (!prompt && (attachmentSummary.document > 0 || attachmentSummary.spreadsheet > 0 || attachmentSummary.slide > 0 || attachmentSummary.image > 0 || attachmentSummary.video > 0 || attachmentSummary.audio > 0)) {
    scores.chat += 5;
    reasons.push("attachment_only_analysis_input");
  }

  if (hasCodeLikeContext(prompt)) {
    scores.task += 3;
    reasons.push("code_context_bias_task");
  }

  if (prompt.length >= 120) {
    if (REQUEST_PREFIX_HINTS.some((pattern) => pattern.test(prompt))) {
      scores.task += 1.6;
      reasons.push("long_request_bias_task");
    } else {
      scores.chat += 0.8;
      reasons.push("long_context_bias_chat");
    }
  }

  if (previousClassification?.lane === "task" && /继续|接着|按上面|还是不行|继续推进|继续修/i.test(prompt)) {
    scores.task += 3;
    reasons.push("continuation_from_previous_task");
  }

  if (previousClassification?.lane === "chat" && /继续解释|继续总结|再讲一下|再分析/i.test(prompt)) {
    scores.chat += 2.5;
    reasons.push("continuation_from_previous_chat");
  }

  return { scores, reasons };
}

function deriveDomainIds(domainMatches, attachmentSummary, prompt) {
  const ids = new Set(summarizeMatchedIds(domainMatches));

  if ((attachmentSummary.code > 0 || attachmentSummary.archive > 0) && !ids.size) {
    ids.add("backend.node");
  }

  if (!ids.size && /flutter|dart/i.test(prompt)) ids.add("mobile.flutter");
  if (!ids.size && /kotlin|android|gradle|jetpack compose/i.test(prompt)) ids.add("mobile.android.kotlin");
  if (!ids.size && /swift|xcode|swiftui|uikit/i.test(prompt)) ids.add("mobile.ios.swift");

  return [...ids];
}

function getPreviousClassification(input = {}) {
  if (isPlainObject(input.previousClassification)) return input.previousClassification;
  if (typeof input.previousIntent === "string" || typeof input.previousLane === "string") {
    return {
      lane: normalizePrompt(input.previousLane).toLowerCase() || null,
      intent: normalizePrompt(input.previousIntent).toLowerCase() || null
    };
  }
  return null;
}

export function classifyLaneDetailed(input = {}) {
  const registry = mergeRegistry(PLATFORM_REGISTRY, input.registryOverrides);
  const prompt = normalizePrompt(input.prompt);
  const promptText = normalizeForMatch(prompt);
  const attachments = getInputAttachments(input).map(normalizeAttachment);
  const attachmentSummary = summarizeAttachmentKinds(attachments);
  const contextText = buildContextText(input);
  const combinedText = normalizeForMatch(
    [
      prompt,
      contextText,
      attachments.map((a) => a.name).filter(Boolean).join(" ")
    ].join(" ")
  );
  const previousClassification = getPreviousClassification(input);
  const forceLane = normalizePrompt(input.forceLane).toLowerCase();

  if (forceLane === "chat" || forceLane === "task") {
    const forcedIntent = previousClassification?.intent || (forceLane === "task" ? "implement" : "generic_chat");
    const boundaryPolicy = deriveBoundaryPolicy({
      prompt,
      actionIds: [],
      artifactIds: buildArtifactIds([], attachmentSummary),
      riskScore: 0
    });
    return {
      lane: forceLane,
      mode: forceLane === "task" ? "execution" : "qa",
      intent: forcedIntent,
      confidence: 1,
      executionMode: forceLane === "task" ? "direct_action" : "answer_only",
      riskLevel: "low",
      requiresTools: attachments.length > 0 || forceLane === "task",
      requiresApproval: false,
      domains: [],
      artifacts: buildArtifactIds([], attachmentSummary),
      scores: { chat: forceLane === "chat" ? 1 : 0, task: forceLane === "task" ? 1 : 0 },
      reasons: ["force_lane_override"],
      matches: {
        domains: [],
        actions: [],
        artifacts: [],
        risks: []
      },
      boundaryPolicy,
      prompt,
      contextText,
      attachments,
      attachmentSummary
    };
  }

  if (isSocialOnly(prompt) && attachments.length === 0) {
    const socialAction = scoreRegistry(promptText, registry.actions).matched.find((m) => m.mode === "social");
    const intent = socialAction?.intent || "greeting";
    const boundaryPolicy = deriveBoundaryPolicy({
      prompt,
      actionIds: socialAction?.id ? [socialAction.id] : [],
      artifactIds: [],
      riskScore: 0
    });
    return {
      lane: "chat",
      mode: "social",
      intent,
      confidence: 0.99,
      executionMode: "answer_only",
      riskLevel: "low",
      requiresTools: false,
      requiresApproval: false,
      domains: [],
      artifacts: [],
      scores: { chat: 10, task: 0 },
      reasons: ["social_only_message"],
      matches: {
        domains: [],
        actions: socialAction ? [socialAction] : [],
        artifacts: [],
        risks: []
      },
      boundaryPolicy,
      prompt,
      contextText,
      attachments,
      attachmentSummary
    };
  }

  const domainResult = scoreRegistry(combinedText, registry.domains, { attachmentSummary });
  const actionResult = scoreRegistry(combinedText, registry.actions, { attachmentSummary });
  const artifactResult = scoreRegistry(combinedText, registry.artifacts, { attachmentSummary });
  const riskResult = scoreRegistry(combinedText, registry.risks, { attachmentSummary });

  if (REQUEST_PREFIX_HINTS.some((pattern) => pattern.test(prompt))) {
    actionResult.matched.push({
      id: "signal.request_prefix",
      score: 1.6,
      via: ["text"],
      intent: null,
      mode: "execution",
      laneBias: "task"
    });
    actionResult.score += 1.6;
  }

  if (hasCodeLikeContext(prompt)) {
    artifactResult.matched.push({
      id: "signal.code_context",
      score: 2.4,
      via: ["text"],
      intent: null,
      mode: null,
      laneBias: "task"
    });
    artifactResult.score += 2.4;
  }

  const artifactIds = buildArtifactIds(artifactResult.matched, attachmentSummary);
  const domainIds = deriveDomainIds(domainResult.matched, attachmentSummary, prompt);
  const actionIds = summarizeMatchedIds(actionResult.matched);
  const modeScores = buildModeScores(actionResult.matched, registry.policies);
  const hasAttachments = attachments.length > 0;
  const intent = deriveIntentFromMatches(
    actionResult.matched,
    prompt,
    attachmentSummary,
    hasAttachments,
    previousClassification
  );

  const laneScoreResult = buildLaneScores({
    modeScores,
    actionMatches: actionResult.matched,
    artifactIds,
    attachmentSummary,
    prompt,
    previousClassification
  });

  const chatScore = Number((laneScoreResult.scores.chat + artifactResult.score * 0.15).toFixed(3));
  const taskScore = Number((laneScoreResult.scores.task + domainResult.score * 0.1 + riskResult.score * 0.2).toFixed(3));

  let lane = "chat";
  if (taskScore > chatScore) lane = "task";
  else if (taskScore === chatScore) {
    if (
      actionIds.some((id) =>
        [
          "task.fix",
          "task.implement",
          "task.generate",
          "task.modify",
          "task.refactor",
          "task.install_configure",
          "task.run_test_verify",
          "task.deploy_release",
          "task.migrate",
          "media.edit",
          "docs.transform",
          "signal.request_prefix"
        ].includes(id)
      ) ||
      artifactIds.includes("artifact.code") ||
      hasCodeLikeContext(prompt)
    ) {
      lane = "task";
      laneScoreResult.reasons.push("tie_breaker_task");
    } else {
      lane = "chat";
      laneScoreResult.reasons.push("tie_breaker_chat");
    }
  }

  const mode = (() => {
    if (lane === "chat" && modeScores.social > 0 && modeScores.social >= Math.max(modeScores.qa, modeScores.analysis)) {
      return "social";
    }
    const winner = pickTopKey(modeScores, lane === "task" ? "execution" : "analysis");
    return lane === "task" && winner === "qa" ? "execution" : winner;
  })();

  const riskLevel = classifyRiskLevel(riskResult.score);
  const executionMode = deriveExecutionMode({
    lane,
    mode,
    intent,
    riskScore: riskResult.score,
    hasAttachments,
    prompt,
    actionIds
  });

  const totalScore = Math.max(1, chatScore + taskScore);
  const confidence = Number((Math.abs(taskScore - chatScore) / totalScore).toFixed(3));

  const requiresApproval =
    riskLevel === "approval_required" ||
    (actionIds.includes("task.deploy_release") && riskResult.score >= 3);

  const boundaryPolicy = deriveBoundaryPolicy({
    prompt,
    actionIds,
    artifactIds,
    riskScore: riskResult.score
  });

  const result = {
    lane,
    mode,
    intent,
    confidence,
    executionMode,
    riskLevel,
    requiresTools: requiresTools({ artifactIds, lane, actionIds, hasAttachments }),
    requiresApproval,
    domains: domainIds,
    artifacts: artifactIds,
    scores: {
      chat: chatScore,
      task: taskScore,
      domain: Number(domainResult.score.toFixed(3)),
      action: Number(actionResult.score.toFixed(3)),
      artifact: Number(artifactResult.score.toFixed(3)),
      risk: Number(riskResult.score.toFixed(3))
    },
    reasons: unique([
      ...laneScoreResult.reasons,
      ...(domainIds.length ? [`domains:${domainIds.join(",")}`] : []),
      ...(artifactIds.length ? [`artifacts:${artifactIds.join(",")}`] : []),
      ...(actionIds.length ? [`actions:${actionIds.join(",")}`] : []),
      ...(riskResult.matched.length ? [`risks:${summarizeMatchedIds(riskResult.matched).join(",")}`] : [])
    ]),
    matches: {
      domains: domainResult.matched,
      actions: actionResult.matched,
      artifacts: artifactResult.matched,
      risks: riskResult.matched
    },
    boundaryPolicy,
    prompt,
    contextText,
    attachments,
    attachmentSummary
  };

  return result;
}

export function classifyLane(input = {}) {
  return classifyLaneDetailed(input).lane;
}

function buildReplyByIntent(detail, workspaceLabel) {
  const {
    intent,
    lane,
    mode,
    prompt,
    attachments,
    attachmentSummary,
    executionMode,
    requiresApproval
  } = detail;

  const attachmentHint = buildAttachmentHint(attachments, attachmentSummary);
  const promptPreview = previewText(prompt, 100);

  if (!prompt) {
    if (attachments.length > 0) {
      if (attachmentSummary.code > 0 || attachmentSummary.archive > 0) {
        return `收到。${attachmentHint}这更像一组工程输入。我会按项目/代码任务链路理解；你可以直接告诉我是要修复、跑通、解释结构，还是输出完整可用结果。`;
      }
      return `收到。${attachmentHint}你可以直接告诉我是要总结、识别、抽取、改写、对比，还是转成可执行产物，我会按最短路径继续。`;
    }
    return `已准备好继续。你可以直接描述目标，我会按最短路径帮你完成。`;
  }

  if (intent === "greeting") {
    return `你好，我在。${attachmentHint}现在可以直接说你的目标，我会先给出可执行的最小下一步。`;
  }

  if (intent === "thanks") {
    return `不客气。${attachmentHint}你下一步直接给目标或材料，我会接着处理。`;
  }

  if (intent === "farewell") {
    return `好的，先到这里。${attachmentHint}你下次继续时直接接着说目标，我会从当前上下文继续。`;
  }

  if (intent === "summarize") {
    return `收到。${attachmentHint}我会先提炼结构化摘要与关键结论，再补充必要的下一步建议。`;
  }

  if (intent === "extract") {
    return `收到。${attachmentHint}我会先抽取关键信息、字段或结构，再按你这轮目标整理成可直接使用的结果。`;
  }

  if (intent === "translate") {
    return `收到。${attachmentHint}我会先保留原意，再按目标语言和使用场景完成翻译或本地化处理。`;
  }

  if (intent === "rewrite") {
    return `收到。${attachmentHint}我会先保留核心信息，再按你需要的语气、结构或用途完成改写。`;
  }

  if (intent === "media_analysis") {
    return `收到。${attachmentHint}我会先基于这轮文本与媒体内容做结构化理解，再给出重点结论和可执行建议。`;
  }

  if (intent === "media_edit") {
    return `收到。${attachmentHint}这是一个媒体编辑类任务。我会先明确目标效果，再按最短路径给出可直接执行的修改方案。`;
  }

  if (intent === "document_analysis") {
    return `收到。${attachmentHint}我会先提炼文档关键信息、结构与结论，再补充下一步可执行建议。`;
  }

  if (intent === "document_transform") {
    return `收到。${attachmentHint}我会先理解原始材料，再把它整理成你目标所需的可交付结果。`;
  }

  if (intent === "review") {
    return `已收到你的请求：“${promptPreview}”。${attachmentHint}我会先给出判断结论，再指出关键问题、边界和优化方向。`;
  }

  if (intent === "qa" && lane === "chat") {
    return `已收到你的问题：“${promptPreview}”。${attachmentHint}我会先给出清晰结论，再补充必要的依据与建议。`;
  }

  if (intent === "plan") {
    return `已收到你的请求：“${promptPreview}”。${attachmentHint}我会先收紧边界与约束，再给出能直接落地的实施路径。`;
  }

  if (intent === "troubleshoot") {
    const approvalSuffix = requiresApproval ? ` 由于这类操作可能涉及高风险变更，我会按保守顺序推进并优先给出确认点。` : "";
    return `已收到你的请求：“${promptPreview}”。${attachmentHint}我会按“复现 → 定位 → 修复 → 验证”的链路，在 ${workspaceLabel} 的当前上下文里直接推进。${approvalSuffix}`;
  }

  if (lane === "task") {
    const modeText =
      executionMode === "stepwise"
        ? "我会优先按分步闭环推进"
        : executionMode === "direct_action"
          ? "我会优先收敛到最小可落地下一步"
          : "我会先给出直接可执行的处理结果";
    return `已收到你的请求：“${promptPreview}”。${attachmentHint}我会基于 ${workspaceLabel} 的当前上下文继续处理，${modeText}。`;
  }

  if (mode === "analysis") {
    return `已收到你的请求：“${promptPreview}”。${attachmentHint}我会先完成结构化分析，再补充关键判断与建议。`;
  }

  return `已收到你的请求：“${promptPreview}”。${attachmentHint}我会基于 ${workspaceLabel} 的当前上下文给出直接可执行的回复。`;
}

export function buildAssistantReplyFromDetail(detail, input = {}) {
  const workspaceLabel = normalizePrompt(input.workspaceLabel || "当前工作区");
  return buildReplyByIntent(detail, workspaceLabel);
}

export function buildAssistantReply(input = {}) {
  const workspaceLabel = normalizePrompt(input.workspaceLabel || "当前工作区");
  const detail =
    isPlainObject(input.classificationDetail) && typeof input.classificationDetail.lane === "string"
      ? input.classificationDetail
      : classifyLaneDetailed(input);
  return buildReplyByIntent(detail, workspaceLabel);
}
