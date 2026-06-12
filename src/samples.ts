import { MockSample } from "./types";

export const PRESET_SAMPLES: MockSample[] = [
  {
    id: "medical-miracle",
    title: "「奇迹健康胖胖消」神奇减肥药单页 (减肥神药违规站)",
    badge: "致命违规 (医药/虚假承诺)",
    badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
    description: "具有典型的虚假陈述、未临床证实效果的奇迹承诺、以及缺少隐私政策等多个谷歌广告不准入条款。",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
    <title>奇迹健康胖胖消 - 1个星期极速瘦身20公斤！</title>
    <meta name="description" content="全新黑科技纳米神级减肥药，不管你吃多少都能躺着瘦！" />
</head>
<body>
    <header>
        <h1>💎 2026年诺贝尔医学奖级神作：胖胖消超级减肥片 💎</h1>
        <p>独家黑科技！突破物理阻断技术，只要吃一片，1小时狂烧3000大卡！</p>
    </header>

    <main>
        <section class="miracle-claims">
            <h2>🔥 惊人承诺：无需运动，无需节食，7天狂瘦20公斤！🔥</h2>
            <p>我们承诺100%见效，治愈任何顽固性肥胖，终生不反弹！</p>
            <div class="testimony-card">
                <img src="fake-doctor.jpg" alt="世界顶级医生张教授" />
                <p>「这是人类医学史上的奇迹！我敢保证世界上没有比这更好的减肥药。」 -- 哈佛著名营养学兼减肥大师 Dr. Max</p>
            </div>
        </section>

        <section class="fake-urgency">
            <h3>⚠️ 警告：库存仅剩 3 件，倒计时即将结束！</h3>
            <div id="fake-timer">00:04:59</div>
            <p>原价 $999，今天一折秒杀价只需要 $99！立即抢购！</p>
            <button onclick="alert('恭喜扣款成功！')">一键极速免密付款抢购</button>
        </section>

        <section class="reviews">
            <h2>看看客人们的疯狂好评（120,490+ 5-Star Reviews）</h2>
            <div class="review">
                <strong>高女士 (已瘦42kg):</strong> "用了第二天就拉出3斤肥油，简直难以置信！"
            </div>
            <div class="review">
                <strong>李先生 (瘦了120斤):</strong> "以前我280斤路都走不动，吃了一疗程现在成了健美先生！无任何副作用！"
            </div>
        </section>
    </main>

    <footer>
        <p>© 2026 奇迹健康胖胖消版权所有。完美减肥体验。</p>
        <div class="footer-links">
            <!-- 缺少隐私政策、服务条款及真实的联系地址，直接导致谷歌广告Misrepresentation或者Unacceptable business practices封号 -->
            <a href="/buy">立即直购</a> | 
            <a href="#">常见问题</a>
        </div>
    </footer>
</body>
</html>`
  },
  {
    id: "ecom-scam-store",
    title: "「TechX 高速降温仪」虚假倒计时电商 (欺诈与系统规避)",
    badge: "高风险违规 (虚假压力/虚假评价)",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    description: "演示常见的黑五/Dropshipping独立站，使用虚假倒计时、造假限时秒杀、没有实体公司、以及提供无用死链接等导致封禁的元素。",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
    <title>TechX Pro Max - 无极静音移动冷风扇，2.5折秒杀</title>
</head>
<body>
    <div class="top-announcement">
        🔥 全球限期免费运送！目前订单爆满，先到先得！
    </div>

    <section class="product-showcase">
        <h2>TechX 智能无极制冷极速冰感静音风扇</h2>
        <div class="price">
            <span class="old-price">$299.99</span>
            <span class="current-price" style="color:red; font-size: 28px;">$39.99 (今日特惠2.5折)</span>
        </div>
        <div class="countdown-timer">
            ⏳ 特惠活动的倒计时限制还剩：03分钟42秒！
        </div>
        <p>只要摆在床头，1秒钟让整个卧室直降15度！相当于随身携带5匹中央空调！</p>
    </section>

    <section class="trust-icons">
        <p>🔒 100% 银行及安全金融保护 | 🛡️ McAfee & Norton 官方认证商铺</p>
    </section>

    <section class="reviews-section">
        <h3>来自脸书(Facebook)和各大媒体的推荐好评 ⭐️⭐️⭐️⭐️⭐️</h3>
        <p>"这简直是夏天救星。我全家都指望它了！" - 来自 Verified Buyer</p>
    </section>

    <footer>
        <p>© 2026 TechX Store Ltd. All Rights Reserved.</p>
        <div class="footer-links">
            <!-- 缺少退换货条款链接、隐私条款是空链接或直接跳回首页，触发谷歌Ad policies Landing page experience违规 -->
            <a href="/">首页</a> |
            <a href="javascript:void(0)">隐私政策 (Privacy Policy)</a> |
            <a href="javascript:void(0)">服务条款 (Terms)</a> |
            <a href="/contact">联系我们</a>
        </div>
    </footer>
</body>
</html>`
  },
  {
    id: "compliant-saas",
    title: "「SaaS智能协同系统」正规合规企业落地页 (通过示范)",
    badge: "完全合规 (100% Safe)",
    badgeColor: "bg-green-500/10 text-green-400 border-green-500/20",
    description: "标准且高信任度的公司落地页，拥有明确的公司版权信息、实体商业地址、真实的联系电话和邮箱，以及必备的合规标准链接。",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>SmartWork - 专业企业协同办公智能化工作流管理系统</title>
    <meta name="description" content="为现代团队提供敏捷、智能的文档协作与流程编排平台，提供免费版试用。" />
</head>
<body>
    <header>
        <span class="brand">SmartWork</span>
        <nav>
            <a href="/features">产品功能</a>
            <a href="/pricing">功能定价</a>
            <a href="/contact">联系我们</a>
        </nav>
    </header>

    <main class="container">
        <section class="hero">
            <h1>让团队协作无缝流动、敏捷且智能</h1>
            <p>为中大型研发与运营团队定制的智能化工作流分配系统，提高 15% 日常交付效率。新团队可免费试用 14 天。</p>
            <a href="/pricing" class="btn">开始免费试用</a>
        </section>

        <section class="features">
            <h2>为什么选择 SmartWork?</h2>
            <div>
                <h4>📅 智能化自动排程</h4>
                <p>基于团队容量与紧急度，合理规划敏捷任务。</p>
            </div>
            <div>
                <h4>📊 实时全局仪表盘</h4>
                <p>清晰跟进里程碑，全透明看板视图。</p>
            </div>
        </section>

        <section class="trust">
            <h2>深受超过 400+ 科技团队的信任</h2>
            <p>“SmartWork 使我们的项目发布周期缩短了近三分之一，是绝佳的内部管理伴侣。” - 某500强科技公司产品总监</p>
        </section>
    </main>

    <footer style="background-color: #fafafa; padding: 40px 20px;">
        <div class="footer-grid">
            <div class="footer-col">
                <strong>SmartWork 软件科技（北京）有限公司</strong>
                <p>联系电话：+86 (010) 8888-9999</p>
                <p>公司邮箱：support@smartwork-saas.com</p>
                <p>办公地址：北京市海淀区科技创新园 A 栋 808 室</p>
            </div>
            <div class="footer-col">
                <strong>合规与服务政策说明</strong>
                <p>备案号：京ICP备2025010203-1</p>
                <a href="/privacy-policy">隐私条款 (Privacy Policy)</a><br/>
                <a href="/terms-of-service">服务协议 (Terms of Service)</a><br/>
                <a href="/refund-policy">退款与服务变更保障规则</a>
            </div>
        </div>
        <p style="text-align: center; margin-top: 30px;">© 2026 北京SmartWork软件科技有限公司. 保留所有权利及最终解释权。</p>
    </footer>
</body>
</html>`
  }
];
