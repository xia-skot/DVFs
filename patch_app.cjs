const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/showToast\((.*?), 'error'\);/g, "showToast($1, 'error');\n          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: $1, isError: true } }));");
// In one place it's `showToast('存储失败', 'error');` let's ensure it catches it. 

fs.writeFileSync('src/App.tsx', content);
