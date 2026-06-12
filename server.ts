import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Initialize Google Ads Policy Analyzer with Gemini API
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("Waring: GEMINI_API_KEY is not configured or uses placeholder value.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

const ai = getGeminiClient();

// Helper to scrape web page
async function fetchWebPage(urlStr: string): Promise<{ html: string; textSummary: string; error?: string }> {
  try {
    let targetUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }
    
    // Ensure URL is valid
    new URL(targetUrl);

    console.log(`Scraping webpage: ${targetUrl}`);
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Truncate html to avoid burning massive tokens, extracting key structure
    // We clean script/style contents to save space but keep metadata, headers, visible content, and links
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "[script removed]")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "[style removed]")
      .substring(0, 75000); // 75k chars is safe and fits well

    return { html: cleanHtml, textSummary: cleanHtml.substring(0, 1000) };
  } catch (err: any) {
    console.error("Scraping failed:", err);
    return { html: "", textSummary: "", error: err.message || "无法访问该网址，可能由于该站点的防爬虫策略或访问限制。请尝试使用直接粘贴网页源代码或文本模式进行检测！" };
  }
}

// REST API for checking website Google Ads Policies compliance
function robustJsonParse(text: string): any {
  let cleanText = text.trim();
  
  // Try direct parse first
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // try to extract block wrapped in ```json ... ``` or ``` ... ```
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = cleanText.match(markdownRegex);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (innerErr) {
        cleanText = match[1].trim();
      }
    }
  }

  // If still fails, try to extract from the first '{' to the last '}'
  const startIdx = cleanText.indexOf("{");
  const endIdx = cleanText.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    try {
      return JSON.parse(cleanText.substring(startIdx, endIdx + 1));
    } catch (finalErr: any) {
      throw new Error(`JSON 解析失败: ${finalErr.message}. 原始返回内容: ${text.substring(0, 300)}...`);
    }
  }

  throw new Error(`无法从返回文本中提取出有效的 JSON 数据结构。原始返回内容: ${text.substring(0, 300)}...`);
}

