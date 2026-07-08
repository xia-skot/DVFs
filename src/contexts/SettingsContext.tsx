import React, { createContext, useContext, useState, useEffect } from 'react';

export interface AppSettings {
  topology: {
    defaultNodeCount: number;
    defaultMeasuringPointCount: number;
    shortcutsEnabled: boolean;
    panelWidths: {
      leftSidebar: number;
      rightSidebar: number;
    };
    canvasResetMargin: number;
  };
  faultDetection: {
    defaultSamplingFrequency: number;
    defaultDetectionAlgorithm: string;
    defaultCalibrationAlgorithm: string;
    defaultWavelet: string;
    preFaultWindowRatio: number;
    exportVariableNaming: string;
    panelWidths: {
      leftSidebar: number;
      rightSidebar: number;
    };
    thresholdFactor: number;
    waveformChartHeight: number;
    tooltipTriggerDistance: number;
    curveColors: {
      phaseA: string;
      phaseB: string;
      phaseC: string;
      alpha: string;
      beta: string;
      zero: string;
      teo: string;
      calibration: string;
    };
    defaultExportFolder: string;
    psoPopulation: number;
    psoIterations: number;
    fittingWindowPercent: number;
    calibrationScope: 'all' | 'current';
    para_cali_windows_length: number;
    para_cali_start_doorsill: number;
    para_cali_hist: number;
    para_cali_hist_sift: number;
    user_diff2_time: number;
    user_diff2_time_end: number;
    para_cali_head_count: number;
    zoomThresholdX: number;
    zoomThresholdY: number;
    sequenceHeadStartColor: string;
    sequenceHeadPeakColor: string;
    sequenceHeadSize: number;
  };
  system: {
    dataImportFolder: string;
    localLibraryWidth: number;
    localLibraryHeight: number;
    shortcuts: {
      saveProject: string;
      openLibrary: string;
      importData: string;
      calibrate: string;
      export: string;
      
      // 拓扑构建快捷键
      topoUndo: string;
      topoRedo: string;
      topoCopy: string;
      topoPaste: string;
      topoCut: string;
      topoMirror: string;
      topoRotate: string;
      topoDelete: string;

      // 故障检测快捷键
      waveToggleMode: string;
      waveUndo: string;
      waveRedo: string;
      waveDelete: string;
      waveClearAll: string;
    };
  };
  guidance: {
    regular: {
      fontFamily: string;
      fontSize: number;
      color: string;
      isItalic: boolean;
      isBold: boolean;
    };
    error: {
      fontFamily: string;
      fontSize: number;
      color: string;
      isItalic: boolean;
      isBold: boolean;
    };
  };
  faultLocalization: {
    defaultAlgorithm: string;
    waveVelocity: number;
    lineLength: number;
    timeSyncAccuracy: number;
  };
}

