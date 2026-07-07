import React, { useState, useEffect } from 'react';
import { X, Save, Database, Info, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { getAllProjectsMetadata, SavedProject } from '../lib/projectStorage';

interface LocalSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  topologyData: any;
  waveformData: any;
  currentProjectId: string | null;
  onConfirmSave: (projectName: string, saveAsNew: boolean) => void;
}

export function LocalSaveModal({ 
  isOpen, 
  onClose, 
  topologyData, 
  waveformData, 
  currentProjectId, 
  onConfirmSave 
}: LocalSaveModalProps) {
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{startX: number, startY: number, startPosX: number, startPosY: number} | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      let newX = dragState.startPosX + dx;
      let newY = dragState.startPosY + dy;
      
      // Keep within screen bounds
      // Approximate dimensions for save modal (max-w-lg is ~512px)
      const w = 512;
      const h = 500; // estimated
      const maxX = Math.max(0, (window.innerWidth - w) / 2);
      const minX = -maxX;
      const maxY = Math.max(0, (window.innerHeight - h) / 2);
      const minY = -maxY;
      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));
      setModalPos({ x: newX, y: newY });
    };
    const handleMouseUp = () => setDragState(null);
    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState]);

  useEffect(() => {
    if (isOpen) { setModalPos({x:0, y:0}); }
  }, [isOpen]);

  const [existingProjects, setExistingProjects] = useState<Omit<SavedProject, 'data' | 'topology'>[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load existing projects to check for duplicates
      const loadList = async () => {
        setIsLoading(true);
        try {
          const list = await getAllProjectsMetadata();
          setExistingProjects(list.sort((a, b) => b.timestamp - a.timestamp));
          
          // Determine default name
          if (waveformData && waveformData.currentProjectName) {
            setProjectName(waveformData.currentProjectName);
          } else {
            const today = new Date();
            const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
            setProjectName(`项目_${dateStr}`);
          }
        } catch (err) {
          console.error('Failed to load project list for save modal:', err);
        } finally {
          setIsLoading(false);
        }
      };
      loadList();
    }
  }, [isOpen, waveformData]);

  if (!isOpen) return null;

  // Validation
  const hasTopology = topologyData && topologyData.isCreated;
  const hasWaveform = waveformData && waveformData.conditions && waveformData.conditions.length > 0;
  const canSaveData = hasTopology && hasWaveform;

  // Check if name is duplicate
  const trimmedName = projectName.trim();
  const duplicateProject = existingProjects.find(p => p.name.trim() === trimmedName);
  
  // Is this an update to the current loaded project?
  // It's an update if currentProjectId matches the duplicate project's id
  const isUpdatingCurrent = currentProjectId && duplicateProject && duplicateProject.id === currentProjectId;
  const isDuplicateOfOther = duplicateProject && (!currentProjectId || duplicateProject.id !== currentProjectId);

  const handleSave = () => {
    if (!canSaveData) return;
    if (isDuplicateOfOther) return;
    if (!trimmedName) return;

    // Save as new if:
    // 1. There is no currentProjectId, OR
    // 2. We typed a name that does not match the current loaded project
    const saveAsNew = !currentProjectId || (duplicateProject ? duplicateProject.id !== currentProjectId : true);
    onConfirmSave(trimmedName, saveAsNew);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-gray-200 animate-in fade-in zoom-in duration-200 relative transition-none"
        style={{ transform: `translate(${modalPos.x}px, ${modalPos.y}px)` }}
      >
        <div 
          className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white cursor-move select-none"
          onMouseDown={(e) => {
            setDragState({
              startX: e.clientX,
              startY: e.clientY,
              startPosX: modalPos.x,
              startPosY: modalPos.y
            });
          }}
        >
          <div className="flex items-center gap-2 text-green-600">
            <Save className="w-5 h-5" />
            <h3 className="font-bold text-sm text-gray-800">存储数据至本地库</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 bg-gray-50/30 space-y-4">
          {/* Data Presence Checklist */}
          <div className="bg-white border border-gray-100 rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">存储必备数据校验</h4>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-500" /> 拓扑结构数据
              </span>
              {hasTopology ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 已就绪
                </span>
              ) : (
                <span className="text-red-500 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 未创建
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-orange-500" /> 波形工况数据
              </span>
              {hasWaveform ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 已就绪 ({waveformData.conditions.length} 个工况)
                </span>
              ) : (
                <span className="text-red-500 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 未导入
                </span>
              )}
            </div>
          </div>

          {/* Project Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">本次存储的项目名称</label>
            <Input 
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="h-9 text-xs bg-white border-gray-200"
              placeholder="请输入项目名称"
              disabled={!canSaveData}
            />

            {/* Validations and Status alerts */}
            {!canSaveData && (
              <p className="text-[11px] text-red-500 flex items-center gap-1 font-medium bg-red-50 p-2 rounded border border-red-100">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> 
                存储失败：拓扑和波形数据必须同时存在才能存储（本地库的拓扑与波形是绑定的）。
              </p>
            )}

            {canSaveData && isDuplicateOfOther && (
              <p className="text-[11px] text-red-500 flex items-center gap-1 font-medium bg-red-50 p-2 rounded border border-red-100">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> 
                项目名称在本地库中已存在，请重新命名，不允许和本地库中的项目名称重复！
              </p>
            )}

            {canSaveData && isUpdatingCurrent && (
              <p className="text-[11px] text-blue-600 flex items-center gap-1 font-medium bg-blue-50 p-2 rounded border border-blue-100">
                <Info className="w-3.5 h-3.5 shrink-0" /> 
                您正准备更新当前项目。这将会覆盖/更新已有该项目的拓扑和波形记录。
              </p>
            )}

            {canSaveData && !duplicateProject && trimmedName && (
              <p className="text-[11px] text-green-600 flex items-center gap-1 font-medium bg-green-50 p-2 rounded border border-green-100">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" /> 
                名称可用！将作为一个新项目保存至本地库。
              </p>
            )}
          </div>

          {/* List of Existing Projects */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 block">本地库已有项目列表 ({existingProjects.length})</label>
            <div className="border border-gray-100 bg-white rounded-lg p-2 max-h-[160px] overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载列表中...
                </div>
              ) : existingProjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">本地库暂无其他项目</div>
              ) : (
                existingProjects.map(p => (
                  <div 
                    key={p.id} 
                    className={`flex items-center justify-between px-2.5 py-1.5 text-[11px] rounded transition-colors ${p.id === currentProjectId ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    <span className="font-medium truncate max-w-[280px]">{p.name}</span>
                    <span className="text-gray-400 shrink-0">
                      {p.id === currentProjectId ? '当前项目' : `${p.conditionsCount || 0}工况`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-white flex items-center justify-end gap-2 border-t border-gray-100">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
            取消
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleSave} 
            disabled={!canSaveData || isDuplicateOfOther || !trimmedName}
            className="text-xs h-8 bg-green-600 hover:bg-green-700 text-white border-none"
          >
            {isUpdatingCurrent ? '更新存储' : '确认存储'}
          </Button>
        </div>
      </div>
    </div>
  );
}
