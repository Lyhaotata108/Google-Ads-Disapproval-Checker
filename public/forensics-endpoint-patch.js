(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);

  function parseRequestBody(init) {
    try {
      return init && typeof init.body === "string" ? JSON.parse(init.body) : null;
    } catch {
      return null;
    }
  }

  function makeJsonResponse(payload, source, status = 200) {
    const headers = new Headers(source && source.headers ? source.headers : undefined);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify(payload), {
      status,
      statusText: source ? source.statusText : "",
      headers,
    });
  }

  function conciseApiError(text, status) {
    const raw = String(text || "");
    if (/FUNCTION_INVOCATION_FAILED/i.test(raw)) {
      return `分析服务运行失败（HTTP ${status}）。系统已停止显示错误网页源码，请稍后重试。`;
    }
    if (/<!doctype|<html|cloudflare|bad gateway|gateway/i.test(raw)) {
      return `自定义 AI 中转接口暂时不可用（HTTP ${status}）。请检查 Base URL、模型名称和服务状态。`;
    }
    try {
      const parsed = JSON.parse(raw);
      return String(parsed.error || parsed.message || `分析接口返回 HTTP ${status}`).slice(0, 240);
    } catch {
      return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || `分析接口返回 HTTP ${status}`;
    }
  }

  function transientFinding(item) {
    const text = `${item && item.id || ""} ${item && item.title || ""} ${item && item.evidence || ""}`;
    return /adsbot-block/i.test(text) && /(抓取超时|时间预算|dns 查询超时|fetch failed|抓取失败|network|timeout)/i.test(text);
  }

  function riskFor(findings, reason) {
    const matched = findings.filter((item) => Array.isArray(item.relatedReasons) && item.relatedReasons.includes(reason));
    if (!matched.length) return 0;
    const values = matched.map((item) => {
      if (item.severity === "high" && item.confidence === "high") return 82;
      if (item.severity === "high") return 68;
      if (item.severity === "medium" && item.confidence === "high") return 52;
      if (item.severity === "medium") return 34;
      return 8;
    });
    const strong = matched.filter((item) => item.severity === "high").length;
    return Math.min(100, Math.max(...values) + Math.max(0, strong - 1) * 8);
  }

  function normalizeForensics(data) {
    if (!data || typeof data !== "object") return data;
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const incompleteProfiles = profiles
      .filter((profile) => profile && profile.status == null)
      .map((profile) => ({ label: profile.label, error: profile.error || "抓取未完成" }));

    const original = Array.isArray(data.findings) ? data.findings : [];
    const findings = original.filter((item) => !transientFinding(item));

    if (incompleteProfiles.length) {
      findings.push({
        id: "scan-coverage-incomplete",
        title: "部分访问身份本次抓取未完成",
        severity: "low",
        confidence: "low",
        source: "技术扫描覆盖范围",
        evidence: incompleteProfiles.map((item) => `${item.label}: ${item.error}`).join("；"),
        recommendation: "本次属于扫描超时或网络波动，不等于 AdsBot 被网站阻止。重新检测；只有稳定复现明确 HTTP 403、404 或 5xx 才按访问阻断处理。",
        relatedReasons: [],
      });
    }

    const compromisedSite = riskFor(findings, "compromised_site");
    const circumventingSystems = riskFor(findings, "circumventing_systems");
    const destinationExperience = Math.max(
      riskFor(findings, "destination_not_working"),
      riskFor(findings, "adsbot_access"),
      riskFor(findings, "destination_mismatch"),
    );

    return {
      ...data,
      findings,
      risk: {
        ...(data.risk || {}),
        overall: Math.max(compromisedSite, circumventingSystems, destinationExperience),
        compromisedSite,
        circumventingSystems,
        destinationExperience,
      },
      coverage: {
        ...(data.coverage || {}),
        completedProfiles: profiles.length - incompleteProfiles.length,
        totalProfiles: profiles.length,
        complete: incompleteProfiles.length === 0,
        incompleteProfiles,
        note: incompleteProfiles.length
          ? "部分访问身份抓取未完成，本次不能据此认定 AdsBot 被阻止。"
          : "四种访问身份均完成抓取。AdsBot 仍仅为 User-Agent 模拟。",
      },
    };
  }

  async function runAnalyze(input, init, url) {
    url.pathname = "/api/analyze-v2";
    const target = url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.toString();
    let response = await nativeFetch(target, init);
    if (response.ok) return response;

    const body = parseRequestBody(init);
    if (body && body.apiSettings && body.apiSettings.apiKey) {
      const fallbackInit = {
        ...(init || {}),
        body: JSON.stringify({ ...body, apiSettings: null }),
      };
      const fallback = await nativeFetch(target, fallbackInit);
      if (fallback.ok) return fallback;
    }

    const text = await response.text();
    return makeJsonResponse({ error: conciseApiError(text, response.status), retryable: true }, response, response.status || 502);
  }

  async function runForensics(input, init, url) {
    url.pathname = "/api/forensics-v3";
    const target = url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.toString();
    const response = await nativeFetch(target, init);
    if (!response.ok) {
      const text = await response.text();
      return makeJsonResponse({ error: conciseApiError(text, response.status), retryable: true }, response, response.status || 500);
    }
    try {
      const data = await response.json();
      return makeJsonResponse(normalizeForensics(data), response, response.status);
    } catch {
      return makeJsonResponse({ error: "技术取证接口返回了无法解析的数据，请重新检测。" }, response, 502);
    }
  }

  window.fetch = async function stableAuditFetch(input, init) {
    try {
      const raw = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      const url = new URL(raw || location.href, location.href);
      if (url.pathname === "/api/analyze") return runAnalyze(input, init, url);
      if (url.pathname === "/api/forensics") return runForensics(input, init, url);
    } catch {
      // 保留其他请求原样执行。
    }
    return nativeFetch(input, init);
  };
})();
