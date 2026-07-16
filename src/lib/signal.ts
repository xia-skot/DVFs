export function removePowerFrequency(
  data: number[] | Float32Array, 
  sampleRate: number = 1000000, 
  preFaultLen: number = 8000,
  psoPop: number = 20,
  psoIter: number = 30
): { data: Float32Array, error: number, A: number, f: number, theta: number } {
  if (data.length === 0) return { data: new Float32Array(0), error: 0, A: 0, f: 50, theta: 0 };
  
  // 1. extract pre-fault data
  // Automatically detect the fault inception point to prevent transient leakage into the fitting window
  let inceptionIdx = data.length;
  const baselineLen = Math.min(100, Math.floor(data.length / 5));
  if (data.length > 20 && baselineLen > 5) {
    let sumPreDiff = 0;
    for (let i = 1; i < baselineLen; i++) {
      sumPreDiff += Math.abs(data[i] - data[i - 1]);
    }
    const avgPreDiff = sumPreDiff / (baselineLen - 1);
    
    // Set an adaptive threshold: 12x the pre-fault baseline difference, with a minimum of 0.5 to prevent noise triggers
    const transientThreshold = Math.max(0.5, avgPreDiff * 12);
    
    // Scan for transient start, starting after baselineLen to avoid self-triggering
    for (let i = baselineLen; i < data.length; i++) {
      if (Math.abs(data[i] - data[i - 1]) > transientThreshold) {
        inceptionIdx = i;
        break;
      }
    }
  }

  // Determine actual fit length: if the user-defined preFaultLen reaches into the post-fault transient, clip it!
  let fitLen = Math.min(preFaultLen, data.length);
  if (inceptionIdx < fitLen) {
    // Clip the fitting window to end 150 samples (0.15ms) before the transient starts to ensure pure pre-fault data
    fitLen = Math.max(100, inceptionIdx - 150);
  }
  const fitData = data.slice(0, fitLen);
  
  // 2. PSO for f in [45, 55], A in [0, 2.5*max(abs)], theta in [0, 2pi]
  const numParticles = psoPop;
  const numIterations = psoIter;
  
  let globalBest = {
    A: 0,
    f: 50,
    theta: 0,
    error: Infinity
  };
  
  let maxAbs = 0;
  for (let i = 0; i < fitLen; i++) {
    const val = fitData[i];
    if (isNaN(val)) continue;
    const v = Math.abs(val);
    if (v > maxAbs) maxAbs = v;
  }
  if (maxAbs === 0 || isNaN(maxAbs)) maxAbs = 1;

  // Search bounds
  const minA = 0;
  const maxA = 2.5 * maxAbs;
  const minF = 45;
  const maxF = 55;

  // Velocity clamping thresholds to prevent particle explosion (Vmax = 20% of range)
  const vMaxA = 0.2 * maxAbs;
  const vMaxF = 0.5; // range is 10 Hz, so 0.5 Hz is 10% velocity step max
  const vMaxTheta = 0.2 * (2 * Math.PI);

  const particles = Array.from({ length: numParticles }, () => {
    const initA = Math.random() * maxAbs;
    const initF = 49.5 + Math.random(); // Initialize close to nominal 50Hz [49.5, 50.5]
    const initTheta = Math.random() * 2 * Math.PI;
    return {
      pos: { A: initA, f: initF, theta: initTheta },
      vel: {
        A: (Math.random() - 0.5) * vMaxA * 0.5,
        f: (Math.random() - 0.5) * vMaxF * 0.5,
        theta: (Math.random() - 0.5) * vMaxTheta * 0.5
      },
      bestPos: { A: initA, f: initF, theta: initTheta },
      bestError: Infinity
    };
  });
  
  // Dynamically calculate sampling step to ensure exact and fast calculations (target ~1000 points)
  const step = Math.max(1, Math.floor(fitLen / 1000));
  const calcError = (A: number, f: number, theta: number) => {
    let err = 0;
    let count = 0;
    for (let i = 0; i < fitLen; i += step) {
      const t = i / sampleRate;
      const val = A * Math.cos(2 * Math.PI * f * t + theta);
      const diff = fitData[i] - val;
      err += diff * diff;
      count++;
    }
    return count > 0 ? err / count : err; // Normalized MSE to ensure stable errors across window changes
  };
  
  particles.forEach(p => {
    p.bestError = calcError(p.pos.A, p.pos.f, p.pos.theta);
    if (p.bestError < globalBest.error) {
      globalBest = { ...p.pos, error: p.bestError };
    }
  });
  
  for (let iter = 0; iter < numIterations; iter++) {
    // 1. Dynamic Inertia Weight: Linearly decreasing from 0.9 to 0.4
    const w = 0.9 - 0.5 * (iter / numIterations);
    
    // 2. Dynamic Acceleration Coefficients:
    // c1 (cognitive factor) decreases linearly from 2.0 to 0.5 to encourage individual exploration early on
    // c2 (social factor) increases linearly from 0.5 to 2.0 to encourage rapid social convergence to global optimum later
    const c1 = 2.0 - 1.5 * (iter / numIterations);
    const c2 = 0.5 + 1.5 * (iter / numIterations);
    
    particles.forEach(p => {
      // Update velocities
      p.vel.A = w * p.vel.A + c1 * Math.random() * (p.bestPos.A - p.pos.A) + c2 * Math.random() * (globalBest.A - p.pos.A);
      p.vel.f = w * p.vel.f + c1 * Math.random() * (p.bestPos.f - p.pos.f) + c2 * Math.random() * (globalBest.f - p.pos.f);
      p.vel.theta = w * p.vel.theta + c1 * Math.random() * (p.bestPos.theta - p.pos.theta) + c2 * Math.random() * (globalBest.theta - p.pos.theta);
      
      // Velocity clamping
      p.vel.A = Math.max(-vMaxA, Math.min(vMaxA, p.vel.A));
      p.vel.f = Math.max(-vMaxF, Math.min(vMaxF, p.vel.f));
      p.vel.theta = Math.max(-vMaxTheta, Math.min(vMaxTheta, p.vel.theta));
      
      // Update positions
      p.pos.A += p.vel.A;
      p.pos.f += p.vel.f;
      p.pos.theta += p.vel.theta;
      
      // Position boundary clamping
      p.pos.A = Math.max(minA, Math.min(maxA, p.pos.A));
      p.pos.f = Math.max(minF, Math.min(maxF, p.pos.f));
      
      // Phase periodic wrapping: theta is periodic within [0, 2pi]. This prevents boundary sticking.
      p.pos.theta = ((p.pos.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      
      // Evaluate new error
      const err = calcError(p.pos.A, p.pos.f, p.pos.theta);
      if (err < p.bestError) {
        p.bestError = err;
        p.bestPos = { ...p.pos };
        if (err < globalBest.error) {
          globalBest = { ...p.pos, error: err };
        }
      }
    });
  }
  
  // 3. Construct wave and subtract
  const result = new Float32Array(data.length);
  for(let i=0; i<data.length; i++) {
    const t = i / sampleRate;
    const wave_cos = globalBest.A * Math.cos(2 * Math.PI * globalBest.f * t + globalBest.theta);
    result[i] = data[i] - wave_cos;
  }
  
  // Calculate final Mean Squared Error (MSE) over all points for normalized, stable reporting
  let finalErr = 0;
  for (let i = 0; i < fitLen; i++) {
    const t = i / sampleRate;
    const val = globalBest.A * Math.cos(2 * Math.PI * globalBest.f * t + globalBest.theta);
    const diff = fitData[i] - val;
    finalErr += diff * diff;
  }
  const mse = fitLen > 0 ? finalErr / fitLen : 0;
  
  return { 
    data: result, 
    error: mse, 
    A: globalBest.A, 
    f: globalBest.f, 
    theta: globalBest.theta 
  };
}

/**
 * Largest Triangle Three Buckets (LTTB) downsampling algorithm
 */
export function lttbDownsample(data: any[] | Float32Array, threshold: number): any[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) {
    return Array.isArray(data) ? data : Array.from(data);
  }

  const sampled: any[] = [];
  let sampledIndex = 0;

  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0; 
  let maxAreaPoint: any;
  let maxArea: number;
  let area: number;
  let nextA = 0;

  sampled[sampledIndex++] = data[a]; 

  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    let avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;

    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
      avgX += (data[avgRangeStart].time || avgRangeStart);
      avgY += (data[avgRangeStart].value !== undefined ? data[avgRangeStart].value : 
               (data[avgRangeStart].alpha !== undefined ? data[avgRangeStart].alpha : 
                (data[avgRangeStart].teo !== undefined ? data[avgRangeStart].teo : 
                 (data[avgRangeStart].teoValue !== undefined ? data[avgRangeStart].teoValue : 0))));
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    let rangeOffs = Math.floor((i + 0) * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    const pointAX = (data[a].time || a);
    const pointAY = (data[a].value !== undefined ? data[a].value : 
                    (data[a].alpha !== undefined ? data[a].alpha : 
                     (data[a].teo !== undefined ? data[a].teo : 
                      (data[a].teoValue !== undefined ? data[a].teoValue : 0))));

    maxArea = area = -1;

    for (; rangeOffs < rangeTo; rangeOffs++) {
      const val = (data[rangeOffs].value !== undefined ? data[rangeOffs].value : 
                   (data[rangeOffs].alpha !== undefined ? data[rangeOffs].alpha : 
                    (data[rangeOffs].teo !== undefined ? data[rangeOffs].teo : 
                     (data[rangeOffs].teoValue !== undefined ? data[rangeOffs].teoValue : 0))));
      
      area = Math.abs(
        (pointAX - avgX) * (val - pointAY) -
        (pointAX - (data[rangeOffs].time || rangeOffs)) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[rangeOffs];
        nextA = rangeOffs;
      }
    }

    sampled[sampledIndex++] = maxAreaPoint;
    a = nextA;
  }

  sampled[sampledIndex++] = data[dataLength - 1]; 
  return sampled;
}

export function addNoise(data: number[] | Float32Array, level: number = 0.1): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] + (Math.random() - 0.5) * 2 * level;
  }
  return result;
}

