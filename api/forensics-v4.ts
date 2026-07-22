import legacyForensics from "./forensics-v3";

export const config = { maxDuration: 15 };

type Finding = {
  id?: string;
  title?: string;
  severity?: "high" | "medium" | "low";
  confidence?: "high" | "medium" | "low";
  evidence?: string;
  recommendation?: string;
  relatedReasons?: string[];
  source?: string;
  [key: string]: unknown;
};

type CaptureState = { statusCode: number; body: any; headers: Record<string, unknown> };

function captureResponse() {
  const state: CaptureState = { statusCode: 200, body: undefined, headers: {} };
  const res: any = {
    setHeader(name: string, value: unknown) {
      state.headers[String(name).toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return payload;
    },
    end(payload?: unknown) {
      if (payload !== undefined) state.body = payload;
      return payload;
    },
  };
  return { state, res };
}

function isTransientFailure(finding: Finding): boolean {
  const text = `${finding.id || ""} ${finding.title || ""} ${finding.evidence || ""}`;
  return /adsbot-block/i.test(text) && /(抓取超时|时间预算|dns 查询超时|fetch failed|抓取失败|network|timeout)/i.test(text);
}

function dedupe(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.id || finding.title}|${String(finding.evidence || "").replace(/\s+/g, " ").trim()}`;
    if (!map.has(key)) map.set(key, finding);
  }
  return [...map.values()];
}

function categoryRisk(findings: Finding[], reason: string): number {
  const matched = findings.filter((item) => Array.isArray(item.relatedReasons) && item.relatedReasons.includes(reason));
  if (!matched.length) return 0;
  const values = matched.map((item) => {
    if (item.severity === "high" && item.confidence === "high") return 82;
    if (item.severity === "high") return 68;
    if (item.severity === "medium" && item.confidence === "high") return 52;
    if (item.severity === "medium") return 34;
    return 8;
  });
  const strongCount = matched.filter((item) => item.severity === "high").length;
  return Math.min(100, Math.max(...values) + Math.max(0, strongCount - 1) * 8);
}

function normalizePayload(payload: any) {
  if (!payload || typeof payload !== "object") return payload;
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  const incompleteProfiles = profiles
    .filter((profile: any) => profile?.status == null)
    .map((profile: any) => ({ id: profile.id, label: profile.label, error: profile.error || "抓取未完成" }));

  const original = Array.isArray(payload.findings) ? payload.findings : [];
  const retained = original.filter((finding: Finding) => !isTransientFailure(finding));

  if (incompleteProfiles.length) {
    retained.push({
      id: "scan-coverage-incomplete",
      title: "部分访问身份本次抓取未完成",
      severity: "low",
      confidence: "low",
      source: "技术扫描覆盖范围",
      evidence: incompleteProfiles.map((item: any) => `${item.label}: ${item.error}`).join("；"),
      recommendation: "这是扫描超时或网络波动，不等于 AdsBot 被网站阻止。请重新检测；只有连续复现明确的 HTTP 403/404/5xx 才应按访问阻断处理。",
      relatedReasons: [],
    });
  }

  const findings = dedupe(retained);
  const compromisedSite = categoryRisk(findings, "compromised_site");
  const circumventingSystems = categoryRisk(findings, "circumventing_systems");
  const destinationExperience = Math.max(
    categoryRisk(findings, "destination_not_working"),
    categoryRisk(findings, "adsbot_access"),
    categoryRisk(findings, "destination_mismatch"),
  );

  return {
    ...payload,
    findings,
    risk: {
      ...(payload.risk || {}),
      overall: Math.max(compromisedSite, circumventingSystems, destinationExperience),
      compromisedSite,
      circumventingSystems,
      destinationExperience,
    },
    coverage: {
      ...(payload.coverage || {}),
      completedProfiles: profiles.length - incompleteProfiles.length,
      totalProfiles: profiles.length,
      complete: incompleteProfiles.length === 0,
      incompleteProfiles,
      note: incompleteProfiles.length
        ? "部分身份抓取未完成，本次不能据此认定 AdsBot 被阻止。"
        : "四种访问身份均完成抓取。AdsBot 仍仅为 User-Agent 模拟。",
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

  const { state, res: capture } = captureResponse();
  await legacyForensics(req, capture);
  if (state.statusCode < 200 || state.statusCode >= 300) {
    return res.status(state.statusCode).json(state.body || { error: "技术取证扫描失败。" });
  }
  return res.status(200).json(normalizePayload(state.body));
}
