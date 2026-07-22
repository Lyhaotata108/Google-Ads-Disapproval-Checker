(() => {
  "use strict";

  const STORAGE_KEY = "google_ads_preflight_ad_copy";
  let adCopy = localStorage.getItem(STORAGE_KEY) || "";
  let analysisData = null;
  let forensicsData = null;
  let running = false;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function preflightObservedFetch(input, init) {
    const response = await originalFetch(input, init);
    try {
      const raw = typeof input === "string" ? input : input && input.url ? input.url : "";
      const path = new URL(raw || location.href, location.href).pathname;
      if (path === "/api/analyze" || path === "/api/forensics") {
        response.clone().json().then((data) => {
          if (path === "/api/analyze") analysisData = response.ok ? data : null;
          if (path === "/api/forensics") forensicsData = response.ok ? data : null;
          running = false;
          renderPrediction();
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(value) {
    return Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
  }

  function addStyles() {
    if (document.getElementById("preflight-v3-css")) return;
    const style = document.createElement("style");
    style.id = "preflight-v3-css";
    style.textContent = `
      .pf-wrap{margin:12px 0 2px;padding:12px;border:1px solid rgba(99,102,241,.2);border-radius:12px;background:rgba(2,6,23,.38)}
      .pf-label{display:block;font-size:10px;font-weight:800;color:#cbd5e1;margin-bottom:6px}.pf-textarea{width:100%;min-height:78px;resize:vertical;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#020617;padding:10px;color:#e2e8f0;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}.pf-textarea:focus{border-color:#6366f1}.pf-help{font-size:9px;line-height:1.55;color:#64748b;margin-top:6px}
      .pf-card{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:15px;margin-bottom:16px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(2,6,23,.92));box-shadow:0 18px 45px rgba(0,0,0,.2)}.pf-card.high{border-color:rgba(239,68,68,.4)}.pf-card.medium{border-color:rgba(245,158,11,.38)}.pf-card.low{border-color:rgba(16,185,129,.35)}
      .pf-row{display:flex;justify-content:space-between;align-items:center;gap:16px}.pf-kicker{font-size:9px;font-weight:800;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase}.pf-verdict{font-size:20px;font-weight:950;margin-top:3px}.pf-score{font-size:36px;font-weight:950;line-height:1;text-align:right}.pf-score-label{font-size:9px;color:#64748b;text-align:right;margin-top:4px}.pf-note{font-size:10px;line-height:1.65;color:#94a3b8;margin-top:7px}.pf-reasons{font-size:10px;line-height:1.65;color:#cbd5e1;margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.06)}.pf-bad{color:#f87171}.pf-warn{color:#fbbf24}.pf-good{color:#34d399}.pf-loading{font-size:11px;color:#c7d2fe}.pf-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pf-meta span{font-size:8px;padding:3px 6px;border:1px solid rgba(255,255,255,.07);border-radius:999px;color:#94a3b8}
      @media(max-width:640px){.pf-row{align-items:flex-start}.pf-score{font-size:30px}}
    `;
    document.head.appendChild(style);
  }

  function ensureInput() {
    const box = document.getElementById("forensics-reason-box");
    if (!box || document.getElementById("preflight-ad-copy-wrap")) return;
    const wrap = document.createElement("div");
    wrap.id = "preflight-ad-copy-wrap";
    wrap.className = "pf-wrap";
    wrap.innerHTML = `
      <label class="pf-label" for="preflight-ad-copy">准备投放的广告文案（选填）</label>
      <textarea class="pf-textarea" id="preflight-ad-copy" placeholder="粘贴标题、说明、关键词或完整广告文案">${esc(adCopy)}</textarea>
      <div class="pf-help">不填写时只预判落地页。填写后会额外检查保证治愈、成人暗示、违禁商品、虚假紧迫和资质冒充等高风险表达。</div>`;
    const grid = box.querySelector(".fx-grid");
    if (grid) grid.insertAdjacentElement("beforebegin", wrap);
    else box.appendChild(wrap);
    const textarea = wrap.querySelector("textarea");
    textarea.addEventListener("input", () => {
      adCopy = textarea.value;
      localStorage.setItem(STORAGE_KEY, adCopy);
    });
  }

  function bindForm() {
    const form = document.getElementById("analyzer-form");
    if (!form || form.dataset.preflightBound) return;
    form.dataset.preflightBound = "1";
    form.addEventListener("submit", () => {
      const textarea = document.getElementById("preflight-ad-copy");
      adCopy = textarea ? textarea.value : adCopy;
      localStorage.setItem(STORAGE_KEY, adCopy);
      analysisData = null;
      forensicsData = null;
      running = true;
      renderPrediction();
    }, true);
  }

  function scanAdCopy(text) {
    const value = String(text || "").trim();
    if (!value) return { risk: 0, reasons: [] };
    const rules = [
      [90, "成人或性服务暗示", /(happy\s*ending|erotic|sexual\s+service|性感技师|特殊服务|全套服务|sexy\s+girls?|nude)/i],
      [82, "保证治愈或绝对效果", /(100\s*%|guaranteed|永久|根治|治愈|包治|保证见效|绝不复发|no\s+side\s+effects?|\bcure\b)/i],
      [76, "违禁药物、武器或非法商品", /(cocaine|heroin|methamphetamine|buy\s+weed|枪支|弹药|毒品|冰毒|海洛因|可卡因)/i],
      [48, "虚假紧迫或倒计时表达", /(仅剩\s*\d+|最后\s*\d+\s*个名额|倒计时|only\s+\d+\s+left|expires\s+in\s+\d+)/i],
      [44, "可能冒充官方或政府资质", /(官方指定|政府认证|国家级认证|google\s+official|government\s+approved|federal\s+certified)/i],
    ];
    const hits = rules.filter(([, , pattern]) => pattern.test(value));
    if (/[!！]{4,}/.test(value)) hits.push([28, "连续感叹号或过度夸张格式", /./]);
    return {
      risk: hits.length ? Math.max(...hits.map(([risk]) => risk)) : 5,
      reasons: hits.map(([, label]) => label),
    };
  }

  function calculate() {
    const technical = clamp(forensicsData && forensicsData.risk ? forensicsData.risk.overall : 0);
    const issues = analysisData && Array.isArray(analysisData.detectedIssues) ? analysisData.detectedIssues : [];
    const critical = issues.filter((item) => String(item.severity).toUpperCase() === "CRITICAL");
    const hasAi = analysisData && Number.isFinite(Number(analysisData.complianceScore));
    const aiRisk = hasAi ? clamp(100 - Number(analysisData.complianceScore)) : null;
    const ad = scanAdCopy(adCopy);
    const highTech = forensicsData && Array.isArray(forensicsData.findings)
      ? forensicsData.findings.filter((item) => item.severity === "high" && item.confidence === "high").length
      : 0;

    const values = [technical, ad.risk];
    if (aiRisk != null) values.push(aiRisk);
    let risk = Math.max(...values);
    if (aiRisk != null) risk = Math.max(risk, technical * .45 + aiRisk * .55);
    risk = clamp(risk + Math.min(18, critical.length * 6) + Math.min(9, highTech * 3));

    let verdict = "页面层面较低风险";
    let level = "low";
    let note = "可以提交审核，但这不是 Google 官方保证通过，账户、付款、验证、图片和视频仍可能影响结果。";
    if (risk >= 70) {
      verdict = "高概率拒登";
      level = "high";
      note = "不建议直接提交。先修复高风险证据，再重新检测。";
    } else if (risk >= 45) {
      verdict = "存在明显拒登风险";
      level = "medium";
      note = "较可能触发机器或人工审查，建议修复后再提交。";
    } else if (risk >= 25) {
      verdict = "结果不确定，建议先优化";
      level = "medium";
      note = "未发现决定性证据，但仍有可能影响审核的问题。";
    }

    const reasons = [];
    critical.forEach((item) => reasons.push(item.policyName || item.policyCategory || item.finding));
    if (forensicsData && Array.isArray(forensicsData.findings)) {
      forensicsData.findings.filter((item) => item.severity !== "low").forEach((item) => reasons.push(item.title));
    }
    reasons.push(...ad.reasons);

    return {
      risk,
      verdict,
      level,
      note,
      reasons: [...new Set(reasons.filter(Boolean))].slice(0, 5),
      hasAi,
      hasForensics: Boolean(forensicsData),
      hasAd: Boolean(adCopy.trim()),
    };
  }

  function getHost() {
    return document.getElementById("results-dashboard") || document.getElementById("dashboard-section");
  }

  function ensureCard() {
    const host = getHost();
    if (!host) return null;
    let card = document.getElementById("preflight-prediction-v3");
    if (!card) {
      card = document.createElement("div");
      card.id = "preflight-prediction-v3";
      const forensicReport = document.getElementById("forensics-report-v2");
      if (forensicReport && forensicReport.parentElement === host) host.insertBefore(card, forensicReport);
      else host.insertBefore(card, host.firstChild);
    }
    return card;
  }

  function renderPrediction() {
    const card = ensureCard();
    if (!card) return;
    if (running && !analysisData && !forensicsData) {
      card.className = "pf-card";
      card.innerHTML = `<div class="pf-loading">正在生成投放前拒登预判：等待页面政策分析与技术取证结果...</div>`;
      return;
    }
    if (!analysisData && !forensicsData) {
      card.remove();
      return;
    }

    const result = calculate();
    const color = result.level === "high" ? "pf-bad" : result.level === "medium" ? "pf-warn" : "pf-good";
    const coverage = [result.hasForensics && "落地页技术", result.hasAi && "页面政策", result.hasAd && "广告文案"].filter(Boolean);
    card.className = `pf-card ${result.level}`;
    card.innerHTML = `
      <div class="pf-row">
        <div>
          <div class="pf-kicker">投放前预计审核结果</div>
          <div class="pf-verdict ${color}">${esc(result.verdict)}</div>
          <div class="pf-note">${esc(result.note)}</div>
          <div class="pf-meta">${coverage.map((item) => `<span>${esc(item)}</span>`).join("")}</div>
        </div>
        <div><div class="pf-score ${color}">${result.risk}</div><div class="pf-score-label">预计拒登风险分 / 100</div></div>
      </div>
      <div class="pf-reasons"><strong>最可能触发的原因：</strong>${result.reasons.length ? esc(result.reasons.join("；")) : "当前未发现明确的高风险证据。"}<br><span class="pf-note">风险分是页面层面的预估，不是官方通过率。Google 仍可能根据账户历史、广告主验证、付款资料、关键词、图片和视频作出不同结果。</span></div>`;
  }

  addStyles();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      ensureInput();
      bindForm();
      const card = document.getElementById("preflight-prediction-v3");
      if ((analysisData || forensicsData || running) && (!card || card.parentElement !== getHost())) {
        renderPrediction();
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureInput();
  bindForm();
})();