export function karenbauerTransform(phaseA: number[] | Float32Array, phaseB: number[] | Float32Array, phaseC: number[] | Float32Array) {
  const wave_0 = new Float32Array(phaseA.length);
  const wave_alpha = new Float32Array(phaseA.length);
  const wave_beta = new Float32Array(phaseA.length);
  for (let i = 0; i < phaseA.length; i++) {
    wave_0[i] = (phaseA[i] + phaseB[i] + phaseC[i]) / 3;
    wave_alpha[i] = (phaseA[i] - phaseB[i]) / 3;
    wave_beta[i] = (phaseA[i] - phaseC[i]) / 3;
  }
  return { wave_0, wave_alpha, wave_beta };
}

export function clarkeTransform(phaseA: number[] | Float32Array, phaseB: number[] | Float32Array, phaseC: number[] | Float32Array) {
  const wave_0 = new Float32Array(phaseA.length);
  const wave_alpha = new Float32Array(phaseA.length);
  const wave_beta = new Float32Array(phaseA.length);
  const sqrt3 = Math.sqrt(3);
  
  for (let i = 0; i < phaseA.length; i++) {
    wave_0[i] = (phaseA[i] + phaseB[i] + phaseC[i]) / 3;
    wave_alpha[i] = (2 * phaseA[i] - phaseB[i] - phaseC[i]) / 3;
    wave_beta[i] = (phaseB[i] - phaseC[i]) / sqrt3;
  }
  return { wave_0, wave_alpha, wave_beta };
}

