with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

old_legend = """                                    <button onClick={() => toggleAnalysisLine('diff2')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('diff2') ? 'bg-gray-300' : 'bg-red-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">二阶差分</span>
                                    </button>
                                  </>"""

new_legend = """                                    <button onClick={() => toggleAnalysisLine('diff2')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('diff2') ? 'bg-gray-300' : 'bg-red-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">二阶差分</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('diff3')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('diff3') ? 'bg-gray-300' : 'bg-purple-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">三阶差分</span>
                                    </button>
                                  </>"""

content = content.replace(old_legend, new_legend)

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Fixed legend overlay")
