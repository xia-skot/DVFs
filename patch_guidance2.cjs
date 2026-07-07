const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  content = content.replace(/\\'/g, "'");
  fs.writeFileSync(filepath, content);
}
patchFile('src/components/WaveformAnalyzer.tsx');
patchFile('src/components/TopologyBuilder.tsx');
