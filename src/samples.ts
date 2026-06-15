import { MockSample } from "./types";

export const PRESET_SAMPLES: MockSample[] = [
  {
    id: "local-spa-violation",
    title: "「极奢皇家SPA理疗会所」虚假诊断宣称与无物理信息单页 (大健康及本地服务违规)",
    badge: "致命违规 (虚假宣称/缺少实体信息)",
    badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
    description: "典型的海外本地美疗/按摩SPA单页，使用了绝对化治疗承诺、虚设倒计时限额、不提供到店具体地址及可拨打客服电话，且底部合规链接采用空链，极易面临封号。",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>极奢皇家SPA理疗会所 - 伦敦高端热石推拿体验</title>
    <meta name="description" content="全伦敦最奢华的中式经络调理与精油SPA，立刻到店享受奢享时光。" />
</head>
<body>
    <header>
        <h1>💆 伦敦奢华皇家SPA会所 💆</h1>
        <p>独家古法热石深层经络理疗，1小时彻底告别全身疲惫！</p>
    </header>

    <main>
        <section class="medical-claims">
            <h2>🔥 奇迹疗效：只需1个疗程，100%根除一切腰椎盘突出与长期偏头痛！🔥</h2>
            <p>我们郑重承诺：100%见效，中西合璧特种理疗技术，彻底治愈风湿骨痛，终生不反弹！</p>
            <div class="testimony-card">
                <img src="fake-expert.jpg" alt="伦敦著名理疗专家 Dr. Arthur" />
                <p>「这是骨骼与推拿发展史上的一项伟大创举！我敢保证世界上没有比这更好的经络恢复疗法。」 -- 剑桥客座健康教授 Dr. Arthur</p>
            </div>
        </section>

        <section class="fake-urgency">
            <h3>⚠️ 警报：因金牌推拿师极其稀缺，今天线上预付仅剩 3 个预约名额！</h3>
            <div id="fake-timer">00:04:59</div>
            <p>原价 £299 单次，今日到店体验秒杀价仅需 £49！立即抢订！</p>
            <button onclick="alert('预约锁定成功，请尽快到店！')">尊享独家优惠一键通道</button>
        </section>

        <section class="reviews">
            <h2>看看客户们的瘋狂推荐（12,490+ 真实好评）</h2>
            <div class="review">
                <strong>伦敦高女士:</strong> "肩膀痛了五年，在这里按了一个钟头竟然彻底不痛了，像换了个人，真的太神奇了！"
            </div>
            <div class="review">
                <strong>曼城李先生:</strong> "颈椎压迫神经导致的麻木瞬间痊愈！强力推荐大家预付体验，没有任何虚假！"
            </div>
        </section>
    </main>

    <footer>
        <p>© 2026 Royal SPA Club. All Rights Reserved.</p>
        <div class="footer-links">
            <!-- 缺少真实详细实体店办公执照物理地点、缺少合法电话接听，且必备隐私链接是空链接，严重踩中谷歌Misrepresentation（虚假陈述）和Landing page experience（目标地体验）高压红线 -->
            <a href="/buy">立即到店路线</a> | 
            <a href="javascript:void(0)">隐私政策 (Privacy Policy)</a> |
            <a href="javascript:void(0)">用户服务条款 (Terms)</a>
        </div>
    </footer>
</body>
</html>`
  },
  {
    id: "auto-rental-violation",
    title: "「美加尊驾豪华自驾租车」虚伪认证章与盲目客诉单页 (境外线下租借违规)",
    badge: "致命高危 (虚设机构盖章/隐蔽实体地址)",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    description: "虚构了官方交通协定特许章、虚标高评分、完全不披露线下租赁门市的具体地段，仅提供一个含糊的网络表单进行获客，触碰谷歌广告“商家实体真实性”安全风控。",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
    <title>北美豪车直租赁 - 每天低至 $19 起，免押金畅行美加</title>
</head>
<body>
    <div class="top-announcement">
        🔥 夏季自驾专场特惠！到店自取尊享10%折扣，还车免清洗费！
    </div>

    <section class="product-showcase">
        <h2>北美自驾豪车一站式快捷到店租赁中心</h2>
        <div class="price">
            <span class="old-price">$99/day</span>
            <span class="current-price" style="color:red; font-size: 28px;">$19/day (今日限时预定)</span>
        </div>
        <div class="countdown-timer">
            ⏳ 特惠锁定倒计时：本批经典野马车型仅剩最后2台供抢定！还剩 03分42秒！
        </div>
        <p>首家获得「美联邦道路特许协会联邦官方盖章」的超正规二手豪华租赁行，多款超跑立租，无任何征信门槛限制，100%全保无忧！</p>
    </section>

    <section class="trust-icons">
        <p>🔒 100% 交通部特许认证商户 | 🏆 纽约本地自驾好评率 99.9% 综合大奖</p>
    </section>

    <section class="reviews-section">
        <h3>各界好口碑评价 ⭐️⭐️⭐️⭐️⭐️</h3>
        <p>"车况完美，下飞机直接到实体店1分钟就提了牧马人！比大公司便宜划算多了！" - Brian Fox from NY</p>
    </section>

    <footer>
        <p>© 2026 Apex Auto Rentals Group LLC. All Rights Reserved.</p>
        <div class="footer-links">
            <!-- 缺少合规的退改款补偿天数和计费折旧细则、隐私条款为空白死弹、无真实物理门市地址 -->
            <a href="/">回到首页</a> |
            <a href="javascript:void(0)">隐私政策 (Privacy Policy)</a> |
            <a href="javascript:void(0)">租赁条款及免责细则 (Terms)</a> |
            <a href="/contact">咨询表单（无电话/无详细办公地址）</a>
        </div>
    </footer>
</body>
</html>`
  },
  {
    id: "compliant-clinic",
    title: "「纽约曼哈顿皇家牙科诊所」正规合规线下展示页 (100% Safe 优秀到店示范)",
    badge: "完全合规 (100% Safe)",
    badgeColor: "bg-green-500/10 text-green-400 border-green-500/20",
    description: "极度标准的本地实体获客落地页。拥有完整的门市全景图展示、清晰写明的线下营业地址（精确到几号楼几室）、到店电话、工作时间表，以及无死锁的高级双语隐私条款跳转。",
    htmlContent: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>纽约皇家口腔种植牙与正畸中心 | Royal Dental Manhattan</title>
    <meta name="description" content="位于曼哈顿中城的高端口腔健康中心。为您提供舒适的种植牙、冷光美白与高品质正畸体验，全透明价格到店预约。" />
</head>
<body>
    <header>
        <span class="brand">Royal Dental Manhattan</span>
        <nav>
            <a href="/services">到店服务项目</a>
            <a href="/pricing">诊疗全透明价格</a>
            <a href="/contact">预约到店流程</a>
        </nav>
    </header>

    <main class="container">
        <section class="hero">
            <h1>让健康的微笑，在此优雅绽放</h1>
            <p>我们专注于提供个性化、严谨的跨学科口腔微创理疗服务。纽约本地 15 年经验执业牙医团队亲自到店主诊。新客户可享受 50 美元首诊检查特惠。</p>
            <a href="/contact" class="btn">立即预订到店问诊时间</a>
        </section>

        <section class="features">
            <h2>为什么选择 Royal Dental Manhattan?</h2>
            <div>
                <h4>📅 快捷到店预约系统</h4>
                <p>合理化预约时段分级，实现到店无需久等，每位客户专享半小时深度洁治评估。</p>
            </div>
            <div>
                <h4>🗺️ 便捷的曼哈顿位置与中文对应</h4>
                <p>邻近中央公园与梅西百货，有多语种中文导医，沟通顺畅安心。</p>
            </div>
        </section>

        <section class="clinic-info">
            <h2>服务真实保障及免责说明</h2>
            <p>「所有的治疗成效与康复时间，因个人身体与骨密度等基础素质而产生科学性差异。本诊所严谨依照并完全符合 ADA 核心大健康管理政策。」</p>
        </section>
    </main>

    <footer style="background-color: #fafafa; padding: 40px 20px;">
        <div class="footer-grid">
            <div class="footer-col">
                <strong>纽约曼哈顿皇家口腔诊疗中心 (Royal Dental Group LLC)</strong>
                <p>📅 营业时间：周一至周五 09:00 - 18:00 (东部时间 EDST)</p>
                <p>📞 到店接听热线：+1 (212) 555-0199 (支持拨打与短信预约)</p>
                <p>📩 客服与咨询邮箱：contact@royaldentallp.com</p>
                <p>📍 实体店面物理地址：123 Broadway Suite 4B, New York, NY 10001 (曼哈顿中城)</p>
            </div>
            <div class="footer-col">
                <strong>合规政策与消保跳转</strong>
                <p>医疗机构执业许可证号：NY-MED-20110309-91</p>
                <a href="/privacy-policy" style="text-decoration: underline;">隐私政策声明 (Privacy Policy)</a><br/>
                <a href="/terms-of-service" style="text-decoration: underline;">问诊服务协议 (Terms of Service)</a><br/>
                <a href="/refund-policy" style="text-decoration: underline;">到店预约取消及退定押金细则</a>
            </div>
        </div>
        <p style="text-align: center; margin-top: 30px;">© 2026 Royal Dental Manhattan group. All Rights Reserved.</p>
    </footer>
</body>
</html>`
  }
];
