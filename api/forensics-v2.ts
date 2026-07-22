import legacyForensicsHandler from "./forensics";

type Finding = {
  id?: string;
  title?: string;
  severity?: "high" | "medium" | "low";
  confidence?: "high" | "medium" | "low";
  source?: string;
  evidence?: string;
  recommendation?: string;
  relatedReasons?: string[];
  [key: string]: unknown;
};

type CaptureState = {
  statusCode: number;
  body: any;
  headers: Record<string, unknown>;
};

function createCaptureResponse() {
  const state: CaptureState = {
    statusCode: 200,
    body: undefined,
    headers: {},
  };

  const capture: any = {
    setHeader(name: string, value: unknown) {
      state.headers[name.toLowerCase()] = value;
      return capture;
    },
    status(code: number) {
      state.statusCode = code;
      return capture;
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

  return { state, capture };
}

function containsRealDynamicExecution(evidence: string): boolean {
  if (/\beval\s*\(/i.test(evidence)) return true;
  if (/\bnew\s+Function\s*\(/.test(evidence)) return true;
  if (/(?:^|[^\w$])Function\s*\(\s*["'`]/.test(evidence)) return true;
  return false;
}

function normalizeFindings(input: unknown): Finding[] {
  if (!Array.isArray(input)) return [];

  const deduped = new Map<string, Finding>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const finding = raw as Finding;
    const evidence = String(finding.evidence || "");

    // The legacy expression used /Function\s*\(/i, so every normal
    // `function (...) {}` or `(function(){ ... })()` IIFE was treated as
    // the JavaScript Function constructor. A normal function declaration
    // is not dynamic code execution and must not be a compromised-site signal.
    if (finding.id === "dynamic-code-execution" && !containsRealDynamicExecution(evidence)) {
      continue;
    }

    const key = [
      String(finding.id || finding.title || "finding"),
      String(finding.severity || "low"),
      evidence.replace(/\s+/g, " ").trim(),
    ].join("|");

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, { ...finding });
      continue;
    }

    const sources = new Set(
      `${existing.source || ""}、${finding.source || ""}`
        .split("、")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    existing.source = [...sources].join("、");
  }

  return [...deduped.values()].sort((left, right) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[right.severity || "low"] - rank[left.severity || "low"];
  });
}

function calculateRisk(findings: Finding[], reason: string): number {
  let score = 0;
  for (const finding of findings) {
    const related = Array.isArray(finding.relatedReasons) ? finding.relatedReasons : [];
    if (!related.includes(reason)) continue;
    score += finding.severity === "high" ? 38 : finding.severity === "medium" ? 17 : 5;
    if (finding.confidence === "high") score += 5;
  }
  return Math.min(100, score);
}

function normalizePayload(payload: any) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.findings)) {
    return payload;
  }

  const originalCount = payload.findings.length;
  const findings = normalizeFindings(payload.findings);
  const circumventingSystems = calculateRisk(findings, "circumventing_systems");
  const compromisedSite = calculateRisk(findings, "compromised_site");
  const destinationExperience = Math.max(
    calculateRisk(findings, "destination_not_working"),
    calculateRisk(findings, "adsbot_access"),
    calculateRisk(findings, "destination_mismatch"),
  );

  return {
    ...payload,
    findings,
    risk: {
      ...(payload.risk || {}),
      circumventingSystems,
      compromisedSite,
      destinationExperience,
      overall: Math.max(circumventingSystems, compromisedSite, destinationExperience),
    },
    normalization: {
      removedOrMergedFindings: Math.max(0, originalCount - findings.length),
      note: "已排除普通 function/IIFE 的误报，并合并四种访问身份中完全相同的静态脚本证据。",
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
    const { state, capture } = createCaptureResponse();
    await legacyForensicsHandler(req, capture);

    if (state.statusCode < 200 || state.statusCode >= 300) {
      return res.status(state.statusCode).json(state.body || { error: "技术取证扫描失败。" });
    }

    return res.status(state.statusCode).json(normalizePayload(state.body));
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "技术取证结果归一化失败。",
    });
  }
}