export function teagerEnergyOperator(data: number[] | Float32Array): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 1; i < data.length - 1; i++) {
    result[i] = (data[i] * data[i]) - (data[i - 1] * data[i + 1]);
  }
  return result;
}

export function multiDifference(data: number[] | Float32Array): { diff1: Float32Array, diff2: Float32Array, diff3: Float32Array } {
  if (data.length < 4) return { diff1: new Float32Array(data.length), diff2: new Float32Array(data.length), diff3: new Float32Array(data.length) };
  
  const diff1 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 1; i++) {
    diff1[i] = data[i + 1] - data[i];
  }
  
  const diff2 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 2; i++) {
    diff2[i] = diff1[i + 1] - diff1[i];
  }
  
  const diff3 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 3; i++) {
    diff3[i] = diff2[i + 1] - diff2[i];
  }
  
  return { diff1, diff2, diff3 };
}

/**
 * Basic 1D DWT using selected wavelet coefficients
 * Returns the detail coefficients (high-pass)
 */
export function discreteWaveletTransform(data: number[] | Float32Array, type: string = 'db2'): Float32Array {
  let hi_d = [-0.4830, 0.8365, -0.2241, -0.1294]; // Default db2
  
  if (type === 'db4') {
    hi_d = [-0.0106, 0.0329, 0.0308, -0.1870, -0.0280, 0.6309, -0.7148, 0.2304];
  } else if (type === 'sym2') {
    hi_d = [-0.4830, 0.8365, -0.2241, -0.1294]; 
  } else if (type === 'haar') {
    hi_d = [-0.7071, 0.7071];
  }
  
  const result = new Float32Array(data.length);
  
  for (let i = 0; i < data.length - hi_d.length; i++) {
    let sum = 0;
    let hasNaN = false;
    for (let j = 0; j < hi_d.length; j++) {
      const v = data[i + j];
      if (isNaN(v)) {
        hasNaN = true;
        break;
      }
      sum += v * hi_d[j];
    }
    result[i] = hasNaN ? 0 : Math.abs(sum);
  }
  return result;
}

