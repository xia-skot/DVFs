const fs = require('fs');
let content = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf8');

// Replace standard alerts with dispatchEvent
content = content.replace(/alert\(`(.*?)`\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `$1`, isError: true } }));");
content = content.replace(/alert\("(.*?)"\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `$1`, isError: true } }));");
content = content.replace(/alert\("读取文件出错！"\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `读取文件出错！`, isError: true } }));");
content = content.replace(/alert\("请至少选择一个工况组进行导出"\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `请至少选择一个工况组进行导出`, isError: true } }));");
content = content.replace(/alert\("导出数据时出错：" \+ \(err instanceof Error \? err\.message : String\(err\)\)\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `导出数据时出错：\${err instanceof Error ? err.message : String(err)}`, isError: true } }));");
content = content.replace(/alert\("处理导出数据时出错：" \+ \(err instanceof Error \? err\.message : String\(err\)\)\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `处理导出数据时出错：\${err instanceof Error ? err.message : String(err)}`, isError: true } }));");
content = content.replace(/alert\("请先导入数据！"\);/g, "window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `请先导入数据！`, isError: true } }));");

fs.writeFileSync('src/components/WaveformAnalyzer.tsx', content);
