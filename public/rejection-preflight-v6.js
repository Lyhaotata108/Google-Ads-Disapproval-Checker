(() => {
  "use strict";

  const STORAGE_KEY = "google_ads_preflight_ad_copy";
  let adCopy = localStorage.getItem(STORAGE_KEY) || "";
  let analysisData = null;
  let forensicsData = null;
  let analysisFailed = false;
  let forensicsFailed = false;
  let running = false;
  let lastSignature = "";

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function observedAuditFetch(input, init) {
    const raw = typeof input === "string" ? input : input && input.url ? input.url : "";
    let path = "";
    try { path = new URL(raw || location.href, location.href).pathname; } catch {}
    const response = await nativeFetch(input, init);
    if (path === "/api/analyze" || path === "/api/forensics") {
      response.clone().json().then((data) => {
        if (path === "/api/analyze") {
          analysisData = response.ok ? data : null;
          analysisFailed = !response.ok;
        } else {
          forensicsData = response.ok ? data : null;
          forensicsFailed = !response.ok;
        }
        running = false;
        render(true);
      }).catch(() => {
        if (path === "/api/analyze") analysisFailed = true;
        else forensicsFailed = true;
        running = false;
        render(true);
      });
    }
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
    if (document.getElementById("preflight-v6-css")) return;
    const style = document.createElement("style");
    style.id = "preflight-v6-css";
    style.textContent = `
      .pf-wrap{margin:12px 0 2px;padding:12px;border:1px solid rgba(99,102,241,.2);border-radius:12px;background:rgba(2,6,23,.38)}
      .pf-label{display:block;font-size:10px;font-weight:800;color:#cbd5e1;margin-bottom:6px}.pf-textarea{width:100%;min-height:78px;resize:vertical;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#020617;padding:10px;color:#e2e8f0;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}.pf-textarea:focus{border-color:#6366f1}.pf-help{font-size:9px;line-height:1.55;color:#64748b;margin-top:6px}
      .pf-card{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:15px;margin-bottom:16px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(2,6,23,.92));box-shadow:0 18px 45px rgba(0,0,0,.2)}.pf-card.high{border-color:rgba(239,68,68,.4)}.pf-card.medium{border-color:rgba(245,158,11,.38)}.pf-card.low{border-color:rgba(16,185,129,.35)}.pf-card.partial{border-color:rgba(96,165,250,.4)}
      .pf-row{display:flex;justify-content:space-between;align-items:center;gap:16px}.pf-kicker{font-size:9px;font-weight:800;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase}.pf-verdict{font-size:20px;font-weight:950;margin-top:3px}.pf-score{font-size:34px;font-weight:950;line-height:1;text-align:right}.pf-score-label{font-size:9px;color:#64748b;text-align:right;margin-top:4px}.pf-note{font-size:10px;line-height:1.65;color:#94a3b8;margin-top:7px}.pf-reasons{font-size:10px;line-height:1.65;color:#cbd5e1;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}.pf-bad{color:#f87171}.pf-warn{color:#fbbf24}.pf-good{color:#34d399}.pf-blue{color:#60a5fa}.pf-loading{font-size:11px;color:#c7d2fe}.pf-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.pf-meta span{font-size:8px;padding:3px 6px;border:1px solid rgba(255,255,255,.07);border-radius:999px;color:#94a3b8}.pf-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:11px}.pf-count{border:1px solid rgba(255,255,255,.06);border-radius:9px;padding:8px;background:rgba(2,6,23,.35)}.pf-count strong{display:block;font-size:15px}.pf-count span{font-size:8px;color:#64748b}
      @media(max-width:640px){.pf-row{align-items:flex-start}.pf-score{font-size:28px}.pf-counts{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureInput() {
    const box = document.getElementById("forensics-reason-box");
    if (!box || document.getElementById("preflight-ad-copy-wrap")) return;
    const wrap = document.createElement("div");
    wrap.id = "preflight-ad-copy-wrap";
    wrap.className = "pf-wrap";
    wrap.innerHTML = `<label class="pf-label" for="preflight-ad-copy">准备投放的广告文案（选填）</label><textarea class="pf-textarea" id="preflight-ad-copy" placeholder="粘贴标题、说明、关键词或完整广告文案">${esc(adCopy)}</textarea><div class="pf-help">填写后额外检查明确的成人暗示、违禁商品、保证治愈、虚假紧迫和资质冒充。</div>`;
    const grid = box.querySelector(".fx-grid");
    if (grid) grid.insertAdjacentElement("beforebegin", wrap); else box.appendChild(wrap);
    wrap.querySelector("textarea").addEventListener("input", (event) => {
      adCopy = event.target.value;
      localStorage.setItem(STORAGE_KEY, adCopy);
    });
  }

  function bindForm() {
    const form = document.getElementById("analyzer-form");
    if (!form || form.dataset.preflightV6Bound) return;
    form.dataset.preflightV6Bound = "1";
    form.addEventListener("submit", () => {
      const textarea = document.getElementById("preflight-ad-copy");
      adCopy = textarea ? textarea.value : adCopy;
      localStorage.setItem(STORAGE_KEY, adCopy);
      analysisData = null;
      forensicsData = null;
      analysisFailed = false;
      forensicsFailed = false;
      running = true;
      lastSignature = "";
      render(true);
    }, true);
  }

  function scanAdCopy(text) {
    const value = String(text || "").trim();
    const blocker = [], risk = [], advisory = [];
    if (/(happy\s*ending|erotic|sexual\s+service|性感技师|特殊服务|全套服务|sexy\s+girls?|nude)/i.test(value)) blocker.push("广告文案含成人或性服务暗示");
    if (/(cocaine|heroin|methamphetamine|buy\s+weed|枪支|弹药|毒品|冰毒|海洛因|可卡因)/i.test(value)) blocker.push("广告文案涉及违禁商品或服务");
    if (/(100\s*%|guaranteed|永久|根治|治愈|包治|保证见效|绝不复发|no\s+side\s+effects?|\bcure\b)/i.test(value)) blocker.push("广告文案包含保证治愈或绝对效果");
    if (/(仅剩\s*\d+|最后\s*\d+\s*个名额|倒计时|only\s+\d+\s+left|expires\s+in\s+\d+)/i.test(value)) risk.push("广告文案包含可能无法验证的紧迫营销");
    if (/(官方指定|政府认证|国家级认证|google\s+official|government\s+approved|federal\s+certified)/i.test(value)) risk.push("广告文案可能冒充官方或政府资质");
    if (/[!！]{4,}/.test(value)) advisory.push("广告文案存在过度夸张格式");
    return { blocker, risk, advisory };
  }

  function label(item) {
    return item.policyName || item.finding || item.title || item.policyCategory || "页面问题";
  }

  function calculate() {
    const issues = analysisData && Array.isArray(analysisData.detectedIssues) ? analysisData.detectedIssues : [];
    const findings = forensicsData && Array.isArray(forensicsData.findings) ? forensicsData.findings : [];
    const ad = scanAdCopy(adCopy);
    const blockers = [
      ...issues.filter((item) => String(item.severity).toUpperCase() === "CRITICAL").map(label),
      ...findings.filter((item) => item.severity === "high" && item.confidence === "high").map(label),
      ...ad.blocker,
    ];
    const risks = [
      ...issues.filter((item) => String(item.severity).toUpperCase() === "WARNING").map(label),
      ...findings.filter((item) => item.severity === "medium" || (item.severity === "high" && item.confidence !== "high")).map(label),
      ...ad.risk,
    ];
    const advisories = [
      ...issues.filter((item) => String(item.severity).toUpperCase() === "INFO").map(label),
      ...findings.filter((item) => item.severity === "low").map(label),
      ...ad.advisory,
    ];
    const blockerReasons = [...new Set(blockers.filter(Boolean))];
    const riskReasons = [...new Set(risks.filter(Boolean))];
    const advisoryReasons = [...new Set(advisories.filter(Boolean))];
    const coverageIncomplete = Boolean(forensicsData && forensicsData.coverage && forensicsData.coverage.complete === false);
    const incomplete = analysisFailed || forensicsFailed || coverageIncomplete || (!analysisData && !forensicsData);
    const technicalRisk = clamp(forensicsData && forensicsData.risk ? forensicsData.risk.overall : 0);
    const policyRisk = blockerReasons.length ? Math.min(95, 72 + blockerReasons.length * 7) : riskReasons.length ? Math.min(69, 34 + riskReasons.length * 8) : advisoryReasons.length ? Math.min(28, advisoryReasons.length * 4) : 5;
    const riskScore = clamp(Math.max(technicalRisk, policyRisk));

    if (blockerReasons.length) return { verdict: "不建议提交", level: "high", note: "发现可验证的阻断证据，建议修复后重新检测。", score: riskScore, blockers: blockerReasons, risks: riskReasons, advisories: advisoryReasons, incomplete };
    if (incomplete) return { verdict: "结果不完整，需要重试", level: "partial", note: "有访问身份超时或接口未完成。本次不能据此认定 AdsBot 被阻止，也不能给出最终提交结论。", score: null, blockers: [], risks: riskReasons, advisories: advisoryReasons, incomplete };
    if (riskReasons.length) return { verdict: "建议先修复再提交", level: "medium", note: "没有确认的致命问题，但存在需要修复或人工核实的明显风险。", score: riskScore, blockers: [], risks: riskReasons, advisories: advisoryReasons, incomplete };
    return { verdict: "页面层面可提交复核", level: "low", note: "当前未发现明确的页面阻断证据；账户、广告素材和付款资料仍需保持一致。", score: riskScore, blockers: [], risks: [], advisories: advisoryReasons, incomplete };
  }

  function host() {
    return document.getElementById("results-dashboard") || document.getElementById("dashboard-section");
  }

  function ensureCard() {
    const target = host();
    if (!target) return null;
    let card = document.getElementById("preflight-prediction-v3");
    if (!card) { card = document.createElement("div"); card.id = "preflight-prediction-v3"; }
    if (card.parentElement !== target) {
      const report = document.getElementById("forensics-report-v2");
      if (report && report.parentElement === target) target.insertBefore(card, report); else target.insertBefore(card, target.firstChild);
    }
    return card;
  }

  function render(force = false) {
    const card = ensureCard();
    if (!card) return;
    let className = "pf-card", html = "";
    if (running && !analysisData && !forensicsData) {
      html = `<div class="pf-loading">正在生成投放前页面审核...</div>`;
    } else if (!analysisData && !forensicsData && !analysisFailed && !forensicsFailed) {
      card.remove(); lastSignature = ""; return;
    } else {
      const result = calculate();
      const color = result.level === "high" ? "pf-bad" : result.level === "medium" ? "pf-warn" : result.level === "partial" ? "pf-blue" : "pf-good";
      const mainReasons = result.blockers.length ? result.blockers : result.risks;
      className = `pf-card ${result.level}`;
      html = `<div class="pf-row"><div><div class="pf-kicker">投放前页面审核状态</div><div class="pf-verdict ${color}">${esc(result.verdict)}</div><div class="pf-note">${esc(result.note)}</div><div class="pf-meta">${analysisData ? "<span>页面政策</span>" : ""}${forensicsData ? "<span>落地页技术</span>" : ""}${adCopy.trim() ? "<span>广告文案</span>" : ""}${result.incomplete ? "<span>扫描不完整</span>" : ""}</div></div><div><div class="pf-score ${color}">${result.score == null ? "--" : result.score}</div><div class="pf-score-label">页面审核风险</div></div></div><div class="pf-counts"><div class="pf-count"><strong class="pf-bad">${result.blockers.length}</strong><span>确认阻断问题</span></div><div class="pf-count"><strong class="pf-warn">${result.risks.length}</strong><span>明显风险 / 需核实</span></div><div class="pf-count"><strong>${result.advisories.length}</strong><span>完善建议</span></div></div><div class="pf-reasons"><strong>${result.blockers.length ? "确认阻断证据" : "优先核实的问题"}：</strong>${mainReasons.length ? esc(mainReasons.slice(0, 5).join("；")) : result.incomplete ? "请重新检测，等待四种访问身份完成。" : "当前未发现明确的页面阻断证据。"}</div>`;
    }
    const signature = `${className}|${html}`;
    if (!force && signature === lastSignature && card.parentElement === host()) return;
    card.className = className;
    if (card.innerHTML !== html) card.innerHTML = html;
    lastSignature = signature;
  }

  function maintain() {
    ensureInput(); bindForm();
    if (analysisData || forensicsData || analysisFailed || forensicsFailed || running) {
      const card = document.getElementById("preflight-prediction-v3");
      if (!card || card.parentElement !== host()) render(true);
    }
  }

  addStyles(); maintain(); window.setInterval(maintain, 500);
})();
