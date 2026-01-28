const { Octokit } = require("@octokit/rest");

const CONFIG = {
    owner: process.env.REPO_OWNER,
    repo: process.env.REPO_NAME,
    token: process.env.GITHUB_TOKEN,
    // 🔥 终极保险：如果 24 小时内涨星超过这个数，不管是什么，强制抓回来！
    FORCE_KEEP_STARS: 200 
};

const octokit = new Octokit({ auth: CONFIG.token });

// --- 🔴 1. 核心保留区 (Expanded Strategies) ---
const KEEP_STRATEGIES = {
    // [安德森] 加速主义：大幅扩容，覆盖视觉、多模态、推理栈
    ANDREESSEN: (text, repo) => {
        // 新增: vision, ocr, vlm, multimodal, transformer, inference, rag, weights
        return (text.match(/agi|infra|llm|cuda|compiler|quantization|tensor|gpu|vision|ocr|vlm|multimodal|transformer|inference|rag|weights|model/i)) ? 'TECH_ACCELERATOR' : null;
    },
    // [托瓦兹] 务实主义：增加对新兴底层语言和 OS 的关注
    TORVALDS: (text, repo) => {
        const isHardcore = ['Rust', 'C', 'C++', 'Zig', 'Assembly'].includes(repo.language);
        return (isHardcore && text.match(/kernel|driver|runtime|engine|embedded|performance|os|virtualization/i)) ? 'CORE_PRAGMATISM' : null;
    },
    // [纳瓦尔] 杠杆哲学：增加对浏览器自动化和工作流的关注
    NAVAL: (text, repo) => {
        // 新增: workflow, browser, scrape
        return (text.match(/protocol|sdk|api-first|autonomous|agent|permissionless|defi|workflow|browser|scrape/i) && repo.forks > 10) ? 'CODE_LEVERAGE' : null;
    },
    // [格雷厄姆] 范式转移：保持敏锐
    GRAHAM: (text, repo) => (text.match(/reimagining|alternative to|solving the problem of|new way|vs code/i)) ? 'PARADIGM_SHIFT' : null
};

// --- 🔵 2. 趋势统计区 (噪音) ---
const STAT_ONLY_STRATEGIES = {
    SKILLS: (text) => (text.match(/skills|roadmap|path|learning|guide|101|tutorial|course/i)) ? 'TALENT_GROWTH' : null,
    INTERVIEW: (text) => (text.match(/interview|questions|leetcode|offer/i)) ? 'CAREER_MOVES' : null,
    RESOURCE: (text) => (text.match(/awesome|collection|list|curated|resources|template|dataset|json/i)) ? 'KNOWLEDGE_BASE' : null
};

async function run() {
    console.log("🚀 Sentinel [深网版] 启动...");
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        // 降低初筛门槛，把网撒大一点
        const query = `stars:>40 created:>=${yesterday}`;
        console.log(`📡 广域扫描: ${query}`);

        const { data } = await octokit.search.repos({
            q: query, sort: 'stars', order: 'desc', per_page: 50
        });

        const stats = {}; 
        const eliteItems = [];

        data.items.forEach(repo => {
            const text = (repo.name + " " + (repo.description || "")).toLowerCase();
            let isKeeper = false;
            let forceKeep = false; // 是否触发强制保留
            const tags = [];

            // 1. 核心策略判定
            for (const [name, logic] of Object.entries(KEEP_STRATEGIES)) {
                const tag = logic(text, repo);
                if (tag) { tags.push(tag); isKeeper = true; }
            }

            // 2. 噪音/趋势判定
            for (const [name, logic] of Object.entries(STAT_ONLY_STRATEGIES)) {
                const tag = logic(text);
                if (tag) tags.push(tag);
            }

            // 3. 🔥【新增】终极保险机制
            // 如果它没被任何策略选中，但是 Star 数极高，说明是“不明巨物”，必须抓！
            if (!isKeeper && repo.stargazers_count >= CONFIG.FORCE_KEEP_STARS) {
                isKeeper = true;
                forceKeep = true;
                tags.push('VIRAL_GIANT'); // 给它打个专属标签：不明巨物
            }

            if (tags.length === 0) tags.push('VIRAL_UNCATEGORIZED');

            // 统计
            tags.forEach(t => { stats[t] = (stats[t] || 0) + 1; });

            // 入库逻辑：命中核心策略 OR 触发强制保留
            if (isKeeper) {
                eliteItems.push({
                    name: repo.full_name,
                    desc: repo.description,
                    lang: repo.language,
                    stars: repo.stargazers_count,
                    tags: tags,
                    reason: forceKeep ? "FORCE_KEEP_HIGH_STARS" : "STRATEGY_MATCH",
                    url: repo.html_url
                });
            }
        });

        const summaryStr = Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(', ');
        console.log(`📊 趋势: ${summaryStr}`);
        console.log(`🛡️ 捕获: ${eliteItems.length} (扫描总数: ${data.items.length})`);

        if (data.items.length > 0) {
            const path = `data/tech/${new Date().toISOString().split('T')[0]}/sentinel-${new Date().getHours()}h.json`;
            
            await octokit.repos.createOrUpdateFileContents({
                owner: CONFIG.owner,
                repo: CONFIG.repo,
                path: path,
                message: `🤖 DeepNet Data: ${eliteItems.length} items`,
                content: Buffer.from(JSON.stringify({
                    meta: { 
                        scanned_at: new Date().toISOString(),
                        threshold_override: CONFIG.FORCE_KEEP_STARS, // 记录当次强制保留的阈值
                        trend_summary: stats 
                    },
                    items: eliteItems
                }, null, 2)).toString('base64')
            });
            console.log(`✅ 数据已入库。`);
        }
    } catch (e) {
        console.error("❌ Error:", e.message);
        process.exit(1);
    }
}

run();
