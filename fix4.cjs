const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

for (let i = 5535; i < 5560; i++) {
  console.log(i + ": " + lines[i]);
}
