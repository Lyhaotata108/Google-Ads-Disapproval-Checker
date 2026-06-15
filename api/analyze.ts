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
    const { url, rawHtml, isRawMode, siteType = "local_service" } = req.body;
    
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

    const targetTypeLabel = "海外线下实体店铺/到店消费体验 (Overseas Local Business & Brick-and-Mortar Store / Offline Experience)";

    const complianceLensGuidance = `
      - **IMPORTANT AUDIT LENS (海外线下实体店铺与到店体验落地页商户评估准则 - 如美疗SPA实体店、诊所、汽车维修/租赁、实体商铺展示、线下娱乐/餐饮等)**:
        * 这个落地页主要用于广告引流、吸引客户直接到店消费或致电预约，而不是在线购买或加入购物车直邮寄送。因此：不要判定缺少“在线电商直邮退换货政策 (Shipping/Refund Shipping Policy)”或在线支付安全标章为 Critical 或 Warning。
        * **核心必备要件审计（如果缺失，直接判定为 CRITICAL 致命高危，因为谷歌会判定虚假陈述 Misrepresentation 导致封账户）**:
          1. 线上必须写明线下物理实体真实地址 (Exact physical address of the retail store or storefront).
          2. 可供拨打的联系电话 (Telephone number for direct dial / consulting / booking) 以及对应的营业时间说明。
          3. 包含电子邮箱 (Email) 或可追溯的联系表格。
          4. 必须能提供一个真正的“隐私政策 (Privacy Policy)”和“用户协议/免责条款 (Terms of Service)”，且底部的这些文件跳转链接绝对不能是空死链 (例如 href="javascript:void(0)" 或 href="#")。
        * 检查内容描述中是否有夸大性、欺骗性、诱导性的“绝对化效果宣称”：例如本地理疗/SPA/按摩不能宣称“一次即可永久根治腰椎病”、“治愈一切慢性痛症”等大健康或者医疗绝对化保障；高昂自愿消费必须有透明展示。
        * 必须有体验科学差异性的免责/提示语（e.g., "免责声明：体验成效因人而异"）。
    `;

    const prompt = `
      You are an expert Google Ads Specialist and Policy Compliance Specialist. 
      Analyze the following HTML / Web content to identify strictly CRITICAL potential issues (致命高危) that would lead to immediate "Google Ads Disapproval" (广告拒登), account suspensions (如 "规避系统" Circumventing Systems, "虚假陈述" Misrepresentation, "不可接受的商业行为" Unacceptable Business Practices).
      
      CRITICAL AUDIT DIRECTIVE: Only detect high-impact, critical policy violations with severity "CRITICAL". Do not detect or suggest mild warnings (WARNING) or minor detail optimizations (INFO). We only require CRITICAL issues.

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

      You must return JSON format that adheres exactly to the schema. All detected issues must strictly have "severity": "CRITICAL".
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
                      "severity": "CRITICAL",
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

    // Strict schema boundary: filter for CRITICAL issues only
    if (data && data.detectedIssues) {
      data.detectedIssues = data.detectedIssues.filter((issue: any) => issue.severity === "CRITICAL");
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
