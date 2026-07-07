function calibrateWaveSequenceUserUpload(wave_fault1, options) {
  const L = wave_fault1.length;
  if (L < 10) return [];
  const para_cali_windows_length = options.para_cali_windows_length ?? 1000;
  const para_cali_start_doorsill = options.para_cali_start_doorsill ?? 0.1;
  const para_cali_hist_sift = options.para_cali_hist_sift ?? 30;
  const user_diff2_time = options.user_diff2_time ?? 7;
  const user_diff2_time_end = options.user_diff2_time_end ?? 50;

  const diff1 = new Float32Array(L);
  const diff2 = new Float32Array(L);
  const diff3 = new Float32Array(L);

  for (let i = 0; i < L - 1; i++) diff1[i] = wave_fault1[i + 1] - wave_fault1[i];
  for (let i = 0; i < L - 2; i++) diff2[i] = diff1[i + 1] - diff1[i];
  for (let i = 0; i < L - 3; i++) diff3[i] = diff2[i + 1] - diff2[i];

  let windows_start = 0;
  for (let i = 0; i < L - 2; i++) {
    if (Math.abs(diff2[i]) > para_cali_start_doorsill) {
      windows_start = Math.max(0, i - 10);
      break;
    }
  }

  const windows_end = Math.min(windows_start + para_cali_windows_length, L - 3);

  const getExtremPoints = (data) => {
    const diff_data = new Float32Array(data.length - 1);
    for (let i = 0; i < data.length - 1; i++) diff_data[i] = data[i+1] - data[i];
    
    const p_site = [];
    if (diff_data[0] < 0) p_site.push(0);
    
    for (let i = 0; i < diff_data.length - 1; i++) {
      if (diff_data[i] > 0 && diff_data[i+1] < 0) {
        p_site.push(i + 1);
      }
    }
    
    if (diff_data[diff_data.length - 1] > 0) p_site.push(diff_data.length); // Assuming i1+2 is data.length 
    
    return p_site.map(idx => ({ index: idx, value: data[idx] }));
  };

  const wave_2 = diff2.subarray(windows_start, windows_end + 1);
  const neg_wave_2 = new Float32Array(wave_2.length);
  for (let i=0; i<wave_2.length; i++) neg_wave_2[i] = -wave_2[i];

  const ext1 = getExtremPoints(wave_2);
  const ext2 = getExtremPoints(neg_wave_2);
  
  let all_ext = [];
  for (const e of ext1) all_ext.push({ index: e.index + windows_start, absValue: Math.abs(e.value) });
  for (const e of ext2) all_ext.push({ index: e.index + windows_start, absValue: Math.abs(e.value) });

  all_ext.sort((a, b) => b.absValue - a.absValue);
  const top_ext = all_ext.slice(0, para_cali_hist_sift);
  top_ext.sort((a, b) => a.index - b.index);
  
  const T_head = top_ext.map(e => e.index);
  const waveHeads = [];

  let k1 = 0;
  while (true) {
    if (k1 >= T_head.length - 1) break;

    const point_1 = T_head[k1];
    let point_2 = 0;
    if (T_head[k1+1] - point_1 <= user_diff2_time) {
      point_2 = T_head[k1+1];
    } else {
      k1 += 1;
      continue;
    }

    let t_range1 = 0;
    let t_range2 = 0;

    const isPos = diff2[point_1] > 0 && diff2[point_2] < 0;
    const isNeg = diff2[point_1] < 0 && diff2[point_2] > 0;

    if (isPos) {
      t_range1 = Math.max(0, point_1 - user_diff2_time);
      const searchEnd = Math.min(point_2 + user_diff2_time_end, L - 1);
      let zheng_site = -1;
      for (let i = point_2; i <= searchEnd; i++) {
        if (diff2[i] > 0) { zheng_site = i; break; }
      }
      
      let max_idx = (k1 + 2 < T_head.length) ? T_head[k1+2] : Infinity;
      if (zheng_site === -1) {
        t_range2 = Math.min(point_2 + user_diff2_time_end, max_idx);
      } else {
        t_range2 = Math.min(zheng_site, max_idx);
      }
    } else if (isNeg) {
      t_range1 = Math.max(0, point_1 - user_diff2_time);
      const searchEnd = Math.min(point_2 + user_diff2_time_end, L - 1);
      let fu_site = -1;
      for (let i = point_2; i <= searchEnd; i++) {
        if (diff2[i] < 0) { fu_site = i; break; }
      }

      let max_idx = (k1 + 2 < T_head.length) ? T_head[k1+2] : Infinity;
      if (fu_site === -1) {
        t_range2 = Math.min(point_2 + user_diff2_time_end, max_idx);
      } else {
        t_range2 = Math.min(fu_site, max_idx);
      }
    } else {
      k1 += 1;
      continue;
    }

    let t_head_start = -1;
    let t_head_end = -1;

    if (isPos) {
      let max_diff3 = -Infinity;
      for (let i = t_range1; i <= point_1; i++) {
        if (diff3[i] > max_diff3) { max_diff3 = diff3[i]; t_head_start = i; }
      }

      let max_diff1 = -Infinity;
      let t_diff1_max = -1;
      for (let i = t_range1; i <= t_range2; i++) {
        if (diff1[i] > max_diff1) { max_diff1 = diff1[i]; t_diff1_max = i; }
      }

      let searchLimit = (k1 + 2 < T_head.length) ? Math.min(t_diff1_max + user_diff2_time_end, T_head[k1+2]) : (t_diff1_max + user_diff2_time_end);
      searchLimit = Math.min(searchLimit, L - 1);

      let fu_site = -1;
      for (let i = t_diff1_max; i <= searchLimit; i++) {
        if (diff1[i] <= 0) { fu_site = i; break; }
      }

      if (fu_site === -1) {
        let diff2_zheng = -1;
        const diff2SearchEnd = Math.min(t_diff1_max + user_diff2_time_end, L - 1);
        for (let i = t_diff1_max; i <= diff2SearchEnd; i++) {
          if (diff2[i] >= 0) { diff2_zheng = i; break; }
        }
        if (diff2_zheng === -1) {
          t_head_end = Math.min(t_diff1_max + user_diff2_time_end - 1, L - 1);
        } else {
          t_head_end = diff2_zheng - 1; // Wait, matlab says diff2_zheng_site(1)-1 but + t_diff1_max. MATLAB find is 1-indexed. Let's see.
        }
      } else {
        t_head_end = fu_site - 1;
      }
    } else if (isNeg) {
      let min_diff3 = Infinity;
      for (let i = t_range1; i <= point_1; i++) {
        if (diff3[i] < min_diff3) { min_diff3 = diff3[i]; t_head_start = i; }
      }

      let min_diff1 = Infinity;
      let t_diff1_min = -1;
      for (let i = t_range1; i <= t_range2; i++) {
        if (diff1[i] < min_diff1) { min_diff1 = diff1[i]; t_diff1_min = i; }
      }

      let searchLimit = (k1 + 2 < T_head.length) ? Math.min(t_diff1_min + user_diff2_time_end, T_head[k1+2]) : (t_diff1_min + user_diff2_time_end);
      searchLimit = Math.min(searchLimit, L - 1);

      let zheng_site = -1;
      for (let i = t_diff1_min; i <= searchLimit; i++) {
        if (diff1[i] >= 0) { zheng_site = i; break; }
      }

      if (zheng_site === -1) {
        let diff2_fu = -1;
        const diff2SearchEnd = Math.min(t_diff1_min + user_diff2_time_end, L - 1);
        for (let i = t_diff1_min; i <= diff2SearchEnd; i++) {
          if (diff2[i] <= 0) { diff2_fu = i; break; }
        }
        if (diff2_fu === -1) {
          t_head_end = Math.min(t_diff1_min + user_diff2_time_end - 1, L - 1);
        } else {
          t_head_end = diff2_fu - 1; 
        }
      } else {
        t_head_end = zheng_site - 1;
      }
    }

    if (t_head_start !== -1 && t_head_end !== -1) {
      waveHeads.push({
        index: t_head_end,
        value: wave_fault1[t_head_end],
        amplitude: wave_fault1[t_head_end] - wave_fault1[t_head_start],
        startIdx: t_head_start,
        endIdx: t_head_end,
        startVal: wave_fault1[t_head_start],
        isManual: false
      });
    }

    k1 += 2;
  }
  
  return waveHeads;
}
console.log("OK");
