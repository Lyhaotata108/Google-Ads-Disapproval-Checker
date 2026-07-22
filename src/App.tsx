import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Code2,
  FileSearch,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AnalysisResult, ViolationIssue } from "./types";

type Mode = "url" | "html";
type SiteType = "local_service" | "ecommerce" | "health_nutrition";
type FindingSeverity = "high" | "medium" | "low";
type FindingConfidence = "high" | "medium" | "low";

type ForensicsFinding = {
  id: string;
  title: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  evidence: string;
  recommendation: string;
  relatedReasons: string[];
  source: string;
};

type ForensicsProfile = {
  id: string;
  label: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  title: string;
  visibleTextLength: number;
  redirectChain: Array<{ url: string; status: number; location?: string }>;
  error?: string;
};

type ForensicsResult = {
  url: string;
  scannedAt: string;
  requestedReasonLabels?: string[];
  risk: {
    overall: number;
    compromisedSite: number;
    circumventingSystems: number;
    destinationExperience: number;
  };
  findings: ForensicsFinding[];
  profiles: ForensicsProfile[];
  robots?: { evidence?: string; error?: string } | null;
  externalDomains?: string[];
  limitations?: string[];
  coverage?: {
    completedProfiles?: number;
    totalProfiles?: number;
    complete?: boolean;
    note?: string;
  };
};

type AnalysisResponse = AnalysisResult & {
  auditSummary?: {
    status?: string;
    blockerCount?: number;
    riskCount?: number;
    advisoryCount?: number;
    note?: string;
  };
  analysisMeta?: { fallbackUsed?: boolean; message?: string };
};

type AuditSummary = {
  verdict: string;
  level: "blocked" | "review" | "partial" | "ready" | "idle";
  note: string;
  score: number | null;
  blockers: string[];
  risks: string[];
  advisories: string[];
};

const REJECTION_REASONS = [
  ["circumventing_systems", "规避系统"],
  ["compromised_site", "被侵网站"],
  ["malicious_software", "恶意软件"],
  ["destination_not_working", "目标网页无法正常运行"],
  ["destination_mismatch", "目标网页不匹配"],
  ["adsbot_access", "AdsBot 无法抓取"],
  ["misrepresentation", "虚假陈述"],
  ["unacceptable_business", "不可接受的商业行为"],
  ["other", "其他"],
] as const;

