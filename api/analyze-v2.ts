import { GoogleGenAI } from "@google/genai";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const config = { maxDuration: 30 };

const MAX_PAGE_CHARS = 120_000;
const FETCH_TIMEOUT_MS = 6_000;

type Severity = "CRITICAL" | "WARNING" | "INFO";

type Issue = {
  id: string;
  policyCategory: string;
  policyName: string;
  severity: Severity;
  finding: string;
  offendingElement: string;
  reason: string;
  suggestion: string;
  whereToFix: string;
  suggestedCode?: string;
};

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof (timer as any).unref === "function") (timer as any).unref();
  return controller.signal;
}

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string): boolean {
  const value = ip.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff")
  );
}

async function normalizePublicUrl(value: unknown): Promise<URL> {
  let text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  const url = new URL(text);
  if (!/^https?:$/.test(url.protocol)) throw new Error("只支持 HTTP 或 HTTPS 网页地址。");
  if (url.username || url.password) throw new Error("网址不能包含用户名或密码。");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("只允许标准的 80/443 端口。");

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("禁止分析 localhost 或局域网地址。");
  }
  if (isIP(host)) {
    const blocked = isIP(host) === 4 ? isPrivateIpv4(host) : isPrivateIpv6(host);
    if (blocked) throw new Error("禁止分析内网、回环或保留 IP 地址。");
  } else {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length) throw new Error("域名没有可用的 DNS 解析记录。");
    if (records.some((record) => (record.family === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address)))) {
      throw new Error("域名解析到了内网或保留 IP，已停止分析。");
    }
  }
  url.hash = "";
  return url;
}

function cleanForPolicy(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .slice(0, MAX_PAGE_CHARS);
}