export const defaultSettings: AppSettings = {
  topology: {
    defaultNodeCount: 10,
    defaultMeasuringPointCount: 5,
    shortcutsEnabled: true,
    panelWidths: {
      leftSidebar: 30,
      rightSidebar: 13,
    },
    canvasResetMargin: 30,
  },
  faultDetection: {
    defaultSamplingFrequency: 1000000,
    defaultDetectionAlgorithm: 'initial',
    defaultCalibrationAlgorithm: 'wavelet',
    defaultWavelet: 'db2',
    preFaultWindowRatio: 0.25,
    exportVariableNaming: 'waveform_results',
    panelWidths: {
      leftSidebar: 300,
      rightSidebar: 25,
    },
    thresholdFactor: 1.5,
    waveformChartHeight: 70,
    tooltipTriggerDistance: 20,
    curveColors: {
      phaseA: '#facc15', // yellow-400
      phaseB: '#22c55e', // green-500
      phaseC: '#ef4444', // red-500
      alpha: '#3b82f6', // blue-500
      beta: '#8b5cf6', // violet-500
      zero: '#64748b', // slate-500
      teo: '#f97316',   // orange-500
      calibration: '#0ea5e9', // sky-500
    },
    defaultExportFolder: 'downloads',
    psoPopulation: 20,
    psoIterations: 30,
    fittingWindowPercent: 25,
    calibrationScope: 'all',
    para_cali_windows_length: 3000,
    para_cali_start_doorsill: 0.01,
    para_cali_hist: 200,
    para_cali_hist_sift: 30,
    user_diff2_time: 10,
    user_diff2_time_end: 50,
    para_cali_head_count: 15,
    zoomThresholdX: 10,
    zoomThresholdY: 10,
    sequenceHeadStartColor: '#ef4444',
    sequenceHeadPeakColor: '#3b82f6',
    sequenceHeadSize: 4,
  },
  system: {
    dataImportFolder: '',
    localLibraryWidth: 672,
    localLibraryHeight: 500,
    shortcuts: {
      saveProject: 'Ctrl+S',
      openLibrary: 'Ctrl+O',
      importData: 'Ctrl+I',
      calibrate: 'Ctrl+B',
      export: 'Ctrl+E',
      
      topoUndo: 'Ctrl+Z',
      topoRedo: 'Ctrl+Y',
      topoCopy: 'Ctrl+C',
      topoPaste: 'Ctrl+V',
      topoCut: 'Ctrl+X',
      topoMirror: 'Ctrl+M',
      topoRotate: 'Ctrl+R',
      topoDelete: 'Delete',

      waveToggleMode: 'Alt+D',
      waveUndo: 'Ctrl+Z',
      waveRedo: 'Ctrl+Y',
      waveDelete: 'Ctrl+X',
      waveClearAll: 'Alt+D, D',
    },
  },
  guidance: {
    regular: {
      fontFamily: 'font-sans',
      fontSize: 12,
      color: '#6b7280', // text-gray-500
      isItalic: true,
      isBold: false,
    },
    error: {
      fontFamily: 'font-sans',
      fontSize: 12,
      color: '#dc2626', // red-600
      isItalic: true,
      isBold: false,
    },
  },
  faultLocalization: {
    defaultAlgorithm: 'double-ended',
    waveVelocity: 284.5, // Propagation speed in overhead lines (typical value in m/µs or km/ms)
    lineLength: 85.0, // Default line length in km
    timeSyncAccuracy: 0.1, // Synchronized GPS clock accuracy threshold in µs
  },
};

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: AppSettings) => void;
  updateCategorySettings: <K extends keyof AppSettings>(category: K, newCategorySettings: Partial<AppSettings[K]>) => void;
  initialSettings: AppSettings;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'appSettings_v5';

const parseSavedSettings = (savedStr: string): AppSettings => {
  try {
    const parsed = JSON.parse(savedStr);
    if (!parsed || typeof parsed !== 'object') return defaultSettings;
    
    // Normalize shortcuts to string format if they are legacy objects
    const systemShortcuts = { ...defaultSettings.system.shortcuts };
    const parsedShortcuts = parsed.system?.shortcuts;
    if (parsedShortcuts && typeof parsedShortcuts === 'object') {
      Object.entries(parsedShortcuts).forEach(([k, v]) => {
        if (typeof v === 'string') {
          (systemShortcuts as any)[k] = v;
        } else if (v && typeof v === 'object') {
          const parts: string[] = [];
          if ((v as any).ctrl) parts.push('Ctrl');
          if ((v as any).shift) parts.push('Shift');
          if ((v as any).alt) parts.push('Alt');
          if ((v as any).meta) parts.push('Meta');
          if ((v as any).key) {
            let keyName = (v as any).key;
            if (keyName === ' ') keyName = 'Space';
            if (keyName.length === 1) keyName = keyName.toUpperCase();
            parts.push(keyName);
          }
          (systemShortcuts as any)[k] = parts.join('+') || 'None';
        }
      });
    }

    return {
      topology: { 
        ...defaultSettings.topology, 
        ...(parsed.topology || {}), 
        panelWidths: { ...defaultSettings.topology.panelWidths, ...(parsed.topology?.panelWidths || {}) } 
      },
      faultDetection: { 
        ...defaultSettings.faultDetection, 
        ...(parsed.faultDetection || {}), 
        panelWidths: { ...defaultSettings.faultDetection.panelWidths, ...(parsed.faultDetection?.panelWidths || {}) }, 
        curveColors: { ...defaultSettings.faultDetection.curveColors, ...(parsed.faultDetection?.curveColors || {}) } 
      },
      system: { 
        ...defaultSettings.system, 
        ...(parsed.system || {}), 
        shortcuts: systemShortcuts 
      },
    guidance: { 
      regular: {
        ...defaultSettings.guidance.regular,
        ...(parsed.guidance?.regular || (parsed.guidance?.fontFamily ? {
          fontFamily: parsed.guidance.fontFamily,
          fontSize: parsed.guidance.fontSize,
          color: parsed.guidance.color,
        } : {}))
      },
      error: {
        ...defaultSettings.guidance.error,
        ...(parsed.guidance?.error || {})
      }
    },
    faultLocalization: { 
      ...defaultSettings.faultLocalization, 
      ...parsed.faultLocalization 
    },
  };
  } catch (e) {
    return defaultSettings;
  }
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return parseSavedSettings(saved);
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  const [initialSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  const updateCategorySettings = <K extends keyof AppSettings>(category: K, newCategorySettings: Partial<AppSettings[K]>) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        ...newCategorySettings,
      },
    }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, updateCategorySettings, initialSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface StrokeHistoryEntry {
  stroke: string;
  time: number;
}