export interface DetectionResult {
  t_arrive: number; // index
  peakIdx: number;  // peak index
  max_val: number;
  detected: boolean;
  debugInfo?: {
    baseline: number;
    threshold: number;
    factor: number;
  };
}

/**
 * Double difference as defined in MATLAB wave_front_detect2.m:
 * double_diff_wave = abs(diff(abs(diff(wave_n))));
 */
export function doubleDifference(wave: Float32Array | number[]): Float32Array {
  const n = wave.length;
  if (n < 3) return new Float32Array(n).fill(0);
  
  const d1 = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    d1[i] = wave[i + 1] - wave[i];
  }
  
  const absD1 = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    absD1[i] = Math.abs(d1[i]);
  }
  
  const d2 = new Float32Array(n - 2);
  for (let i = 0; i < n - 2; i++) {
    d2[i] = absD1[i + 1] - absD1[i];
  }
  
  const result = new Float32Array(n);
  for (let i = 0; i < n - 2; i++) {
    result[i + 2] = Math.abs(d2[i]);
  }
  return result;
}

export function waveFrontDetect(
  processedWave: number[] | Float32Array, 
  samplingFreq: number, 
  faultTime: number,
  mode: 'diff' | 'wavelet',
  thresholdFactor: number = 1.5,
  preFaultWindowRatio: number = 0.1
): DetectionResult {
  const L = processedWave.length;
  if (L < 10) return { t_arrive: 0, peakIdx: 0, max_val: 0, detected: false };

  // Calculate baseline threshold from pre-fault data (MATLAB logic)
  // Use preFaultWindowRatio (e.g. 0.25 for 1/4 window) to determine the normal waveform portion
  const faultIdx = Math.max(10, Math.floor(preFaultWindowRatio * L));
  const preFaultData = processedWave.slice(0, Math.min(L, faultIdx));
  
  let max_num = 1e-6;
  if (preFaultData.length > 0) {
    let currentAbsMax = 0;
    for (let i = 0; i < preFaultData.length; i++) {
      const absVal = Math.abs(preFaultData[i]);
      if (absVal > currentAbsMax) currentAbsMax = absVal;
    }
    if (currentAbsMax > 0) {
      max_num = currentAbsMax;
    }
  }

  // The actual mutation threshold is the baseline max_num * thresholdFactor (K)
  // We compute a relative safety floor (1% of the absolute peak of the entire processed wave)
  // to prevent false triggering on micro-noise fluctuations (e.g. 1e-12) during smooth pre-fault periods.
  let maxOfEntireWave = 0;
  for (let i = 0; i < L; i++) {
    const absVal = Math.abs(processedWave[i]);
    if (absVal > maxOfEntireWave) maxOfEntireWave = absVal;
  }
  const safetyFloor = 0.01 * maxOfEntireWave;
  const threshold = Math.max(max_num * thresholdFactor, safetyFloor);

  // Find first mutation index exceeding the threshold (start from index 10 or faultIdx to avoid pre-fault window false alarms)
  const startSearchIdx = Math.max(10, faultIdx);
  let triggerIdx = -1;
  let detected = false;
  let fault_point = 0;

  for (let i = startSearchIdx; i < L; i++) {
    if (Math.abs(processedWave[i]) > threshold) {
      fault_point = processedWave[i];
      triggerIdx = i;
      detected = true;
      break;
    }
  }

  // Refine peak: look for first local peak (MATLAB logic)
  let peakIdx = triggerIdx;
  let peakVal = fault_point;

  if (detected && triggerIdx !== -1) {
    for (let j = triggerIdx + 1; j < L; j++) {
      const val = processedWave[j];
      const absVal = Math.abs(val);
      const absFaultPoint = Math.abs(fault_point);
      
      if (absVal > absFaultPoint && val * fault_point > 0) {
        fault_point = val;
        peakIdx = j;
        peakVal = val;
      }
      if (absVal < absFaultPoint || val * fault_point < 0) {
        break;
      }
    }
  }

  return { 
    t_arrive: triggerIdx === -1 ? 0 : triggerIdx, 
    peakIdx: peakIdx === -1 ? 0 : peakIdx,
    max_val: peakVal, 
    detected,
    debugInfo: {
      baseline: max_num,
      threshold: threshold,
      factor: thresholdFactor
    }
  };
}
export function detectWaveHead(data: number[] | Float32Array, threshold: number = 0.1, maxCount: number = 100): { index: number, value: number }[] {
  const peaks = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > data[i - 1] && data[i] > data[i + 1] && data[i] > threshold) {
      peaks.push({ index: i, value: data[i] });
    }
  }
  peaks.sort((a, b) => b.value - a.value);
  return peaks.slice(0, maxCount);
}