async function fetchPage(value: unknown): Promise<{ url: string; html: string }> {
  const url = await normalizePublicUrl(value);
  const response = await fetch(url, {
    redirect: "follow",
    signal: timeoutSignal(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.5",
      "Cache-Control": "no-cache",
    },
  });
  if (!response.ok) throw new Error(`目标网页返回 HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`目标网址返回的不是网页内容：${contentType}`);
  }
  return { url: response.url || url.toString(), html: cleanForPolicy(await response.text()) };
}

function robustJsonParse(text: string): any {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim());
    } catch {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("AI 未返回有效的 JSON 结果。");
}

function siteTypeLabel(siteType: string): string {
  if (siteType === "ecommerce") return "线上直接交易电商";
  if (siteType === "health_nutrition") return "健康、保健或功效类页面";
  return "线下实体店或本地服务页面";
}

function buildPrompt(html: string, siteType: string): string {
  return `
你是一名严谨的 Google Ads 落地页政策审计员。请分析下面网页，但必须区分“直接阻断问题”“明显风险”和“优化建议”，不要为了显得严格而夸大。

页面类型：${siteTypeLabel(siteType)}

分级标准：
1. CRITICAL：有明确页面证据，足以直接导致拒登或严重政策问题。例如目标页不可用、明确 cloaking/规避系统、钓鱼或恶意数据窃取、违禁商品或服务、冒充官方、虚假资质、保证治愈/100%见效等严重欺骗性承诺。
2. WARNING：可能影响审核，需要修复或人工核实，但不能断言一定拒登。
3. INFO：商业透明度或页面完善建议，不计为致命违规。

重要校准规则：
- 缺少 Terms of Service、邮箱、体验效果因人而异声明、退款政策，不得单独判为 CRITICAL。
- 线下实体店没有在线购物时，缺少退款/配送政策通常只是 INFO。
- 缺少隐私政策：只有页面实际采集姓名、电话、邮箱等个人信息时才列为 WARNING；没有表单时最多 INFO。
- 地址或电话不完整通常是 WARNING；只有存在虚构、冒充、矛盾信息或明显隐藏主体时才可判 CRITICAL。
- 不得把普通营销文案、正常第三方预约服务、普通 JavaScript、正常统计代码写成规避系统或被侵网站。
- 不得臆造页面中不存在的内容。每个 CRITICAL 必须给出具体页面文本、HTML 元素或可验证证据。
- policyName、finding、reason、suggestion、whereToFix 必须使用简体中文，不要输出泛化英文标签。

请返回纯 JSON，结构必须为：
{
  "isCompliant": boolean,
  "complianceScore": 0-100,
  "detectedIssues": [
    {
      "id": "string",
      "policyCategory": "string",
      "policyName": "string",
      "severity": "CRITICAL|WARNING|INFO",
      "finding": "string",
      "offendingElement": "string",
      "reason": "string",
      "suggestion": "string",
      "whereToFix": "string",
      "suggestedCode": "string"
    }
  ],
  "legalPages": {
    "hasPrivacyPolicy": boolean,
    "hasTermsOfService": boolean,
    "hasRefundPolicy": boolean,
    "hasContactInfo": boolean,
    "privacyPolicyUri": "string",
    "termsOfServiceUri": "string",
    "refundPolicyUri": "string",
    "contactInfoDetails": "string"
  },
  "generalRecommendations": ["string"]
}

网页 HTML：
\`\`\`html
${html.slice(0, 90_000)}
\`\`\`
`;
}

async function callAi(prompt: string, settings: any): Promise<any> {
  const apiKey = String(settings?.apiKey || process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("服务器未配置 GEMINI_API_KEY，请在 Vercel 环境变量或页面 API 配置中填写可用密钥。");
  }

  const apiType = String(settings?.apiType || "gemini-native");
  const baseUrl = String(settings?.baseUrl || "").trim();
  const model = String(settings?.model || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim();

  if (apiType === "openai" || baseUrl) {
    const endpoint = `${(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      signal: timeoutSignal(25_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: [
          {
            role: "system",
            content: "你是严谨的 Google Ads 落地页审计员。只输出有效 JSON，不夸大缺少普通页面信息的风险。",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`自定义 AI 接口返回 HTTP ${response.status}: ${raw.slice(0, 300)}`);
    const payload = JSON.parse(raw);
    return robustJsonParse(payload?.choices?.[0]?.message?.content || "");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: "你是严谨的 Google Ads 落地页审计员。必须基于页面证据分级，缺少邮箱、Terms 或免责声明不能单独判为致命违规。",
      responseMimeType: "application/json",
    },
  });
  return robustJsonParse(response.text || "{}");
}

function normalizeSeverity(value: unknown): Severity {
  const text = String(value || "").toUpperCase();
  if (text === "CRITICAL" || text === "BLOCKER") return "CRITICAL";
  if (text === "WARNING" || text === "RISK") return "WARNING";
  return "INFO";
}

function normalizeIssue(raw: any, index: number, hasPersonalDataForm: boolean): Issue {
  const issue: Issue = {
    id: String(raw?.id || `issue-${index + 1}`),
    policyCategory: String(raw?.policyCategory || "页面审核"),
    policyName: String(raw?.policyName || raw?.finding || "需要核实的问题"),
    severity: normalizeSeverity(raw?.severity),
    finding: String(raw?.finding || ""),
    offendingElement: String(raw?.offendingElement || ""),
    reason: String(raw?.reason || ""),
    suggestion: String(raw?.suggestion || ""),
    whereToFix: String(raw?.whereToFix || ""),
    suggestedCode: String(raw?.suggestedCode || ""),
  };

  const combined = `${issue.policyName} ${issue.finding} ${issue.reason}`.toLowerCase();
  const missingTerms = /(missing|缺少|没有).{0,20}(terms|服务条款|用户协议)/i.test(combined);
  const missingEmail = /(missing|缺少|没有).{0,20}(email|邮箱|电子邮件)/i.test(combined);
  const missingDisclaimer = /(missing|缺少|没有).{0,30}(disclaimer|免责声明|效果因人而异|results vary)/i.test(combined);
  const missingRefund = /(missing|缺少|没有).{0,20}(refund|return|退款|退货|配送)/i.test(combined);
  const missingPrivacy = /(missing|缺少|没有).{0,20}(privacy|隐私政策)/i.test(combined);
  const missingContact = /(missing|缺少|没有).{0,20}(address|phone|地址|电话|联系信息)/i.test(combined);

  if (missingTerms || missingEmail || missingDisclaimer || missingRefund) issue.severity = "INFO";
  if (missingPrivacy) issue.severity = hasPersonalDataForm ? "WARNING" : "INFO";
  if (missingContact && issue.severity === "CRITICAL" && !/(虚构|冒充|伪造|矛盾|欺骗|fake|impersonat)/i.test(combined)) {
    issue.severity = "WARNING";
  }

  return issue;
}

function normalizeResult(raw: any, sourceUrl: string, html: string) {
  const hasPersonalDataForm = /<form\b/i.test(html) && /(name|email|phone|tel|姓名|邮箱|电话)/i.test(html);
  const inputIssues = Array.isArray(raw?.detectedIssues) ? raw.detectedIssues : [];
  const map = new Map<string, Issue>();

  inputIssues.forEach((item: any, index: number) => {
    const issue = normalizeIssue(item, index, hasPersonalDataForm);
    const key = `${issue.policyName}|${issue.offendingElement}|${issue.severity}`.replace(/\s+/g, " ").trim();
    if (!map.has(key)) map.set(key, issue);
  });

  const issues = [...map.values()];
  const blockerCount = issues.filter((item) => item.severity === "CRITICAL").length;
  const riskCount = issues.filter((item) => item.severity === "WARNING").length;
  const advisoryCount = issues.filter((item) => item.severity === "INFO").length;
  const weightedRisk = Math.min(95, blockerCount * 30 + riskCount * 9 + advisoryCount * 2);
  const complianceScore = Math.max(5, 100 - weightedRisk);

  return {
    url: sourceUrl,
    isCompliant: blockerCount === 0,
    complianceScore,
    detectedIssues: issues,
    legalPages: {
      hasPrivacyPolicy: Boolean(raw?.legalPages?.hasPrivacyPolicy),
      hasTermsOfService: Boolean(raw?.legalPages?.hasTermsOfService),
      hasRefundPolicy: Boolean(raw?.legalPages?.hasRefundPolicy),
      hasContactInfo: Boolean(raw?.legalPages?.hasContactInfo),
      privacyPolicyUri: String(raw?.legalPages?.privacyPolicyUri || ""),
      termsOfServiceUri: String(raw?.legalPages?.termsOfServiceUri || ""),
      refundPolicyUri: String(raw?.legalPages?.refundPolicyUri || ""),
      contactInfoDetails: String(raw?.legalPages?.contactInfoDetails || ""),
    },
    generalRecommendations: Array.isArray(raw?.generalRecommendations)
      ? raw.generalRecommendations.map(String).slice(0, 10)
      : [],
    auditSummary: {
      status: blockerCount > 0 ? "BLOCKED" : riskCount > 0 ? "NEEDS_REVIEW" : "READY_FOR_REVIEW",
      blockerCount,
      riskCount,
      advisoryCount,
      note: "缺少邮箱、Terms、退款政策或体验免责声明不会被单独计算为致命拒登问题。",
    },
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const isRawMode = Boolean(body.isRawMode);
    let html = "";
    let sourceUrl = "直接粘贴输入";

    if (isRawMode) {
      html = cleanForPolicy(String(body.rawHtml || ""));
      if (!html.trim()) return res.status(400).json({ error: "未检测到可供分析的 HTML 内容。" });
    } else {
      if (!body.url) return res.status(400).json({ error: "请输入需要检测的网址。" });
      const page = await fetchPage(body.url);
      html = page.html;
      sourceUrl = page.url;
    }

    const raw = await callAi(buildPrompt(html, String(body.siteType || "local_service")), body.apiSettings || {});
    return res.status(200).json(normalizeResult(raw, sourceUrl, html));
  } catch (error: any) {
    const message = error?.name === "AbortError" ? "页面或 AI 接口请求超时，请稍后重试。" : error?.message || "广告页面分析失败。";
    return res.status(500).json({ error: message });
  }
}
