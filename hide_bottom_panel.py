import re

with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

# Find the start of the Vertical Resize Handle
start_idx = content.find('{/* Vertical Resize Handle */}')

# Find the end of the bottom panel. It is the div with `style={{ height: \`${bottomPanelHeight}px\` }}` and we need to match its closing div.
# We'll just wrap the whole thing inside `{!isWaveformFullScreen && ( ... )}`
# The `bottomPanelHeight` div ends just before `</div>` then `) : (`.
# Let's find the `style={{ height: \`${bottomPanelHeight}px\` }}` string
bottom_panel_start = content.find('<div className="shrink-0 bg-white flex flex-col overflow-hidden" style={{ height: `${bottomPanelHeight}px` }}>')

# We need to find the matching closing div for bottom_panel_start
def find_matching_closing_div(html, start_pos):
    pos = start_pos
    depth = 0
    while pos < len(html):
        next_div = html.find('<div', pos)
        next_end_div = html.find('</div>', pos)
        
        if next_div == -1: next_div = float('inf')
        if next_end_div == -1: next_end_div = float('inf')
        
        if next_div < next_end_div:
            depth += 1
            pos = next_div + 4
        else:
            depth -= 1
            pos = next_end_div + 6
            if depth == 0:
                return pos

end_idx = find_matching_closing_div(content, bottom_panel_start)

# We wrap the content from start_idx to end_idx
wrapped_content = "{!isWaveformFullScreen && (\n<>\n" + content[start_idx:end_idx] + "\n</>\n)}"

final_content = content[:start_idx] + wrapped_content + content[end_idx:]

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(final_content)
print("Updated successfully")
