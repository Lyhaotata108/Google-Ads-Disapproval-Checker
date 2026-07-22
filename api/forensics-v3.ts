import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const config = { maxDuration: 15 };

const FETCH_TIMEOUT_MS = 3_500;
const PROFILE_BUDGET_MS = 7_000;
const MAX_REDIRECTS = 3;
const MAX_HTML_CHARS = 260_000;

type Severity = "high" | "medium" | "low";
type Confidence = "high" | "medium" | "low";

type Finding = {
  id: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  recommendation: string;
  relatedReasons: string[];
  source: string;
};

type RedirectHop = { url: string; status: number; location?: string };

type Profile = {
  id: string;
  label: string;
  initialUrl: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  contentType: string;
  title: string;
  htmlLength: number;
  visibleTextLength: number;
  contentHash: string;
  redirectChain: RedirectHop[];
  externalDomains: string[];
  suspiciousSignals: Finding[];
  visibleText?: string;
  error?: string;
};

const REASON_LABELS: Record<string, string> = {
  circumventing_systems: "规避系统",
  compromised_site: "被侵网站",
  malicious_software: "恶意软件",
  destination_not_working: "目标网页无法正常运行",
  destination_mismatch: "目标网页不匹配",
  misrepresentation: "虚假陈述",
  unacceptable_business: "不可接受的商业行为",
  adsbot_access: "AdsBot 无法抓取",
  other: "其他",
};

const PROFILES = [
  {
    id: "browser_desktop",
    label: "普通桌面访客",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
  {
    id: "browser_mobile",
    label: "普通手机访客",
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
  {
    id: "adsbot_desktop",
    label: "AdsBot User-Agent 模拟（桌面）",
    userAgent: "AdsBot-Google (+http://www.google.com/adsbot.html)",
  },
  {
    id: "adsbot_mobile",
    label: "AdsBot User-Agent 模拟（手机）",
    userAgent: "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)",
  },
] as const;

const TRUSTED_SUFFIXES = [
  "google.com", "googleapis.com", "gstatic.com", "googletagmanager.com", "google-analytics.com",
  "doubleclick.net", "cloudflare.com", "cloudflareinsights.com", "jquery.com", "jsdelivr.net",
  "unpkg.com", "stripe.com", "paypal.com", "facebook.net", "clarity.ms", "hotjar.com",
  "wordpress.com", "wp.com", "wpengine.com", "calendly.com", "squarecdn.com", "wixstatic.com",
  "squarespace.com", "elementor.com",
];

function abortSignal(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof (timer as any).unref === "function") (timer as any).unref();
  return controller.signal;
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isPrivateIpv6(ip: string) {
  const value = ip.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

function normalizeUrl(value: unknown) {
  let text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  const url = new URL(text);
  if (!/^https?:$/.test(url.protocol)) throw new Error("只支持 HTTP 或 HTTPS 网页地址。");
  if (url.username || url.password) throw new Error("网址不能包含用户名或密码。");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("只允许标准的 80/443 端口。");
  url.hash = "";
  return url;
}

async function assertPublicUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("禁止扫描 localhost 或局域网地址。");
  }
  if (isIP(hostname)) {
    if (isIP(hostname) === 4 ? isPrivateIpv4(hostname) : isPrivateIpv6(hostname)) {
      throw new Error("禁止扫描内网、回环或保留 IP 地址。");
    }
    return;
  }
  const records = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS 查询超时")), 1_500)),
  ]);
  if (!records.length) throw new Error("域名没有可用的 DNS 解析记录。");
  if (records.some((record) => record.family === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address))) {
    throw new Error("域名解析到了内网或保留 IP，已停止扫描。");
  }
}

function trustedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return TRUSTED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function truncate(value: string, max = 320) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function visibleText(html: string) {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 120_000);
}

