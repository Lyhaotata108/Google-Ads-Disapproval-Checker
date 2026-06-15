import { GoogleGenAI, Type } from "@google/genai";

// Scraping helper
async function fetchWebPage(urlStr: string): Promise<{ html: string; textSummary: string; error?: string }> {
  try {
    let targetUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }
    
    new URL(targetUrl);

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
    
    // Clean script and style contents to fit tokens
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "[script removed]")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "[style removed]")
      .substring(0, 75000);

    return { html: cleanHtml, textSummary: cleanHtml.substring(0, 1000) };
  } catch (err: any) {
    return { html: "", textSummary: "", error: err.message || "无法访问该网址，可能由于该站点的防爬虫策略或访问限制。请尝试使用直接粘贴网页源代码或文本模式进行检测！" };
  }
}

// JSON extraction helper
function robustJsonParse(text: string): any {
  let cleanText = text.trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // try block
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

// Vercel Serverless custom route handler
export default async function handler(req: any, res: any) {
  // Support CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { url, rawHtml, isRawMode, siteType = "ecommerce" } = req.body;
    
    let contentsToAnalyze = "";
    let sourceUrl = url || "直接粘贴输入";

    if (isRawMode) {
      contentsToAnalyze = rawHtml || "";
    } else {
      if (!url) {
        return res.status(400).json({ error: "请输入需要检测的网址！" });
      }
      const scrapeResult = await fetchWebPage(url);
      if (scrapeResult.error) {
        return res.status(500).json({ error: scrapeResult.error });
      }
      contentsToAnalyze = scrapeResult.html;
    }

    if (!contentsToAnalyze || contentsToAnalyze.trim().length === 0) {
      return res.status(400).json({ error: "未检测到任何可供分析的页面内容或HTML代码！" });
    }

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

    // Check custom settings
    if (req.body.apiSettings && req.body.apiSettings.apiKey && req.body.apiSettings.apiKey.trim() !== "") {
      const { apiKey, baseUrl, model, apiType } = req.body.apiSettings;
      const finalModel = model ? model.trim() : (apiType === "openai" ? "gpt-4o" : "gemini-3.5-flash");

      if (apiType === "openai" || (baseUrl && baseUrl.trim().length > 0)) {
        let cleanBaseUrl = baseUrl ? baseUrl.trim() : "https://api.openai.com/v1";
        
        const lowerUrl = cleanBaseUrl.toLowerCase();
        if (lowerUrl.includes("squarefaceicon.org")) {
          cleanBaseUrl = "https://api.squarefaceicon.org/v1";
        }

        if (cleanBaseUrl.endsWith("/")) {
          cleanBaseUrl = cleanBaseUrl.slice(0, -1);
        }

        const fetchRes = await fetch(`${cleanBaseUrl}/chat/completions`, {
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
                content: "You are an expert Google Ads Specialist and Policy Compliance Specialist. Output raw JSON ONLY."
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

        if (!fetchRes.ok) {
          const rawErr = await fetchRes.text();
          return res.status(fetchRes.status).json({ error: `中转API调用返回错误状况 [HTTP Code ${fetchRes.status}]: ${rawErr}` });
        }

        const resData = await fetchRes.json();
        if (resData.error && resData.error.message) {
          return res.status(400).json({ error: resData.error.message });
        }

        const content = resData.choices?.[0]?.message?.content;
        data = robustJsonParse(content);
      } else {
        // Direct Custom Gemini Key
        const customAi = new GoogleGenAI({ apiKey: apiKey.trim() });
        const response = await customAi.models.generateContent({
          model: finalModel,
          contents: prompt,
          config: {
            systemInstruction: "You are an expert Google Ads Specialist and Policy Compliance Specialist.",
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
        
        data = JSON.parse(response.text || "{}");
      }
    } else {
      // Default global system key
      const siteApiKey = process.env.GEMINI_API_KEY;
      if (!siteApiKey) {
        return res.status(500).json({ error: "服务器端的 GEMINI_API_KEY 未配置！请在您的 Vercel 环境变量中添加 GEMINI_API_KEY，或在页面顶部的「API 接口配置」中配置您个人的 API Key。" });
      }

      const ai = new GoogleGenAI({ apiKey: siteApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert Google Ads Specialist and Policy Compliance Specialist. Always output valid JSON strictly aligned with the schema.",
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

      data = JSON.parse(response.text || "{}");
    }

    return res.status(200).json({
      url: sourceUrl,
      ...data
    });

  } catch (error: any) {
    console.error("Vercel Serverless Route Error:", error);
    return res.status(500).json({
      error: error.message || "执行广告拒登分析时发生不可预知的服务器内部错误。"
    });
  }
}
