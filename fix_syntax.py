with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

# Replace the wrong tags
wrong_tags = """                </div>
</>
)}
              ) : ("""

correct_tags = """                  </div>
</>
)}
                </div>
              ) : ("""

content = content.replace(wrong_tags, correct_tags)

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Syntax fixed")
