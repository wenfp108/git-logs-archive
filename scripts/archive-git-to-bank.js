const fs = require('fs');
const path = require('path');

/**
 * GitHub Sentinel 归档脚本：将技术趋势数据移至中央银行
 */
async function archiveToBank() {
    const bjTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const dateStr = bjTime.toISOString().split('T')[0];
    
    const ROOT = process.cwd();
    const LOCAL_DATA_ROOT = path.join(ROOT, 'data', 'tech', dateStr);
    // 对应 YAML 中的 path: central_bank，目标路径为 GitHub/tech
    const BANK_TARGET_ROOT = path.join(ROOT, 'central_bank', 'GitHub', 'tech', dateStr);

    console.log(`🚀 开始技术情报归档: ${dateStr}`);

    if (fs.existsSync(LOCAL_DATA_ROOT)) {
        const files = fs.readdirSync(LOCAL_DATA_ROOT).filter(f => f.endsWith('.json'));
        
        if (files.length > 0) {
            if (!fs.existsSync(BANK_TARGET_ROOT)) {
                fs.mkdirSync(BANK_TARGET_ROOT, { recursive: true });
            }

            files.forEach(file => {
                const src = path.join(LOCAL_DATA_ROOT, file);
                const dest = path.join(BANK_TARGET_ROOT, file);
                
                fs.copyFileSync(src, dest);
                // 确认目的地有文件后，清理前线仓库临时数据
                if (fs.existsSync(dest)) {
                    fs.unlinkSync(src);
                    console.log(`✅ [Tech] 已存入金库: ${file}`);
                }
            });
        } else {
            console.log("📭 今日暂无待归档的技术 JSON 文件。");
        }
    } else {
        console.log(`⚠️ 未发现今日数据目录: ${LOCAL_DATA_ROOT}`);
    }
}

archiveToBank().catch(console.error);
