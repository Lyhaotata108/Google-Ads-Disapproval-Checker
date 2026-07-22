import legacyAnalyze from "./analyze-v2";

export const config = { maxDuration: 30 };

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

function parseBody(req: any) {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return {};
  }
}

function conciseError(value: unknown): string {
  const raw = String((value as any)?.error || value || "页面政策分析失败。");
  const status = raw.match(/HTTP\s+(\d{3})/i)?.[1];
  if (status) return `自定义 AI 接口暂时不可用（HTTP ${status}）。请检查 Base URL、模型名称和中转服务状态。`;
  if (/<!doctype|<html|cloudflare|bad gateway|gateway/i.test(raw)) {
    return "自定义 AI 接口返回了网关错误页面，当前中转服务不可用。请检查 Base URL、模型名称或服务状态。";
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function run(req: any) {
  const { state, res } = captureResponse();
  await legacyAnalyze(req, res);
  return state;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const body = parseBody(req);
  const primary = await run(req);
  if (primary.statusCode >= 200 && primary.statusCode < 300) {
    return res.status(primary.statusCode).json(primary.body);
  }

  const hasCustomApi = Boolean(body?.apiSettings?.apiKey);
  const hasServerGemini = Boolean(process.env.GEMINI_API_KEY);

  if (hasCustomApi && hasServerGemini) {
    const fallbackReq = Object.create(req);
    fallbackReq.body = { ...body, apiSettings: null };
    const fallback = await run(fallbackReq);
    if (fallback.statusCode >= 200 && fallback.statusCode < 300) {
      return res.status(200).json({
        ...fallback.body,
        analysisMeta: {
          fallbackUsed: true,
          message: "自定义 AI 接口不可用，本次已自动切换到服务器内置 Gemini 完成分析。",
        },
      });
    }
  }

  return res.status(502).json({
    error: conciseError(primary.body),
    retryable: true,
  });
}