function cleanError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || "请求失败");
  if (/FUNCTION_INVOCATION_FAILED/i.test(raw)) return "Vercel 分析函数本次运行失败，请稍后重新检测。";
  if (/<!doctype|<html|bad gateway|cloudflare/i.test(raw)) return "接口返回了网关错误页，请检查服务状态后重试。";
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260);
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`);
    }
    if (!response.ok) throw new Error(payload?.error || payload?.message || `接口返回 HTTP ${response.status}`);
    return payload as T;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("接口请求超时，请重新检测。可切换到 HTML 源码模式继续分析。");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function scanAdCopy(text: string) {
  const blocker: string[] = [];
  const risk: string[] = [];
  const advisory: string[] = [];
  if (!text.trim()) return { blocker, risk, advisory };
  if (/(happy\s*ending|erotic|sexual\s+service|性感技师|特殊服务|全套服务|sexy\s+girls?|nude)/i.test(text)) blocker.push("广告文案含成人或性服务暗示");
  if (/(cocaine|heroin|methamphetamine|buy\s+weed|枪支|弹药|毒品|冰毒|海洛因|可卡因)/i.test(text)) blocker.push("广告文案涉及违禁商品或服务");
  if (/(100\s*%|guaranteed|永久|根治|治愈|包治|保证见效|绝不复发|no\s+side\s+effects?|\bcure\b)/i.test(text)) blocker.push("广告文案包含保证治愈或绝对效果");
  if (/(仅剩\s*\d+|最后\s*\d+\s*个名额|倒计时|only\s+\d+\s+left|expires\s+in\s+\d+)/i.test(text)) risk.push("广告文案包含可能无法验证的紧迫营销");
  if (/(官方指定|政府认证|国家级认证|google\s+official|government\s+approved|federal\s+certified)/i.test(text)) risk.push("广告文案可能冒充官方或政府资质");
  if (/[!！]{4,}/.test(text)) advisory.push("广告文案存在过度夸张格式");
  return { blocker, risk, advisory };
}

function issueName(issue: ViolationIssue) {
  return issue.policyName || issue.finding || issue.policyCategory || "页面政策问题";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function riskClass(score: number) {
  if (score >= 70) return "text-red-400";
  if (score >= 35) return "text-amber-400";
  return "text-emerald-400";
}

export default function App() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [siteType, setSiteType] = useState<SiteType>("local_service");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [adCopy, setAdCopy] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [forensics, setForensics] = useState<ForensicsResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [forensicsError, setForensicsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const summary = useMemo<AuditSummary>(() => {
    if (!hasRun && !loading) {
      return { verdict: "等待检测", level: "idle", note: "输入落地页后开始完整审核。", score: null, blockers: [], risks: [], advisories: [] };
    }

    const issues = analysis?.detectedIssues || [];
    const findings = forensics?.findings || [];
    const copy = scanAdCopy(adCopy);
    const blockers = unique([
      ...issues.filter((item) => item.severity === "CRITICAL").map(issueName),
      ...findings.filter((item) => item.severity === "high" && item.confidence === "high").map((item) => item.title),
      ...copy.blocker,
    ]);
    const risks = unique([
      ...issues.filter((item) => item.severity === "WARNING").map(issueName),
      ...findings.filter((item) => item.severity === "medium" || (item.severity === "high" && item.confidence !== "high")).map((item) => item.title),
      ...copy.risk,
    ]);
    const advisories = unique([
      ...issues.filter((item) => item.severity === "INFO").map(issueName),
      ...findings.filter((item) => item.severity === "low").map((item) => item.title),
      ...copy.advisory,
    ]);

    const coverageIncomplete = Boolean(forensics && forensics.coverage?.complete === false);
    const incomplete = Boolean(analysisError || forensicsError || coverageIncomplete || !analysis || !forensics);
    const technicalRisk = Number(forensics?.risk?.overall || 0);
    const policyRisk = blockers.length
      ? Math.min(95, 72 + blockers.length * 7)
      : risks.length
        ? Math.min(69, 34 + risks.length * 8)
        : advisories.length
          ? Math.min(28, advisories.length * 4)
          : 5;
    const score = Math.max(technicalRisk, policyRisk);

    if (blockers.length) {
      return { verdict: "不建议提交", level: "blocked", note: "发现可验证的阻断证据，建议修复后重新检测。", score, blockers, risks, advisories };
    }
    if (incomplete) {
      return { verdict: "结果不完整，需要重试", level: "partial", note: "至少一个检测环节未完成。本次不能据此认定规避系统、被侵网站或最终审核状态。", score: null, blockers, risks, advisories };
    }
    if (risks.length) {
      return { verdict: "建议先修复再提交", level: "review", note: "没有确认的致命问题，但存在需要修复或人工核实的风险。", score, blockers, risks, advisories };
    }
    return { verdict: "页面层面可提交复核", level: "ready", note: "当前未发现明确的页面阻断证据。账户、素材、关键词和付款资料仍需保持一致。", score, blockers, risks, advisories };
  }, [adCopy, analysis, analysisError, forensics, forensicsError, hasRun, loading]);

  const levelStyles = {
    idle: "border-slate-800 text-slate-300",
    blocked: "border-red-500/40 text-red-400",
    review: "border-amber-500/40 text-amber-400",
    partial: "border-blue-500/40 text-blue-400",
    ready: "border-emerald-500/40 text-emerald-400",
  }[summary.level];

  function toggleReason(value: string) {
    setSelectedReasons((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const isRawMode = mode === "html";
    if (!isRawMode && !url.trim()) return;
    if (isRawMode && !html.trim()) return;

    setLoading(true);
    setHasRun(true);
    setAnalysis(null);
    setForensics(null);
    setAnalysisError(null);
    setForensicsError(null);

    const analyzePayload = {
      url: isRawMode ? "" : url.trim(),
      rawHtml: isRawMode ? html : "",
      isRawMode,
      siteType,
      apiSettings: null,
    };
    const forensicsPayload = {
      url: isRawMode ? "" : url.trim(),
      rawHtml: isRawMode ? html : "",
      isRawMode,
      rejectedReasons: selectedReasons,
    };

    const [analysisOutcome, forensicsOutcome] = await Promise.allSettled([
      postJson<AnalysisResponse>("/api/analyze-v2", analyzePayload, 35_000),
      postJson<ForensicsResult>("/api/forensics-v3", forensicsPayload, 22_000),
    ]);

    if (analysisOutcome.status === "fulfilled") setAnalysis(analysisOutcome.value);
    else setAnalysisError(cleanError(analysisOutcome.reason));

    if (forensicsOutcome.status === "fulfilled") setForensics(forensicsOutcome.value);
    else setForensicsError(cleanError(forensicsOutcome.reason));

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 lg:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10">
            <ShieldAlert className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">Google Ads 拒登预审与技术取证</h1>
            <p className="mt-0.5 text-[11px] text-slate-500">投放前风险预判 · 已拒登原因反查 · AdsBot User-Agent 模拟</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-12 lg:px-6">
        <section className="lg:col-span-4">
          <form onSubmit={handleSubmit} className="rounded-2xl border border-white/5 bg-slate-900/55 p-5 shadow-2xl">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <h2 className="text-sm font-bold">检测设置</h2>
            </div>

            <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-950 p-1">
              <button type="button" onClick={() => setMode("url")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${mode === "url" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>
                <Globe2 className="h-3.5 w-3.5" />在线网址
              </button>
              <button type="button" onClick={() => setMode("html")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${mode === "html" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>
                <Code2 className="h-3.5 w-3.5" />HTML 源码
              </button>
            </div>

            {mode === "url" ? (
              <div className="mb-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">落地页网址</label>
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" className="w-full rounded-xl border border-white/5 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-indigo-500" />
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">持续超时时，请切换到 HTML 源码模式。一次超时不会被认定为 AdsBot 被阻止。</p>
              </div>
            ) : (
              <div className="mb-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">页面 HTML 源码</label>
                <textarea value={html} onChange={(event) => setHtml(event.target.value)} rows={9} placeholder="粘贴完整 HTML 源码" className="w-full resize-y rounded-xl border border-white/5 bg-slate-950 p-3 font-mono text-xs leading-relaxed outline-none focus:border-indigo-500" />
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">页面业务类型</label>
              <select value={siteType} onChange={(event) => setSiteType(event.target.value as SiteType)} className="w-full rounded-xl border border-white/5 bg-slate-950 px-3 py-2.5 text-xs outline-none focus:border-indigo-500">
                <option value="local_service">线下实体店 / 本地服务</option>
                <option value="ecommerce">在线交易电商</option>
                <option value="health_nutrition">健康、保健或功效类页面</option>
              </select>
            </div>

            <div className="mb-4 rounded-xl border border-indigo-500/20 bg-indigo-950/15 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-200">Google 已显示的拒登原因</span>
                <span className="text-[9px] text-slate-500">可多选</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {REJECTION_REASONS.map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-slate-950/60 px-2.5 py-2 text-[10px] text-slate-300">
                    <input type="checkbox" checked={selectedReasons.includes(value)} onChange={() => toggleReason(value)} className="accent-indigo-500" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">广告标题、说明或关键词（选填）</label>
              <textarea value={adCopy} onChange={(event) => setAdCopy(event.target.value)} rows={4} placeholder="粘贴准备投放的广告文案" className="w-full resize-y rounded-xl border border-white/5 bg-slate-950 p-3 text-xs leading-relaxed outline-none focus:border-indigo-500" />
            </div>

            <button disabled={loading || (mode === "url" ? !url.trim() : !html.trim())} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />正在完成两项检测</> : <><FileSearch className="h-4 w-4" />开始完整检测</>}
            </button>
          </form>
        </section>

        <section className="space-y-5 lg:col-span-8">
          <div className={`rounded-2xl border bg-slate-900/45 p-5 shadow-2xl ${levelStyles}`}>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">投放前页面审核状态</div>
                <div className="mt-2 text-2xl font-black">{loading ? "正在检测" : summary.verdict}</div>
                <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-400">{loading ? "页面政策分析与技术取证正在并行执行。" : summary.note}</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-4xl font-black">{loading || summary.score == null ? "--" : Math.round(summary.score)}</div>
                <div className="mt-1 text-[9px] text-slate-500">页面审核风险 / 100</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3"><strong className="block text-xl text-red-400">{summary.blockers.length}</strong><span className="text-[9px] text-slate-500">确认阻断问题</span></div>
              <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3"><strong className="block text-xl text-amber-400">{summary.risks.length}</strong><span className="text-[9px] text-slate-500">明显风险 / 需核实</span></div>
              <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3"><strong className="block text-xl text-slate-200">{summary.advisories.length}</strong><span className="text-[9px] text-slate-500">完善建议</span></div>
            </div>

            {(summary.blockers.length > 0 || summary.risks.length > 0) && (
              <div className="mt-4 border-t border-white/5 pt-4 text-[11px] leading-relaxed text-slate-300">
                <strong>{summary.blockers.length ? "确认阻断证据：" : "优先核实："}</strong>
                {(summary.blockers.length ? summary.blockers : summary.risks).slice(0, 5).join("；")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatusCard title="页面政策分析" loading={loading} success={Boolean(analysis)} error={analysisError} />
            <StatusCard title="技术取证扫描" loading={loading} success={Boolean(forensics)} error={forensicsError} />
          </div>

          {forensics && (
            <section className="rounded-2xl border border-white/5 bg-slate-900/45 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-indigo-400" />技术取证结果</h2>
                  <p className="mt-1 text-[10px] text-slate-500">公开网页黑盒扫描；AdsBot 仅为 User-Agent 模拟。</p>
                </div>
                <span className={`rounded-full border border-white/5 bg-slate-950 px-3 py-1 text-xs font-black ${riskClass(forensics.risk.overall)}`}>综合风险 {forensics.risk.overall}</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <RiskBox label="规避系统" value={forensics.risk.circumventingSystems} />
                <RiskBox label="被侵网站" value={forensics.risk.compromisedSite} />
                <RiskBox label="目标网页" value={forensics.risk.destinationExperience} />
              </div>

              {forensics.coverage?.note && (
                <div className={`mt-4 rounded-xl border p-3 text-[10px] leading-relaxed ${forensics.coverage.complete === false ? "border-blue-500/20 bg-blue-950/20 text-blue-300" : "border-emerald-500/20 bg-emerald-950/15 text-emerald-300"}`}>
                  {forensics.coverage.note}
                </div>
              )}

              <div className="mt-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-300">证据与处理顺序（{forensics.findings.length}）</h3>
                {forensics.findings.length ? forensics.findings.map((item) => (
                  <details key={`${item.id}-${item.source}`} className="group rounded-xl border border-white/5 bg-slate-950/45 p-3">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold text-slate-200">{item.title}</div>
                        <div className="mt-1 text-[9px] text-slate-500">{item.source}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[8px] font-bold ${item.severity === "high" ? "bg-red-500/10 text-red-400" : item.severity === "medium" ? "bg-amber-500/10 text-amber-400" : "bg-slate-800 text-slate-400"}`}>{item.severity === "high" ? "高风险" : item.severity === "medium" ? "需核实" : "线索"}</span>
                    </summary>
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-slate-400">
                      <p><strong className="text-slate-300">证据：</strong>{item.evidence}</p>
                      <p><strong className="text-slate-300">处理：</strong>{item.recommendation}</p>
                    </div>
                  </details>
                )) : <div className="rounded-xl border border-dashed border-white/10 p-4 text-[10px] text-slate-500">未发现明显的 AdsBot 差异、隐藏跳转或高危公开脚本。</div>}
              </div>

              {forensics.profiles?.length > 0 && (
                <details className="mt-5 rounded-xl border border-white/5 bg-slate-950/35">
                  <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-[11px] font-bold text-slate-300">访问身份对比 <ChevronDown className="h-4 w-4 text-slate-500" /></summary>
                  <div className="overflow-x-auto border-t border-white/5">
                    <table className="min-w-[720px] w-full text-left text-[9px]">
                      <thead className="text-slate-500"><tr><th className="p-3">身份</th><th className="p-3">状态</th><th className="p-3">最终网址</th><th className="p-3">标题 / 错误</th><th className="p-3">跳转</th></tr></thead>
                      <tbody>{forensics.profiles.map((profile) => (
                        <tr key={profile.id} className="border-t border-white/5 text-slate-300"><td className="p-3">{profile.label}</td><td className="p-3">{profile.status ? `HTTP ${profile.status}` : "未完成"}</td><td className="max-w-[260px] break-all p-3">{profile.finalUrl}</td><td className="max-w-[260px] p-3">{profile.error || profile.title || `正文 ${profile.visibleTextLength || 0} 字符`}</td><td className="p-3">{profile.redirectChain?.length || 0}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>
          )}

          {analysis && (
            <section className="rounded-2xl border border-white/5 bg-slate-900/45 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold"><FileSearch className="h-4 w-4 text-indigo-400" />页面政策问题</h2>
                  <p className="mt-1 text-[10px] text-slate-500">致命问题、明显风险和完善建议分开显示，不再只保留 CRITICAL。</p>
                </div>
                <span className="rounded-full border border-white/5 bg-slate-950 px-3 py-1 text-xs font-bold text-slate-300">{analysis.detectedIssues.length} 项</span>
              </div>

              <div className="mt-4 space-y-3">
                {analysis.detectedIssues.length ? analysis.detectedIssues.map((issue) => (
                  <details key={issue.id} className="rounded-xl border border-white/5 bg-slate-950/45 p-4">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-100">{issue.policyName}</div>
                        <div className="mt-1 text-[9px] text-slate-500">{issue.policyCategory}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[8px] font-bold ${issue.severity === "CRITICAL" ? "bg-red-500/10 text-red-400" : issue.severity === "WARNING" ? "bg-amber-500/10 text-amber-400" : "bg-blue-500/10 text-blue-300"}`}>{issue.severity === "CRITICAL" ? "确认阻断" : issue.severity === "WARNING" ? "需修复 / 核实" : "完善建议"}</span>
                    </summary>
                    <div className="mt-4 space-y-3 border-t border-white/5 pt-4 text-[10px] leading-relaxed text-slate-400">
                      <p><strong className="text-slate-200">发现：</strong>{issue.finding}</p>
                      <p><strong className="text-slate-200">原因：</strong>{issue.reason}</p>
                      <p><strong className="text-slate-200">位置：</strong>{issue.whereToFix}</p>
                      {issue.offendingElement && <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/10 bg-red-950/10 p-3 font-mono text-[9px] text-red-100/80">{issue.offendingElement}</pre>}
                      <div className="rounded-lg border border-emerald-500/10 bg-emerald-950/10 p-3 text-emerald-100/80">{issue.suggestedCode || issue.suggestion}</div>
                      <button type="button" onClick={() => copyText(issue.id, issue.suggestedCode || issue.suggestion)} className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-slate-900 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-800">
                        {copiedId === issue.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Clipboard className="h-3.5 w-3.5" />}
                        {copiedId === issue.id ? "已复制" : "复制修改建议"}
                      </button>
                    </div>
                  </details>
                )) : <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-[11px] text-slate-500">未发现明确的页面政策问题。</div>}
              </div>
            </section>
          )}

          {!hasRun && !loading && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/20 p-10 text-center">
              <ShieldCheck className="mx-auto h-9 w-9 text-indigo-400" />
              <h2 className="mt-4 text-sm font-bold">一次提交，同时执行两类检测</h2>
              <p className="mx-auto mt-2 max-w-lg text-[11px] leading-relaxed text-slate-500">技术取证检查 AdsBot 模拟、跳转、脚本和 robots.txt；页面政策分析检查广告内容、商业透明度和目标网页要求。</p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-white/5 px-4 py-5 text-center text-[9px] text-slate-600">本工具提供公开页面风险线索，不代表 Google 官方审核结论。</footer>
    </div>
  );
}

function StatusCard({ title, loading, success, error }: { title: string; loading: boolean; success: boolean; error: string | null }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 text-xs font-bold">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> : success ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : error ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <RefreshCw className="h-4 w-4 text-slate-500" />}
        {title}
      </div>
      <p className={`mt-2 text-[10px] leading-relaxed ${error ? "text-red-300" : "text-slate-500"}`}>{loading ? "正在运行..." : success ? "已完成" : error || "等待开始"}</p>
    </div>
  );
}

function RiskBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
      <div className="text-[9px] text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-black ${riskClass(value)}`}>{value}</div>
    </div>
  );
}
