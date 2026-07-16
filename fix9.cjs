const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

for (let i = 5620; i < 5650; i++) {
  console.log(i + ": " + lines[i]);
}
