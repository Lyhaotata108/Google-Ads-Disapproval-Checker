import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Settings2, X } from "lucide-react";
import App from "./App";

type ApiType = "openai" | "gemini-native";

type ApiSettings = {
  apiType: ApiType;
  apiKey: string;
  apiBaseUrl: string;
  apiModel: string;
};

const STORAGE_KEYS = {
  type: "checker_api_type",
  key: "checker_api_key",
  base: "checker_api_base",
  model: "checker_api_model",
};

function readSettings(): ApiSettings {
  const storedType = localStorage.getItem(STORAGE_KEYS.type);
  return {
    apiType: storedType === "gemini-native" ? "gemini-native" : "openai",
    apiKey: localStorage.getItem(STORAGE_KEYS.key) || "",
    apiBaseUrl: localStorage.getItem(STORAGE_KEYS.base) || "",
    apiModel: localStorage.getItem(STORAGE_KEYS.model) || "",
  };
}

function isConfigured(settings: ApiSettings): boolean {
  if (!settings.apiKey.trim() || !settings.apiModel.trim()) return false;
  if (settings.apiType === "openai" && !settings.apiBaseUrl.trim()) return false;
  return true;
}

function normalizedSettings(settings: ApiSettings): ApiSettings {
  return {
    apiType: settings.apiType,
    apiKey: settings.apiKey.trim(),
    apiBaseUrl: settings.apiBaseUrl.trim().replace(/\/+$/, ""),
    apiModel: settings.apiModel.trim(),
  };
}

export default function ApiConfiguredApp() {
  const [settings, setSettings] = useState<ApiSettings>(() => readSettings());
  const [draft, setDraft] = useState<ApiSettings>(() => readSettings());
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState("");

  const configured = useMemo(() => isConfigured(settings), [settings]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const rawUrl = typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
        const requestUrl = new URL(rawUrl, window.location.href);

        if (requestUrl.pathname === "/api/analyze-v2" && typeof init?.body === "string") {
          const current = readSettings();
          if (isConfigured(current)) {
            const payload = JSON.parse(init.body);
            const safe = normalizedSettings(current);
            return originalFetch(input, {
              ...init,
              body: JSON.stringify({
                ...payload,
                apiSettings: {
                  apiType: safe.apiType,
                  apiKey: safe.apiKey,
                  baseUrl: safe.apiBaseUrl,
                  model: safe.apiModel,
                },
              }),
            });
          }
        }
      } catch {
        // 配置读取或请求体解析失败时保持原请求，避免影响技术取证接口。
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  function openSettings() {
    const current = readSettings();
    setSettings(current);
    setDraft(current);
    setMessage("");
    setOpen(true);
  }

  function saveSettings() {
    const next = normalizedSettings(draft);
    if (!next.apiKey) {
      setMessage("请填写 API Key。");
      return;
    }
    if (!next.apiModel) {
      setMessage("请填写模型名称。");
      return;
    }
    if (next.apiType === "openai") {
      if (!next.apiBaseUrl) {
        setMessage("OpenAI 兼容中转接口必须填写 Base URL。");
        return;
      }
      if (!/^https?:\/\//i.test(next.apiBaseUrl)) {
        setMessage("Base URL 必须以 http:// 或 https:// 开头。");
        return;
      }
    }

    localStorage.setItem(STORAGE_KEYS.type, next.apiType);
    localStorage.setItem(STORAGE_KEYS.key, next.apiKey);
    localStorage.setItem(STORAGE_KEYS.base, next.apiBaseUrl);
    localStorage.setItem(STORAGE_KEYS.model, next.apiModel);
    setSettings(next);
    setDraft(next);
    setMessage("配置已保存，下一次检测会直接使用该中转接口。");
  }

  function clearSettings() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    const empty: ApiSettings = { apiType: "openai", apiKey: "", apiBaseUrl: "", apiModel: "" };
    setSettings(empty);
    setDraft(empty);
    setMessage("已清空 API 配置。");
  }

  return (
    <>
      <App />

      <button
        type="button"
        onClick={openSettings}
        className="fixed right-4 top-3 z-50 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-[11px] font-bold text-slate-200 shadow-xl backdrop-blur hover:bg-slate-800"
      >
        {configured ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Settings2 className="h-4 w-4 text-amber-400" />}
        第三方 API
        <span className={`h-2 w-2 rounded-full ${configured ? "bg-emerald-400" : "bg-amber-400"}`} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-100">
                  <KeyRound className="h-4 w-4 text-indigo-400" />第三方中转 API 配置
                </h2>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">配置保存在当前浏览器本地，页面政策分析会通过 Vercel 后端转发到你的中转接口；技术取证不依赖 AI。</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">接口类型</label>
                <select
                  value={draft.apiType}
                  onChange={(event) => setDraft((current) => ({ ...current, apiType: event.target.value as ApiType }))}
                  className="w-full rounded-xl border border-white/5 bg-slate-950 px-3 py-2.5 text-xs outline-none focus:border-indigo-500"
                >
                  <option value="openai">OpenAI 兼容中转接口</option>
                  <option value="gemini-native">Gemini 原生接口</option>
                </select>
              </div>

              {draft.apiType === "openai" && (
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Base URL</label>
                  <input
                    value={draft.apiBaseUrl}
                    onChange={(event) => setDraft((current) => ({ ...current, apiBaseUrl: event.target.value }))}
                    placeholder="https://your-relay.example.com/v1"
                    className="w-full rounded-xl border border-white/5 bg-slate-950 px-3 py-3 text-xs outline-none focus:border-indigo-500"
                  />
                  <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">填写 API 根路径，系统会自动请求 /chat/completions。多数中转站需要以 /v1 结尾。</p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="sk-..."
                    autoComplete="off"
                    className="w-full rounded-xl border border-white/5 bg-slate-950 px-3 py-3 pr-11 text-xs outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-200">
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">模型名称</label>
                <input
                  value={draft.apiModel}
                  onChange={(event) => setDraft((current) => ({ ...current, apiModel: event.target.value }))}
                  placeholder="gemini-3-flash-preview"
                  className="w-full rounded-xl border border-white/5 bg-slate-950 px-3 py-3 text-xs outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {message && <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 text-[10px] leading-relaxed text-indigo-200">{message}</div>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={clearSettings} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-slate-400 hover:bg-slate-800">清空配置</button>
              <button type="button" onClick={saveSettings} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500">保存配置</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
