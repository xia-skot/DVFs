import re

with open('src/lib/signal.ts', 'r') as f:
    content = f.read()

start_pattern = "  let k1 = 0;\n  while (k1 < T_head.length - 1) {"
end_pattern = "    k1 += 1;\n  }"

idx1 = content.find(start_pattern)
idx2 = content.find(end_pattern, idx1)

if idx1 != -1 and idx2 != -1:
    idx2 += len(end_pattern)
    original_block = content[idx1:idx2]
    
    # We will replace the strict adjacent check with a slightly relaxed check
    new_block = original_block.replace(
        """    const idx1 = T_head[k1];
    const idx2 = T_head[k1 + 1];

    if (idx2 - idx1 <= user_diff2_time) {""",
        """    const idx1 = T_head[k1];
    let foundPair = false;
    for (let k2 = k1 + 1; k2 < Math.min(k1 + 5, T_head.length); k2++) {
      const idx2 = T_head[k2];
      if (idx2 - idx1 > user_diff2_time) break;

      if (idx2 - idx1 <= user_diff2_time) {"""
    )
    
    new_block = new_block.replace(
        """        k1 += 2;
        continue;
      }
    }
    k1 += 1;
  }""",
        """        foundPair = true;
        k1 = k2 + 1;
        break;
      }
    }
    if (!foundPair) {
      k1 += 1;
    }
  }"""
    )
    
    content = content[:idx1] + new_block + content[idx2:]
    
    with open('src/lib/signal.ts', 'w') as f:
        f.write(content)
    print("Fixed")
else:
    print("Pattern not found")
