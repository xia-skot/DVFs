const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

const newLines = [];
for (let i = 0; i < lines.length; i++) {
  if (i >= 5538 && i <= 5611) {
    continue;
  }
  newLines.push(lines[i]);
}

fs.writeFileSync('src/components/WaveformAnalyzer.tsx', newLines.join('\n'));