export interface SequenceCalibrationResult {
  index: number;
  value: number;
  amplitude: number;
  isManual: boolean;
  startIdx: number;
  endIdx: number;
  startVal?: number;
  point1?: number;
  point2?: number;
  diff1Idx?: number;
  debugWaves?: {
    diff1: Float32Array;
    diff2: Float32Array;
    diff3: Float32Array;
    original: Float32Array;
  };
}

export interface CalibrationOptions {
  samplingFreq?: number;
  thresholdFactor?: number;
  preFaultWindowRatio?: number;
  para_cali_windows_length?: number;
  para_cali_start_doorsill?: number;
  para_cali_hist?: number;
  para_cali_hist_sift?: number;
  user_diff2_time?: number;
  user_diff2_time_end?: number;
  min_pair_distance?: number;
  para_cali_head_count?: number;
}

/**
 * MATLAB get_extrem_point.m 0-indexed equivalent
 */
function getExtremPointMatlab(data1: Float32Array | number[]): number[] {
  const n = data1.length;
  if (n < 2) return [];
  const diff_data = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    diff_data[i] = data1[i + 1] - data1[i];
  }

  const p_site: number[] = [];
  if (diff_data[0] < 0) {
    p_site.push(0);
  }
  for (let i1 = 0; i1 < diff_data.length - 1; i1++) {
    if (diff_data[i1] > 0 && diff_data[i1 + 1] < 0) {
      p_site.push(i1 + 1);
    }
  }
  if (diff_data[diff_data.length - 1] > 0) {
    p_site.push(n - 1);
  }
  return p_site;
}

/**
 * MATLAB get_wave_head.m 0-indexed equivalent
 */
function getWaveHeadMatlab(
  wave_1: Float32Array,
  t_us: Float32Array,
  para_cali: number[]
): { wave_head: number[], t_head: number[] } {
  const windows_length = para_cali[0];
  const start_doorsill = para_cali[1];
  const hist_sift = para_cali[3];

  const site_temp_1: number[] = [];
  for (let i = 0; i < wave_1.length; i++) {
    if (Math.abs(wave_1[i]) > start_doorsill) {
      site_temp_1.push(i);
    }
  }

  let windows_start = 0;
  if (site_temp_1.length > 0) {
    windows_start = site_temp_1[0] - 10;
  }
  if (windows_start < 0) windows_start = 0;
  
  let windows_end = windows_start + windows_length;
  if (windows_end >= wave_1.length) windows_end = wave_1.length - 1;

  const wave_2 = wave_1.slice(windows_start, windows_end + 1);
  const t_2: number[] = [];
  for (let i = windows_start; i <= windows_end; i++) {
    t_2.push(Number(t_us[i]));
  }

  const p_site1 = getExtremPointMatlab(wave_2);
  const wave_2_neg = new Float32Array(wave_2.length);
  for (let i = 0; i < wave_2.length; i++) wave_2_neg[i] = -wave_2[i];
  const p_site2 = getExtremPointMatlab(wave_2_neg);

  const P_pole: number[] = [];
  const P_site: number[] = [];
  for (const s of p_site1) {
    P_pole.push(Math.abs(wave_2[s]));
    P_site.push(s);
  }
  for (const s of p_site2) {
    P_pole.push(Math.abs(wave_2[s]));
    P_site.push(s);
  }

  const pole_indices = P_pole.map((v, i) => i);
  pole_indices.sort((a, b) => P_pole[b] - P_pole[a]);

  const head_sift_count = Math.min(hist_sift, pole_indices.length);
  const head_site_indices = pole_indices.slice(0, head_sift_count);

  const wave_head_sifted: number[] = [];
  const t_head_sifted: number[] = [];
  for (const idx of head_site_indices) {
    const s = P_site[idx];
    wave_head_sifted.push(wave_2[s]);
    t_head_sifted.push(t_2[s]);
  }

  const t_indices = t_head_sifted.map((v, i) => i);
  t_indices.sort((a, b) => t_head_sifted[a] - t_head_sifted[b]);

  const wave_head: number[] = [];
  const t_head: number[] = [];
  for (const idx of t_indices) {
    wave_head.push(wave_head_sifted[idx]);
    t_head.push(t_head_sifted[idx]);
  }

  return { wave_head, t_head };
}

