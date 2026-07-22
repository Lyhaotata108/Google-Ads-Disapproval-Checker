(() => {
  "use strict";

  const reasons = [
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
  const key = "google_ads_rejected_reasons";
  const selected = new Set(readSaved());
  let controller = null;
  let reportState = null;

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function addStyles() {
    if (document.getElementById("forensics-v2-css")) return;
    const style = document.createElement("style");
    style.id = "forensics-v2-css";
    style.textContent = `
      .fx-box{border:1px solid rgba(99,102,241,.24);background:rgba(15,23,42,.88);border-radius:14px;padding:14px;color:#e2e8f0;box-shadow:0 18px 45px rgba(0,0,0,.18)}
      .fx-input{margin-bottom:16px}.fx-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.fx-title{font-size:12px;font-weight:800;color:#c7d2fe}.fx-sub{font-size:10px;line-height:1.55;color:#94a3b8;margin-top:4px}.fx-count,.fx-tag{font-size:9px;padding:4px 7px;border-radius:999px;border:1px solid rgba(99,102,241,.28);background:rgba(79,70,229,.13);color:#c7d2fe;white-space:nowrap}.fx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}.fx-choice{display:flex;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(2,6,23,.42);font-size:11px;color:#cbd5e1;cursor:pointer}.fx-choice input{accent-color:#6366f1}.fx-report{margin-bottom:18px}.fx-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.fx-risks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}.fx-risk{padding:9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(2,6,23,.4)}.fx-risk-name{font-size:9px;color:#94a3b8}.fx-risk-score{font-size:20px;font-weight:900;margin-top:2px}.fx-low{color:#34d399}.fx-mid{color:#fbbf24}.fx-high{color:#f87171}.fx-section{border-top:1px solid rgba(255,255,255,.06);padding-top:12px;margin-top:13px}.fx-section-title{font-size:11px;font-weight:800;color:#cbd5e1;margin-bottom:8px}.fx-list{display:grid;gap:7px}.fx-item{border:1px solid rgba(255,255,255,.06);border-left:3px solid #6366f1;border-radius:9px;background:rgba(2,6,23,.38);padding:9px}.fx-item.high{border-left-color:#ef4444}.fx-item.medium{border-left-color:#f59e0b}.fx-item-title{display:flex;justify-content:space-between;gap:10px;font-size:11px;font-weight:800}.fx-level{font-size:8px;color:#94a3b8;white-space:nowrap}.fx-text{font-size:10px;line-height:1.55;color:#94a3b8;margin-top:6px;word-break:break-word}.fx-action{color:#cbd5e1}.fx-table-wrap{overflow:auto}.fx-table{width:100%;min-width:650px;border-collapse:collapse;font-size:9px}.fx-table th,.fx-table td{text-align:left;padding:7px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top;word-break:break-word}.fx-table th{color:#64748b}.fx-table td{color:#cbd5e1}.fx-details{margin-top:10px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(2,6,23,.35)}.fx-details summary{padding:9px;cursor:pointer;font-size:10px;color:#a5b4fc;font-weight:700}.fx-detail-body{padding:0 9px 9px;font-size:9px;line-height:1.6;color:#94a3b8;word-break:break-word}.fx-loading{display:flex;gap:9px;align-items:center;font-size:11px;color:#c7d2fe}.fx-spin{width:14px;height:14px;border:2px solid rgba(99,102,241,.25);border-top-color:#818cf8;border-radius:50%;animation:fxspin .8s linear infinite}.fx-error{font-size:11px;color:#fca5a5;line-height:1.6}.fx-empty{font-size:10px;color:#94a3b8;border:1px dashed rgba(255,255,255,.09);border-radius:9px;padding:9px}@keyframes fxspin{to{transform:rotate(360deg)}}
      @media(max-width:760px){.fx-grid{grid-template-columns:1fr}.fx-risks{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function ensureInput() {
    const form = document.getElementById("analyzer-form");
    if (!form) return;
    if (!document.getElementById("forensics-reason-box")) {
      const box = document.createElement("div");
      box.id = "forensics-reason-box";
      box.className = "fx-box fx-input";
      box.innerHTML = `
        <div class="fx-head"><div><div class="fx-title">Google Ads 已显示的拒登原因</div><div class="fx-sub">按后台提示勾选，可多选。系统会额外执行 AdsBot 对比、跳转链、脚本、iframe 和 robots.txt 技术取证。</div></div><span id="forensics-count" class="fx-count"></span></div>
        <div class="fx-grid">${reasons.map(([value,label]) => `<label class="fx-choice"><input type="checkbox" value="${value}" ${selected.has(value) ? "checked" : ""}><span>${esc(label)}</span></label>`).join("")}</div>`;
      const anchor = document.getElementById("site-type-selector-card") || form.querySelector("button[type='submit']");
      form.insertBefore(box, anchor);
      box.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        target.checked ? selected.add(target.value) : selected.delete(target.value);
        localStorage.setItem(key, JSON.stringify([...selected]));
        updateCount();
      });
      updateCount();
    }
    if (!form.dataset.forensicsV2Bound) {
      form.dataset.forensicsV2Bound = "1";
      form.addEventListener("submit", startScan, true);
    }
  }

  function updateCount() {
    const node = document.getElementById("forensics-count");
    if (node) node.textContent = `已选 ${selected.size} 项`;
  }

  function startScan() {
    const url = document.getElementById("url-text-input");
    const html = document.getElementById("html-textarea-input");
    const isRawMode = Boolean(html);
    const payload = {
      url: !isRawMode && url ? url.value.trim() : "",
      rawHtml: isRawMode && html ? html.value : "",
      isRawMode,
      rejectedReasons: [...selected],
    };
    if ((!isRawMode && !payload.url) || (isRawMode && !payload.rawHtml.trim())) return;
    run(payload);
  }

  async function run(payload) {
    if (controller) controller.abort();
    controller = new AbortController();
    reportState = { loading: true };
    render();
    try {
      const response = await fetch("/api/forensics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`技术取证接口返回异常：${text.slice(0,120)}`); }
      if (!response.ok) throw new Error(data.error || "技术取证扫描失败");
      reportState = { data };
    } catch (error) {
      if (error && error.name === "AbortError") return;
      reportState = { error: error && error.message ? error.message : "技术取证扫描失败" };
    }
    render();
  }

  function host() {
    return document.getElementById("results-dashboard") || document.getElementById("dashboard-section");
  }

  function container() {
    if (!reportState) return null;
    const target = host();
    if (!target) return null;
    let node = document.getElementById("forensics-report-v2");
    if (node && node.parentElement !== target) node.remove();
    if (!node || !document.body.contains(node)) {
      node = document.createElement("div");
      node.id = "forensics-report-v2";
      node.className = "fx-box fx-report";
      const kpi = document.getElementById("kpi-summary-ribbon");
      if (kpi && kpi.parentElement === target) kpi.insertAdjacentElement("afterend", node);
      else target.insertBefore(node, target.firstChild);
    }
    return node;
  }

  function render() {
    const node = container();
    if (!node) return;
    if (reportState.loading) {
      node.innerHTML = `<div class="fx-loading"><span class="fx-spin"></span><div><strong>正在执行拒登原因技术取证</strong><div class="fx-sub">模拟四种访问身份并检查跳转、脚本和 AdsBot 抓取差异。</div></div></div>`;
      return;
    }
    if (reportState.error) {
      node.innerHTML = `<div class="fx-title">拒登原因技术取证</div><div class="fx-error">${esc(reportState.error)}</div>`;
      return;
    }
    const data = reportState.data || {};
    const risk = data.risk || {};
    const findings = Array.isArray(data.findings) ? data.findings : [];
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const labels = Array.isArray(data.requestedReasonLabels) ? data.requestedReasonLabels : [];
    const domains = Array.isArray(data.externalDomains) ? data.externalDomains : [];
    node.innerHTML = `
      <div class="fx-head"><div><div class="fx-title">拒登原因技术取证报告</div><div class="fx-sub">公开落地页的黑盒证据，不等同于 Google 内部最终判定。优先处理高风险、高置信度项目。</div><div class="fx-tags">${(labels.length ? labels : ["通用技术扫描"]).map(v => `<span class="fx-tag">${esc(v)}</span>`).join("")}</div></div><span class="fx-count">${esc(new Date(data.scannedAt).toLocaleString("zh-CN"))}</span></div>
      <div class="fx-risks">${riskBox("综合风险",risk.overall)}${riskBox("规避系统",risk.circumventingSystems)}${riskBox("被侵网站",risk.compromisedSite)}${riskBox("目标网页",risk.destinationExperience)}</div>
      <div class="fx-section"><div class="fx-section-title">证据与处理顺序（${findings.length} 项）</div><div class="fx-list">${findings.length ? findings.slice(0,14).map(finding).join("") : `<div class="fx-empty">未发现明显的 AdsBot 差异、隐藏跳转或高危脚本。若仍提示“被侵网站”，需继续扫描 WordPress 文件、数据库和管理员账号。</div>`}</div></div>
      ${profiles.length ? `<div class="fx-section"><div class="fx-section-title">访问身份对比</div><div class="fx-table-wrap"><table class="fx-table"><thead><tr><th>身份</th><th>状态</th><th>最终网址</th><th>标题/正文</th><th>跳转</th></tr></thead><tbody>${profiles.map(profile).join("")}</tbody></table></div></div>` : ""}
      <details class="fx-details"><summary>robots.txt、外部域名和检测边界</summary><div class="fx-detail-body"><div><strong>robots.txt：</strong>${esc(data.robots ? data.robots.evidence : "源码模式未检测")}${data.robots && data.robots.error ? `；${esc(data.robots.error)}` : ""}</div><div style="margin-top:6px"><strong>外部域名：</strong>${domains.length ? esc(domains.join(", ")) : "未提取到"}</div>${Array.isArray(data.limitations) ? `<ul>${data.limitations.map(v => `<li>${esc(v)}</li>`).join("")}</ul>` : ""}</div></details>`;
  }

  function riskBox(name, value) {
    const score = Math.max(0, Math.min(100, Number(value) || 0));
    const cls = score >= 70 ? "fx-high" : score >= 35 ? "fx-mid" : "fx-low";
    return `<div class="fx-risk"><div class="fx-risk-name">${esc(name)}</div><div class="fx-risk-score ${cls}">${score}</div></div>`;
  }

  function finding(item) {
    const level = item.severity === "high" ? "高风险" : item.severity === "medium" ? "需核实" : "线索";
    return `<div class="fx-item ${esc(item.severity)}"><div class="fx-item-title"><span>${esc(item.title)}</span><span class="fx-level">${level} · ${esc(item.confidence || "")}</span></div><div class="fx-text"><strong>证据：</strong>${esc(item.evidence)}</div><div class="fx-text fx-action"><strong>处理：</strong>${esc(item.recommendation)}</div><div class="fx-text">来源：${esc(item.source || "页面扫描")}</div></div>`;
  }

  function profile(item) {
    const status = item.status == null ? (item.error || "失败") : `HTTP ${item.status}`;
    const jumps = Array.isArray(item.redirectChain) ? Math.max(0,item.redirectChain.length - 1) : 0;
    return `<tr><td>${esc(item.label)}</td><td class="${item.ok ? "fx-low" : "fx-high"}">${esc(status)}</td><td>${esc(item.finalUrl || "-")}</td><td>${esc(item.title || "无标题")}<br><span style="color:#64748b">正文 ${Number(item.visibleTextLength || 0)} 字符 · ${esc(item.contentHash || "-")}</span></td><td>${jumps} 次</td></tr>`;
  }

  addStyles();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      ensureInput();
      if (reportState) {
        const node = document.getElementById("forensics-report-v2");
        if (!node || node.parentElement !== host()) render();
      }
    });
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  ensureInput();
})();
