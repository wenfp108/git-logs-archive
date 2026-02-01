import axios from 'axios';
import fs from 'fs';
import path from 'path';

// --- 🎯 核心配置 ---
const CONFIG = {
    // 每次扫描最近多少天的论文 (30天能捕捉到较稳健的短期趋势)
    LOOKBACK_DAYS: 30,
    // 什么样的期刊算“核心期刊”？(影响因子参考值，虽OpenAlex非直接IF，但2yr引用率接近)
    MIN_IMPACT_FACTOR: 15,
    // 近期论文如果有5个引用已经说明热度很高了
    MIN_CITATIONS: 5,
    // ✨ 从环境变量获取邮箱，如果没有则使用默认值
    // 配置 Secret 后，OpenAlex 会把你加入“礼貌通道”，请求更快更稳
    CONTACT_EMAIL: process.env.CONTACT_EMAIL || 'sentinel@architect.alpha' 
};

async function run() {
    // ✨ 1. 时间戳处理逻辑 (与 GitHub Sentinel 保持 1:1 一致)
    const now = new Date();
    // 转换为北京时间 (UTC+8)
    const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const hour = bjTime.getUTCHours();
    const ampm = hour < 12 ? 'AM' : 'PM';
    
    // 生成时间标签，例如 "AM-8h" 或 "PM-20h"
    const timeLabel = `${ampm}-${hour}h`; 
    const dateStr = bjTime.toISOString().split('T')[0];

    // 计算扫描起始日期 (基于当前时间前推)
    const startDate = new Date(now.getTime() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log(`🌍 Global Science Radar [${timeLabel}] 启动...`);
    console.log(`   - 扫描范围: ${startDate} 至今`);
    console.log(`   - 用户代理: ${CONFIG.CONTACT_EMAIL} (Polite Pool Active)`);

    // 构建 OpenAlex 查询
    // 逻辑：发表日期在最近X天 AND 引用数>阈值，按引用数降序排列
    const apiUrl = `https://api.openalex.org/works?filter=from_publication_date:${startDate},cited_by_count:>${CONFIG.MIN_CITATIONS}&sort=cited_by_count:desc&per_page=100`;

    try {
        const { data } = await axios.get(apiUrl, {
            // ✨ 使用变量中的邮箱，进入 OpenAlex 的礼貌通道
            headers: {
                'User-Agent': `mailto:${CONFIG.CONTACT_EMAIL}`
            }
        });

        const papers = data.results;
        
        const elitePapers = [];
        const conceptStats = {}; // 用于统计“发展方向”

        console.log(`📥 扫描到 ${papers.length} 篇近期高引论文，开始分析技术方向...`);

        papers.forEach(paper => {
            const title = paper.title;
            const citations = paper.cited_by_count;
            
            // 获取期刊信息
            const venue = paper.primary_location?.source;
            const impactFactor = venue?.summary_stats?.['2yr_mean_citedness'] || 0;
            const journalName = venue?.display_name || "Unknown Venue";

            // 1. 提取论文的核心概念 (OpenAlex 会自动给论文打标签)
            // concepts 结构: [{display_name: "Battery", score: 0.9, level: 2}, ...]
            // level 0 是大类(Physics), level 2-3 是具体方向(Lithium-ion battery)
            const validConcepts = paper.concepts
                .filter(c => c.level >= 2) // 只看具体技术方向，忽略太宽泛的大类
                .map(c => c.display_name);

            // 2. 统计方向热度 (加权逻辑：引用数越高，该方向权重越大)
            validConcepts.forEach(concept => {
                if (!conceptStats[concept]) conceptStats[concept] = { count: 0, score: 0 };
                conceptStats[concept].count += 1;
                conceptStats[concept].score += citations; // 引用越多，说明这个方向越“硬”
            });

            // 3. 收录论文
            elitePapers.push({
                title: title,
                journal: journalName,
                metrics: {
                    citations: citations,
                    impact_factor: impactFactor.toFixed(1)
                },
                concepts: validConcepts.slice(0, 5), // 只存前5个核心标签
                url: paper.open_access?.oa_url || paper.doi
            });
        });

        // 4. 生成“热门发展方向”榜单
        const topDirections = Object.entries(conceptStats)
            .map(([name, stat]) => ({ name, ...stat }))
            .sort((a, b) => b.score - a.score) // 按总引用权重排序
            .slice(0, 10); // 取前10个最火的方向

        // 5. 输出报告
        if (elitePapers.length > 0) {
            // ✨ 2. 文件名修改：加入时间戳，风格对齐 GitHub
            // 结果示例: data/papers/2026-02-01/trend-radar-AM-8h.json
            const filePath = `data/papers/${dateStr}/trend-radar-${timeLabel}.json`;
            
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const fileContent = {
                meta: {
                    scanned_at_bj: bjTime.toISOString(), // 记录北京时间
                    session: ampm,
                    total_analyzed: elitePapers.length,
                    // 🔥 核心输出：这就是你要的“哪个发展方向”
                    HOT_DIRECTIONS: topDirections.map(d => `${d.name} (Heat: ${d.score})`)
                },
                top_papers: elitePapers.slice(0, 20) // 只保留头部最火的论文
            };

            fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
            console.log(`✅ 探测完成！已生成趋势报告: ${filePath}`);
            
            // 打印日志预览
            if(topDirections.length > 0) {
                 console.log(`🔥 当前最热方向 (Top 3):`);
                 topDirections.slice(0, 3).forEach((d, i) => {
                    console.log(`   ${i+1}. ${d.name} (Heat: ${d.score})`);
                 });
            }
        } else {
            console.log("💤 今日未探测到高强度的突发趋势。");
        }

    } catch (error) {
        console.error("❌ 探测失败:", error.message);
        if (error.response) {
             console.error("API Status:", error.response.status);
             console.error("API Data:", error.response.data);
        }
    }
}

run();
