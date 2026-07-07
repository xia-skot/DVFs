import React, { useState, useEffect, useRef } from 'react';
import { Network, Activity, MapPin, Settings as SettingsIcon, Database, ChevronDown, FolderOpen, Save } from 'lucide-react';
import { TopologyBuilder } from './components/TopologyBuilder';
import { WaveformAnalyzer } from './components/WaveformAnalyzer';
import { SettingsModal } from './components/SettingsModal';
import { LocalLibraryModal } from './components/LocalLibraryModal';
import { LocalSaveModal } from './components/LocalSaveModal';
import { saveProject, SavedProject } from './lib/projectStorage';
import { useSettings, matchShortcut } from './contexts/SettingsContext';

type Tab = 'topology' | 'waveform' | 'location';

export default function App() {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>('topology');
  const [globalPointsCount, setGlobalPointsCount] = useState<number>(4);
  const [globalMachineList, setGlobalMachineList] = useState<number[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [isLocalLibraryOpen, setIsLocalLibraryOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('');
  const [gatheredData, setGatheredData] = useState<{ topology: any, waveform: any } | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);
  
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const libraryMenuRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    const duration = (type === 'error' || type === 'warning') ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  };

  // Data sync state
  const pendingData = useRef<{ topology?: any, waveform?: any }>({});

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setIsFileMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
      if (libraryMenuRef.current && !libraryMenuRef.current.contains(event.target as Node)) {
        setIsLibraryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    const handleProvideData = (e: any) => {
      const { type, data } = e.detail;
      if (type === 'topology') pendingData.current.topology = data;
      if (type === 'waveform') pendingData.current.waveform = data;
      
      // Check if both are gathered
      if (pendingData.current.topology && pendingData.current.waveform) {
        const { topology, waveform } = pendingData.current;
        pendingData.current = {};

        // Requirement: If only topology exists but no waveform data, show reminder in guidance area instead of modal
        const hasTopology = topology.isCreated && topology.nodes && topology.nodes.length > 0;
        const hasWaveform = waveform.conditions && waveform.conditions.length > 0;

        if (!hasTopology) {
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: '存储失败：网络拓扑结构为空，请先在[拓扑构建]中建立并保存网络节点模型。', isError: true } }));
          return;
        }

        if (hasTopology && !hasWaveform) {
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: '存储失败：当前仅有拓扑结构数据，缺少波形工况数据，无法进行绑定存储。', isError: true } }));
          return;
        }

        if (waveform.conditions && waveform.conditions.length > 0) {
          const firstCondition = waveform.conditions[0];
          if (firstCondition.points.length !== topology.machineList.length) {
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: '存储失败：拓扑图中配置的测量点数量与导入的波形测点数量不匹配，请重新配置。', isError: true } }));
            return;
          }
        }

        if (currentProjectId) {
          // Automatic save update directly! No popup!
          const projName = currentProjectName || waveform.currentProjectName || `项目_${new Date().toLocaleDateString()}`;
          executeDirectSave(topology, waveform, projName);
        } else {
          // Open Modal for new save
          setGatheredData({ topology, waveform });
          setIsSaveModalOpen(true);
        }
      }
    };
    window.addEventListener('COMPONENT_PROVIDE_DATA', handleProvideData);

    const handleProjectCleared = () => {
      setCurrentProjectId(null);
      setCurrentProjectName('');
    };
    window.addEventListener('APP_PROJECT_CLEARED', handleProjectCleared);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('COMPONENT_PROVIDE_DATA', handleProvideData);
      window.removeEventListener('APP_PROJECT_CLEARED', handleProjectCleared);
    };
  }, [currentProjectId, currentProjectName]);

  // 全局快捷键监听（匹配用户自定义设置）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is actively typing in input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const scs = settings.system?.shortcuts;
      if (!scs) return;

      // 1. 保存项目
      if (matchShortcut(e, scs.saveProject)) {
        e.preventDefault();
        handleStoreRequest();
        return;
      }

      // 2. 打开本地库
      if (matchShortcut(e, scs.openLibrary)) {
        e.preventDefault();
        setIsLocalLibraryOpen(true);
        return;
      }

      // 3. 导入数据 (分发自定义事件给具体的组件)
      if (matchShortcut(e, scs.importData)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('APP_SHORTCUT_IMPORT_DATA'));
        return;
      }

      // 4. 自动算法标定波头
      if (matchShortcut(e, scs.calibrate)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('APP_SHORTCUT_CALIBRATE'));
        return;
      }

      // 5. 导出测距/标定结果
      if (matchShortcut(e, scs.export)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('APP_SHORTCUT_EXPORT_RESULTS'));
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProjectId, settings.system?.shortcuts]);

  const handleStoreRequest = () => {
    pendingData.current = {};
    window.dispatchEvent(new CustomEvent('APP_REQUEST_DATA'));
    setIsLibraryMenuOpen(false);
    
    // Safety timeout in case one component doesn't respond
    setTimeout(() => {
      if (pendingData.current.topology || pendingData.current.waveform) {
        if (!pendingData.current.topology || !pendingData.current.waveform) {
          showToast('存储失败：请确保拓扑结构已创建且已导入波形数据', 'error');
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: '存储失败：请确保拓扑结构已创建且已导入波形数据', isError: true } }));
          pendingData.current = {};
        }
      }
    }, 1000);
  };

  const executeDirectSave = async (topology: any, waveform: any, projectName: string) => {
    if (!currentProjectId) return;
    
    // Dispatch save started
    window.dispatchEvent(new CustomEvent('APP_PROJECT_SAVING', { detail: { id: currentProjectId } }));

    const newProject: SavedProject = {
      id: currentProjectId,
      name: projectName,
      timestamp: Date.now(),
      conditionsCount: waveform.conditions.length,
      data: waveform.conditions,
      topology: {
        nodes: topology.nodes,
        linkMatrix: topology.linkMatrix,
        longMatrix: topology.longMatrix,
        machineList: topology.machineList,
        nodeCount: topology.nodeCount,
        measurementCount: topology.measurementCount
      }
    };

    try {
      await saveProject(newProject);
      setCurrentProjectName(projectName);
      // Dispatch save ended
      window.dispatchEvent(new CustomEvent('APP_PROJECT_SAVED', { detail: { id: currentProjectId, name: projectName } }));
    } catch (err) {
      console.error('Direct save failed:', err);
      showToast('自动更新存储失败', 'error');
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: '自动更新存储失败', isError: true } }));
    }
  };

  const onConfirmSave = async (projectName: string, saveAsNew: boolean) => {
    if (!gatheredData) return;
    const { topology, waveform } = gatheredData;

    const projectId = (saveAsNew || !currentProjectId) ? crypto.randomUUID() : currentProjectId;
    const newProject: SavedProject = {
      id: projectId,
      name: projectName,
      timestamp: Date.now(),
      conditionsCount: waveform.conditions.length,
      data: waveform.conditions,
      topology: {
        nodes: topology.nodes,
        linkMatrix: topology.linkMatrix,
        longMatrix: topology.longMatrix,
        machineList: topology.machineList,
        nodeCount: topology.nodeCount,
        measurementCount: topology.measurementCount
      }
    };

    try {
      await saveProject(newProject);
      setCurrentProjectId(projectId);
      setCurrentProjectName(projectName);
      // Notify components about the new ID and Name
      window.dispatchEvent(new CustomEvent('APP_PROJECT_SAVED', { detail: { id: projectId, name: projectName } }));
      setIsSaveModalOpen(false);
      setGatheredData(null);
      showToast(saveAsNew ? '项目成功保存至本地库' : '项目已成功保存更新', 'success');
    } catch (err) {
      console.error('Save failed:', err);
      showToast('存储失败', 'error');
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: '存储失败', isError: true } }));
    }
  };

  const handleLoadProject = (project: SavedProject) => {
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    window.dispatchEvent(new CustomEvent('APP_LOAD_DATA', { detail: project }));
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Top Global Navigation (Simulating MATLAB UI Header) */}
      <header className="bg-white border-b border-gray-200 flex flex-col shrink-0 z-20 shadow-sm relative">
        <div className="px-4 py-1.5 flex items-center justify-between bg-[#f0f4f9] border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <img src="/vite.svg" alt="icon" className="w-4 h-4 opacity-70" />
            <h1 className="text-xs font-semibold text-gray-800 tracking-tight">
              动态虚拟故障行波网络自适应定位系统
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            {/* Local Library Dropdown */}
            <div className="relative" ref={libraryMenuRef}>
              <button 
                onClick={() => setIsLibraryMenuOpen(!isLibraryMenuOpen)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${isLibraryMenuOpen ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50/50'}`}
              >
                <Database className={`w-3.5 h-3.5 ${isLibraryMenuOpen ? 'text-white' : 'text-blue-600'}`} />
                <span>本地库</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isLibraryMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isLibraryMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <button 
                    onClick={() => {
                      setIsLocalLibraryOpen(true);
                      setIsLibraryMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-xs text-gray-700 hover:bg-blue-50 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                    <span>打开</span>
                  </button>
                  <button 
                    onClick={handleStoreRequest}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-xs text-gray-700 hover:bg-blue-50 transition-colors border-t border-gray-50 mt-1 pt-2"
                  >
                    <Save className="w-3.5 h-3.5 text-green-500" />
                    <span>存储</span>
                  </button>
                </div>
              )}
            </div>

            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-[10px] font-medium transition-colors"
              title="由于浏览器安全限制，内嵌模式下无法使用原生的“另存为”对话框。请在新标签页中打开以获取完整体验。"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>在新标签页打开</span>
            </a>
          </div>
        </div>
        <div className="px-2 py-0.5 flex items-center space-x-1 text-xs text-gray-700 bg-white">
          <div className="relative" ref={fileMenuRef}>
            <button 
              className={`hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer ${isFileMenuOpen ? 'bg-blue-50 border-blue-200' : ''}`}
              onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
            >
              文件(F)
            </button>
            {isFileMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg py-1 z-50">
                <button
                  className="w-full text-left px-4 py-1.5 hover:bg-blue-50 flex items-center space-x-2 text-sm text-gray-700"
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsFileMenuOpen(false);
                  }}
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                  <span>设置</span>
                </button>
              </div>
            )}
          </div>
          <button className="hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer">编辑(E)</button>
          
          <div className="relative" ref={viewMenuRef}>
            <button 
              className="hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
            >
              查看(V)
            </button>
            {isViewMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg py-1 z-50">
                <button
                  className="w-full text-left px-4 py-1.5 hover:bg-blue-50 flex items-center space-x-2 text-sm text-gray-700"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('toggleCalculationData'));
                    setIsViewMenuOpen(false);
                  }}
                >
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                  <span>计算数据</span>
                </button>
                <button
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center space-x-2 text-sm text-gray-700 border-t border-gray-100 mt-1 pt-1"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('toggleWaveformWindow', { detail: { type: 'user-debug' } }));
                    setIsViewMenuOpen(false);
                  }}
                >
                  <Activity className="w-4 h-4 text-orange-500" />
                  <div className="flex flex-col">
                    <span className="font-medium">算法调试视图</span>
                    <span className="text-[10px] text-gray-400">显示一/二/三阶差分波形</span>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button className="hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer">插入(I)</button>
          <button className="hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer">工具(T)</button>
          <button className="hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer">桌面(D)</button>
          <button 
            className="hover:bg-blue-50 px-2 py-1 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              window.dispatchEvent(new CustomEvent('toggleAppWindowMenu', { detail: { x: rect.left, y: rect.bottom } }));
            }}
          >
            窗口(W)
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Tabs */}
        <nav className="w-32 bg-[#f8fafc] border-r border-gray-200 flex flex-col pt-4 shrink-0 shadow-sm z-10">
          <button 
            onClick={() => {
              setActiveTab('topology');
              window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                detail: { message: '【模块切换】已进入 [拓扑构建] 模块，您可在此建立和调整电网节点的空间拓扑关系。' } 
              }));
            }}
            className={`px-4 py-3 flex items-center space-x-3 transition-colors ${
              activeTab === 'topology' 
                ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-500 font-medium' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-r-2 border-transparent'
            }`}
          >
            <Network className="w-5 h-5" />
            <span className="text-sm">拓扑构建</span>
          </button>
          <button 
            onClick={() => {
              setActiveTab('waveform');
              window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                detail: { message: '【模块切换】已进入 [故障检测] 模块，您可结合拓扑信息分析测量点的故障行波信号。' } 
              }));
            }}
            className={`px-4 py-3 flex items-center space-x-3 transition-colors ${
              activeTab === 'waveform' 
                ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-500 font-medium' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-r-2 border-transparent'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-sm">故障检测</span>
          </button>
          <button 
            onClick={() => {
              setActiveTab('location');
              window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                detail: { message: '【模块切换】已进入 [故障定位] 模块（功能开发中），未来将结合双端/多端行波实现高精度故障测距。' } 
              }));
            }}
            className={`px-4 py-3 flex items-center space-x-3 transition-colors ${
              activeTab === 'location' 
                ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-500 font-medium' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-r-2 border-transparent'
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span className="text-sm">故障定位</span>
          </button>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative bg-gray-50">
          <div className={`absolute inset-0 ${activeTab === 'topology' ? 'block' : 'hidden'}`}>
            <TopologyBuilder onPointsCountChange={setGlobalPointsCount} onMachineListChange={setGlobalMachineList} />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'waveform' ? 'block' : 'hidden'}`}>
            <WaveformAnalyzer pointsCountFromTopology={globalPointsCount} machineListFromTopology={globalMachineList} />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'location' ? 'block' : 'hidden'}`}>
            <div className="flex h-full items-center justify-center text-gray-400">
              故障定位模块开发中...
            </div>
          </div>
        </main>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <LocalLibraryModal 
        isOpen={isLocalLibraryOpen} 
        onClose={() => setIsLocalLibraryOpen(false)} 
        onLoadProject={handleLoadProject}
        currentProjectId={currentProjectId}
      />

      <LocalSaveModal 
        isOpen={isSaveModalOpen}
        onClose={() => {
          setIsSaveModalOpen(false);
          setGatheredData(null);
        }}
        topologyData={gatheredData?.topology}
        waveformData={gatheredData?.waveform}
        currentProjectId={currentProjectId}
        onConfirmSave={onConfirmSave}
      />

      {/* Toast notifications removed per user request */}
    </div>
  );
}