let strokeHistory: StrokeHistoryEntry[] = [];
let lastProcessedEvent: KeyboardEvent | null = null;

function getEventStroke(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  
  let keyName = e.key;
  if (keyName === ' ') keyName = 'Space';
  
  const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(keyName);
  if (isModifierOnly) {
    return parts.join('+');
  }
  
  if (keyName.length === 1) {
    keyName = keyName.toUpperCase();
  } else {
    keyName = keyName.charAt(0).toUpperCase() + keyName.slice(1);
  }
  
  if (!parts.includes(keyName)) {
    parts.push(keyName);
  }
  
  return parts.join('+');
}

function getActiveShortcuts(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.system?.shortcuts) {
        return Object.values(parsed.system.shortcuts).filter((v): v is string => typeof v === 'string');
      }
    }
  } catch (e) {}
  return Object.values(defaultSettings.system.shortcuts);
}

export function matchShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false;

  // Track event history
  if (lastProcessedEvent !== e) {
    lastProcessedEvent = e;
    const keyName = e.key;
    const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(keyName);
    
    if (!isModifierOnly) {
      const currentStroke = getEventStroke(e);
      const now = Date.now();
      // Clean up strokes older than 1000ms
      strokeHistory = strokeHistory.filter(h => now - h.time < 1000);
      strokeHistory.push({ stroke: currentStroke, time: now });
    }
  }

  // Parse shortcutStr. It can be multiple strokes separated by space, e.g. "Alt+D D"
  // Or a single legacy stroke
  const expectedStrokes = shortcutStr.split(' ').map(s => s.trim()).filter(Boolean);
  if (expectedStrokes.length === 0) return false;

  const now = Date.now();
  const validHistory = strokeHistory.filter(h => now - h.time < 1000);

  if (validHistory.length < expectedStrokes.length) return false;

  // Take the last expectedStrokes.length elements from history
  const actualStrokes = validHistory.slice(-expectedStrokes.length);

  // Check matching
  for (let i = 0; i < expectedStrokes.length; i++) {
    const act = actualStrokes[i].stroke;
    const exp = expectedStrokes[i];
    
    if (act.toLowerCase() === exp.toLowerCase()) continue;

    const actParts = act.split('+');
    const expParts = exp.split('+');
    const actMain = actParts[actParts.length - 1];
    const expMain = expParts[expParts.length - 1];

    if (actMain.toLowerCase() !== expMain.toLowerCase()) return false;

    // Compare modifiers: if they are different, check if it's a sequence where modifier is held.
    if (i > 0) {
      const firstExp = expectedStrokes[0];
      const firstExpParts = firstExp.split('+');
      const firstExpMods = firstExpParts.slice(0, -1).map(m => m.toLowerCase());
      
      const actMods = actParts.slice(0, -1).map(m => m.toLowerCase());
      const expMods = expParts.slice(0, -1).map(m => m.toLowerCase());

      const isSubset = actMods.every(m => firstExpMods.includes(m));
      const containsExpected = expMods.every(m => actMods.includes(m));
      
      if (isSubset && containsExpected) {
        continue;
      }
    }
    
    return false;
  }

  // If matched, clear history of these matched strokes so they don't trigger another shortcut in same sequence
  const activeShortcuts = getActiveShortcuts();
  const isPrefixOfAnyOther = activeShortcuts.some(other => 
    other.toLowerCase() !== shortcutStr.toLowerCase() &&
    other.toLowerCase().startsWith(shortcutStr.toLowerCase() + ' ')
  );
  if (!isPrefixOfAnyOther) {
    strokeHistory = [];
  }
  return true;
}