function titleOf(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? truncate(decodeEntities(match[1]), 180) : "";
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function resolveHttpUrl(value: string, base: URL): URL | null {
  try {
    if (!value.trim() || /^(data:|javascript:|mailto:|tel:|#)/i.test(value.trim())) return null;
    const url = new URL(value.trim(), base);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function externalDomains(html: string, base: URL) {
  const all = new Set<string>();
  const unknownScripts = new Set<string>();
  let match: RegExpExecArray | null;
  const attr = /\b(?:src|href|action)\s*=\s*["']([^"']+)["']/gi;
  while ((match = attr.exec(html))) {
    const url = resolveHttpUrl(match[1], base);
    if (!url || url.hostname === base.hostname) continue;
    all.add(url.hostname.toLowerCase());
  }
  const scripts = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = scripts.exec(html))) {
    const url = resolveHttpUrl(match[1], base);
    if (url && url.hostname !== base.hostname && !trustedHost(url.hostname)) unknownScripts.add(url.hostname.toLowerCase());
  }
  return { all: [...all].sort(), unknownScripts: [...unknownScripts].sort() };
}

function scriptBodies(html: string) {
  const chunks: string[] = [];
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) if (match[1]) chunks.push(match[1]);
  return chunks.join("\n").slice(0, 220_000);
}

function staticFindings(html: string, base: URL, source: string): Finding[] {
  const findings: Finding[] = [];
  const scripts = scriptBodies(html);
  const domains = externalDomains(html, base);
  const add = (finding: Omit<Finding, "source">) => findings.push({ ...finding, source });

  const dynamic = scripts.match(/.{0,100}(?:\beval\s*\(|\bnew\s+Function\s*\().{0,180}/i);
  const obfuscated = /\batob\s*\(|String\.fromCharCode\s*\(|(?:\\x[0-9a-f]{2}){8,}|[A-Za-z0-9+/]{360,}={0,2}/i.test(scripts);
  const network = /\b(fetch|sendBeacon|XMLHttpRequest|WebSocket)\s*\(/i.test(scripts);
  if (dynamic) {
    add({
      id: "dynamic-execution",
      title: "发现动态 JavaScript 执行",
      severity: obfuscated || network ? "high" : "medium",
      confidence: obfuscated || network ? "high" : "medium",
      evidence: truncate(dynamic[0]),
      recommendation: "定位 eval 或 new Function 的来源。若同时存在混淆或外部请求，应优先隔离并检查最近修改的主题、插件和文件。",
      relatedReasons: ["compromised_site", "malicious_software", "circumventing_systems"],
    });
  } else if (obfuscated) {
    add({
      id: "obfuscated-script",
      title: "发现需要核实的编码或混淆脚本",
      severity: "medium",
      confidence: "medium",
      evidence: "内联脚本包含 atob、String.fromCharCode、连续十六进制转义或超长 Base64 字符串。",
      recommendation: "确认脚本是否由可信主题、统计或预约插件生成。仅凭编码形式不能认定网站被侵。",
      relatedReasons: ["compromised_site", "malicious_software"],
    });
  }

  const iframe = html.match(/<iframe\b(?=[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|width\s*=\s*["']?0|height\s*=\s*["']?0))[^>]*>/i);
  if (iframe) {
    const src = iframe[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const target = src ? resolveHttpUrl(src, base) : null;
    const unknownExternal = Boolean(target && target.hostname !== base.hostname && !trustedHost(target.hostname));
    add({
      id: "hidden-iframe",
      title: "发现隐藏 iframe",
      severity: unknownExternal ? "high" : "medium",
      confidence: unknownExternal ? "high" : "medium",
      evidence: truncate(iframe[0]),
      recommendation: "确认 iframe 的目标与用途。指向未知外部域名的隐藏 iframe 应优先移除并排查注入来源。",
      relatedReasons: ["compromised_site", "malicious_software", "circumventing_systems"],
    });
  }

  const meta = html.match(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (meta) {
    const destination = meta[1].match(/url\s*=\s*(.+)$/i)?.[1]?.trim() || "";
    const target = destination ? resolveHttpUrl(destination, base) : null;
    const crossDomain = Boolean(target && target.origin !== base.origin);
    add({
      id: "meta-refresh",
      title: "发现自动 Meta Refresh 跳转",
      severity: crossDomain ? "high" : "medium",
      confidence: "high",
      evidence: truncate(meta[0]),
      recommendation: "广告最终网址应直接打开真实落地页。删除不必要的自动跳转，并核对跨域目标是否与广告展示网址一致。",
      relatedReasons: ["circumventing_systems", "destination_mismatch", "compromised_site"],
    });
  }

  const cookieRead = /document\.cookie/i.test(scripts);
  if (cookieRead && network && domains.unknownScripts.length) {
    add({
      id: "possible-cookie-exfiltration",
      title: "发现 Cookie 读取与未知外部请求组合",
      severity: "high",
      confidence: "high",
      evidence: `未知脚本域名：${domains.unknownScripts.join(", ")}`,
      recommendation: "核对数据发送目标，移除未经授权的脚本，并检查 WordPress 主题、插件、数据库和管理员账号。",
      relatedReasons: ["compromised_site", "malicious_software"],
    });
  }

  if (domains.unknownScripts.length) {
    add({
      id: "unknown-script-domains",
      title: "发现未列入常见可信清单的外部脚本域名",
      severity: "low",
      confidence: "low",
      evidence: domains.unknownScripts.join(", "),
      recommendation: "逐个确认外部脚本用途。陌生域名本身不能证明网站被侵。",
      relatedReasons: [],
    });
  }

  return findings;
}

async function fetchTrace(input: URL, userAgent: string) {
  const deadline = Date.now() + PROFILE_BUDGET_MS;
  let current = new URL(input.toString());
  const redirectChain: RedirectHop[] = [];
  for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 400) throw new Error("抓取超过本次扫描时间预算");
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: abortSignal(Math.min(FETCH_TIMEOUT_MS, remaining)),
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.5",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.google.com/",
      },
    });
    const location = response.headers.get("location") || undefined;
    redirectChain.push({ url: current.toString(), status: response.status, location });
    if (response.status >= 300 && response.status < 400 && location) {
      if (index === MAX_REDIRECTS) throw new Error(`跳转超过 ${MAX_REDIRECTS} 次`);
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current, redirectChain };
  }
  throw new Error("无法完成跳转链检测");
}

async function scanProfile(input: URL, definition: typeof PROFILES[number]): Promise<Profile> {
  try {
    const { response, finalUrl, redirectChain } = await fetchTrace(input, definition.userAgent);
    const contentType = response.headers.get("content-type") || "";
    const raw = (await response.text()).slice(0, MAX_HTML_CHARS);
    const text = visibleText(raw);
    const domains = externalDomains(raw, finalUrl);
    return {
      id: definition.id,
      label: definition.label,
      initialUrl: input.toString(),
      finalUrl: finalUrl.toString(),
      status: response.status,
      ok: response.ok && (!contentType || /text\/html|application\/xhtml\+xml/i.test(contentType)),
      contentType,
      title: titleOf(raw),
      htmlLength: raw.length,
      visibleTextLength: text.length,
      contentHash: hash(text),
      redirectChain,
      externalDomains: domains.all,
      suspiciousSignals: staticFindings(raw, finalUrl, definition.label),
      visibleText: text,
    };
  } catch (error: any) {
    return {
      id: definition.id,
      label: definition.label,
      initialUrl: input.toString(),
      finalUrl: input.toString(),
      status: null,
      ok: false,
      contentType: "",
      title: "",
      htmlLength: 0,
      visibleTextLength: 0,
      contentHash: "",
      redirectChain: [],
      externalDomains: [],
      suspiciousSignals: [],
      error: error?.name === "AbortError" ? "抓取超时" : error?.message || "抓取失败",
    };
  }
}

function tokenSet(text: string) {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((token) => token.length > 1).slice(0, 8_000));
}

function similarity(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function explicitBlockedStatus(status: number | null) {
  return status !== null && ([401, 403, 404, 410, 429, 451].includes(status) || status >= 500);
}

function pairComparison(browser: Profile | undefined, bot: Profile | undefined, source: string): Finding[] {
  if (!browser || !bot || !browser.ok || !bot.status) return [];
  const findings: Finding[] = [];
  if (explicitBlockedStatus(bot.status)) {
    findings.push({
      id: `adsbot-explicit-block-${source}`,
      title: "普通访客正常，但 AdsBot 模拟返回明确错误状态",
      severity: "medium",
      confidence: "high",
      source,
      evidence: `${browser.label}: HTTP ${browser.status}；${bot.label}: HTTP ${bot.status}`,
      recommendation: "检查 Cloudflare/WAF、防爬插件、服务器规则和 robots.txt。单个访问身份的一次错误先复测，稳定复现后再按阻断处理。",
      relatedReasons: ["adsbot_access", "destination_not_working", "circumventing_systems"],
    });
    return findings;
  }
  if (!bot.ok) return findings;
  const browserUrl = new URL(browser.finalUrl);
  const botUrl = new URL(bot.finalUrl);
  if (browserUrl.origin !== botUrl.origin) {
    findings.push({
      id: `origin-mismatch-${source}`,
      title: "普通访客与 AdsBot 模拟最终进入不同域名",
      severity: "high",
      confidence: "high",
      source,
      evidence: `${browser.finalUrl}；${bot.finalUrl}`,
      recommendation: "检查按 User-Agent、来源、广告参数、地区或 IP 执行的跳转规则。",
      relatedReasons: ["circumventing_systems", "destination_mismatch", "compromised_site"],
    });
  } else if (`${browserUrl.pathname}${browserUrl.search}` !== `${botUrl.pathname}${botUrl.search}`) {
    findings.push({
      id: `path-mismatch-${source}`,
      title: "普通访客与 AdsBot 模拟最终路径不同",
      severity: "medium",
      confidence: "medium",
      source,
      evidence: `${browserUrl.pathname}${browserUrl.search}；${botUrl.pathname}${botUrl.search}`,
      recommendation: "核对服务器重写和广告参数处理，确认差异不是专门针对抓取器的页面替换。",
      relatedReasons: ["circumventing_systems", "destination_mismatch"],
    });
  }
  if (browser.visibleTextLength >= 500 && bot.visibleTextLength >= 500) {
    const score = similarity(browser.visibleText || "", bot.visibleText || "");
    const ratio = Math.max(browser.visibleTextLength, bot.visibleTextLength) / Math.max(1, Math.min(browser.visibleTextLength, bot.visibleTextLength));
    if (score < 0.25 && ratio > 2.2) {
      findings.push({
        id: `content-cloaking-${source}`,
        title: "普通访客与 AdsBot 模拟页面正文差异极大",
        severity: "high",
        confidence: "high",
        source,
        evidence: `正文相似度 ${(score * 100).toFixed(1)}%；文本长度 ${browser.visibleTextLength} vs ${bot.visibleTextLength}`,
        recommendation: "确认是否按 User-Agent、设备、来源或广告参数返回不同业务内容。",
        relatedReasons: ["circumventing_systems", "compromised_site"],
      });
    } else if (score < 0.45 && ratio > 1.6) {
      findings.push({
        id: `content-difference-${source}`,
        title: "普通访客与 AdsBot 模拟页面内容存在明显差异",
        severity: "medium",
        confidence: "medium",
        source,
        evidence: `正文相似度 ${(score * 100).toFixed(1)}%；文本长度 ${browser.visibleTextLength} vs ${bot.visibleTextLength}`,
        recommendation: "人工核对差异是否仅来自响应式布局、Cookie 横幅或动态组件。",
        relatedReasons: ["circumventing_systems"],
      });
    }
  }
  return findings;
}

function dedupeFindings(input: Finding[]) {
  const map = new Map<string, Finding>();
  for (const finding of input) {
    const key = `${finding.id}|${finding.evidence.replace(/\s+/g, " ").trim()}`;
    const existing = map.get(key);
    if (!existing) map.set(key, { ...finding });
    else existing.source = [...new Set(`${existing.source}、${finding.source}`.split("、").filter(Boolean))].join("、");
  }
  const rank = { high: 3, medium: 2, low: 1 };
  return [...map.values()].sort((a, b) => rank[b.severity] - rank[a.severity]);
}

function categoryRisk(findings: Finding[], reason: string) {
  const matched = findings.filter((item) => item.relatedReasons.includes(reason));
  if (!matched.length) return 0;
  const values = matched.map((item) => item.severity === "high" && item.confidence === "high" ? 82 :
    item.severity === "high" ? 68 : item.severity === "medium" && item.confidence === "high" ? 48 :
      item.severity === "medium" ? 34 : 8);
  return Math.min(100, Math.max(...values));
}

function parseRobots(text: string, agent: string) {
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || !line.includes(":")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && key === "disallow") current.disallow.push(value);
    else if (current && key === "allow") current.allow.push(value);
  }
  const normalized = agent.toLowerCase();
  const matching = groups.filter((group) => group.agents.some((candidate) => candidate === "*" || normalized.includes(candidate)));
  const blocked = matching.some((group) => group.disallow.some((rule) => rule === "/" || rule === "/*"));
  const allowed = matching.some((group) => group.allow.some((rule) => rule === "/" || rule === "/*"));
  return blocked && !allowed;
}

async function scanRobots(input: URL) {
  const robotsUrl = new URL("/robots.txt", input.origin);
  try {
    await assertPublicUrl(robotsUrl);
    const response = await fetch(robotsUrl, { signal: abortSignal(3_500), headers: { "User-Agent": PROFILES[2].userAgent } });
    const text = (await response.text()).slice(0, 80_000);
    const blockedAgents = ["AdsBot-Google", "AdsBot-Google-Mobile", "Googlebot"].filter((agent) => parseRobots(text, agent));
    return {
      url: robotsUrl.toString(), status: response.status, blockedAgents,
      evidence: blockedAgents.length ? `robots.txt 对 ${blockedAgents.join(", ")} 设置了根路径禁止抓取。` : "未发现 robots.txt 禁止 AdsBot/Googlebot 访问根路径。",
    };
  } catch (error: any) {
    return { url: robotsUrl.toString(), status: null, blockedAgents: [], evidence: "robots.txt 未完成检测，本项不计入风险。", error: error?.name === "AbortError" ? "抓取超时" : error?.message || "抓取失败" };
  }
}

function normalizeReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((item) => Object.prototype.hasOwnProperty.call(REASON_LABELS, item)))];
}

function publicProfile(profile: Profile) {
  const { visibleText: _visibleText, ...safe } = profile;
  return safe;
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
    const requestedReasons = normalizeReasons(body.rejectedReasons);

    if (body.isRawMode) {
      const html = String(body.rawHtml || "").slice(0, 500_000);
      if (!html.trim()) return res.status(400).json({ error: "请提供需要检测的 HTML 源码。" });
      const base = new URL("https://local-html-input.invalid/");
      const text = visibleText(html);
      const findings = dedupeFindings(staticFindings(html, base, "粘贴的 HTML 源码"));
      const compromisedSite = categoryRisk(findings, "compromised_site");
      const circumventingSystems = categoryRisk(findings, "circumventing_systems");
      const destinationExperience = categoryRisk(findings, "destination_not_working");
      return res.status(200).json({
        url: "直接粘贴的 HTML 源码", scannedAt: new Date().toISOString(), requestedReasons,
        requestedReasonLabels: requestedReasons.map((item) => REASON_LABELS[item]), mode: "raw_html",
        risk: { overall: Math.max(compromisedSite, circumventingSystems, destinationExperience), compromisedSite, circumventingSystems, destinationExperience },
        profiles: [{ id: "raw_html", label: "粘贴的 HTML 源码", initialUrl: "", finalUrl: "", status: null, ok: true, contentType: "text/html", title: titleOf(html), htmlLength: html.length, visibleTextLength: text.length, contentHash: hash(text), redirectChain: [], externalDomains: externalDomains(html, base).all, suspiciousSignals: findings }],
        robots: null, externalDomains: externalDomains(html, base).all, findings,
        coverage: { completedProfiles: 1, totalProfiles: 1, complete: true, note: "源码模式已完成静态脚本扫描，但无法进行访问身份对比。" },
        limitations: ["源码模式不能比较普通访客与 AdsBot User-Agent 模拟结果。", "未知脚本域名和普通 JavaScript 不能单独证明网站被侵。"],
      });
    }

    const input = normalizeUrl(body.url);
    await assertPublicUrl(input);
    const [profiles, robots] = await Promise.all([
      Promise.all(PROFILES.map((definition) => scanProfile(input, definition))),
      scanRobots(input),
    ]);

    const findings = dedupeFindings([
      ...profiles.flatMap((profile) => profile.suspiciousSignals),
      ...pairComparison(profiles.find((item) => item.id === "browser_desktop"), profiles.find((item) => item.id === "adsbot_desktop"), "桌面抓取对比"),
      ...pairComparison(profiles.find((item) => item.id === "browser_mobile"), profiles.find((item) => item.id === "adsbot_mobile"), "手机抓取对比"),
      ...(robots.blockedAgents.length ? [{ id: "robots-blocks-google", title: "robots.txt 禁止 Google 广告抓取代理访问", severity: "high" as Severity, confidence: "high" as Confidence, source: "robots.txt", evidence: robots.evidence, recommendation: "删除针对 AdsBot-Google、AdsBot-Google-Mobile 或 Googlebot 的根路径 Disallow: /。", relatedReasons: ["adsbot_access", "destination_not_working", "circumventing_systems"] }] : []),
    ]);

    const explicitDesktop = findings.find((item) => item.id === "adsbot-explicit-block-桌面抓取对比");
    const explicitMobile = findings.find((item) => item.id === "adsbot-explicit-block-手机抓取对比");
    if (explicitDesktop && explicitMobile) {
      explicitDesktop.severity = "high";
      explicitDesktop.title = "桌面和手机 AdsBot 模拟均返回明确错误状态";
      explicitDesktop.evidence = `${explicitDesktop.evidence}；${explicitMobile.evidence}`;
      const index = findings.indexOf(explicitMobile);
      if (index >= 0) findings.splice(index, 1);
    }

    const incompleteProfiles = profiles.filter((profile) => profile.status === null);
    if (incompleteProfiles.length) {
      findings.push({
        id: "scan-coverage-incomplete",
        title: "部分访问身份本次抓取未完成",
        severity: "low",
        confidence: "low",
        source: "技术扫描覆盖范围",
        evidence: incompleteProfiles.map((profile) => `${profile.label}: ${profile.error || "抓取未完成"}`).join("；"),
        recommendation: "这是超时或网络波动，不等于 AdsBot 被网站阻止。重新检测或改用 HTML 源码模式。",
        relatedReasons: [],
      });
    }

    const compromisedSite = categoryRisk(findings, "compromised_site");
    const circumventingSystems = categoryRisk(findings, "circumventing_systems");
    const destinationExperience = Math.max(categoryRisk(findings, "destination_not_working"), categoryRisk(findings, "adsbot_access"), categoryRisk(findings, "destination_mismatch"));

    return res.status(200).json({
      url: input.toString(), scannedAt: new Date().toISOString(), requestedReasons,
      requestedReasonLabels: requestedReasons.map((item) => REASON_LABELS[item]), mode: "url",
      risk: { overall: Math.max(compromisedSite, circumventingSystems, destinationExperience), compromisedSite, circumventingSystems, destinationExperience },
      profiles: profiles.map(publicProfile), robots,
      externalDomains: [...new Set(profiles.flatMap((profile) => profile.externalDomains))].sort(),
      findings,
      coverage: {
        completedProfiles: profiles.length - incompleteProfiles.length,
        totalProfiles: profiles.length,
        complete: incompleteProfiles.length === 0,
        note: incompleteProfiles.length ? "部分访问身份抓取未完成，本次不能据此认定 AdsBot 被阻止。" : "四种访问身份均完成抓取。AdsBot 仍仅为 User-Agent 模拟。",
      },
      limitations: [
        "本报告只检查公开页面的黑盒表现，不能读取 Google Ads 账户、付款资料或内部风控信号。",
        "URL 扫描无法发现仅存在于服务器 PHP、WordPress 数据库、计划任务或管理员账号中的后门。",
        "普通 JavaScript、第三方预约表单和未知脚本域名不会被单独认定为被侵网站。",
      ],
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.name === "AbortError" ? "网页抓取超时，请稍后重试。" : error?.message || "技术取证扫描失败。" });
  }
}
