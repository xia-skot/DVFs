const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  if (content.includes('const [isGuidanceError, setIsGuidanceError]')) return;
  
  content = content.replace(
    'const [guidanceMsg, setGuidanceMsg] = useState("', 
    'const [isGuidanceError, setIsGuidanceError] = useState(false);\n  const [guidanceMsg, setGuidanceMsg] = useState("'
  );
  
  content = content.replace(
    /setGuidanceMsg\(e\.detail\.message\);/g, 
    'setGuidanceMsg(e.detail.message);\n        setIsGuidanceError(!!e.detail.isError);'
  );
  
  // Also need to find where guidanceMsg is rendered and update the class
  // className={`italic truncate w-full transition-opacity duration-300 ${settings.guidance.fontFamily || 'font-sans'}`}
  content = content.replace(
    /className=\{\`italic truncate w-full transition-opacity duration-300 \$\{settings\.guidance\.fontFamily \|\| 'font-sans'\}\`\}/g,
    'className={`italic truncate w-full transition-opacity duration-300 ${settings.guidance.fontFamily || \\\'font-sans\\\'} ${isGuidanceError ? \\\'text-red-600 font-bold\\\' : \\\'\\\'}`}'
  );
  // the color style: (settings.guidance.color || '#6b7280') 
  content = content.replace(
    /color: settings\.guidance\.color \|\| '#6b7280'/g,
    'color: isGuidanceError ? \\\'#dc2626\\\' : (settings.guidance.color || \\\'#6b7280\\\')'
  );
  
  fs.writeFileSync(filepath, content);
}

patchFile('src/components/WaveformAnalyzer.tsx');
patchFile('src/components/TopologyBuilder.tsx');
