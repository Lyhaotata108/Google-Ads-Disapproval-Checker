export interface ViolationIssue {
  id: string;
  policyCategory: string; // e.g. "虚假陈述", "目标地体验", "规避系统", "受限制内容"
  policyName: string; // e.g. "商家信息不全", "不真实夸大宣称", "缺少必备法律条款", "无法正常加载"
  severity: "CRITICAL" | "WARNING" | "INFO";
  finding: string; // Detail explanation of what was found
  offendingElement: string; // Specific HTML code, tag, line or text causing violation
  reason: string; // Why Google Ads rejects this
  suggestion: string; // Actions to fix
  whereToFix: string; // Code location instructions
  suggestedCode?: string; // High-fidelity rewritten HTML snippet
}

export interface LegalPoliciesCheck {
  hasPrivacyPolicy: boolean;
  hasTermsOfService: boolean;
  hasRefundPolicy: boolean;
  hasContactInfo: boolean;
  privacyPolicyUri?: string;
  termsOfServiceUri?: string;
  refundPolicyUri?: string;
  contactInfoDetails?: string;
}

export interface AnalysisResult {
  url: string;
  isCompliant: boolean;
  complianceScore: number; // 0 - 100
  detectedIssues: ViolationIssue[];
  legalPages: LegalPoliciesCheck;
  generalRecommendations: string[];
}

export interface MockSample {
  id: string;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  htmlContent: string;
}

export interface SearchHistoryItem {
  id: string;
  url: string;
  timestamp: string;
  score: number;
  isCompliant: boolean;
  issuesCount: number;
}