app.post("/api/analyze", async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { url, rawHtml, isRawMode, siteType = "ecommerce" } = req.body;
    
    let contentsToAnalyze = "";
    let sourceUrl = url || "直接粘贴输入";
    let scrapError = "";

    if (isRawMode) {
      contentsToAnalyze = rawHtml || "";
    } else {
      if (!url) {
        res.status(400).json({ error: "请输入需要检测的网址！" });
        return;
      }
      const scrapeResult = await fetchWebPage(url);
      if (scrapeResult.error) {
        scrapError = scrapeResult.error;
        // In case fetching fails, we still allow proceeding if we have some text or abort with error
        res.status(500).json({ error: scrapeResult.error });
        return;
      }
      contentsToAnalyze = scrapeResult.html;
    }

    if (!contentsToAnalyze || contentsToAnalyze.trim().length === 0) {
      res.status(400).json({ error: "未检测到任何可供分析的页面内容或HTML代码！" });
      return;
    }

    // Dynamic adaptation of auditing thresholds based on ad category selected
    const siteTypeLabels: Record<string, string> = {
      ecommerce: "DTC跨境与电商直邮 (DTC Ecommerce / Online Cart Direct Sales)",
      local_service: "本地生活/线下实体商户展示 (Local Services / Offline Store Consultation like SPA, clinic, repair, wellness)",
      health_nutrition: "大健康功效推广 (Therapeutic health benefits, body slimming, health tech)"
    };

    const targetTypeLabel = siteTypeLabels[siteType as string] || siteTypeLabels.ecommerce;

    const complianceLensGuidance = 
      siteType === "local_service" 
        ? `
        - **IMPORTANT AUDIT LENS (本地生活与实体服务展示类商户专属评估准则 - 💆SPA实体店、诊所、本地服务、电话获客)**:
          * 实体店/服务展示类页面不包含在线收银或加入购物车功能。因此：**不要 (DO NOT)** 判定缺少“Refund Policy”(退换货规则/退钱政策) 或在线支付安全标章为 Critical 或 Warning（只需在 legalPages 中做客观标记，不应扣减大量分数或报警）。
          * **核心要件重点审计**: 本地实体商业最看重真实性与联系渠道。检查页面是否有：
            1. 线下具体地址 (Physical address)
            2. 真实的客服电话 (Phone number) 与营业时间 
            3. 地图标注或路线提示。
          * 检查描述中是否有对功效的夸大，例如 SPA 按摩或理疗不能宣称“根治腰椎间盘突出”、“治愈顽固疾病”等保健/医疗绝对化违规词。
        ` 
        : siteType === "health_nutrition" 
        ? `
        - **IMPORTANT AUDIT LENS (大健康功效推广专属评估准则 - 💊功效宣称、保健医疗、减肥)**:
          * 重点检测是否包含违反谷歌“保健和医药限制”的成分陈述，如夸大医疗奇迹、保障100%见效、疗程保证。
          * 检测页面是否有：未声明效果因人而异、缺少必要的“免责声明”(Disclaimer)、使用虚假专家背书等导致账户大面积永久封杀 (Suspension) 的重灾区因素。
        `
        : `
        - **IMPORTANT AUDIT LENS (DTC线上直接交易电商专属评估准则 - 🛒标准电商独立站)**:
          * 极度严格。必须具备完整的:
            1. 隐私政策 (Privacy Policy)
            2. 服务条款 (Terms of Service)
            3. 详细的退换货条款政策 (Refund & Return Policy - 包含天数、运费谁付、退货地址)
            4. 配送政策 (Shipping Policy - 包含配送国家、时效、计算方式)。
          * 检查是否缺失任何消保要件，否则会被谷歌判定为“虚假陈述”直接封户。
        `;

    // Call Gemini to parse and match Google Ads Policies:
    const prompt = `
      You are an expert Google Ads Specialist and Policy Compliance Specialist. 
      Analyze the following HTML / Web content to identify potential issues that would lead to "Google Ads Disapproval" (广告拒登), account suspensions (如 "规避系统" Circumventing Systems, "虚假陈述" Misrepresentation, "不可接受的商业行为" Unacceptable Business Practices), or low quality score flags.

      The business model / ad landing page type selected is: "${targetTypeLabel}". Apply the specific auditing filters below.

      HTML/Content to analyze:
      \`\`\`html
      ${contentsToAnalyze.substring(0, 60000)}
      \`\`\`

      Analyze strictly based on Google Advertising Policies including:
      - **Misrepresentation**: Look for absence of specific physical address, lack of phone/email, fake visual widgets, unreal testimonials, lack of transparent prices, refund policy details missing.
      - **Landing Page Experience**: Autoplay elements, redirects, missing legal policies, non-functional links, blank segments, generic templates, placeholders like "Lorem Ipsum".
      - **Restricted/Dangerous Content**: Exaggerated medical/pharmaceutical promises, violent materials, copyright violations, weapon terms.
      - **Required Disclosures/Legal pages**: Check specifically for "Privacy Policy", "Terms of Service", "Return/Refund Policy", "Contact Us" links and page presence.

      ${complianceLensGuidance}

      You must return JSON format that adheres exactly to the schema. 
    `;

    let data;

    if (req.body.apiSettings && req.body.apiSettings.apiKey && req.body.apiSettings.apiKey.trim() !== "") {
      const { apiKey, baseUrl, model, apiType } = req.body.apiSettings;
      const finalModel = model ? model.trim() : (apiType === "openai" ? "gpt-4o" : "gemini-3.5-flash");
      
      if (apiType === "openai" || (baseUrl && baseUrl.trim().length > 0)) {
        let cleanBaseUrl = baseUrl ? baseUrl.trim() : "https://api.openai.com/v1";
        
        // Auto-correct Squarefaceicon URLs to avoid common mistypes
        const lowerUrl = cleanBaseUrl.toLowerCase();
        if (lowerUrl.includes("squarefaceicon.org")) {
          console.log(`[Auto-Correction] Normalizing squarefaceicon URL "${cleanBaseUrl}" to actual API endpoint "https://api.squarefaceicon.org/v1"`);
          cleanBaseUrl = "https://api.squarefaceicon.org/v1";
        }

        if (cleanBaseUrl.endsWith("/")) {
          cleanBaseUrl = cleanBaseUrl.slice(0, -1);
        }
        
        console.log(`Calling Custom Proxy API at: ${cleanBaseUrl}/chat/completions using model: ${finalModel}`);
        
        let fetchRes;
        let fetchErrorMsg = "";
        
        // Attempt 1: with response_format: json_object (helps ensure json response on APIs that support it)
        try {
          fetchRes = await fetch(`${cleanBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
              model: finalModel,
              messages: [
                {
                  role: "system",
                  content: `You are an expert Google Ads Specialist and Policy Compliance Specialist. You analyze webpage markup/text specifically for Google Ads disapproval indicators and policy issues. Explain findings, suggestions, and locations in Chinese (简体中文). 
Your output MUST be a valid JSON object matching the exact schema definition, with NO other text or markdown decorators. Do not wrap inside extra text.`
                },
                {
                  role: "user",
                  content: prompt + `\n\nReturn EXACTLY a JSON structure matching this shape:
                  {
                    "isCompliant": boolean,
                    "complianceScore": number (0 to 100),
                    "detectedIssues": [
                      {
                        "id": "string",
                        "policyCategory": "string",
                        "policyName": "string",
                        "severity": "CRITICAL" | "WARNING" | "INFO",
                        "finding": "string",
                        "offendingElement": "string",
                        "reason": "string",
                        "suggestion": "string",
                        "whereToFix": "string",
                        "suggestedCode": "string"
                      }
                    ],
                    "legalPages": {
                      "hasPrivacyPolicy": boolean,
                      "hasTermsOfService": boolean,
                      "hasRefundPolicy": boolean,
                      "hasContactInfo": boolean,
                      "privacyPolicyUri": "string",
                      "termsOfServiceUri": "string",
                      "refundPolicyUri": "string",
                      "contactInfoDetails": "string"
                    },
                    "generalRecommendations": ["string"]
                  }`
                }
              ],
              response_format: { type: "json_object" }
            })
          });
        } catch (err: any) {
          fetchErrorMsg = err.message || JSON.stringify(err);
          console.warn(`Attempt 1 failed with connection error: ${fetchErrorMsg}. Will retry without response_format.`);
        }

        // Attempt 2: If Attempt 1 failed or returned non-OK status (e.g. 400 Bad Request because provider does not support response_format), retry without response_format
        if (!fetchRes || !fetchRes.ok) {
          const statusStr = fetchRes ? `HTTP Code: ${fetchRes.status}` : "Network Error";
          console.log(`OpenAI API attempt 1 is non-compliant/failed under "${statusStr}". Retrying standard text format payload...`);
          
          try {
            fetchRes = await fetch(`${cleanBaseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey.trim()}`
              },
              body: JSON.stringify({
                model: finalModel,
                messages: [
                  {
                    role: "system",
                    content: `You are an expert Google Ads Specialist and Policy Compliance Specialist. You analyze webpage markup/text specifically for Google Ads disapproval indicators and policy issues. Explain findings, suggestions, and locations in Chinese (简体中文). 
Your output MUST be a valid JSON object matching the exact schema definition. Return raw JSON text only.`
                  },
                  {
                    role: "user",
                    content: prompt + `\n\nReturn EXACTLY a JSON structure matching this shape:
                    {
                      "isCompliant": boolean,
                      "complianceScore": number (0 to 100),
                      "detectedIssues": [
                        {
                          "id": "string",
                          "policyCategory": "string",
                          "policyName": "string",
                          "severity": "CRITICAL" | "WARNING" | "INFO",
                          "finding": "string",
                          "offendingElement": "string",
                          "reason": "string",
                          "suggestion": "string",
                          "whereToFix": "string",
                          "suggestedCode": "string"
                        }
                      ],
                      "legalPages": {
                        "hasPrivacyPolicy": boolean,
                        "hasTermsOfService": boolean,
                        "hasRefundPolicy": boolean,
                        "hasContactInfo": boolean,
                        "privacyPolicyUri": "string",
                        "termsOfServiceUri": "string",
                        "refundPolicyUri": "string",
                        "contactInfoDetails": "string"
                      },
                      "generalRecommendations": ["string"]
                    }`
                  }
                ]
              })
            });
          } catch (retryErr: any) {
            throw new Error(`无法连接中转API并发生了网络连接被拒或超时: ${retryErr.message}. (Attempt 1 was: ${fetchErrorMsg})`);
          }
        }

        if (!fetchRes.ok) {
          const rawErr = await fetchRes.text();
          // Check if it's an HTML page
          if (rawErr.trim().startsWith("<!") || rawErr.trim().startsWith("<html") || rawErr.trim().startsWith("<div")) {
            throw new Error(`中转API返回了 HTML 错误页面 (HTTP ${fetchRes.status})。这通常是因为中转站 Base URL 填写错误、由于跨域/云盾拦截、或该代理服务正处于离线/错误状态。错误页面缩略: ${rawErr.substring(0, 200).replace(/<[^>]*>/g, "").trim()}`);
          }
          throw new Error(`中转API调用返回错误状况 [HTTP Code ${fetchRes.status}]: ${rawErr || fetchRes.statusText}`);
        }

        const rawResText = await fetchRes.text();
        let resData: any;
        try {
          resData = JSON.parse(rawResText);
        } catch (jsonErr: any) {
          if (rawResText.trim().startsWith("<!") || rawResText.trim().startsWith("<html") || rawResText.trim().startsWith("<div")) {
            throw new Error(`中转API返回了 HTML 网页而非 JSON 数据 (HTTP ${fetchRes.status})。这代表填写的中转站 Base URL (${cleanBaseUrl}) 可能不正确、接口发生了重定向、或代理网关返回了错误页面。HTML前150字: ${rawResText.substring(0, 150).replace(/<[^>]*>/g, "").trim()}`);
          }
          throw new Error(`中转API响应解析 JSON 失败 (HTTP ${fetchRes.status})。原始返回报文: ${rawResText.substring(0, 200)}`);
        }

        // If the proxy returns an OpenAI-compatible error object, bubble it up directly!
        if (resData.error && resData.error.message) {
          throw new Error(`中转服务商返回报错: ${resData.error.message} (代码: ${resData.error.code || "无"})`);
        }

        const content = resData.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error(`中转站接口未返回有效的文本内容 (choices[0].message.content 为空)。接口完整返回: ${JSON.stringify(resData).substring(0, 300)}`);
        }

        data = robustJsonParse(content);
      } else {
        // Dynamic custom Gemini directly
        console.log(`Calling Custom Gemini API Key natively using model: ${finalModel}`);
        const customAi = new GoogleGenAI({ apiKey: apiKey.trim() });
        const response = await customAi.models.generateContent({
          model: finalModel,
          contents: prompt,
          config: {
            systemInstruction: `You analyze webpage markup/text specifically for Google Ads disapproval indicators and policy issues.
Always output valid JSON strictly aligned with the specified schema description. 
Explain findings, suggestions, and locations in Chinese (简体中文).`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              required: ["isCompliant", "complianceScore", "detectedIssues", "legalPages", "generalRecommendations"],
              properties: {
                isCompliant: { type: Type.BOOLEAN },
                complianceScore: { type: Type.INTEGER },
                detectedIssues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["id", "policyCategory", "policyName", "severity", "finding", "offendingElement", "reason", "suggestion", "whereToFix", "suggestedCode"],
                    properties: {
                      id: { type: Type.STRING },
                      policyCategory: { type: Type.STRING },
                      policyName: { type: Type.STRING },
                      severity: { type: Type.STRING },
                      finding: { type: Type.STRING },
                      offendingElement: { type: Type.STRING },
                      reason: { type: Type.STRING },
                      suggestion: { type: Type.STRING },
                      whereToFix: { type: Type.STRING },
                      suggestedCode: { type: Type.STRING }
                    }
                  }
                },
                legalPages: {
                  type: Type.OBJECT,
                  required: ["hasPrivacyPolicy", "hasTermsOfService", "hasRefundPolicy", "hasContactInfo"],
                  properties: {
                    hasPrivacyPolicy: { type: Type.BOOLEAN },
                    hasTermsOfService: { type: Type.BOOLEAN },
                    hasRefundPolicy: { type: Type.BOOLEAN },
                    hasContactInfo: { type: Type.BOOLEAN },
                    privacyPolicyUri: { type: Type.STRING },
                    termsOfServiceUri: { type: Type.STRING },
                    refundPolicyUri: { type: Type.STRING },
                    contactInfoDetails: { type: Type.STRING }
                  }
                },
                generalRecommendations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            }
          }
        });

        const resultText = response.text;
        if (!resultText) {
          throw new Error("No response was generated from custom specified Gemini key.");
        }
        data = JSON.parse(resultText);
      }
    } else {
      // Default dynamic model
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You analyze webpage markup/text specifically for Google Ads disapproval indicators and policy issues.
Always output valid JSON strictly aligned with the specified schema description. 
Explain findings, suggestions, and locations in Chinese (简体中文) so the user understands exactly how to update their code.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["isCompliant", "complianceScore", "detectedIssues", "legalPages", "generalRecommendations"],
            properties: {
              isCompliant: {
                type: Type.BOOLEAN,
                description: "Whether the page is predicted to safely pass Google Ads checks without disapproval warnings.",
              },
              complianceScore: {
                type: Type.INTEGER,
                description: "Overall compliance rating score from 0 (heavily offending) to 100 (fully compliant).",
              },
              detectedIssues: {
                type: Type.ARRAY,
                description: "Detailed list of policy issues matched in the code.",
                items: {
                  type: Type.OBJECT,
                  required: ["id", "policyCategory", "policyName", "severity", "finding", "offendingElement", "reason", "suggestion", "whereToFix", "suggestedCode"],
                  properties: {
                    id: { type: Type.STRING, description: "Unique identifier, e.g. 'issue-1'" },
                    policyCategory: { type: Type.STRING, description: "Google Ads Policy primary category, e.g. 虚假陈述, 目标地体验, 规避系统, 受限制内容" },
                    policyName: { type: Type.STRING, description: "Specific policy rule, e.g. 商家信息不全, 不真实陈述, 无法提供正常体验, 缺少必备法律条款" },
                    severity: { type: Type.STRING, description: "CRITICAL, WARNING, or INFO" },
                    finding: { type: Type.STRING, description: "Detailed discovery described in Chinese." },
                    offendingElement: { type: Type.STRING, description: "The specific HTML code, tag, text, link or element found in the web code. Use real snippets or text patterns. Put '网页全局' if not a specific tag." },
                    reason: { type: Type.STRING, description: "Explain why this fails Google Ads requirements in detail (in Chinese)." },
                    suggestion: { type: Type.STRING, description: "Clear actionable step on what to modify/add/delete (in Chinese)." },
                    whereToFix: { type: Type.STRING, description: "Where in the project code or page structure this exists, e.g., 页脚链接、底部文字、<head>部分、全局页面等 (in Chinese)." },
                    suggestedCode: { type: Type.STRING, description: "The perfectly modified/rewritten valid HTML code or raw element string which is 100% compliant and ready to be copied/substituted. It must correspond directly to the offendingElement and fix the violation described." }
                  }
                }
              },
              legalPages: {
                type: Type.OBJECT,
                required: ["hasPrivacyPolicy", "hasTermsOfService", "hasRefundPolicy", "hasContactInfo"],
                properties: {
                  hasPrivacyPolicy: { type: Type.BOOLEAN, description: "Presence of standard Privacy Policy (隐私政策) link or text" },
                  hasTermsOfService: { type: Type.BOOLEAN, description: "Presence of Terms of Service / Conditions of Use (服务条款) link or text" },
                  hasRefundPolicy: { type: Type.BOOLEAN, description: "Presence of Refund/Return Policy (退换配退改政策) link or text" },
                  hasContactInfo: { type: Type.BOOLEAN, description: "Presence of phone, real physical address, or verifiable company credentials" },
                  privacyPolicyUri: { type: Type.STRING, description: "Identified URL or placeholder text found" },
                  termsOfServiceUri: { type: Type.STRING, description: "Identified URL or placeholder text found" },
                  refundPolicyUri: { type: Type.STRING, description: "Identified URL or placeholder text found" },
                  contactInfoDetails: { type: Type.STRING, description: "Verifiable details found in header/footer" }
                }
              },
              generalRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Strategic advice list for improving conversion rates and avoiding random Ads account suspension."
              }
            }
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("No response matching the policies analysis schema was generated from Gemini.");
      }
      data = JSON.parse(resultText);
    }
    res.json({
      url: sourceUrl,
      ...data
    });

  } catch (error: any) {
    console.error("Analysis route error:", error);
    res.status(500).json({
      error: error.message || "执行广告拒登分析时发生不可预知的服务器内部错误，请检查API Key设置或重试。"
    });
  }
});

// Setup dev server or static build serving
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated successfully.");
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving production static elements from:", distPath);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started in ${process.env.NODE_ENV || "development"} mode on http://localhost:${PORT}`);
  });
}

setupServer();
