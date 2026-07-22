(() => {
  "use strict";

  const REASONS = [
    ["circumventing_systems", "规避系统"],
    ["compromised_site", "被侵网站"],
    ["malicious_software", "恶意软件"],
    ["destination_not_working", "目标网页无法正常运行"],
    ["destination_mismatch", "目标网页不匹配"],
    ["adsbot_access", "AdsBot 无法抓取"],
    ["misrepresentation", "虚假陈述"],
    ["unacceptable_business", "不可接受的商业行为"],
    ["other", "其他"],
  ];

  const STORAGE_KEY = "google_ads_rejected_reasons";
  const state = {
    selected: new Set(loadSelected()),
    loading: false,
    result: null,
    error: "",
    controller: null,
  };

  function loadSelected() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveSelected() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected]));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function riskClass(score) {
    if (score >= 70) return "gaf-risk-high";
    if (score >= 35) return "gaf-risk-medium";
    return "gaf-risk-low";
  }

  function severityLabel(value) {
    return value === "high" ? "高风险" : value === "medium" ? "需核实" : "线索";
  }

  function injectStyles() {
    if (document.getElementById("gaf-forensics-styles")) return;
    const style = document.createElement("style");
    style.id = "gaf-forensics-styles";
    style.textContent = `
      .gaf-reason-panel,.gaf-report{border:1px solid rgba(99,102,241,.22);background:rgba(30,41,59,.54);border-radius:14px;padding:14px;color:#e2e8f0;font-family:inherit;box-shadow:0 16px 40px rgba(0,0,0,.18)}
      .gaf-reason-panel{margin:0 0 16px}.gaf-panel-head,.gaf-report-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.gaf-title{font-size:12px;font-weight:800;color:#c7d2fe;letter-spacing:.04em}.gaf-help{font-size:10px;line-height:1.55;color:#94a3b8;margin-top:4px}.gaf-reason-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.gaf-reason{display:flex;align-items:center;gap:8px;padding:8px 9px;border:1px solid rgba(255,255,255,.06);background:rgba(2,6,23,.48);border-radius:10px;cursor:pointer;font-size:11px;color:#cbd5e1;transition:.18s}.gaf-reason:hover{border-color:rgba(99,102,241,.4);background:rgba(49,46,129,.22)}.gaf-reason input{accent-color:#6366f1}.gaf-selected-count{white-space:nowrap;font-size:9px;color:#a5b4fc;background:rgba(79,70,229,.16);border:1px solid rgba(99,102,241,.24);padding:4px 7px;border-radius:999px}
      .gaf-report{margin-bottom:18px;background:rgba(15,23,42,.88)}.gaf-report-title{font-size:14px;font-weight:850;color:#f8fafc}.gaf-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.gaf-badge{font-size:9px;padding:4px 7px;border-radius:999px;background:rgba(79,70,229,.14);border:1px solid rgba(99,102,241,.25);color:#c7d2fe}.gaf-scan-time{font-size:9px;color:#64748b;white-space:nowrap}.gaf-risk-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}.gaf-risk{border:1px solid rgba(255,255,255,.06);background:rgba(2,6,23,.42);border-radius:11px;padding:10px}.gaf-risk-name{font-size:9px;color:#94a3b8}.gaf-risk-score{font-size:20px;font-weight:900;margin-top:3px}.gaf-risk-high .gaf-risk-score{color:#f87171}.gaf-risk-medium .gaf-risk-score{color:#fbbf24}.gaf-risk-low .gaf-risk-score{color:#34d399}.gaf-section{margin-top:15px;border-top:1px solid rgba(255,255,255,.06);padding-top:14px}.gaf-section-title{font-size:11px;font-weight:800;color:#cbd5e1;margin-bottom:9px}.gaf-findings{display:grid;gap:8px}.gaf-finding{border:1px solid rgba(255,255,255,.06);border-left:3px solid #64748b;background:rgba(2,6,23,.4);border-radius:10px;padding:10px}.gaf-finding-high{border-left-color:#ef4444}.gaf-finding-medium{border-left-color:#f59e0b}.gaf-finding-low{border-left-color:#6366f1}.gaf-finding-top{display:flex;justify-content:space-between;gap:10px}.gaf-finding-name{font-size:11px;font-weight:800;color:#e2e8f0}.gaf-severity{font-size:8px;white-space:nowrap;padding:3px 6px;border-radius:999px;background:rgba(255,255,255,.05);color:#94a3b8}.gaf-evidence,.gaf-recommendation{font-size:10px;line-height:1.55;margin-top:7px;color:#94a3b8;word-break:break-word}.gaf-recommendation{color:#cbd5e1}.gaf-source{font-size:8px;color:#64748b;margin-top:6px}.gaf-profile-table{width:100%;border-collapse:collapse;font-size:9px}.gaf-profile-table th,.gaf-profile-table td{text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}.gaf-profile-table th{color:#64748b;font-weight:700}.gaf-profile-table td{color:#cbd5e1;word-break:break-word}.gaf-ok{color:#34d399}.gaf-bad{color:#f87171}.gaf-details{margin-top:10px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(2,6,23,.34)}.gaf-details summary{cursor:pointer;padding:10px;font-size:10px;font-weight:750;color:#a5b4fc}.gaf-details-body{padding:0 10px 10px;font-size:9px;line-height:1.6;color:#94a3b8;word-break:break-word}.gaf-loading{display:flex;align-items:center;gap:9px;font-size:11px;color:#c7d2fe}.gaf-spinner{width:15px;height:15px;border:2px solid rgba(99,102,241,.25);border-top-color:#818cf8;border-radius:50%;animation:gaf-spin .8s linear infinite}.gaf-error{color:#fca5a5;font-size:11px;line-height:1.6}.gaf-limitations{font-size:9px;line-height:1.6;color:#64748b;margin:0;padding-left:17px}.gaf-empty{font-size:10px;color:#94a3b8;padding:10px;border:1px dashed rgba(255,255,255,.08);border-radius:10px}
      @keyframes gaf-spin{to{transform:rotate(360deg)}}
      @media(max-width:760px){.gaf-reason-grid{grid-template-columns:1fr}.gaf-risk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gaf-profile-wrap{overflow-x:auto}.gaf-profile-table{min-width:650px}}
    `;
    document.head.appendChild(style);
  }

  function ensureReasonPanel() {
    const form = document.getElementById("analyzer-form");
    if (!form) return;

    if (!document.getElementById("gaf-rejection-reason-panel")) {
      const panel = document.createElement("div");
      panel.id = "gaf-rejection-reason-panel";
      panel.className = "gaf-reason-panel";
      panel.innerHTML = `
        <div class="gaf-panel-head">
          <div>
            <div class="gaf-title">Google Ads 已显示的拒登原因</div>
            <div class="gaf-help">先勾选后台看到的原因，技术取证会优先检查对应证据。可多选；未选择时执行通用扫描。</div>
          </div>
          <span class="gaf-selected-count" id="gaf-selected-count">已选 0 项</span>
        </div>
        <div class="gaf-reason-grid">
          ${REASONS.map(([value, label]) => `
            <label class="gaf-reason">
              <input type="checkbox" value="${value}" ${state.selected.has(value) ? "checked" : ""}>
              <span>${escapeHtml(label)}</span>
            </label>
          `).join("")}
        </div>
      `;
      const siteTypeCard = document.getElementById("site-type-selector-card");
      if (siteTypeCard) form.insertBefore(panel, siteTypeCard);
      else form.insertBefore(panel, form.querySelector("button[type='submit']"));

      panel.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.checked) state.selected.add(target.value);
        else state.selected.delete(target.value);
        saveSelected();
        updateSelectedCount();
      });
      updateSelectedCount();
    }

    if (!form.dataset.gafForensicsBound) {
      form.dataset.gafForensicsBound = "1";
      form.addEventListener("submit", handleAnalyzeSubmit, true);
    }
  }

  function updateSelectedCount() {
    const count = document.getElementById("gaf-selected-count");
    if (count) count.textContent = `已选 ${state.selected.size} 项`;
  }

  function handleAnalyzeSubmit() {
    const urlInput = document.getElementById("url-text-input");
    const htmlInput = document.getElementById("html-textarea-input");
    const isRawMode = Boolean(htmlInput);
    const payload = {
      url: !isRawMode && urlInput ? urlInput.value.trim() : "",
      rawHtml: isRawMode && htmlInput ? htmlInput.value : "",
      isRawMode,
      rejectedReasons: [...state.selected],
    };

    if ((!isRawMode && !payload.url) || (isRawMode && !payload.rawHtml.trim())) return;
    runForensics(payload);
  }

  async function runForensics(payload) {
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    state.loading = true;
    state.result = null;
    state.error = "";
    renderReport();

    try {
      const response = await fetch("/api/forensics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: state.controller.signal,
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`技术取证接口返回了非 JSON 内容：${text.slice(0, 120)}`);
      }
      if (!response.ok) throw new Error(data.error || "技术取证扫描失败");
      state.result = data;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      state.error = error && error.message ? error.message : "技术取证扫描失败";
    } finally {
      state.loading = false;
      renderReport();
    }
  }

  function reportHost() {
    const dashboard = document.getElementById("results-dashboard");
    if (dashboard) return dashboard;
    return document.getElementById("dashboard-section");
  }

  function ensureReportContainer() {
    const host = reportHost();
    if (!host || (!state.loading && !state.result && !state.error)) return null;
    let report = document.getElementById("gaf-forensics-report");
    if (!report) {
      report = document.createElement("div");
      report.id = "gaf-forensics-report";
      report.className = "gaf-report";
      const kpi = document.getElementById("kpi-summary-ribbon");
      if (kpi && kpi.parentNode === host) kpi.insertAdjacentElement("afterend", report);
      else host.insertBefore(report, host.firstChild);
    } else if (!document.body.contains(report)) {
      return null;
    }
    return report;
  }

  function renderReport() {
    const report = ensureReportContainer();
    if (!report) return;

    if (state.loading) {
      report.innerHTML = `
        <div class="gaf-loading"><span class="gaf-spinner"></span><div><strong>正在进行拒登原因技术取证</strong><div class="gaf-help">同时模拟普通桌面、普通手机、AdsBot 桌面和 AdsBot 手机，并检查跳转链、脚本、iframe 与 robots.txt。</div></div></div>
      `;
      return;
    }

    if (state.error) {
      report.innerHTML = `<div class="gaf-report-title">拒登原因技术取证</div><div class="gaf-error">${escapeHtml(state.error)}</div>`;
      return;
    }

    const data = state.result;
    if (!data) return;
    const risk = data.risk || {};
    const findings = Array.isArray(data.findings) ? data.findings : [];
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const labels = Array.isArray(data.requestedReasonLabels) ? data.requestedReasonLabels : [];
    const externalDomains = Array.isArray(data.externalDomains) ? data.externalDomains : [];
    const limitations = Array.isArray(data.limitations) ? data.limitations : [];

    report.innerHTML = `
      <div class="gaf-report-head">
        <div>
          <div class="gaf-report-title">拒登原因技术取证报告</div>
          <div class="gaf-help">这是公开页面的黑盒证据，不等同于 Google 内部最终判定。优先处理“高风险 + 高置信度”的项目。</div>
          <div class="gaf-badges">${labels.length ? labels.map((label) => `<span class="gaf-badge">${escapeHtml(label)}</span>`).join("") : `<span class="gaf-badge">通用技术扫描</span>`}</div>
        </div>
        <div class="gaf-scan-time">${escapeHtml(new Date(data.scannedAt).toLocaleString("zh-CN"))}</div>
      </div>

      <div class="gaf-risk-grid">
        ${riskBox("综合技术风险", risk.overall || 0)}
        ${riskBox("规避系统风险", risk.circumventingSystems || 0)}
        ${riskBox("被侵网站风险", risk.compromisedSite || 0)}
        ${riskBox("目标网页风险", risk.destinationExperience || 0)}
      </div>

      <div class="gaf-section">
        <div class="gaf-section-title">证据与排查顺序（${findings.length} 项）</div>
        <div class="gaf-findings">
          ${findings.length ? findings.slice(0, 14).map(renderFinding).join("") : `<div class="gaf-empty">本次公开页面扫描没有发现明显的跳转差异、AdsBot 阻断或高危脚本证据。若 Google 仍提示“被侵网站”，下一步应扫描 WordPress 文件、数据库和管理员账号。</div>`}
        </div>
      </div>

      ${profiles.length ? `
        <div class="gaf-section">
          <div class="gaf-section-title">四种访问身份对比</div>
          <div class="gaf-profile-wrap">
            <table class="gaf-profile-table">
              <thead><tr><th>访问身份</th><th>状态</th><th>最终网址</th><th>标题 / 文本</th><th>跳转</th></tr></thead>
              <tbody>${profiles.map(renderProfile).join("")}</tbody>
            </table>
          </div>
        </div>
      ` : ""}

      <details class="gaf-details">
        <summary>robots.txt、第三方域名与检测边界</summary>
        <div class="gaf-details-body">
          <div><strong>robots.txt：</strong>${escapeHtml(data.robots ? data.robots.evidence : "源码模式未检测")}${data.robots && data.robots.error ? `；${escapeHtml(data.robots.error)}` : ""}</div>
          <div style="margin-top:7px"><strong>页面引用的外部域名：</strong>${externalDomains.length ? escapeHtml(externalDomains.join(", ")) : "未提取到"}</div>
          ${limitations.length ? `<ul class="gaf-limitations">${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        </div>
      </details>
    `;
  }

  function riskBox(name, score) {
    const numeric = Math.max(0, Math.min(100, Number(score) || 0));
    return `<div class="gaf-risk ${riskClass(numeric)}"><div class="gaf-risk-name">${escapeHtml(name)}</div><div class="gaf-risk-score">${numeric}</div></div>`;
  }

  function renderFinding(item) {
    return `
      <div class="gaf-finding gaf-finding-${escapeHtml(item.severity)}">
        <div class="gaf-finding-top"><div class="gaf-finding-name">${escapeHtml(item.title)}</div><span class="gaf-severity">${severityLabel(item.severity)} · ${escapeHtml(item.confidence || "")}</span></div>
        <div class="gaf-evidence"><strong>证据：</strong>${escapeHtml(item.evidence)}</div>
        <div class="gaf-recommendation"><strong>处理：</strong>${escapeHtml(item.recommendation)}</div>
        <div class="gaf-source">来源：${escapeHtml(item.source || "页面扫描")}</div>
      </div>
    `;
  }

  function renderProfile(profile) {
    const status = profile.status == null ? (profile.error || "失败") : `HTTP ${profile.status}`;
    const redirectCount = Array.isArray(profile.redirectChain) ? Math.max(0, profile.redirectChain.length - 1) : 0;
    const title = profile.title || "无标题";
    return `
      <tr>
        <td>${escapeHtml(profile.label)}</td>
        <td class="${profile.ok ? "gaf-ok" : "gaf-bad"}">${escapeHtml(status)}</td>
        <td>${escapeHtml(profile.finalUrl || "-")}</td>
        <td>${escapeHtml(title)}<br><span style="color:#64748b">正文 ${Number(profile.visibleTextLength || 0)} 字符 · 指纹 ${escapeHtml(profile.contentHash || "-")}</span></td>
        <td>${redirectCount} 次</td>
      </tr>
    `;
  }

  injectStyles();
  const observer = new MutationObserver(() => {
    ensureReasonPanel();
    if (state.loading || state.result || state.error) renderReport();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureReasonPanel();
})();