/**
 * Core wave head sequence calibration runner matching Wave_head_time_calibration4_plot.m exactly
 */
function calibrateWaveSequenceCore(
  wave_fault1: number[] | Float32Array,
  options: CalibrationOptions = {}
): SequenceCalibrationOutput {
  const {
    para_cali_start_doorsill = 0.1,
    para_cali_windows_length = 1000,
    para_cali_hist_sift = 30,
    user_diff2_time = 7,  // corresponds to diff2_pole_time in MATLAB
    user_diff2_time_end = 50,
    para_cali_head_count = 15
  } = options;

  const L = wave_fault1.length;
  if (L < 10) return { heads: [] };

  // 1. Calculate diff1, diff2, diff3
  const diff1 = new Float32Array(L - 1);
  for (let i = 0; i < L - 1; i++) diff1[i] = wave_fault1[i + 1] - wave_fault1[i];
  
  const diff2 = new Float32Array(L - 2);
  for (let i = 0; i < L - 2; i++) diff2[i] = diff1[i + 1] - diff1[i];
  
  const diff3 = new Float32Array(L - 3);
  for (let i = 0; i < L - 3; i++) diff3[i] = diff2[i + 1] - diff2[i];

  // 2. get_wave_head logic
  let windows_start = 0;
  for (let i = 0; i < diff2.length; i++) {
    if (Math.abs(diff2[i]) > para_cali_start_doorsill) {
      windows_start = Math.max(0, i - 10);
      break;
    }
  }
  let windows_end = Math.min(diff2.length - 1, windows_start + para_cali_windows_length);
  const diff2_window = diff2.slice(windows_start, windows_end + 1);
  
  const p_site1 = getExtremPointMatlab(diff2_window);
  const diff2_window_neg = new Float32Array(diff2_window.length);
  for(let i=0; i<diff2_window.length; i++) diff2_window_neg[i] = -diff2_window[i];
  const p_site2 = getExtremPointMatlab(diff2_window_neg);
  
  const P_pole: number[] = [];
  const P_site: number[] = [];
  for (const s of p_site1) {
    P_pole.push(Math.abs(diff2_window[s]));
    P_site.push(s);
  }
  for (const s of p_site2) {
    P_pole.push(Math.abs(diff2_window[s]));
    P_site.push(s);
  }
  
  const pole_indices = P_pole.map((v, i) => i);
  pole_indices.sort((a, b) => P_pole[b] - P_pole[a]);
  
  const head_sift_count = Math.min(para_cali_hist_sift, pole_indices.length);
  const head_site_indices = pole_indices.slice(0, head_sift_count);
  
  const T_head_window_idx: number[] = [];
  for (const idx of head_site_indices) {
    T_head_window_idx.push(P_site[idx]);
  }
  T_head_window_idx.sort((a, b) => a - b);
  const T_head: number[] = T_head_window_idx.map(s => s + windows_start);

  const waveHeads: SequenceCalibrationResult[] = [];
  let k1 = 0;
  while (true) {
    if (k1 >= T_head.length) break;
    
    const point_1 = T_head[k1];
    let point_2: number;
    
    if (k1 + 1 < T_head.length && T_head[k1 + 1] - point_1 <= user_diff2_time) {
      point_2 = T_head[k1 + 1];
    } else {
      k1++;
      continue;
    }
    
    let t_range1 = Math.max(0, point_1 - user_diff2_time);
    let t_range2 = point_2;
    
    const val1 = diff2[point_1];
    const val2 = diff2[point_2];
    
    let t_head_start = point_1;
    let t_head_end = point_2;
    let diff1Idx: number | undefined;

    if (val1 > 0 && val2 < 0) { 
      const search_end_for_zheng = Math.min(point_2 + user_diff2_time_end, diff2.length - 1);
      let site_zheng_s_first = -1;
      for (let i = point_2; i <= search_end_for_zheng; i++) {
        if (diff2[i] > 0) { site_zheng_s_first = i; break; }
      }
      
      if (site_zheng_s_first === -1) {
        if (k1 + 2 < T_head.length) {
          t_range2 = Math.min(point_2 + user_diff2_time_end, T_head[k1 + 2]);
        } else {
          t_range2 = point_2 + user_diff2_time_end;
        }
      } else {
        if (k1 + 2 < T_head.length) {
          t_range2 = Math.min(site_zheng_s_first, T_head[k1 + 2]);
        } else {
          t_range2 = site_zheng_s_first;
        }
      }
      
      let max_diff3 = -Infinity;
      let max_site_diff3 = t_range1;
      for (let i = t_range1; i <= Math.min(point_1, diff3.length - 1); i++) {
        if (diff3[i] > max_diff3) { max_diff3 = diff3[i]; max_site_diff3 = i; }
      }
      t_head_start = max_site_diff3;
      
      let max_diff1 = -Infinity;
      let max_site_diff1 = t_range1;
      for (let i = t_range1; i <= Math.min(t_range2, diff1.length - 1); i++) {
        if (diff1[i] > max_diff1) { max_diff1 = diff1[i]; max_site_diff1 = i; }
      }
      diff1Idx = max_site_diff1;
      
      let search_end_for_fu = Math.min(diff1Idx + user_diff2_time_end, diff1.length - 1);
      if (k1 + 2 < T_head.length) search_end_for_fu = Math.min(search_end_for_fu, T_head[k1 + 2]);
      
      let site_fu_s_first = -1;
      for (let i = diff1Idx; i <= search_end_for_fu; i++) {
        if (diff1[i] <= 0) { site_fu_s_first = i; break; }
      }
      
      if (site_fu_s_first === -1) {
        let diff2_zheng_site_first = -1;
        for (let i = diff1Idx || 0; i <= Math.min((diff1Idx || 0) + user_diff2_time_end, diff2.length - 1); i++) {
          if (diff2[i] >= 0) { diff2_zheng_site_first = i; break; }
        }
        if (diff2_zheng_site_first === -1) {
          t_head_end = (diff1Idx || 0) + user_diff2_time_end;
        } else {
          t_head_end = diff2_zheng_site_first;
        }
      } else {
        t_head_end = site_fu_s_first;
      }
      
    } else if (val1 < 0 && val2 > 0) { 
      const search_end_for_fu = Math.min(point_2 + user_diff2_time_end, diff2.length - 1);
      let site_fu_s_first = -1;
      for (let i = point_2; i <= search_end_for_fu; i++) {
        if (diff2[i] < 0) { site_fu_s_first = i; break; }
      }
      
      if (site_fu_s_first === -1) {
        if (k1 + 2 < T_head.length) {
          t_range2 = Math.min(point_2 + user_diff2_time_end, T_head[k1 + 2]);
        } else {
          t_range2 = point_2 + user_diff2_time_end;
        }
      } else {
        if (k1 + 2 < T_head.length) {
          t_range2 = Math.min(site_fu_s_first, T_head[k1 + 2]);
        } else {
          t_range2 = site_fu_s_first;
        }
      }
      
      let min_diff3 = Infinity;
      let min_site_diff3 = t_range1;
      for (let i = t_range1; i <= Math.min(point_1, diff3.length - 1); i++) {
        if (diff3[i] < min_diff3) { min_diff3 = diff3[i]; min_site_diff3 = i; }
      }
      t_head_start = min_site_diff3;
      
      let min_diff1 = Infinity;
      let min_site_diff1 = t_range1;
      for (let i = t_range1; i <= Math.min(t_range2, diff1.length - 1); i++) {
        if (diff1[i] < min_diff1) { min_diff1 = diff1[i]; min_site_diff1 = i; }
      }
      diff1Idx = min_site_diff1;
      
      let search_end_for_zheng = Math.min(diff1Idx + user_diff2_time_end, diff1.length - 1);
      if (k1 + 2 < T_head.length) search_end_for_zheng = Math.min(search_end_for_zheng, T_head[k1 + 2]);
      
      let site_zheng_s_first = -1;
      for (let i = diff1Idx || 0; i <= search_end_for_zheng; i++) {
        if (diff1[i] >= 0) { site_zheng_s_first = i; break; }
      }
      
      if (site_zheng_s_first === -1) {
        let diff2_fu_site_first = -1;
        for (let i = diff1Idx || 0; i <= Math.min((diff1Idx || 0) + user_diff2_time_end, diff2.length - 1); i++) {
          if (diff2[i] <= 0) { diff2_fu_site_first = i; break; }
        }
        if (diff2_fu_site_first === -1) {
          t_head_end = (diff1Idx || 0) + user_diff2_time_end;
        } else {
          t_head_end = diff2_fu_site_first;
        }
      } else {
        t_head_end = site_zheng_s_first;
      }
    } else {
      k1++;
      continue;
    }
    
    t_head_start = Math.max(0, Math.min(L - 1, t_head_start));
    t_head_end = Math.max(0, Math.min(L - 1, t_head_end));
    
    const wave_head_start = wave_fault1[t_head_start];
    const wave_head_end = wave_fault1[t_head_end];
    const wave_amplitude = wave_head_end - wave_head_start;
    
    waveHeads.push({
      index: t_head_start, // Start time of wave head
      value: wave_head_start, // Original waveform value at start time
      amplitude: wave_amplitude,
      isManual: false,
      startIdx: t_head_start,
      endIdx: t_head_end,
      startVal: wave_head_start,
      point1: point_1,
      point2: point_2,
      diff1Idx
    });
    
    k1 += 2;
  }

  return { 
    heads: waveHeads,
    debugInfo: {
      threshold: para_cali_start_doorsill,
      T_head,
      validHeads: waveHeads
    }
  };
}

