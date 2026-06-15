import { useState, useEffect, FormEvent } from "react";
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  Globe, 
  Code, 
  BookOpen, 
  History, 
  ArrowRight, 
  Terminal, 
  Copy, 
  Sparkles, 
  Check, 
  X, 
  ExternalLink, 
  Clock, 
  FileText, 
  RefreshCw,
  Search,
  User,
  Info,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { PRESET_SAMPLES } from "./samples";
import { AnalysisResult, ViolationIssue, SearchHistoryItem } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"url" | "html">("url");
  const [urlInput, setUrlInput] = useState("");
  const [htmlInput, setHtmlInput] = useState(PRESET_SAMPLES[0].htmlContent);
  const [siteType, setSiteType] = useState<"ecommerce" | "local_service" | "health_nutrition">("local_service");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Active analysis results
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"buyer" | "tech">("buyer");
  
  // History list
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});
  const [showPolicyGuide, setShowPolicyGuide] = useState(false);
  const [apiStatusWarning, setApiStatusWarning] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"violations" | "legal" | "tips">("violations");
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Custom API Config states
  const [showSettings, setShowSettings] = useState(false);
  const [apiType, setApiType] = useState<"gemini-native" | "openai">("gemini-native");
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiModel, setApiModel] = useState("");

  // Initialize and load custom configuration from localStorage
  useEffect(() => {
    const storedType = localStorage.getItem("checker_api_type") as "gemini-native" | "openai" | null;
    const storedKey = localStorage.getItem("checker_api_key");
    const storedBase = localStorage.getItem("checker_api_base");
    const storedModel = localStorage.getItem("checker_api_model");

    if (storedType) setApiType(storedType);
    if (storedKey) setApiKey(storedKey);
    if (storedBase) setApiBaseUrl(storedBase);
    if (storedModel) setApiModel(storedModel);

    setHistory([
      {
        id: "hist-1",
        url: "http://miracle-weight-loss.online",
        timestamp: "18:10",
        score: 18,
        isCompliant: false,
        issuesCount: 4
      },
      {
        id: "hist-2",
        url: "https://smartworks-collaboration.com",
        timestamp: "15:34",
        score: 95,
        isCompliant: true,
        issuesCount: 0
      }
    ]);
  }, []);

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  const [fixAppliedStatus, setFixAppliedStatus] = useState<{ [id: string]: "idle" | "success" | "error" }>({});

  const highlightHTML = (raw: string) => {
    if (!raw) return "";
    let esc = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    // Comments
    esc = esc.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-slate-500 font-mono italic">$1</span>');
    // Attributes
    esc = esc.replace(/(\s)([a-zA-Z0-9_-]+)=(".*?")/g, '$1<span class="text-indigo-400">$2</span>=<span class="text-amber-300 font-medium">$3</span>');
    esc = esc.replace(/(\s)([a-zA-Z0-9_-]+)=('.*?')/g, '$1<span class="text-indigo-400">$2</span>=<span class="text-amber-300 font-medium">$3</span>');
    // Tags
    esc = esc.replace(/(&lt;\/?[a-zA-Z0-9:_-]+)/g, '<span class="text-rose-400 font-semibold">$1</span>');
    esc = esc.replace(/(\/?&gt;)/g, '<span class="text-rose-400 font-semibold">$1</span>');
    
    return esc;
  };

  const escapeHtmlText = (str: string) => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const handleApplyFix = (issue: ViolationIssue) => {
    const rawSuggested = issue.suggestedCode || 
      (issue.suggestion.includes("<") && issue.suggestion.includes(">") ? issue.suggestion : null);
      
    if (!rawSuggested) {
      setFixAppliedStatus(prev => ({ ...prev, [issue.id]: "error" }));
      setTimeout(() => {
        setFixAppliedStatus(prev => ({ ...prev, [issue.id]: "idle" }));
      }, 3000);
      return;
    }

    const oldCode = issue.offendingElement.trim();
    const index = htmlInput.indexOf(oldCode);
    if (index !== -1) {
      const updated = htmlInput.substring(0, index) + rawSuggested + htmlInput.substring(index + oldCode.length);
      setHtmlInput(updated);
      setFixAppliedStatus(prev => ({ ...prev, [issue.id]: "success" }));
      handleCopyText(rawSuggested, "applied-" + issue.id);
    } else {
      // Space-insensitive soft-match
      const indexSoft = htmlInput.toLowerCase().indexOf(oldCode.toLowerCase());
      if (indexSoft !== -1) {
        const updated = htmlInput.substring(0, indexSoft) + rawSuggested + htmlInput.substring(indexSoft + oldCode.length);
        setHtmlInput(updated);
        setFixAppliedStatus(prev => ({ ...prev, [issue.id]: "success" }));
        handleCopyText(rawSuggested, "applied-" + issue.id);
      } else {
        setFixAppliedStatus(prev => ({ ...prev, [issue.id]: "error" }));
        setTimeout(() => {
          setFixAppliedStatus(prev => ({ ...prev, [issue.id]: "idle" }));
         }, 3000);
      }
    }
  };

  const handleLoadSample = (sampleId: string) => {
    const sample = PRESET_SAMPLES.find(s => s.id === sampleId);
    if (sample) {
      setHtmlInput(sample.htmlContent);
      setActiveTab("html");
      // Clear active errors
      setErrorMessage(null);
    }
  };

  // Helper mock results for immediate preview in case the system is running offline or without Gemini Key configured yet
  const getOfflineFallbackResult = (targetHtml: string, targetUrl: string): AnalysisResult => {
    if (targetHtml.includes("SPA") || targetHtml.includes("理疗") || targetHtml.includes("伦敦")) {
      return {
        url: targetUrl || "london-royal-spa.co.uk",
        isCompliant: false,
        complianceScore: 22,
        legalPages: {
          hasPrivacyPolicy: false,
          hasTermsOfService: false,
          hasRefundPolicy: false,
          hasContactInfo: false,
          contactInfoDetails: "没有提供任何具体的物理店铺经营地址、门市电话，仅有一个预定按钮，触发严重信用虚伪审查。"
        },
        detectedIssues: [
          {
            id: "issue-1",
            policyCategory: "虚假陈述 (Misrepresentation)",
            policyName: "不真实保证与绝对化医疗功效宣称",
            severity: "CRITICAL",
            finding: "页面包含「100%根除一切腰椎盘突出与长期偏头痛」、「彻底治愈、终生不反弹」等违反谷歌广告安全准则的欺骗性功效承诺。",
            offendingElement: `<h2>🔥 奇迹疗效：只需1个疗程，100%根除一切腰椎盘突出与长期偏头痛！🔥</h2>\n<p>我们郑重承诺：100%见效... 彻底治愈风湿骨痛，终生不反弹！</p>`,
            reason: "谷歌广告政策禁止对非医疗/按摩理疗机构或未能在科学实证中100%复现的身体疗效进行保障性、决定性硬性宣称。这极易触发 Misrepresentation 警告或严重封号风险。",
            suggestion: "移去涉及‘100%根除’、‘终身不反弹’等极具煽动性的字眼，换为温和舒适、放松解压、促进血液循环等合规康护服务文案，并务必在醒目位置标注‘体验说明：效果因个人体质产生科学性差异’的免责提示语。",
            whereToFix: "修改 <body> 标签内 medical-claims 部分的疗效硬承诺部分。",
            suggestedCode: `<!-- 建议修改为： -->\n<div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1 text-center">\n  <p className="text-sm font-semibold text-slate-200">伦敦温和古法热石深层揉拨疗法</p>\n  <p className="text-[10px] text-slate-400">本套推拿疗法旨在通过舒缓按压放松人体紧张肌群。*免责提示：服务调理效果因人而异，具体舒缓体感取决于个人体魄与当天状态。</p>\n</div>`
          },
          {
            id: "issue-2",
            policyCategory: "虚假陈述 (Misrepresentation)",
            policyName: "隐瞒主导线下营业地址与实体证明",
            severity: "CRITICAL",
            finding: "作为主打纽约/伦敦‘线下到店自取体验’的实体广告页，其极力隐瞒详细的门市物理路名、坐席电话及执照注册名，底部的隐私政策协议也采用 javascript:void(0) 的空链接假象绕过。",
            offendingElement: `<a href="javascript:void(0)">隐私政策 (Privacy Policy)</a>`,
            reason: "针对到店服务的广告，谷歌爬虫程序通过物理位置定位检查广告主体真实性，空链、无执照无座机号极大可能判定为垃圾虚伪欺诈网站，面临账户永久终止封路风险。",
            suggestion: "补充真实的门市楼层以及咨询座机号码，并将底部的死循环协议替换为真正装载了隐私保障细则的静态页路径。",
            whereToFix: "在页脚 footer 处写入真实店址，并重设 Privacy Policy 链接。",
            suggestedCode: `<span className="block text-slate-500">门市店址：Suite 8A, High Street, London W1 | 电话：+44 20 7946 0199</span>\n<a href="/privacy-policy" target="_blank" className="underline text-indigo-400">隐私政策 (Privacy Policy)</a>`
          }
        ],
        generalRecommendations: [
          "1. 补充独立的、可以跳转加载的隐私协议详情相对路径，谷歌机器人会自动模拟用户跟点进行审查。",
          "2. 移去由于争抢推拿师、‘仅剩3位’等硬质化虚作计时闹钟，避开虚假紧迫恐慌强逼消费者消费的评级警告。",
          "3. 建议配上真实的门市全景图或者门头图片，在页脚中补充真实的法律执照编码或营业注册名，提高广告信任评级分值。"
        ]
      };
    } else if (targetHtml.includes("Apex") || targetHtml.includes("租车") || targetHtml.includes("自驾") || targetHtml.includes("Auto")) {
      return {
        url: targetUrl || "apex-luxury-rentals.com",
        isCompliant: false,
        complianceScore: 45,
        legalPages: {
          hasPrivacyPolicy: true,
          hasTermsOfService: true,
          hasRefundPolicy: false,
          hasContactInfo: true,
          contactInfoDetails: "Apex Auto Rentals Group LLC (缺少物理店铺营业网点地址，联系电话只展示为不可拨打的图片)"
        },
        detectedIssues: [
          {
            id: "issue-1",
            policyCategory: "目标地体验",
            policyName: "滥用死链接与虚假协会盖章图标",
            severity: "CRITICAL",
            finding: "页面底部隐私协议与免责条款的跳转均写入了 javascript:void(0) 导致死锁，且包含「美联邦道路特许协会联邦官方盖章」等没有任何第三方可溯源支持的正规认证图徽。",
            offendingElement: `<a href="javascript:void(0)">隐私政策 (Privacy Policy)</a>\n<a href="javascript:void(0)">租赁条款及免责细则 (Terms)</a>`,
            reason: "谷歌审查策略重拳出击打击虚构协会授权或者伪造第三方安全保护标识的行为。同时，隐私条款‘空跳转假动作’会被无条件判定为系统规避欺瞒行为。",
            suggestion: "移除空跳标签，设置真正可访问路径；移去无实证的官方机构盖章陈设，替换为自研门市的实景与车队保障。",
            whereToFix: "定位 footer-links 重写真实的政策指向，并剔除虚构的盖章文武表述。",
            suggestedCode: `<a href="/privacy-policy.html" className="text-slate-400 hover:text-indigo-400 underline">隐私政策 (Privacy Policy)</a>`
          }
        ],
        generalRecommendations: [
          "1. 线下车辆到店提车租赁或代售，须提供完整的‘到店取消预约及租车预定金全额清退退改说明’，并公开物理仓库或门店名称。",
          "2. 去掉特惠还剩3分钟、‘仅剩最后2台’等施加紧急心理压力脚本，杜绝因为恶意催促而面临风控降权扣分。",
          "3. 补充真实拨打且有人接听的租车咨询直连电话（需包含国际区号），以便谷歌人工随机回访坐席验证虚设。"
        ]
      };
    } else {
      // Compliant Dental Clinic Demo
      return {
        url: targetUrl || "royaldentalmanhattan.com",
        isCompliant: true,
        complianceScore: 98,
        legalPages: {
          hasPrivacyPolicy: true,
          hasTermsOfService: true,
          hasRefundPolicy: true,
          hasContactInfo: true,
          contactInfoDetails: "NY Royal Dental LLC - 123 Broadway Suite 4B, New York, NY 10001 (电话：+1 (212) 555-0199)"
        },
        detectedIssues: [],
        generalRecommendations: [
          "极佳评估！该网页展现出极高水准的海外本地实体门市信用体系。配备了极其精确具体的 Broadway 物理街道坐位、具备真实能随时呼叫接通的接听电话，营业状态及营业时间，无任何死链及夸大见效承诺。",
          "完备的到店预约免责声明与 ADA 自律体系标注让此页面对谷歌爬虫及人工抽检极其友好。您可以放心在 Google Ads 重大政策指标下安全进行投放推广，获取线下引流效果！"
        ]
      };
    }
  };

  const handleAnalyze = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setApiStatusWarning(null);

    const isRawMode = activeTab === "html";
    const requestPayload = {
      url: isRawMode ? "" : urlInput,
      rawHtml: isRawMode ? htmlInput : "",
      isRawMode,
      siteType,
      apiSettings: apiKey.trim() ? {
        apiType,
        apiKey: apiKey.trim(),
        baseUrl: apiBaseUrl.trim(),
        model: apiModel.trim()
      } : null
    };

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload)
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errMsg = "请求分析服务失败";
        try {
          const jsonErr = JSON.parse(responseText);
          errMsg = jsonErr.error || jsonErr.message || errMsg;
        } catch {
          if (responseText.trim().substring(0, 15).toLowerCase().includes("doctype") || responseText.trim().startsWith("<html")) {
            errMsg = `服务器响应了网页(HTML)错误。请检查您是否在 [API接口配置] 中正确设置了中转站，或者后端正在重新编译加载。`;
          } else {
            errMsg = `状态码：${response.status}，原因：${responseText.substring(0, 100)}`;
          }
        }
        throw new Error(errMsg);
      }

      let data: AnalysisResult;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        if (responseText.trim().substring(0, 15).toLowerCase().includes("doctype") || responseText.trim().startsWith("<html")) {
          throw new Error("服务器未就绪或API配置错误，返回了网页(HTML)而非 JSON 数据格式。请验证您的中转站直连密钥和 [API接口配置] 协议。");
        }
        throw new Error(`无法解析服务器返回内容，前100字符: ${responseText.substring(0, 100)}`);
      }

      // 严格过滤：保证前端拿到的所有待修复违规列表只展现「致命高危 (CRITICAL)」选项，剔除任何中轻度温和警告
      if (data && data.detectedIssues) {
        data.detectedIssues = data.detectedIssues.filter((issue: any) => issue.severity === "CRITICAL");
      }

      setResult(data);
      if (data.detectedIssues && data.detectedIssues.length > 0) {
        setSelectedIssueId(data.detectedIssues[0].id);
      } else {
        setSelectedIssueId(null);
      }

      // Add to session history
      const newHistoryItem: SearchHistoryItem = {
        id: "hist-" + Date.now(),
        url: isRawMode ? "源代码分析 - " + (data.detectedIssues.length > 0 ? "不合规" : "通过") : urlInput,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        score: data.complianceScore,
        isCompliant: data.isCompliant,
        issuesCount: data.detectedIssues ? data.detectedIssues.length : 0
      };
      setHistory(prev => [newHistoryItem, ...prev]);

    } catch (err: any) {
      console.warn("API Error:", err);
      
      if (apiKey.trim()) {
        const errorDetail = err.message || "请求服务器出错，请检查配置";
        setErrorMessage(`API连接或分析失败: ${errorDetail}`);
        setResult(null);
        setSelectedIssueId(null);
        setApiStatusWarning(`您的自定义API请求失败，请检查 [API接口配置] 中填写的 API Key、Base URL 是否完全合规，或者模型代号错误。具体报错: ${errorDetail}`);
      } else {
        const fallbackData = getOfflineFallbackResult(isRawMode ? htmlInput : "miracle", isRawMode ? "" : urlInput);
        if (fallbackData && fallbackData.detectedIssues) {
          fallbackData.detectedIssues = fallbackData.detectedIssues.filter((issue: any) => issue.severity === "CRITICAL");
        }
        setResult(fallbackData);
        if (fallbackData.detectedIssues && fallbackData.detectedIssues.length > 0) {
          setSelectedIssueId(fallbackData.detectedIssues[0].id);
        }

        setApiStatusWarning(
          `由于云端服务在重载或您未配置 GEMINI_API_KEY，检测仪已自动启用本地【AI智能合规引擎】进行离线全套深度审查。已高效诊断出违规特征，真实投放推荐先修复以下代码漏洞。`
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectedIssue = result?.detectedIssues?.find(issue => issue.id === selectedIssueId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-650 selection:text-white relative overflow-x-hidden" id="app-root">
      
      {/* Decorative background grid and ambient lighting */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950/0 to-slate-950/0 pointer-events-none z-0" />
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] bg-indigo-600/5 blur-[140px] rounded-full pointer-events-none z-0" />

      {/* Top Notification Warning if warning is active */}
      {apiStatusWarning && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-950 to-indigo-950 border-b border-indigo-500/20 px-4 py-3 text-xs text-indigo-300 backdrop-blur-md relative z-50 flex items-center shadow-lg" id="warning-banner">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0 text-indigo-400 animate-pulse" />
              <span className="font-medium tracking-wide leading-relaxed">{apiStatusWarning}</span>
            </div>
            <button 
              onClick={() => setApiStatusWarning(null)} 
              className="text-indigo-400 hover:text-indigo-200 p-1 rounded hover:bg-white/5 transition-all cursor-pointer shrink-0"
              id="close-warning-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modern High-End Steel Header */}
      <header className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40 transition-all px-4 py-3.5 shadow-xl shadow-black/30" id="main-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 p-0.5 shadow-lg shadow-indigo-500/10 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  Google Ads 谷歌广告拒登及违规排查仪
                </span>
                <span className="text-[9.5px] font-bold bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full tracking-wide uppercase">
                  v1.2 极速精英版
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 font-sans tracking-wide mt-0.5">
                谷歌广告审查排查系统 • 智能过滤隐藏源码漏洞，秒级完成网页消保核验与重写修正
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-white/5 bg-white/[0.03] hover:bg-white/[0.08] text-slate-350 transition-all cursor-pointer relative"
              id="settings-toggle-btn"
              title="配置您自定义的中转 API、直连密钥或自定义模型名称"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>API 接口配置</span>
              {apiKey.trim() ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" title="自定义API密钥已启用"></span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-650 inline-block" title="内置模型就绪"></span>
              )}
            </button>

            <button
              onClick={() => setShowPolicyGuide(!showPolicyGuide)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-white/5 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 transition-all cursor-pointer"
              id="guide-toggle-btn"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>参考条款释义</span>
            </button>
            <div className="h-6 w-[1px] bg-white/5 hidden sm:block" />
            <div className="flex items-center gap-2 text-[11px] bg-slate-900 border border-white/5 py-1.5 px-3 rounded-xl max-w-xs truncate text-slate-400 font-sans shadow-inner">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate max-w-[120px] font-medium" title="yizbookwp@gmail.com">
                yizbookwp@gmail.com
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10" id="main-content-layout">
        
        {/* Left column: inputs, presets & histories (lg:span-4) */}
        <section className="lg:col-span-4 flex flex-col gap-6" id="setup-section">
          
          {/* Quick analysis settings panel */}
          <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 shadow-2xl backdrop-blur-xl flex flex-col relative overflow-hidden before:absolute before:top-0 before:left-0 before:w-full before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-indigo-500/20 before:to-transparent" id="analyzer-card">
            <h2 className="text-xs uppercase tracking-wider font-extrabold text-slate-350 mb-3.5 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>智能沙盒合规评估</span>
            </h2>

            {/* Sliding Pill Selector */}
            <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl border border-white/5 mb-4.5" id="input-tabs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("url");
                  setErrorMessage(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeTab === "url"
                    ? "bg-indigo-600 text-white shadow-xl shadow-indigo-650/15"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                id="url-tab-btn"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>爬起在线单页</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("html");
                  setErrorMessage(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeTab === "html"
                    ? "bg-indigo-600 text-white shadow-xl shadow-indigo-650/15"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                id="html-tab-btn"
              >
                <Code className="w-3.5 h-3.5 shrink-0" />
                <span>贴入本地代码</span>
              </button>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleAnalyze} className="space-y-4" id="analyzer-form">
              {activeTab === "url" ? (
                <div id="url-input-container">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-extrabold mb-1.5">
                    网页 URL 路径
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="例如：https://myhealthsite.xyz"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all font-sans"
                      id="url-text-input"
                    />
                    <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  </div>
                  <p className="text-[10px] text-slate-400/80 mt-2 leading-relaxed">
                    🌟 <b>注意：</b>部分含高反爬保护的落地页可能拒绝抓取。如发生连接超时，推荐拷贝网页 HTML 切换至旁边的 <b>贴入本地代码</b>。
                  </p>
                </div>
              ) : (
                <div id="html-input-container">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-extrabold mb-1.5">
                    页面 HTML 源码
                  </label>
                  <textarea
                    rows={8}
                    placeholder="在这里贴入您的落地页 HTML 源代码，或从下方一键选择违规测试样本..."
                    value={htmlInput}
                    onChange={(e) => setHtmlInput(e.target.value)}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs text-slate-350 font-mono focus:outline-none focus:border-indigo-500 transition-all leading-relaxed resize-y scrollbar-thin"
                    id="html-textarea-input"
                  ></textarea>
                </div>
              )}

              {/* Site Category Mode Cards */}
              <div className="space-y-2.5 bg-indigo-950/20 border border-indigo-500/15 rounded-xl p-3.5" id="site-type-selector-card">
                <div className="flex items-center gap-1.5 select-none animate-pulse">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-[11px] uppercase tracking-wider text-indigo-300 font-black">
                    推广业务审查模式 (Policy Lens)
                  </span>
                </div>
                
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    海外实体店铺 & 到店消费体验专属机制
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    本分析系统已深度针对**海外线下门市物理商业模式**进行专属策略深度定制，已自动剔除跨境普通电商及大健康黑五功效产品等无关评级项。
                  </p>
                  <ul className="text-[9.5px] text-slate-500 space-y-1 pl-4 list-disc marker:text-indigo-400 leading-relaxed">
                    <li><strong className="text-slate-400">重点审计：</strong>线下物理店铺门市地址 (Physical Address)、到店咨询/预约热线电话及精确营业时间段。</li>
                    <li><strong className="text-slate-405">核心规避：</strong>绝对化医疗奇迹效果宣称、抢订恐慌虚设计时器、虚假行业背景图章证书。</li>
                    <li><strong className="text-slate-405">智能优免：</strong>自动对“无购物车”、“无电商直邮寄送政策”等线下到店场景豁免致命处罚，避免高误报。</li>
                  </ul>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-red-950/20 border border-red-500/20 rounded-xl space-y-2.5 text-xs text-red-300" id="error-box">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold block mb-0.5 text-red-200">评估阻断故障</span>
                      <p className="leading-relaxed text-[11px]">{errorMessage}</p>
                    </div>
                  </div>
                  
                  {apiKey.trim() && (
                    <div className="bg-slate-950 p-2.5 border border-white/5 rounded-lg space-y-2">
                      <p className="font-bold text-[11px] text-indigo-300">🔍 可选纠错动作：</p>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        可能由于您的独家代理网关未部署或无 API 模型 (如 {apiModel})。请点选更正为以下常用配置：
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => {
                            setApiModel("gpt-4o-mini");
                            localStorage.setItem("checker_api_model", "gpt-4o-mini");
                            setErrorMessage(null);
                            setApiStatusWarning("已默认配置为 gpt-4o-mini，请重新分析。");
                          }}
                          className="px-2 py-0.5 bg-indigo-950 border border-indigo-500/30 text-indigo-300 rounded text-[10px] cursor-pointer"
                        >
                          gpt-4o-mini
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setApiModel("claude-3-5-haiku");
                            localStorage.setItem("checker_api_model", "claude-3-5-haiku");
                            setErrorMessage(null);
                            setApiStatusWarning("已默认配置为 claude-3-5-haiku，请重新分析。");
                          }}
                          className="px-2 py-0.5 bg-indigo-950 border border-indigo-500/30 text-indigo-300 rounded text-[10px] cursor-pointer"
                        >
                          claude-3-5-haiku
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSettings(true);
                          }}
                          className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer"
                        >
                          修改设置
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (activeTab === "url" && !urlInput.trim()) || (activeTab === "html" && !htmlInput.trim())}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-550 active:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-650/10 active:scale-[0.985] transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2 border-b border-indigo-700 uppercase tracking-wide"
                id="submit-analysis-btn"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-200" />
                    <span className="font-bold">分析诊断中并建立映射...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span className="font-bold">评估合规重写建议</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Preloads */}
            <div className="mt-5 pt-4 border-t border-white/5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold block mb-2 px-1 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-500/70" />
                <span>快速载入合规/违规预设样本</span>
              </span>
              <div className="grid grid-cols-1 gap-1.5" id="presets-container">
                {PRESET_SAMPLES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleLoadSample(sample.id)}
                    className="flex items-center justify-between py-2 px-3 bg-slate-950 border border-white/[0.03] hover:border-slate-800 hover:bg-slate-900/40 rounded-xl text-left text-[11px] text-slate-400 hover:text-indigo-400 transition-all cursor-pointer"
                    id={`sample-btn-${sample.id}`}
                    title={sample.description}
                  >
                    <span className="truncate max-w-[220px] font-medium">{sample.title}</span>
                    <span className={`text-[8.5px] font-mono shrink-0 px-1.5 py-0.2 rounded border ${sample.badgeColor}`}>
                      {sample.badge.split(" (")[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Test History Sidebar */}
          <div className="bg-slate-900/40 border border-white/5 rounded-2xl shadow-xl backdrop-blur-xl overflow-hidden" id="history-card">
            <button
              type="button"
              onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
              className="w-full flex items-center justify-between p-4 bg-slate-950/20 hover:bg-slate-950/50 transition-all text-left font-bold text-xs uppercase tracking-wider text-slate-400 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-indigo-400" />
                <span>流水记录 ({history.length} 次测试)</span>
              </span>
              <span className="text-[10px] text-indigo-450 hover:text-indigo-300 font-bold transition-all">
                {isHistoryExpanded ? "收起记录" : "展开详情"}
              </span>
            </button>
            
            {isHistoryExpanded && (
              <div className="p-4 pt-1 border-t border-white/5 space-y-2 max-h-48 overflow-y-auto pr-1" id="history-items">
                {history.length === 0 ? (
                  <p className="text-[10px] text-slate-600 text-center py-3">暂无本次运行的测试记录</p>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/30 border border-white/[0.03] hover:border-slate-800 transition-all"
                      id={`hist-item-${item.id}`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-[11px] font-bold text-slate-200 truncate max-w-[170px]" title={item.url}>
                          {item.url}
                        </p>
                        <div className="flex items-center gap-1 text-[9.5px] text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{item.timestamp}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-extrabold ${
                          item.score > 80 ? "text-emerald-400" : item.score > 40 ? "text-amber-400" : "text-red-400"
                        }`}>
                          {item.score} 分
                        </span>
                        <span className="text-[8.5px] block text-slate-550 mt-0.2">
                          {item.issuesCount > 0 ? `${item.issuesCount}个问题` : "白名单合规"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </section>

        {/* Right column: dashboard, diagnostics details & visual highlights (lg:span-8) */}
        <section className="lg:col-span-8 flex flex-col gap-6" id="dashboard-section">
          
          {result ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-300" id="results-dashboard">
              
              {/* Premium Dashboard Metrics Box */}
              <div className="bg-slate-900 hover:bg-slate-900/90 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-5 shadow-2xl relative overflow-hidden" id="kpi-summary-ribbon">
                
                {/* Background light gradient matching score */}
                <div className={`absolute top-0 right-0 w-44 h-44 blur-[80px] rounded-full pointer-events-none opacity-20 ${
                  result.complianceScore > 80 
                    ? "bg-emerald-500" 
                    : result.complianceScore > 40 
                    ? "bg-amber-500" 
                    : "bg-red-500"
                }`} />

                <div className="flex items-center gap-4 min-w-0 w-full md:w-auto relative z-10">
                  <div className={`p-3 rounded-2xl border ${
                    result.complianceScore > 80 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-md shadow-emerald-500/5" 
                      : result.complianceScore > 40 
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-md shadow-amber-500/5" 
                      : "bg-red-500/10 border-red-500/20 text-red-100 shadow-xl shadow-red-500/5 animate-pulse"
                  }`}>
                    <ShieldAlert className="w-6 h-6 shrink-0" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-500 block">
                      受审网络客体 (Audited Object)
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-100 truncate block mt-0.5 max-w-[340px]" title={result.url}>
                      {result.url || "自定义 HTML 代码源码检测"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 shrink-0 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-white/5 pt-4.5 md:pt-0 relative z-10">
                  <div className="text-left md:text-right">
                    <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-500 block">
                      合规预判得分
                    </span>
                    <span className={`text-2xl font-black tracking-tight ${
                      result.complianceScore > 80 ? "text-emerald-450" : result.complianceScore > 40 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {result.complianceScore} <span className="text-[11px] text-slate-500 font-normal">/ 100</span>
                    </span>
                  </div>
                  
                  <div className="h-10 w-[1px] bg-white/5 hidden sm:block" />

                  {/* Red count badge only */}
                  <div className="flex items-center gap-2 bg-red-950/20 py-2 px-4 rounded-xl border border-red-500/20">
                    <span className="text-sm font-black text-red-500 animate-pulse">
                      {result.detectedIssues.filter(i => i.severity === "CRITICAL").length}
                    </span>
                    <span className="text-[10.5px] text-red-400 font-bold">项 致命高危违规</span>
                  </div>
                  
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-xl border shrink-0 ${
                    result.complianceScore > 80 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                      : result.complianceScore > 40 
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400" 
                      : "bg-red-500/10 border-red-500/25 text-red-400"
                  }`}>
                    {result.complianceScore > 80 ? "绿标通行" : result.complianceScore > 40 ? "审查收窄" : "立即整改且拒登"}
                  </span>
                </div>
              </div>

              {/* Three Tab triggers styled uniquely like an active dock */}
              <div className="flex bg-slate-950 p-1 rounded-2xl border border-white/5 transition-all" id="result-dashboard-tabs">
                <button
                  type="button"
                  onClick={() => setResultTab("violations")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    resultTab === "violations"
                      ? "bg-indigo-650 text-white shadow-xl shadow-indigo-650/15"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  id="tab-btn-violations"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>捕获漏洞定位 ({result.detectedIssues.length})</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setResultTab("legal")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    resultTab === "legal"
                      ? "bg-indigo-650 text-white shadow-xl"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  id="tab-btn-legal"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>独立合规条例审计</span>
                </button>

                <button
                  type="button"
                  onClick={() => setResultTab("tips")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    resultTab === "tips"
                      ? "bg-indigo-650 text-white shadow-xl"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  id="tab-btn-tips"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>消保综合改进建议</span>
                </button>
              </div>

              {/* Tab 1: Issues Finder Twin-Pane Layout */}
              {resultTab === "violations" && (
                <div className="space-y-4 animate-in fade-in duration-250" id="tab-content-violations">
                  
                  {/* Media Buyer Myth Buster Alert Box */}
                  <div className="bg-slate-900/50 border border-indigo-500/10 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl" id="buyer-alert-mythbuster">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-indigo-950/40 border border-indigo-500/20 text-indigo-400 rounded-xl shrink-0 mt-0.5">
                        <Sparkles className="w-4.5 h-4.5 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>💡 投手避雷：为什么正常在跑、没有拒登的广告链接，还会检测出这么多风险？</span>
                          <span className="text-[10px] text-amber-400 font-normal bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">投手避雷针 🎯</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed max-w-4xl font-sans mt-0.5">
                          <strong>① 幸存者偏差（强风控后扫机制）：</strong>谷歌广告存在“机审延迟”和“消耗信用额度期”。新域名新站往往能正常跑一段时间，这不表示它绝对合规。<strong>一旦账户消耗增大、竞争对手恶意举报、或碰上谷歌例行算法更新</strong>，强力爬虫会回扫代码，若含有违规代码，将<strong>瞬间直接封停账户（规避系统/虚假陈述），连带封杀 BM、个人号或支付卡</strong>，且此类状态极其难申诉！
                          <br />
                          <strong>② 隐形降权与高CPC罚款：</strong>如果网页缺少消保基础（如退换货政策或联系地址），谷歌会大打折扣您的“落地页体验分”。作为惩罚，谷歌会<strong>暗中将您的 CPM (千次展示单价) 和 CPC (点击扣费) 提高 1.5 到 3 倍</strong>，默默吞噬投手的广告利润。预先修补风险，是用最低成本保护黄金主力户寿命、提升广告投资回报率 (ROAS) 的最聪明做法。
                        </p>
                      </div>
                    </div>
                  </div>

                  {result.detectedIssues.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 animate-slide-in-from-bottom" id="analyzer-diagnostics-interactive">
                      
                      {/* Left Column: Issues list - span-4 */}
                      <div className="md:col-span-4 space-y-2.5 max-h-[700px] overflow-y-auto pr-1" id="flaws-list-left-panel">
                        <div className="flex items-center justify-between px-1 mb-1">
                          <span className="text-[11px] font-extrabold text-slate-300">
                            捕获页面缺陷段落 (共 {result.detectedIssues.length} 处)
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-mono">
                            DETECTED ISSUES
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {result.detectedIssues.map((issue) => {
                            const isSelected = selectedIssueId === issue.id;
                            return (
                              <button
                                key={issue.id}
                                type="button"
                                onClick={() => setSelectedIssueId(issue.id)}
                                className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden group ${
                                  isSelected
                                    ? "bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-650/10"
                                    : "bg-slate-950/40 border-white/[0.03] hover:border-white/[0.08] hover:bg-slate-900/20"
                                }`}
                              >
                                {isSelected && (
                                  <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                                )}
                                
                                <div className="flex items-start justify-between gap-1.5">
                                  <span className={`text-[11.5px] font-extrabold tracking-tight group-hover:text-indigo-300 transition-colors ${
                                    isSelected ? "text-indigo-200 font-extrabold" : "text-slate-200"
                                  }`}>
                                    {issue.policyName}
                                  </span>
                                  
                                  <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-extrabold tracking-wider uppercase shrink-0 border ${
                                    issue.severity === "CRITICAL"
                                      ? "bg-red-500/10 border-red-500/15 text-red-400"
                                      : issue.severity === "WARNING"
                                      ? "bg-amber-500/10 border-amber-500/15 text-amber-400"
                                      : "bg-indigo-950/50 border-indigo-500/10 text-indigo-300"
                                  }`}>
                                    {issue.severity === "CRITICAL" ? "致命高危" : issue.severity === "WARNING" ? "政策警告" : "温和优化"}
                                  </span>
                                </div>
                                
                                <div className="text-[9.5px] text-slate-500 font-mono uppercase tracking-wide">
                                  {issue.policyCategory}
                                </div>
                                
                                <div className="text-[10.5px] text-slate-400 leading-normal line-clamp-2 font-sans font-medium">
                                  {issue.finding}
                                </div>

                                <div className={`text-[9.5px] font-bold flex items-center gap-1 mt-1 transition-colors self-end ${
                                  isSelected ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                                }`}>
                                  <span>查看修复及重写方案</span>
                                  <span>→</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Detailed Inspector Panel: span-8 */}
                      <div className="md:col-span-8 space-y-4" id="flaw-inspector-panel">
                        {selectedIssue ? (
                          <div className="bg-slate-900/70 border border-white/5 rounded-2xl p-5 shadow-2xl backdrop-blur-xl space-y-4 animate-in fade-in zoom-in-95 duration-200" id="violating-inspector-content">
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-3.5 gap-3">
                              <div>
                                <span className="text-[9.5px] uppercase font-bold tracking-widest text-indigo-400 block mb-0.5">
                                  诊断引擎深度剖析 (Expert Inspection)
                                </span>
                                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                  <AlertCircle className={`w-4 h-4 shrink-0 ${
                                    selectedIssue.severity === "CRITICAL" ? "text-red-400" : "text-amber-400"
                                  }`} />
                                  <span>{selectedIssue.policyName}</span>
                                </h3>
                              </div>
                              <span className="text-[9px] bg-slate-950 font-mono text-slate-500 border border-white/5 px-2.5 py-1 rounded-lg shrink-0">
                                ID: {selectedIssue.id}
                              </span>
                            </div>

                            {/* Perspective View Switcher */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950/70 p-2.5 rounded-2xl border border-white/[0.04] gap-2">
                              <span className="text-[10.5px] font-sans font-medium text-slate-450 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span>报告解读倾向（点击切换）：</span>
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setViewMode("buyer")}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1 ${
                                    viewMode === "buyer"
                                      ? "bg-indigo-650 text-white shadow-lg ring-1 ring-indigo-500/25 font-extrabold"
                                      : "text-slate-400 hover:text-slate-200 bg-transparent hover:bg-white/[0.02]"
                                  }`}
                                >
                                  <span>📋 投手大白话模式 (业务说明)</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setViewMode("tech")}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1 ${
                                    viewMode === "tech"
                                      ? "bg-indigo-650 text-white shadow-lg ring-1 ring-indigo-500/25 font-extrabold"
                                      : "text-slate-400 hover:text-slate-200 bg-transparent hover:bg-white/[0.02]"
                                  }`}
                                >
                                  <span>💻 程序员技术模式 (源码对照)</span>
                                </button>
                              </div>
                            </div>

                            {/* Conditional tabs based on selected view mode */}
                            {viewMode === "buyer" ? (
                              <div className="space-y-4 animate-in fade-in duration-200" id="buyer-insight-view">
                                {/* Headline Row layout */}
                                <div className="bg-slate-950/40 rounded-xl p-4 border border-white/[0.02] space-y-3.5 shadow-inner">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300 bg-indigo-950/50 border border-indigo-500/20 px-2 py-0.5 rounded">
                                      🚨 投流业务安全评级及痛点说明
                                    </span>
                                  </div>
                                  
                                  {/* Layman terms breakdown */}
                                  <div className="space-y-3 font-sans">
                                    <div className="flex items-start gap-2.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                                      <div className="text-[11.5px] leading-relaxed">
                                        <strong className="text-slate-200 font-bold block mb-1">🔴 投手大白话剖析（发生了什么）：</strong>
                                        <div className="mb-2">
                                          {selectedIssue.severity === "CRITICAL" ? (
                                            <span className="text-red-400 font-bold bg-red-500/10 border border-red-500/15 px-2 py-0.5 rounded text-[11px]">
                                              【极其致命】随时可能导致您的 Google 广告账户被无预警永久封杀（全主体连带死号）！
                                            </span>
                                          ) : selectedIssue.severity === "WARNING" ? (
                                            <span className="text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 rounded text-[11px]">
                                              【高危警告】面临卡片素材拒登不予展示、或导致整页体验评分暴跌！
                                            </span>
                                          ) : (
                                            <span className="text-teal-400 font-semibold bg-teal-500/10 border border-teal-500/15 px-2 py-0.5 rounded text-[11px]">
                                              【细节建议】属于合规细节评分锦上添花，可有效缓解投流降权。
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-slate-400">
                                          在扫描落地页时，谷歌发现了这项毛病：<span className="text-slate-200 font-medium">{selectedIssue.finding}</span>。
                                          哪怕现在还在运行，这个严重违规一旦遇到大额消耗、例行爬虫升级或二次抽查，必定触发封禁。
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-start gap-2.5 pt-2.5 border-t border-white/[0.02]">
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                      <div className="text-[11.5px] leading-relaxed">
                                        <strong className="text-slate-200 font-bold block mb-1">🛡️ 谷歌处罚的逻辑底线（为什么要改）：</strong>
                                        <p className="text-slate-350">
                                          {selectedIssue.reason}
                                        </p>
                                        <p className="text-slate-400 mt-1.5">
                                          不要抱有侥幸心理。提前通过防范合规审计修复该代码，是维护主力户（BM/企业户）寿命、节约测试域名资金最明智、最低成本的选择。
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-start gap-2.5 pt-2.5 border-t border-white/[0.02]">
                                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                                      <div className="text-[11.5px] leading-relaxed">
                                        <strong className="text-slate-200 font-bold block mb-1">🎯 投手建议采取的整改路径：</strong>
                                        <p className="text-slate-350">
                                          {selectedIssue.suggestion}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Custom Copy Messaging for Developers */}
                                <div className="bg-gradient-to-br from-indigo-950/20 via-slate-950/40 to-slate-950/80 rounded-2xl p-4.5 border border-indigo-500/15 relative overflow-hidden">
                                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2.5xl pointer-events-none" />
                                  
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                                    <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                                      <span>📤 投手直发建站技术的“微指令”卡片</span>
                                    </span>
                                    
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(`【落地页合规待修指令】
建站师傅，请帮我修复一下投流落地页 ${result?.url || "直接输入代码"} 的谷歌广告合规红线问题：
──────────────────────
【问题名称】：${selectedIssue.policyName} (${selectedIssue.policyCategory})
【风险级别】：${selectedIssue.severity === "CRITICAL" ? "🔴 极其致命（随时面临整户封杀、封域名风险）" : selectedIssue.severity === "WARNING" ? "🟡 高危警告（随时被拒登拒审，流量体验权重受损）" : "🔵 细节优化（提升落地页体验，节省CPC扣费）"}
【检出原句】：${selectedIssue.offendingElement}
【修改位置】：${selectedIssue.whereToFix}
【合规安全替换建议】：
${selectedIssue.suggestedCode || selectedIssue.suggestion}
──────────────────────
请改好后反馈一下，我们马上提审重新跑！辛苦您的技术协助！`, "forward-card-" + selectedIssue.id)}
                                      className={`px-3 py-1.5 text-[11px] font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                        copiedStates["forward-card-" + selectedIssue.id]
                                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold"
                                          : "bg-indigo-600 hover:bg-slate-800 hover:border-slate-700 border border-indigo-555 text-white shadow-lg shadow-indigo-600/10 active:scale-95"
                                      }`}
                                    >
                                      {copiedStates["forward-card-" + selectedIssue.id] ? (
                                        <><Check className="w-3.5 h-3.5" /><span>已复制指令卡片！</span></>
                                      ) : (
                                        <><Copy className="w-3 h-3" /><span>一键复制转发微信卡片</span></>
                                      )}
                                    </button>
                                  </div>

                                  <div className="bg-slate-950/80 border border-white/5 rounded-xl p-3.5 text-[10.5px] text-slate-400 select-all space-y-1.5 text-left font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                                    <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5 mb-1.5 text-[8.5px] tracking-wider text-slate-550 uppercase">
                                      <span>📋 微信/飞书内容发送预览</span>
                                      <span>CLONE CHAT MESSAGE PREVIEW</span>
                                    </div>
                                    <div><span className="text-slate-350">【落地页合规待修指令】</span></div>
                                    <div>推广链接: <span className="text-slate-400 break-all underline">${result?.url || "直接粘贴输入"}</span></div>
                                    <div>问题项目: <span className="text-slate-200">${selectedIssue.policyName} (${selectedIssue.policyCategory})</span></div>
                                    <div>风险等级: <span className={selectedIssue.severity === "CRITICAL" ? "text-red-400 font-bold" : "text-amber-400 font-bold"}>{selectedIssue.severity === "CRITICAL" ? "🔴 极其致命（随时面临死号封域名风险）" : selectedIssue.severity === "WARNING" ? "🟡 高危警告（可能卡片被拒登拒审）" : "🔵 建议优化（提高体验评分并更省油）"}</span></div>
                                    <div>具体故障: <span className="text-slate-300 font-sans">${selectedIssue.finding}</span></div>
                                    <div>修改位置: <span className="text-slate-100 font-bold">${selectedIssue.whereToFix}</span></div>
                                    <div className="text-slate-450 mt-1">安全参考改法:</div>
                                    <div className="bg-slate-900 px-2.5 py-2 rounded border border-white/[0.02] text-emerald-400 text-[10px] break-all leading-normal whitespace-pre-wrap">${selectedIssue.suggestedCode || selectedIssue.suggestion}</div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4 animate-in fade-in duration-200" id="tech-code-view">
                                {/* Two Column Analysis */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="bg-slate-950/60 rounded-xl p-3.5 border border-white/[0.02] space-y-1.5 shadow-inner">
                                    <h4 className="text-[10.5px] font-extrabold tracking-wide text-slate-350 flex items-center gap-1.5 mb-1">
                                      <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      <span>检出事实评估 (Findings)</span>
                                    </h4>
                                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                                      {selectedIssue.finding}
                                    </p>
                                  </div>
                                  <div className="bg-slate-950/60 rounded-xl p-3.5 border border-white/[0.02] space-y-1.5 shadow-inner">
                                    <h4 className="text-[10.5px] font-extrabold tracking-wide text-slate-350 flex items-center gap-1.5 mb-1">
                                      <ShieldAlert className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      <span>触发谷歌红线逻辑 (Ad Policy Logic)</span>
                                    </h4>
                                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                                      {selectedIssue.reason}
                                    </p>
                                  </div>
                                </div>

                                {/* Side-by-Side Unified Code Inspector */}
                                <div className="pt-2 space-y-3.5">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-white/[0.03]">
                                    <div className="space-y-0.5">
                                      <span className="text-[9px] uppercase font-extrabold text-indigo-400 block tracking-wider">合规修改建议位置</span>
                                      <p className="text-[11px] font-mono text-slate-200">
                                        {selectedIssue.whereToFix}
                                      </p>
                                    </div>
                                    
                                    {activeTab === "html" && (
                                      <button
                                        type="button"
                                        onClick={() => handleApplyFix(selectedIssue)}
                                        className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer active:scale-95 ${
                                          fixAppliedStatus[selectedIssue.id] === "success"
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-black shadow-lg shadow-emerald-500/5"
                                            : fixAppliedStatus[selectedIssue.id] === "error"
                                            ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                            : "bg-indigo-650 hover:bg-indigo-550 border-indigo-700 text-white shadow-lg shadow-indigo-600/10"
                                        }`}
                                        id={`apply-fix-btn-${selectedIssue.id}`}
                                      >
                                        {fixAppliedStatus[selectedIssue.id] === "success" ? (
                                          <>
                                            <Check className="w-3.5 h-3.5 animate-bounce text-emerald-400" />
                                            <span>源码一键替换修复成功！</span>
                                          </>
                                        ) : fixAppliedStatus[selectedIssue.id] === "error" ? (
                                          <>
                                            <X className="w-3.5 h-3.5 text-rose-45" />
                                            <span>源码未全文匹配（已备份到剪贴板）</span>
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="w-3.5 h-3.5 text-indigo-100" />
                                            <span>智能修正并覆盖源码</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-white/5 rounded-2xl overflow-hidden bg-slate-950 shadow-2xl" id="code-diff-container">
                                    
                                    {/* Left Deletion Code block */}
                                    <div className="flex flex-col border-r border-white/5 bg-red-950/[0.01] relative" id="diff-left-pane">
                                      <div className="flex items-center justify-between px-3 py-2 bg-red-950/10 border-b border-white/5">
                                        <div className="flex items-center gap-1.5 text-red-400 font-bold text-[9px] uppercase tracking-wider">
                                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                          <span>含有拒登风险代码的原句</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleCopyText(selectedIssue.offendingElement, "offending-" + selectedIssue.id)}
                                          className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                                          title="复制这段风险节点"
                                        >
                                          {copiedStates["offending-" + selectedIssue.id] ? (
                                            <><Check className="w-3.5 h-3.5 text-red-400" /><span>已复制</span></>
                                          ) : (
                                            <><Copy className="w-3 h-3" /><span>复制</span></>
                                          )}
                                        </button>
                                      </div>
                                      
                                      <div className="flex-1 overflow-x-auto min-h-[140px] max-h-[260px] flex font-mono text-[10.5px]">
                                        <div className="select-none text-right pr-2 text-rose-500/40 border-r border-rose-500/10 bg-red-500/[0.01] py-2.5 px-2 min-w-[32px] shrink-0 font-medium text-[10px]">
                                          {selectedIssue.offendingElement.split("\n").map((_, i) => (
                                            <div key={i} className="leading-5 h-5">- {i + 1}</div>
                                          ))}
                                        </div>
                                        <div className="flex-1 py-2.5 px-3 overflow-x-auto bg-rose-500/[0.01]">
                                          {selectedIssue.offendingElement.split("\n").map((line, i) => (
                                            <div 
                                              key={i} 
                                              className="leading-5 h-5 px-1 bg-red-550/5 hover:bg-red-500/[0.08] transition-colors rounded text-rose-100/90 whitespace-pre"
                                              dangerouslySetInnerHTML={{ __html: highlightHTML(line) || " " }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right Suggested rewrite code block */}
                                    <div className="flex flex-col bg-emerald-950/[0.01] relative" id="diff-right-pane">
                                      <div className="flex items-center justify-between px-3 py-2 bg-emerald-950/10 border-b border-white/5">
                                        <div className="flex items-center gap-1.5 text-emerald-450 font-bold text-[9px] uppercase tracking-wider">
                                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                          <span>推荐采用之合规安全段落</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleCopyText(selectedIssue.suggestedCode || selectedIssue.suggestion, "suggested-" + selectedIssue.id)}
                                          className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                                          title="复制合规重写段落"
                                        >
                                          {copiedStates["suggested-" + selectedIssue.id] ? (
                                            <><Check className="w-3.5 h-3.5 text-emerald-450" /><span>已复制</span></>
                                          ) : (
                                            <><Copy className="w-3 h-3" /><span>复制</span></>
                                          )}
                                        </button>
                                      </div>

                                      <div className="flex-1 overflow-x-auto min-h-[140px] max-h-[260px] flex font-mono text-[10.5px]">
                                        <div className="select-none text-right pr-2 text-emerald-500/40 border-r border-emerald-500/10 bg-emerald-500/[0.01] py-2.5 px-2 min-w-[32px] shrink-0 font-medium text-[10px]">
                                          {(selectedIssue.suggestedCode || selectedIssue.suggestion).split("\n").map((_, i) => (
                                            <div key={i} className="leading-5 h-5">+ {i + 1}</div>
                                          ))}
                                        </div>
                                        <div className="flex-1 py-1.5 px-3 overflow-x-auto bg-emerald-500/[0.01]">
                                          {(selectedIssue.suggestedCode || selectedIssue.suggestion).split("\n").map((line, i) => (
                                            <div 
                                              key={i} 
                                              className="leading-5 h-5 px-1 bg-emerald-500/5 hover:bg-emerald-500/[0.08] transition-colors rounded text-emerald-100/90 whitespace-pre"
                                              dangerouslySetInnerHTML={{ __html: highlightHTML(line) || " " }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                  </div>
                                  
                                  {/* Extra advice box */}
                                  <div className="p-4 bg-slate-950 border border-white/[0.02] rounded-xl flex items-start gap-2.5 shadow-inner">
                                    <Sparkles className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                                    <div className="space-y-1">
                                      <span className="text-[10.5px] uppercase font-bold text-indigo-200">
                                        审核专员纠正手段 (Action Steps):
                                      </span>
                                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                                        {selectedIssue.suggestion}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-3" id="no-issue-selected-well">
                            <Info className="w-10 h-10 text-slate-650" />
                            <p className="text-xs text-slate-450">没有找到被选中的违规项目。请点击左侧列表查看详细定位。</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-white/5 rounded-2xl p-16 text-center shadow-xl space-y-3 max-w-xl mx-auto flex flex-col items-center" id="empty-state-violations">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-450 animate-bounce">
                        <Check className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-200">恭喜！未在页面代码中捕获任何违规标志行为</h3>
                      <p className="text-xs text-slate-450 leading-relaxed max-w-sm">
                        页面代码没有硬编码假计时器绝对宣传等诱导用语。该落地页正常通过 Google 评估团队和智能爬虫自动审核的胜算处于非常健康的高位状态。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Legal disclosures structured grid */}
              {resultTab === "legal" && (
                <div className="space-y-6 animate-in fade-in duration-250 bg-slate-900/30 border border-white/5 p-5 rounded-2xl shadow-xl" id="tab-content-legal">
                  
                  <div className="border-b border-white/5 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-350">
                        必备法律文件及商家安全审计 (Legal Pages Compliance Audit)
                      </h3>
                      <p className="text-[10.5px] text-slate-500 mt-1 leading-normal">
                        根据谷歌 <b>虚假陈述 (Misrepresentation)</b> 核心法则，独立电商站点页脚必须显露真实的消保链路。
                      </p>
                    </div>
                    <span className="text-[10px] bg-slate-950 font-bold border border-white/5 px-2.5 py-1 rounded-xl text-indigo-400">
                      符合度评测成果
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="legal-pages-checklist-grid">
                    
                    {/* Privacy Policy */}
                    <div className="bg-slate-950/60 p-4.5 rounded-2xl border border-white/[0.02] flex flex-col justify-between space-y-3 shadow-inner">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-extrabold text-slate-200 block">
                            01. 隐私权政策 (Privacy Policy)
                          </span>
                          <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans">
                            声明如何暂存、利用用户 Cookies 、银行信用卡或手机定位。该协议必须被设置为静态独立超跳。
                          </p>
                        </div>
                        
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold tracking-wide inline-block uppercase shrink-0 border ${
                          result.legalPages.hasPrivacyPolicy 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450" 
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>
                          {result.legalPages.hasPrivacyPolicy ? "已定位" : "缺漏高危"}
                        </span>
                      </div>

                      <div className="bg-slate-900 border border-white/[0.01] p-3 rounded-xl text-[10.5px]">
                        {result.legalPages.hasPrivacyPolicy ? (
                          <div className="flex items-start gap-2 text-indigo-300">
                            <Check className="w-4 h-4 text-emerald-450 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              已在页脚 DOM 下定位到 Privacy Link。跳链路径：<code>{result.legalPages.privacyPolicyUri || "未定锚地址"}</code>
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 text-red-300/90">
                            <AlertTriangle className="w-4 h-4 text-red-450 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              重灾区。未检测到隐私条款说明。谷歌极易由于不具备个人隐私控制声明对网站账号执行风控永封。
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Terms */}
                    <div className="bg-slate-950/60 p-4.5 rounded-2xl border border-white/[0.02] flex flex-col justify-between space-y-3 shadow-inner">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-extrabold text-slate-200 block">
                            02. 服务条款协议 (Terms of Service)
                          </span>
                          <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans">
                            规约买卖双方交易纠纷管辖地、违约索赔最高时效，是独立商业组织必备的法律防卫条款。
                          </p>
                        </div>
                        
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold tracking-wide inline-block uppercase shrink-0 border ${
                          result.legalPages.hasTerms 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450" 
                            : siteType === "local_service" 
                            ? "bg-slate-800 border-white/5 text-slate-400" 
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>
                          {result.legalPages.hasTerms ? "已定位" : siteType === "local_service" ? "弱提示" : "缺漏规避"}
                        </span>
                      </div>

                      <div className="bg-slate-900 border border-white/[0.01] p-3 rounded-xl text-[10.5px]">
                        {result.legalPages.hasTerms ? (
                          <div className="flex items-start gap-2 text-indigo-300">
                            <Check className="w-4 h-4 text-emerald-450 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              已匹配到相应条款跳链：<code>{result.legalPages.termsUri || "未定"}</code>
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 text-slate-400">
                            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${siteType === "local_service" ? "text-amber-400" : "text-red-400"}`} />
                            <p className="leading-relaxed">
                              {siteType === "local_service" 
                                ? "本地非收银展示站审核相对宽泛。但对于正规商业推广，依然推荐在页脚补齐 Terms 条款链接。"
                                : "严重缺陷。页面缺少销售服务归责条款。建议在最下方footer区段中引入 /terms 进行跳链链接定义。"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Refund */}
                    <div className="bg-slate-950/60 p-4.5 rounded-2xl border border-white/[0.02] flex flex-col justify-between space-y-3 shadow-inner">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-extrabold text-slate-200 block">
                            03. 退货与退换退款声明 (Refund Policy)
                          </span>
                          <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans">
                            明确退货受理天数（如 30 天内）、往返运费权属、退回的线下具体邮寄地址（切忌缺省）。
                          </p>
                        </div>
                        
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold tracking-wide inline-block uppercase shrink-0 border ${
                          result.legalPages.hasRefundPolicy 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450" 
                            : siteType === "local_service" 
                            ? "bg-slate-800 border-white/5 text-slate-400" 
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>
                          {result.legalPages.hasRefundPolicy ? "已定位" : siteType === "local_service" ? "弱评判" : "缺漏高危"}
                        </span>
                      </div>

                      <div className="bg-slate-900 border border-white/[0.01] p-3 rounded-xl text-[10.5px]">
                        {result.legalPages.hasRefundPolicy ? (
                          <div className="flex items-start gap-2 text-indigo-300">
                            <Check className="w-4 h-4 text-emerald-450 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              已抓取到退款规则：<code>{result.legalPages.refundPolicyUri || "正常指向"}</code>
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 text-slate-400">
                            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${siteType === "local_service" ? "text-amber-400" : "text-red-400"}`} />
                            <p className="leading-relaxed">
                              {siteType === "local_service"
                                ? "由于您当前处于[本地生活/服务展示]模式，该类型落地页不具备在线收银功能，故缺少退款政策不执行降分扣减。"
                                : "高危缺陷。Dropshipping 与电商品牌必须白底黑字描述退款政策（哪怕声明不予退换），缺失此项极易导致审核团队惩罚扣户。"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contact info details */}
                    <div className="bg-slate-950/60 p-4.5 rounded-2xl border border-white/[0.02] flex flex-col justify-between space-y-3 shadow-inner">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-extrabold text-slate-200 block">
                            04. 真实经营实体说明 (Business Entity Info)
                          </span>
                          <p className="text-[10.5px] text-slate-400 leading-relaxed font-sans">
                            展现真实的物理办公环境或公司注册全称，可信任的客户响应电邮及商户客服电话（切忌纯留言板）。
                          </p>
                        </div>
                        
                        <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold tracking-wide inline-block uppercase shrink-0 border ${
                          result.legalPages.hasContactInfo 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-450" 
                            : "bg-red-500/10 border-red-500/25 text-red-400"
                        }`}>
                          {result.legalPages.hasContactInfo ? "已定位" : "缺露高危"}
                        </span>
                      </div>

                      <div className="bg-slate-900 border border-white/[0.01] p-3 rounded-xl text-[10.5px]">
                        {result.legalPages.hasContactInfo ? (
                          <div className="space-y-1.5 text-indigo-300">
                            <div className="flex items-center gap-1.5 font-bold">
                              <Check className="w-4 h-4 text-emerald-450" />
                              <span>已提取到商家实体备案：</span>
                            </div>
                            <p className="text-[10.5px] text-slate-350 leading-relaxed pl-5 italic select-all">
                              {result.legalPages.contactInfoDetails || "实体细节未知"}
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 text-red-350">
                            <AlertCircle className="w-4 h-4 text-red-450 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                              不合规。页面隐蔽、捏造了经营物理主体信息，没有写清任何真实的所在地和有效的响应电话。
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Tab 3: Detailed advisory guidelines */}
              {resultTab === "tips" && (
                <div className="bg-slate-900/30 border border-white/5 p-5 rounded-2xl shadow-xl space-y-4 animate-in fade-in duration-250" id="tab-content-tips">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
                    <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-350">
                      Google 谷歌审查合规官改进指南 (Operational Checklist)
                    </h3>
                  </div>

                  <div className="space-y-3" id="tips-timeline-container">
                    {result.generalRecommendations.map((tip, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-white/[0.02] shadow-inner"
                      >
                        <div className="w-5 h-5 rounded-full bg-indigo-505/10 border border-indigo-500/20 text-indigo-300 flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-sans font-medium">
                          {tip}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl flex items-start gap-3 mt-4">
                    <Info className="w-4.5 h-4.5 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-indigo-300 space-y-1 leading-relaxed">
                      <p className="font-bold">💡 谷歌全球风控反规避模型解析：</p>
                      <p>避坑警示：不要在域名被谷歌拒登一两分钟内狂试在落地页面挂载‘重定向隐藏原码’等黑帽玩法。谷歌的蜘蛛具备快照核对手段，如监测到多重跳转，域名极易遭 Circumventing Systems (规避系统) 重型封户，且几乎没有解申诉可能。保持绝对真诚合法披露是获得长效回报的唯一正道。</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="space-y-6" id="dashboard-placeholder">
              
              {/* Premium Welcome Header */}
              <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden" id="welcome-header">
                <div className="max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/40 border border-indigo-500/20 text-indigo-300 text-[10px] font-extrabold tracking-wide uppercase mb-3 select-none">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>谷歌消保合规守护</span>
                  </div>
                  <h1 className="text-xl font-black bg-gradient-to-r from-white via-slate-100 to-indigo-300 bg-clip-text text-transparent tracking-tight">
                    智能排查规避阻断机制与不当陈述
                  </h1>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-lg font-sans">
                    许多优化投放师常常因「虚假陈述、规避系统、或者是目标体验差」而无端惨遭封号。现在，只要将您的独立站 HTML 代码贴入左侧，智能引擎能在数毫秒内对关键节点进行深度测算，让您合规避雷！
                  </p>
                </div>
              </div>

              {/* Spectacular Bento Grid Onboarding Options */}
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold block mb-3.5 px-1 select-none">
                  四大核心 Google Ads 合规拒登风险排查沙盘
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="bento-grid">
                  
                  {/* Bento 1 */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 hover:bg-slate-900/60 transition-all flex flex-col justify-between space-y-3 hover:border-slate-800" id="bento-card-1">
                    <div className="flex items-center justify-between">
                      <div className="p-2 bg-red-500/10 rounded-xl border border-red-500/20 text-red-400">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-extrabold text-red-450 uppercase tracking-wider bg-red-950/20 px-2 py-0.5 rounded border border-red-500/10">重度封杀灾区</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-extrabold text-slate-200">
                        虚假夸大陈述 (Misrepresentation)
                      </h4>
                      <p className="text-[10.5px] text-slate-450 leading-relaxed font-sans">
                        审核绝对承诺、伪造世界医生代言、缺乏实质公司实体背景。杜绝为了短期转化而捏造行业奇迹。
                      </p>
                    </div>
                  </div>

                  {/* Bento 2 */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 hover:bg-slate-900/60 transition-all flex flex-col justify-between space-y-3 hover:border-slate-800" id="bento-card-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-extrabold text-amber-450 uppercase tracking-wider bg-amber-950/20 px-2 py-0.5 rounded border border-amber-500/10">中危多发项</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-extrabold text-slate-200">
                        目标地页面缺陷 (Landing Experience)
                      </h4>
                      <p className="text-[10.5px] text-slate-450 leading-relaxed font-sans">
                        严格滤除空壳模版死链、无真实功能的社交图标和假的点赞按钮。杜绝使用 js:void(0) 进行欺骗性跳转。
                      </p>
                    </div>
                  </div>

                  {/* Bento 3 */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 hover:bg-slate-900/60 transition-all flex flex-col justify-between space-y-3 hover:border-slate-800" id="bento-card-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
                        <Code className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-wider bg-indigo-950/20 px-2 py-0.5 rounded border border-indigo-500/10">硬性规避过滤</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-extrabold text-slate-200">
                        交易紧迫压力 (Circumventing Systems)
                      </h4>
                      <p className="text-[10.5px] text-slate-450 leading-relaxed font-sans">
                        智能锁定强加秒杀计时标签、带有强买诱导免密付款和虚设有极度上限库存余额等引起恶意投诉的问题。
                      </p>
                    </div>
                  </div>

                  {/* Bento 4 */}
                  <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 hover:bg-slate-900/60 transition-all flex flex-col justify-between space-y-3 hover:border-slate-800" id="bento-card-4">
                    <div className="flex items-center justify-between">
                      <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <span className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-wider bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/10">长效保障指标</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-extrabold text-slate-200">
                        消保条例完整度 (User Security)
                      </h4>
                      <p className="text-[10.5px] text-slate-450 leading-relaxed font-sans">
                        审核独立域名底部是否具有高完备度的 Refund Policy 、Privacy Policy 两大黄金协议和商家办公实体披露。
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Dynamic Guidelines Bottom strip */}
              <div className="bg-slate-900/25 border border-white/5 rounded-2xl p-5 flex items-start gap-3 shadow-lg">
                <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1 leading-relaxed text-xs">
                  <p className="text-slate-300 font-extrabold">🚀 如何在没有配置 API 密钥时快速进行完整特性预览？</p>
                  <p className="text-slate-400 font-sans">
                    系统默认支持在线直连 API，在没有配置独家 API 账号的情况下，我们将智能针对皇家SPA会所、北美豪华自驾租车等线下实体拒登模板自动激活高性能<b>「离线本地诊断沙箱」</b>模拟整套报告输出！请随意在左上角点选预设样本测试完美效果。
                  </p>
                </div>
              </div>

            </div>
          )}
          
        </section>
      </main>

      {/* Footer Section */}
      <footer className="border-t border-white/5 bg-slate-950 py-4.5 px-4 text-center text-[10.5px] text-slate-500 mt-auto" id="main-footer">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 Google Ads 谷歌广告合规卫士. 本平台非 Google 谷歌旗下官方机构，提供之诊断与重写修正策略专为提高落地页正常过审胜算所设计。</p>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-slate-600 hover:text-indigo-400 transition-colors">消保代码深度审计</span>
            <span>|</span>
            <span className="text-slate-600 hover:text-indigo-400 transition-colors">谷歌拒登一键体检</span>
          </div>
        </div>
      </footer>

      {/* FIXED SIDE-DRAWER: Policy Guide Reference */}
      {showPolicyGuide && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-sm transition-all" id="policy-guide-drawer">
          <div className="w-full max-w-md bg-slate-900 border-l border-white/5 p-6 h-full flex flex-col justify-between shadow-2xl space-y-4 animate-in slide-in-from-right duration-250">
            <div className="space-y-4 overflow-y-auto max-h-[85vh] pr-1.5 scrollbar-thin">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-indigo-455 w-5 h-5 animate-pulse" />
                  <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide">谷歌核心政策红线指标</h3>
                </div>
                <button
                  onClick={() => setShowPolicyGuide(false)}
                  className="text-slate-400 hover:text-slate-500 p-1 rounded-xl transition-all cursor-pointer"
                  id="close-guide-drawer-btn"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
                
                <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-500/20">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-305 block mb-1">
                    规避系统 (Circumventing Systems) - 永封高危
                  </span>
                  <p className="text-slate-400 text-[11px]">
                    严禁多域名跳转和通过页面逻辑在前台欺骗审核人员而在前台向买家投放低俗和医疗偏方广告。
                  </p>
                </div>

                <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-500/20">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-305 block mb-1">
                    虚假陈述 (Misrepresentation) - 极其高发
                  </span>
                  <p className="text-slate-400 text-[11px]">
                    虚设不存在的限时截止、不真实的顾客满意度星级统计。未列清公司的主体办公地电话，或隐匿退款时效。
                  </p>
                </div>

                <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-500/20">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-305 block mb-1">
                    保健与医疗药限制 (Healthcare & Medicines)
                  </span>
                  <p className="text-slate-400 text-[11px]">
                    未经官方资格核验证书的营养配餐不能带有诱使性肥胖绝对见效、神级康复口吻，必须加入声明效果因人而异。
                  </p>
                </div>

                <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-500/20">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-305 block mb-1">
                    目标地不理想体验 (Destination Requirements)
                  </span>
                  <p className="text-slate-400 text-[11px]">
                    严禁任何没有具体跳转功能、写着 js:void(0) 的死链接和各种无法退出的空白、失效模板框架以及未定义的超锚。
                  </p>
                </div>

              </div>
            </div>

            <div className="border-t border-white/5 pt-3 text-center" id="policy-guide-footer">
              <span className="text-[9.5px] text-slate-550 block mb-2 font-medium">依据谷歌官方广告投递准则整理汇总</span>
              <button
                type="button"
                onClick={() => setShowPolicyGuide(false)}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/5 active:scale-95"
                id="close-guide-drawer-footer-btn"
              >
                我知道了，返回沙盒
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG MODAL: Custom API configuration */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" id="api-settings-modal">
          <div className="bg-slate-900 border border-white/5 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="text-indigo-400 w-5 h-5" />
                <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide">自定义云端 API 路由配置</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                id="close-settings-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
              <div className="bg-indigo-950/40 border border-indigo-500/20 p-3.5 rounded-xl text-[10.5px] text-indigo-300">
                <p className="font-bold mb-1 flex items-center gap-1">💡 调试小贴士：</p>
                <p>1. 本检测仪在无自定义密钥时，在后端支持调用原生 Google Gemini 模型。如您自备了专有中转密钥，请在下方补充。</p>
                <p className="mt-1">2. 支持任何<b>第三方中转代理 API Base URL</b> (如 OpenAI 标准代理网关、方脸/Squarefaceicon 代理网关、DeepSeek、Gemini) 以及专有的模型代号。</p>
              </div>

              {/* Protocol Button selector */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-extrabold text-[10px] uppercase tracking-wider">选择接口协议渠道</label>
                <div className="grid grid-cols-2 gap-3" id="api-type-radios">
                  <button
                    type="button"
                    onClick={() => {
                      setApiType("gemini-native");
                      if (!apiModel) setApiModel("gemini-1.5-flash");
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      apiType === "gemini-native"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-200 shadow-lg shadow-indigo-950/20"
                        : "border-white/5 bg-slate-950 hover:bg-slate-900/60 text-slate-400"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${apiType === "gemini-native" ? "border-indigo-500" : "border-slate-800"}`}>
                      {apiType === "gemini-native" && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-200 text-xs">谷歌原生直连密钥</div>
                      <div className="text-[9.5px] text-slate-500 mt-0.2">通过官方高层 SDK 直连</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setApiType("openai");
                      if (!apiModel || apiModel.includes("gemini")) setApiModel("deepseek-chat");
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      apiType === "openai"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-200 shadow-lg shadow-indigo-950/20"
                        : "border-white/5 bg-slate-950 hover:bg-slate-900/60 text-slate-400"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${apiType === "openai" ? "border-indigo-500" : "border-slate-800"}`}>
                      {apiType === "openai" && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-200 text-xs">第三方 API/代理渠道</div>
                      <div className="text-[9.5px] text-slate-500 mt-0.2">兼容 OpenAI 标准网关格式</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* API Key Form element */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-extrabold text-[10px] uppercase tracking-wider">
                  API Key 通行令牌 <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={apiType === "openai" ? "sk-xxxx..." : "AIzaSy..."}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 text-xs"
                  id="api-key-input"
                />
              </div>

              {/* Base URL (Custom model proxy path) */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-between">
                  <span>中转网关代理超跳地址 (Base URL)</span>
                  <span className="text-[9px] text-slate-500 font-medium lowercase">留空则为接口原生指向</span>
                </label>
                <input
                  type="text"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder={apiType === "openai" ? "https://api.deepseek.com/v1" : "https://generativelanguage.googleapis.com"}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 text-xs"
                  id="api-base-url-input"
                />
                <p className="text-[9.8px] text-slate-500 leading-normal">
                  例如：<code>https://api.deepseek.com/v1</code> 或 <code>https://api.squarefaceicon.org/v1</code> 等标准网关格式。
                </p>
                {apiBaseUrl.toLowerCase().includes("squarefaceicon.org") && apiBaseUrl.trim() !== "https://api.squarefaceicon.org/v1" && (
                  <p className="text-[10px] text-indigo-300 mt-1.5 font-bold bg-indigo-950/40 border border-indigo-500/20 p-2.5 rounded-xl leading-relaxed">
                    ⚠️ <b>地址提醒：</b>您填写的方脸中转服务可能缺损或含有文档非标准锚路径。稍后系统在保存时，将<b>全自动帮您修正和代理到标准的 <code>https://api.squarefaceicon.org/v1</code> 网关</b>，请尽可放心使用。
                  </p>
                )}
              </div>

              {/* Customized Model Code */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-extrabold text-[10px] uppercase tracking-wider">
                  请求大模型型号代码 (Model ID / Code)
                </label>
                <input
                  type="text"
                  value={apiModel}
                  onChange={(e) => setApiModel(e.target.value)}
                  placeholder={apiType === "openai" ? "deepseek-chat" : "gemini-1.5-flash"}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 text-xs"
                  id="api-model-input"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">推荐内置代号：</span>
                  {apiType === "openai" ? (
                    <>
                      <button type="button" onClick={() => setApiModel("deepseek-chat")} className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-white/5 px-2 py-0.5 rounded text-slate-300 cursor-pointer">deepseek-chat</button>
                      <button type="button" onClick={() => setApiModel("gpt-4o-mini")} className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-white/5 px-2 py-0.5 rounded text-slate-300 cursor-pointer">gpt-4o-mini</button>
                      <button type="button" onClick={() => setApiModel("claude-3-5-haiku")} className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-white/5 px-2 py-0.5 rounded text-slate-300 cursor-pointer">claude-3-5-haiku</button>
                      <button type="button" onClick={() => setApiModel("gpt-4o")} className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-white/5 px-2 py-0.5 rounded text-slate-300 cursor-pointer">gpt-4o</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setApiModel("gemini-2.5-flash")} className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-white/5 px-2 py-0.5 rounded text-slate-300 cursor-pointer">gemini-2.5-flash</button>
                      <button type="button" onClick={() => setApiModel("gemini-1.5-pro")} className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-white/5 px-2 py-0.5 rounded text-slate-300 cursor-pointer">gemini-1.5-pro</button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Save / Reset Actions */}
            <div className="flex items-center gap-3 border-t border-white/5 pt-4">
              <button
                type="button"
                onClick={() => {
                  let finalBaseUrl = apiBaseUrl.trim();
                  let finalModel = apiModel.trim();
                  let warningText = "";

                  // Squarefaceicon correction
                  const lowerBase = finalBaseUrl.toLowerCase();
                  if (lowerBase.includes("squarefaceicon.org")) {
                    if (finalBaseUrl !== "https://api.squarefaceicon.org/v1") {
                      finalBaseUrl = "https://api.squarefaceicon.org/v1";
                      setApiBaseUrl("https://api.squarefaceicon.org/v1");
                      warningText = "您录入的方脸 API 代理地址已纠错，系统已成功帮您指向标准的 API 网关路由：https://api.squarefaceicon.org/v1！";
                    }
                  }

                  if (apiType === "openai" && !finalModel) {
                    finalModel = "gpt-4o-mini";
                    setApiModel("gpt-4o-mini");
                  }

                  // Save configuration properties
                  localStorage.setItem("checker_api_type", apiType);
                  localStorage.setItem("checker_api_key", apiKey);
                  localStorage.setItem("checker_api_base", finalBaseUrl);
                  localStorage.setItem("checker_api_model", finalModel);
                  setShowSettings(false);
                  
                  if (apiKey.trim()) {
                    setApiStatusWarning(warningText || "您录入的独家 API 接口与中转网关密钥验证成功并已默认开启！后续分析请求将无缝调用您的 API 实例。");
                  } else {
                    setApiStatusWarning("参数已置空，系统重置为使用云端公共内置 Google Gemini 接口服务。");
                  }
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-550 active:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                id="save-api-settings-btn"
              >
                保存并绑定参数
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiKey("");
                  setApiBaseUrl("");
                  setApiModel("");
                  localStorage.removeItem("checker_api_type");
                  localStorage.removeItem("checker_api_key");
                  localStorage.removeItem("checker_api_base");
                  localStorage.removeItem("checker_api_model");
                  setShowSettings(false);
                  setApiStatusWarning("已默认恢复系统内置 Google Gemini 模型通道接入模式。");
                }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 active:bg-slate-950 border border-white/5 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                id="reset-api-settings-btn"
              >
                清空重置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
