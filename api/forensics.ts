import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 6;
const FETCH_TIMEOUT_MS = 7_500;
const MAX_HTML_CHARS = 350_000;
const MAX_RAW_HTML_CHARS = 500_000;

const REJECTION_REASON_LABELS: Record<string, string> = {
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

type RiskLevel = "high" | "medium" | "low";

type RedirectHop = {
  url: string;
  status: number;
  location?: string;
};

type ScanProfile = {
  id: string;
  label: string;
  userAgent: string;
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
  suspiciousSignals: StaticSignal[];
  html?: string;
  visibleText?: string;
  error?: string;
};

type StaticSignal = {
  id: string;
  title: string;
  severity: RiskLevel;
  evidence: string;
  recommendation: string;
  relatedReasons: string[];
};

type TechnicalFinding = StaticSignal & {
  confidence: "high" | "medium" | "low";
  source: string;
};

const USER_AGENTS = [
  {
    id: "browser_desktop",
    label: "普通桌面访客",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
  {
    id: "browser_mobile",
    label: "普通手机访客",
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
  {
    id: "adsbot_desktop",
    label: "Google AdsBot 桌面",
    userAgent: "AdsBot-Google (+http://www.google.com/adsbot.html)",
  },
  {
    id: "adsbot_mobile",
    label: "Google AdsBot 手机",
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)",
  },
];

const TRUSTED_SCRIPT_SUFFIXES = [
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "cloudflare.com",
  "cloudflareinsights.com",
  "jquery.com",
  "jsdelivr.net",
  "unpkg.com",
  "stripe.com",
  "paypal.com",
  "facebook.net",
  "clarity.ms",
  "hotjar.com",
  "wordpress.com",
  "wp.com",
  "wpengine.com",
  "calendly.com",
];

function normalizeInputUrl(value: string): URL {
  let normalized = String(value || "").trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  const parsed = new URL(normalized);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("只支持 HTTP 或 HTTPS 网页地址。");
  if (parsed.username || parsed.password) throw new Error("网址不能包含用户名或密码。");
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new Error("为防止扫描内网服务，只允许标准的 80/443 端口。");
  }
  parsed.hash = "";
  return parsed;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
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
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

async function assertPublicUrl(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("禁止扫描 localhost 或局域网地址。");
  }

  if (isIP(hostname)) {
    const blocked = isIP(hostname) === 4 ? isPrivateIpv4(hostname) : isPrivateIpv6(hostname);
    if (blocked) throw new Error("禁止扫描内网、回环或保留 IP 地址。");
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error("域名没有可用的 DNS 解析记录。");
  for (const record of records) {
    if ((record.family === 4 && isPrivateIpv4(record.address)) || (record.family === 6 && isPrivateIpv6(record.address))) {
      throw new Error("域名解析到了内网或保留 IP，已停止扫描。");
    }
  }
}

function withTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof (timer as any).unref === "function") (timer as any).unref();
  return controller.signal;
}

async function fetchWithRedirectTrace(
  inputUrl: URL,
  userAgent: string,
): Promise<{ response: Response; finalUrl: URL; redirectChain: RedirectHop[] }> {
  let current = new URL(inputUrl.toString());
  const redirectChain: RedirectHop[] = [];

  for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: withTimeoutSignal(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.6",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.google.com/",
      },
    });

    const location = response.headers.get("location") || undefined;
    redirectChain.push({ url: current.toString(), status: response.status, location });

    if (response.status >= 300 && response.status < 400 && location) {
      if (index === MAX_REDIRECTS) throw new Error(`跳转超过 ${MAX_REDIRECTS} 次，疑似跳转循环。`);
      current = new URL(location, current);
      continue;
    }

    return { response, finalUrl: current, redirectChain };
  }

  throw new Error("无法完成网页跳转链检测。");
}

function truncate(value: string, max = 280): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractVisibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 120_000);
}

function extractTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? truncate(decodeHtmlEntities(match[1]), 180) : "";
}