export function calibrateWaveSequence(
  wave_fault1: number[] | Float32Array,
  options: CalibrationOptions = {}
): SequenceCalibrationResult[] {
  const { heads } = calibrateWaveSequenceCore(wave_fault1, options);
  const { para_cali_head_count = 15 } = options;
  const waveHeads = [...heads];
  waveHeads.sort((a, b) => Math.abs(b.amplitude) - Math.abs(a.amplitude));
  const finalHeads = waveHeads.slice(0, para_cali_head_count);
  finalHeads.sort((a, b) => a.index - b.index);
  return finalHeads;
}

export interface SequenceCalibrationOutput {
  heads: SequenceCalibrationResult[];
  debugInfo?: {
    threshold: number;
    T_head?: number[];
    heads_start_indices?: number[];
    heads_end_indices?: number[];
    extrema?: {
      index: number;
      val: number;
      absVal: number;
      passedThreshold: boolean;
      rank?: number;
      passedSift?: boolean;
    }[];
    pairingSteps?: {
      k1: number;
      point1?: number;
      point2?: number;
      val1?: number;
      val2?: number;
      distance?: number;
      isNear?: boolean;
      isOppositeSign?: boolean;
      status: 'success' | 'failed_distance' | 'failed_sign' | 'skipped' | 'incomplete';
      description: string;
      t_head_start?: number;
      t_head_end?: number;
      amplitude?: number;
    }[];
    validHeads?: SequenceCalibrationResult[];
  };
}