function resolveAssetUrl(raw: string, baseUrl: URL): URL | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed || /^(data:|javascript:|mailto:|tel:|#)/i.test(trimmed)) return null;
    const resolved = new URL(trimmed, baseUrl);
    if (!/^https?:$/.test(resolved.protocol)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function extractExternalDomains(html: string, baseUrl: URL): { all: string[]; unknownScripts: string[] } {
  const domains = new Set<string>();
  const unknownScripts = new Set<string>();
  const attrRegex = /\b(?:src|href|action)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(html))) {
    const resolved = resolveAssetUrl(match[1], baseUrl);
    if (!resolved || resolved.hostname === baseUrl.hostname) continue;
    domains.add(resolved.hostname);
  }

  const scriptRegex = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptRegex.exec(html))) {
    const resolved = resolveAssetUrl(match[1], baseUrl);
    if (!resolved || resolved.hostname === baseUrl.hostname) continue;
    const trusted = TRUSTED_SCRIPT_SUFFIXES.some((suffix) => hostMatchesSuffix(resolved.hostname, suffix));
    if (!trusted) unknownScripts.add(resolved.hostname);
  }

  return {
    all: [...domains].sort(),
    unknownScripts: [...unknownScripts].sort(),
  };
}

function extractScriptBodies(html: string): string {
  const bodies: string[] = [];
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    if (match[1]) bodies.push(match[1]);
  }
  return bodies.join("\n").slice(0, 220_000);
}

function scanStaticHtml(html: string, baseUrl: URL): StaticSignal[] {
  const signals: StaticSignal[] = [];
  const scriptBodies = extractScriptBodies(html);
  const { unknownScripts } = extractExternalDomains(html, baseUrl);

  const add = (signal: StaticSignal) => {
    if (!signals.some((item) => item.id === signal.id && item.evidence === signal.evidence)) signals.push(signal);
  };

  if (/eval\s*\(|new\s+Function\s*\(|Function\s*\(/i.test(scriptBodies)) {
    add({
      id: "dynamic-code-execution",
      title: "发现动态执行 JavaScript",
      severity: "medium",
      evidence: truncate(scriptBodies.match(/.{0,90}(?:eval\s*\(|new\s+Function\s*\(|Function\s*\().{0,140}/i)?.[0] || "检测到 eval / Function 动态执行"),
      recommendation: "在主题、插件和自定义代码中定位该脚本来源；如果不是明确可信的业务代码，应删除并检查最近被修改的文件。",
      relatedReasons: ["compromised_site", "malicious_software", "circumventing_systems"],
    });
  }

  const hasDecoder = /\batob\s*\(|String\.fromCharCode\s*\(|(?:\\x[0-9a-f]{2}){8,}|[A-Za-z0-9+/]{240,}={0,2}/i.test(scriptBodies);
  if (hasDecoder) {
    add({
      id: "obfuscated-script",
      title: "发现疑似混淆或编码脚本",
      severity: /eval\s*\(|new\s+Function/i.test(scriptBodies) ? "high" : "medium",
      evidence: "内联脚本包含 atob、String.fromCharCode、连续十六进制转义或超长 Base64 字符串。",
      recommendation: "导出页面源代码并搜索 atob、fromCharCode、\\x、eval；核对脚本是否由已知插件生成，未知来源应先隔离再清理。",
      relatedReasons: ["compromised_site", "malicious_software", "circumventing_systems"],
    });
  }

  if (/document\.cookie/i.test(scriptBodies) && /(sendBeacon\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket)/i.test(scriptBodies)) {
    add({
      id: "cookie-network-transfer",
      title: "发现 Cookie 与外部传输组合代码",
      severity: "high",
      evidence: "同一页面脚本同时读取 document.cookie，并调用 fetch、sendBeacon、XMLHttpRequest 或 WebSocket。",
      recommendation: "立即确认接收数据的域名和脚本来源；未知域名可能涉及数据窃取，应检查主题文件、插件文件和数据库中的注入代码。",
      relatedReasons: ["compromised_site", "malicious_software"],
    });
  }

  if (/(?:window\.)?location\.(?:href|replace|assign)\s*\(|(?:window\.)?location\.href\s*=|window\.open\s*\(/i.test(scriptBodies)) {
    add({
      id: "javascript-redirect",
      title: "发现 JavaScript 跳转逻辑",
      severity: "medium",
      evidence: truncate(scriptBodies.match(/.{0,100}(?:(?:window\.)?location\.(?:href|replace|assign)|window\.open).{0,180}/i)?.[0] || "检测到 location / window.open 跳转代码"),
      recommendation: "检查该跳转是否会根据设备、来源、地区、时间或广告参数展示不同页面；广告落地页不应对 AdsBot 和真实用户使用不同跳转。",
      relatedReasons: ["circumventing_systems", "destination_mismatch", "compromised_site"],
    });
  }

  const metaRefresh = html.match(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i);
  if (metaRefresh) {
    const targetMatch = metaRefresh[1].match(/url\s*=\s*(.+)$/i);
    const target = targetMatch ? resolveAssetUrl(targetMatch[1].replace(/["']/g, ""), baseUrl) : null;
    add({
      id: "meta-refresh",
      title: "发现 Meta Refresh 自动跳转",
      severity: target && target.hostname !== baseUrl.hostname ? "high" : "medium",
      evidence: truncate(metaRefresh[0]),
      recommendation: "删除不必要的自动跳转；如必须跳转，确保最终地址与广告最终到达网址属于同一业务和同一域名体系。",
      relatedReasons: ["circumventing_systems", "destination_mismatch", "compromised_site"],
    });
  }

  const hiddenIframeRegex = /<iframe\b(?=[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|width\s*=\s*["']?0|height\s*=\s*["']?0))[^>]*>/gi;
  const hiddenIframe = hiddenIframeRegex.exec(html);
  if (hiddenIframe) {
    add({
      id: "hidden-iframe",
      title: "发现隐藏 iframe",
      severity: "high",
      evidence: truncate(hiddenIframe[0]),
      recommendation: "确认 iframe 的目标域名及用途。未知隐藏 iframe 常见于恶意注入、流量劫持或隐蔽加载，应从源文件和数据库中彻底移除。",
      relatedReasons: ["compromised_site", "malicious_software", "circumventing_systems"],
    });
  }

  const formRegex = /<form\b[^>]*\baction\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let formMatch: RegExpExecArray | null;
  while ((formMatch = formRegex.exec(html))) {
    const target = resolveAssetUrl(formMatch[1], baseUrl);
    if (target && target.hostname !== baseUrl.hostname) {
      add({
        id: "cross-domain-form",
        title: "表单提交到其他域名",
        severity: "high",
        evidence: truncate(formMatch[0]),
        recommendation: `核实 ${target.hostname} 是否为真实且已授权的表单服务；未知接收域名可能导致用户数据外传或“被侵网站”判定。`,
        relatedReasons: ["compromised_site", "malicious_software", "misrepresentation"],
      });
      break;
    }
  }

  if (/https:\/\/[^\s"']+\.php(?:\?|["'])/i.test(scriptBodies) && /(fetch|XMLHttpRequest|sendBeacon)/i.test(scriptBodies)) {
    add({
      id: "remote-php-endpoint",
      title: "脚本向远程 PHP 接口发送请求",
      severity: "medium",
      evidence: truncate(scriptBodies.match(/https:\/\/[^\s"']+\.php[^\s"']*/i)?.[0] || "检测到远程 PHP 接口"),
      recommendation: "核对远程接口是否属于表单、CRM 或支付服务；如无法确认来源，优先检查网站是否被注入恶意收集脚本。",
      relatedReasons: ["compromised_site", "malicious_software"],
    });
  }

  if (unknownScripts.length > 0) {
    add({
      id: "unknown-external-scripts",
      title: "存在需要人工核实的第三方脚本域名",
      severity: "low",
      evidence: unknownScripts.slice(0, 12).join(", "),
      recommendation: "逐个确认这些脚本是否来自正在使用的插件、预约系统、统计工具或客服工具；不认识的域名不要直接保留。",
      relatedReasons: ["compromised_site", "malicious_software"],
    });
  }

  if (baseUrl.protocol === "https:" && /(?:src|href)\s*=\s*["']http:\/\//i.test(html)) {
    add({
      id: "mixed-content",
      title: "HTTPS 页面加载 HTTP 资源",
      severity: "medium",
      evidence: "页面中存在 http:// 图片、脚本、样式或链接资源。",
      recommendation: "将所有资源替换为 HTTPS；混合内容可能导致浏览器拦截、页面缺图或 AdsBot 看到不完整页面。",
      relatedReasons: ["destination_not_working", "adsbot_access"],
    });
  }

  return signals;
}

function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .slice(0, 8_000);
  return new Set(tokens);
}

function jaccardSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function addFinding(findings: TechnicalFinding[], finding: TechnicalFinding): void {
  if (!findings.some((item) => item.id === finding.id && item.source === finding.source)) findings.push(finding);
}

function compareProfiles(
  browser: ScanProfile | undefined,
  adsbot: ScanProfile | undefined,
  sourceLabel: string,
  findings: TechnicalFinding[],
): void {
  if (!browser || !adsbot) return;

  if (browser.ok && !adsbot.ok) {
    addFinding(findings, {
      id: `adsbot-block-${sourceLabel}`,
      title: "普通用户可访问，但 AdsBot 无法正常访问",
      severity: "high",
      confidence: "high",
      source: sourceLabel,
      evidence: `${browser.label}: HTTP ${browser.status}; ${adsbot.label}: ${adsbot.status ? `HTTP ${adsbot.status}` : adsbot.error || "抓取失败"}`,
      recommendation: "检查 Cloudflare/WAF、防爬插件、服务器安全规则和 robots.txt，确保 AdsBot-Google 与 AdsBot-Google-Mobile 可以获得 HTTP 200 页面。",
      relatedReasons: ["circumventing_systems", "destination_not_working", "adsbot_access"],
    });
  }

  if (!browser.finalUrl || !adsbot.finalUrl) return;
  const browserUrl = new URL(browser.finalUrl);
  const adsbotUrl = new URL(adsbot.finalUrl);

  if (browserUrl.origin !== adsbotUrl.origin) {
    addFinding(findings, {
      id: `origin-mismatch-${sourceLabel}`,
      title: "普通用户与 AdsBot 最终进入不同域名",
      severity: "high",
      confidence: "high",
      source: sourceLabel,
      evidence: `${browser.label}: ${browser.finalUrl}; ${adsbot.label}: ${adsbot.finalUrl}`,
      recommendation: "统一所有设备和爬虫的最终落地域名，检查基于 User-Agent、Referer、gclid、IP 或地区执行的跳转代码和 CDN 规则。",
      relatedReasons: ["circumventing_systems", "destination_mismatch", "compromised_site"],
    });
  } else if (`${browserUrl.pathname}${browserUrl.search}` !== `${adsbotUrl.pathname}${adsbotUrl.search}`) {
    addFinding(findings, {
      id: `path-mismatch-${sourceLabel}`,
      title: "普通用户与 AdsBot 最终路径不同",
      severity: "medium",
      confidence: "medium",
      source: sourceLabel,
      evidence: `${browser.label}: ${browserUrl.pathname}${browserUrl.search}; ${adsbot.label}: ${adsbotUrl.pathname}${adsbotUrl.search}`,
      recommendation: "核对服务器重写、广告参数处理和跳转插件，避免仅对 AdsBot 返回专用页面。",
      relatedReasons: ["circumventing_systems", "destination_mismatch"],
    });
  }

  if (browser.visibleTextLength >= 300 && adsbot.visibleTextLength >= 300) {
    const similarity = jaccardSimilarity(browser.visibleText || "", adsbot.visibleText || "");
    const lengthRatio = Math.max(browser.visibleTextLength, adsbot.visibleTextLength) / Math.max(1, Math.min(browser.visibleTextLength, adsbot.visibleTextLength));

    if (similarity < 0.35 || (similarity < 0.55 && lengthRatio > 3)) {
      addFinding(findings, {
        id: `content-cloaking-${sourceLabel}`,
        title: "普通用户与 AdsBot 页面正文差异非常大",
        severity: "high",
        confidence: "high",
        source: sourceLabel,
        evidence: `正文相似度 ${(similarity * 100).toFixed(1)}%；文本长度 ${browser.visibleTextLength} vs ${adsbot.visibleTextLength}；指纹 ${browser.contentHash} vs ${adsbot.contentHash}`,
        recommendation: "检查是否存在按 User-Agent、IP、设备、来源或广告参数返回不同内容的代码。确保 AdsBot 与真实用户看到同一业务主体、服务和主要文案。",
        relatedReasons: ["circumventing_systems", "compromised_site"],
      });
    } else if (similarity < 0.62) {
      addFinding(findings, {
        id: `content-difference-${sourceLabel}`,
        title: "普通用户与 AdsBot 页面内容存在明显差异",
        severity: "medium",
        confidence: "medium",
        source: sourceLabel,
        evidence: `正文相似度 ${(similarity * 100).toFixed(1)}%；文本长度 ${browser.visibleTextLength} vs ${adsbot.visibleTextLength}`,
        recommendation: "人工打开两种抓取结果的跳转链和页面标题，确认差异仅来自响应式布局，而不是隐藏服务、价格、承诺或跳转。",
        relatedReasons: ["circumventing_systems"],
      });
    }
  }
}

async function scanProfile(inputUrl: URL, profile: (typeof USER_AGENTS)[number]): Promise<ScanProfile> {
  try {
    const { response, finalUrl, redirectChain } = await fetchWithRedirectTrace(inputUrl, profile.userAgent);
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    const html = raw.slice(0, MAX_HTML_CHARS);
    const visibleText = extractVisibleText(html);
    const { all: externalDomains } = extractExternalDomains(html, finalUrl);
    const suspiciousSignals = scanStaticHtml(html, finalUrl);

    return {
      id: profile.id,
      label: profile.label,
      userAgent: profile.userAgent,
      initialUrl: inputUrl.toString(),
      finalUrl: finalUrl.toString(),
      status: response.status,
      ok: response.ok && /text\/html|application\/xhtml\+xml/i.test(contentType || "text/html"),
      contentType,
      title: extractTitle(html),
      htmlLength: raw.length,
      visibleTextLength: visibleText.length,
      contentHash: hashText(visibleText),
      redirectChain,
      externalDomains,
      suspiciousSignals,
      html,
      visibleText,
    };
  } catch (error: any) {
    return {
      id: profile.id,
      label: profile.label,
      userAgent: profile.userAgent,
      initialUrl: inputUrl.toString(),
      finalUrl: inputUrl.toString(),
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

function parseRobotsGroups(text: string): Array<{ agents: string[]; disallow: string[]; allow: string[] }> {
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && key === "disallow") {
      current.disallow.push(value);
    } else if (current && key === "allow") {
      current.allow.push(value);
    }
  }

  return groups;
}

function robotsBlocksRoot(text: string, agent: string): boolean {
  const groups = parseRobotsGroups(text);
  const normalizedAgent = agent.toLowerCase();
  const matching = groups.filter((group) => group.agents.some((candidate) => candidate === "*" || normalizedAgent.includes(candidate)));
  if (!matching.length) return false;
  const disallowRoot = matching.some((group) => group.disallow.some((rule) => rule === "/" || rule === "/*"));
  const allowRoot = matching.some((group) => group.allow.some((rule) => rule === "/" || rule === "/*"));
  return disallowRoot && !allowRoot;
}

async function scanRobots(inputUrl: URL): Promise<{
  url: string;
  status: number | null;
  blockedAgents: string[];
  evidence: string;
  error?: string;
}> {
  const robotsUrl = new URL("/robots.txt", inputUrl.origin);
  try {
    const { response } = await fetchWithRedirectTrace(robotsUrl, USER_AGENTS[2].userAgent);
    const text = (await response.text()).slice(0, 100_000);
    const blockedAgents = ["AdsBot-Google", "AdsBot-Google-Mobile", "Googlebot"].filter((agent) => robotsBlocksRoot(text, agent));
    return {
      url: robotsUrl.toString(),
      status: response.status,
      blockedAgents,
      evidence: blockedAgents.length ? `robots.txt 对 ${blockedAgents.join(", ")} 设置了根路径禁止抓取。` : "未发现 robots.txt 禁止上述 Google 抓取代理访问根路径。",
    };
  } catch (error: any) {
    return {
      url: robotsUrl.toString(),
      status: null,
      blockedAgents: [],
      evidence: "robots.txt 无法完成检测。",
      error: error?.name === "AbortError" ? "抓取超时" : error?.message || "抓取失败",
    };
  }
}

function calculateRisk(findings: TechnicalFinding[], reason: string): number {
  let score = 0;
  for (const finding of findings) {
    if (!finding.relatedReasons.includes(reason)) continue;
    score += finding.severity === "high" ? 38 : finding.severity === "medium" ? 17 : 5;
    if (finding.confidence === "high") score += 5;
  }
  return Math.min(100, score);
}

function publicProfile(profile: ScanProfile) {
  const { html, visibleText, userAgent, ...safe } = profile;
  return safe;
}

function buildFindings(profiles: ScanProfile[], robots: Awaited<ReturnType<typeof scanRobots>>): TechnicalFinding[] {
  const findings: TechnicalFinding[] = [];

  for (const profile of profiles) {
    for (const signal of profile.suspiciousSignals) {
      addFinding(findings, {
        ...signal,
        confidence: signal.severity === "high" ? "high" : signal.severity === "medium" ? "medium" : "low",
        source: profile.label,
      });
    }

    if (profile.status && profile.status >= 400) {
      addFinding(findings, {
        id: `http-error-${profile.id}`,
        title: `${profile.label} 返回 HTTP ${profile.status}`,
        severity: profile.id.startsWith("adsbot") ? "high" : "medium",
        confidence: "high",
        source: profile.label,
        evidence: `${profile.finalUrl} 返回 HTTP ${profile.status}，Content-Type: ${profile.contentType || "未知"}`,
        recommendation: "修复服务器、CDN、WAF 或页面路径，使广告最终网址对真实用户和 AdsBot 都稳定返回 HTTP 200。",
        relatedReasons: ["destination_not_working", "adsbot_access", "circumventing_systems"],
      });
    }

    if (profile.redirectChain.length > 4) {
      addFinding(findings, {
        id: `long-redirect-chain-${profile.id}`,
        title: `${profile.label} 的跳转链过长`,
        severity: "medium",
        confidence: "high",
        source: profile.label,
        evidence: profile.redirectChain.map((hop) => `${hop.status} ${hop.url}`).join(" → "),
        recommendation: "将广告最终网址直接指向稳定页面，减少跨域和多层 301/302 跳转。",
        relatedReasons: ["destination_not_working", "destination_mismatch", "circumventing_systems"],
      });
    }
  }

  compareProfiles(
    profiles.find((item) => item.id === "browser_desktop"),
    profiles.find((item) => item.id === "adsbot_desktop"),
    "桌面抓取对比",
    findings,
  );
  compareProfiles(
    profiles.find((item) => item.id === "browser_mobile"),
    profiles.find((item) => item.id === "adsbot_mobile"),
    "手机抓取对比",
    findings,
  );

  if (robots.blockedAgents.length) {
    addFinding(findings, {
      id: "robots-blocks-google",
      title: "robots.txt 禁止 Google 广告抓取代理访问",
      severity: "high",
      confidence: "high",
      source: "robots.txt",
      evidence: robots.evidence,
      recommendation: "修改 robots.txt，删除针对 AdsBot-Google、AdsBot-Google-Mobile 或 Googlebot 的根路径 Disallow: / 规则。",
      relatedReasons: ["adsbot_access", "destination_not_working", "circumventing_systems"],
    });
  }

  return findings.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.severity] - rank[a.severity];
  });
}

function normalizeReasons(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(String).filter((reason) => Object.prototype.hasOwnProperty.call(REJECTION_REASON_LABELS, reason)))];
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
    const isRawMode = Boolean(body.isRawMode);

    if (isRawMode) {
      const rawHtml = String(body.rawHtml || "").slice(0, MAX_RAW_HTML_CHARS);
      if (!rawHtml.trim()) return res.status(400).json({ error: "请提供需要技术取证的 HTML 源码。" });
      const baseUrl = new URL("https://local-html-input.invalid/");
      const visibleText = extractVisibleText(rawHtml);
      const signals = scanStaticHtml(rawHtml, baseUrl);
      const findings: TechnicalFinding[] = signals.map((signal) => ({
        ...signal,
        confidence: signal.severity === "high" ? "high" : signal.severity === "medium" ? "medium" : "low",
        source: "粘贴的 HTML 源码",
      }));

      return res.status(200).json({
        url: "直接粘贴的 HTML 源码",
        scannedAt: new Date().toISOString(),
        requestedReasons,
        requestedReasonLabels: requestedReasons.map((reason) => REJECTION_REASON_LABELS[reason]),
        mode: "raw_html",
        risk: {
          circumventingSystems: calculateRisk(findings, "circumventing_systems"),
          compromisedSite: calculateRisk(findings, "compromised_site"),
          destinationExperience: calculateRisk(findings, "destination_not_working"),
          overall: Math.max(
            calculateRisk(findings, "circumventing_systems"),
            calculateRisk(findings, "compromised_site"),
            calculateRisk(findings, "destination_not_working"),
          ),
        },
        profiles: [
          {
            id: "raw_html",
            label: "粘贴的 HTML 源码",
            initialUrl: "",
            finalUrl: "",
            status: null,
            ok: true,
            contentType: "text/html",
            title: extractTitle(rawHtml),
            htmlLength: rawHtml.length,
            visibleTextLength: visibleText.length,
            contentHash: hashText(visibleText),
            redirectChain: [],
            externalDomains: extractExternalDomains(rawHtml, baseUrl).all,
            suspiciousSignals: signals,
          },
        ],
        robots: null,
        externalDomains: extractExternalDomains(rawHtml, baseUrl).all,
        findings,
        limitations: [
          "源码模式只能检查当前提供的 HTML，无法比较 AdsBot 与真实浏览器内容，也无法检测服务器端 PHP 后门。",
          "未知第三方域名不等于恶意域名，必须结合插件、主题和业务用途人工核实。",
        ],
      });
    }

    const inputUrl = normalizeInputUrl(body.url);
    await assertPublicUrl(inputUrl);

    const [profileResults, robots] = await Promise.all([
      Promise.all(USER_AGENTS.map((profile) => scanProfile(inputUrl, profile))),
      scanRobots(inputUrl),
    ]);

    const findings = buildFindings(profileResults, robots);
    const externalDomains = [...new Set(profileResults.flatMap((profile) => profile.externalDomains))].sort();
    const circumventingSystems = calculateRisk(findings, "circumventing_systems");
    const compromisedSite = calculateRisk(findings, "compromised_site");
    const destinationExperience = Math.max(
      calculateRisk(findings, "destination_not_working"),
      calculateRisk(findings, "adsbot_access"),
      calculateRisk(findings, "destination_mismatch"),
    );

    return res.status(200).json({
      url: inputUrl.toString(),
      scannedAt: new Date().toISOString(),
      requestedReasons,
      requestedReasonLabels: requestedReasons.map((reason) => REJECTION_REASON_LABELS[reason]),
      mode: "url",
      risk: {
        circumventingSystems,
        compromisedSite,
        destinationExperience,
        overall: Math.max(circumventingSystems, compromisedSite, destinationExperience),
      },
      profiles: profileResults.map(publicProfile),
      robots,
      externalDomains,
      findings,
      limitations: [
        "该报告只检查公开落地页的黑盒表现，不能读取 Google Ads 账户历史、账户关联、付款资料或 Google 内部风控信号。",
        "URL 扫描无法发现仅存在于服务器 PHP、WordPress 数据库、计划任务或管理员账户中的后门。",
        "未知第三方域名和混淆脚本属于排查线索，不应在没有人工确认时直接认定为恶意。",
      ],
    });
  } catch (error: any) {
    return res.status(400).json({
      error: error?.name === "AbortError" ? "网页抓取超时，请稍后重试。" : error?.message || "技术取证扫描失败。",
    });
  }
}