export function calibrateWaveSequenceUserUpload(
  wave_fault1: number[] | Float32Array,
  options: CalibrationOptions = {}
): SequenceCalibrationOutput {
  return calibrateWaveSequenceCore(wave_fault1, options);
}

export function generateMockConditionData(pointsCount: number, faultPointIdx: number = 0) {
  const length = 500;
  const points = [];
  for (let p = 0; p < pointsCount; p++) {
    const phaseA = new Float32Array(length);
    const phaseB = new Float32Array(length);
    const phaseC = new Float32Array(length);
    
    // Arrival time differs by distance
    const arrivalTime = 200 + p * 30 + (Math.random() * 10 - 5);
    
    for (let i = 0; i < length; i++) {
      if (i < arrivalTime) {
        phaseA[i] = Math.sin(i * 0.1) * 0.1 + (Math.random() - 0.5) * 0.02;
        phaseB[i] = Math.sin(i * 0.1 - (2 * Math.PI) / 3) * 0.1 + (Math.random() - 0.5) * 0.02;
        phaseC[i] = Math.sin(i * 0.1 + (2 * Math.PI) / 3) * 0.1 + (Math.random() - 0.5) * 0.02;
      } else {
        const t = i - arrivalTime;
        const decay = Math.exp(-t * 0.03);
        const faultSign = (p === faultPointIdx) ? 1.5 : 0.8; // larger spike at fault
        
        // Simulating a ground fault on Phase A
        phaseA[i] = Math.sin(i * 0.1) * 0.1 + faultSign * decay * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.05;
        phaseB[i] = Math.sin(i * 0.1 - (2 * Math.PI) / 3) * 0.1 + 0.2 * decay * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.02;
        phaseC[i] = Math.sin(i * 0.1 + (2 * Math.PI) / 3) * 0.1 + 0.2 * decay * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.02;
      }
    }
    points.push({ id: `point-${p+1}`, name: `测点M(${p+1})`, phaseA, phaseB, phaseC });
  }
  return points;
}
