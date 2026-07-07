import React, { useState, useEffect } from 'react';
import { X, Save, Database, Info, Loader2, RefreshCcw, Trash2, Download, CheckCircle, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useSettings } from '../contexts/SettingsContext';
import { 
  getAllProjectsMetadata, 
  deleteProject, 
  deleteProjects,
  getProjectById, 
  getStorageEstimate, 
  onProjectUpdate,
  SavedProject 
} from '../lib/projectStorage';

interface LocalLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (project: SavedProject) => void;
  currentProjectId: string | null;
}

export function LocalLibraryModal({ isOpen, onClose, onLoadProject, currentProjectId }: LocalLibraryModalProps) {
  const { settings } = useSettings();
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{startX: number, startY: number, startPosX: number, startPosY: number} | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      let newX = dragState.startPosX + dx;
      let newY = dragState.startPosY + dy;
      const w = settings.system.localLibraryWidth;
      const h = settings.system.localLibraryHeight;
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
  }, [dragState, settings.system.localLibraryWidth, settings.system.localLibraryHeight]);

  useEffect(() => {
    if (isOpen) { setModalPos({x:0, y:0}); }
  }, [isOpen]);

  const [savedProjects, setSavedProjects] = useState<Omit<SavedProject, 'data' | 'topology'>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<{ usage: number, quota: number } | null>(null);

  // Batch selection state
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  // Delete loading state map
  const [deletingMap, setDeletingMap] = useState<Record<string, 'deleting' | 'deleted'>>({});
  // Single delete confirm overlay state
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<{ id: string, name: string } | null>(null);
  // Batch delete confirm overlay state
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  // Floating error message state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadList = async () => {
    setIsLoading(true);
    try {
      const list = await getAllProjectsMetadata();
      setSavedProjects(list.sort((a, b) => b.timestamp - a.timestamp));
      
      // Load storage estimate non-blockingly to ensure instant opens & operations
      getStorageEstimate().then(stats => {
        setStorageStats(stats);
      }).catch(err => {
        console.warn('Failed to get storage stats:', err);
      });
    } catch (err) {
      console.error('Failed to load project list:', err);
    } finally {
      setTimeout(() => setIsLoading(false), 300);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadList();
      setSelectedProjectIds([]);
      setDeletingMap({});
    }
  }, [isOpen]);

  useEffect(() => {
    onProjectUpdate(() => {
      loadList();
    });
  }, []);

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteConfirmProject({ id, name });
  };

  const executeDelete = async () => {
    if (!deleteConfirmProject) return;
    const targetId = deleteConfirmProject.id;
    setDeleteConfirmProject(null);
    
    // Set this project to deleting state
    setDeletingMap(prev => ({ ...prev, [targetId]: 'deleting' }));
    
    try {
      await deleteProject(targetId);
      setDeletingMap(prev => ({ ...prev, [targetId]: 'deleted' }));
      
      // Wait to let user see "已删除" state
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Remove from selected lists
      setSelectedProjectIds(prev => prev.filter(id => id !== targetId));
      setDeletingMap(prev => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      
      loadList();
    } catch (err) {
      setDeletingMap(prev => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      setErrorMessage('删除失败');
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const executeBatchDelete = async () => {
    if (selectedProjectIds.length === 0) return;
    setBatchDeleteConfirm(false);
    
    const targets = [...selectedProjectIds];
    
    // Set all selected projects to deleting
    const initialDeletingMap: Record<string, 'deleting' | 'deleted'> = {};
    targets.forEach(id => {
      initialDeletingMap[id] = 'deleting';
    });
    setDeletingMap(prev => ({ ...prev, ...initialDeletingMap }));
    
    try {
      // Use transactional batch deleteProjects instead of looping
      await deleteProjects(targets);
      
      // Update all to deleted
      const finalDeletingMap: Record<string, 'deleting' | 'deleted'> = {};
      targets.forEach(id => {
        finalDeletingMap[id] = 'deleted';
      });
      setDeletingMap(prev => ({ ...prev, ...finalDeletingMap }));
      
      // Wait to see "已删除" checkmarks
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Clean up
      setSelectedProjectIds([]);
      setDeletingMap(prev => {
        const next = { ...prev };
        targets.forEach(id => {
          delete next[id];
        });
        return next;
      });
      
      loadList();
    } catch (err) {
      setErrorMessage('批量删除未完全成功');
      setTimeout(() => setErrorMessage(null), 3000);
      setDeletingMap({});
      loadList();
    }
  };

  const handleLoad = async (projectMeta: Omit<SavedProject, 'data' | 'topology'>) => {
    setIsLoading(true);
    try {
      const fullProject = await getProjectById(projectMeta.id);
      if (fullProject) {
        onLoadProject(fullProject);
        onClose();
      } else {
        setErrorMessage('加载失败：数据不存在');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (err) {
      setErrorMessage('加载失败');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 relative transition-none"
        style={{ 
          width: settings.system.localLibraryWidth, 
          height: settings.system.localLibraryHeight, 
          transform: `translate(${modalPos.x}px, ${modalPos.y}px)` 
        }}
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
          <div className="flex items-center gap-2 text-blue-600">
            <Database className="w-5 h-5" />
            <h3 className="font-bold text-sm text-gray-800">本地数据管理中心</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6 bg-gray-50/30 flex-1 flex flex-col min-h-0">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-blue-700 leading-relaxed">
              您可以在此处查看、加载或删除历史记录。数据存储在您的浏览器本地，拓扑结构与波形数据已实现自动关联绑定。
            </p>
          </div>

          {/* Action Bar for Batch Delete */}
          {savedProjects.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 mb-2 bg-gray-100/60 rounded-lg border border-gray-100 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-600 select-none">
                <input 
                  type="checkbox"
                  checked={savedProjects.length > 0 && selectedProjectIds.length === savedProjects.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedProjectIds(savedProjects.map(p => p.id));
                    } else {
                      setSelectedProjectIds([]);
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                />
                全选项目 ({savedProjects.length})
              </label>
              
              {selectedProjectIds.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold flex items-center gap-1.5 px-2.5 rounded-md border border-red-100 bg-white shadow-sm transition-all"
                  onClick={() => setBatchDeleteConfirm(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  批量删除 ({selectedProjectIds.length})
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-2 flex-1">
            {isLoading && savedProjects.length === 0 ? (
              <div className="py-20 text-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
                <p className="text-blue-500 text-sm font-medium">数据加载中...</p>
              </div>
            ) : savedProjects.length === 0 ? (
              <div className="py-20 text-center">
                <Database className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">暂无保存的项目数据</p>
              </div>
            ) : (
              savedProjects.map(p => {
                const isDeleting = deletingMap[p.id] === 'deleting';
                const isDeleted = deletingMap[p.id] === 'deleted';
                const hasOperationPending = isDeleting || isDeleted;

                return (
                  <div 
                    key={p.id} 
                    className={`group flex items-center justify-between p-3 rounded-lg border transition-all ${
                      p.id === currentProjectId 
                        ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-100' 
                        : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                    } ${isDeleted ? 'opacity-50 line-through' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <input 
                        type="checkbox"
                        checked={selectedProjectIds.includes(p.id)}
                        disabled={hasOperationPending}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProjectIds(prev => [...prev, p.id]);
                          } else {
                            setSelectedProjectIds(prev => prev.filter(id => id !== p.id));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-800 truncate max-w-[240px]">{p.name}</span>
                          {p.id === currentProjectId && (
                            <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">当前项目</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1">
                            <RefreshCcw className="w-3 h-3" />
                            {new Date(p.timestamp).toLocaleString()}
                          </span>
                          <span>•</span>
                          <span>{p.conditionsCount || 0} 个工况</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 text-xs text-blue-600 hover:bg-blue-100"
                        onClick={() => handleLoad(p)}
                        disabled={hasOperationPending}
                      >
                        导入
                      </Button>
                      
                      {isDeleting ? (
                        <div className="flex items-center gap-1 text-red-500 text-xs px-2.5 py-1.5 bg-red-50 rounded-md font-semibold animate-pulse border border-red-100">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          删除中...
                        </div>
                      ) : isDeleted ? (
                        <div className="flex items-center gap-1 text-green-600 text-xs px-2.5 py-1.5 bg-green-50 rounded-md font-semibold border border-green-100">
                          <Check className="w-3.5 h-3.5 text-green-600 font-bold" />
                          已删除
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-xs text-red-500 hover:bg-red-50"
                          onClick={() => handleDeleteClick(p.id, p.name)}
                          disabled={Object.keys(deletingMap).length > 0}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        
        <div className="px-6 py-4 bg-white flex items-center justify-between border-t border-gray-100 shrink-0">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-gray-400 italic">
              所有数据仅保存在当前浏览器本地数据库。
            </p>
            {storageStats && (
              <p className="text-[10px] text-gray-400 flex items-center gap-2">
                <span>已占用: {(storageStats.usage / 1024 / 1024).toFixed(2)} MB</span>
                <span>/</span>
                <span>配额: {(storageStats.quota / 1024 / 1024 / 1024).toFixed(1)} GB</span>
              </p>
            )}
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={onClose}
            className="text-xs px-6 h-8"
          >
            关闭
          </Button>
        </div>

        {/* Delete Confirmation Overlay */}
        {deleteConfirmProject && (
          <div className="absolute inset-0 bg-black/60 z-[310] flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-100 text-center space-y-4 animate-in fade-in zoom-in duration-200">
              <h4 className="font-bold text-sm text-gray-800">确认删除</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                确定要删除项目 <span className="font-semibold text-gray-700">"{deleteConfirmProject.name}"</span> 吗？此操作无法撤销。
              </p>
              <div className="flex gap-2 justify-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs px-4"
                  onClick={() => setDeleteConfirmProject(null)}
                >
                  取消
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="h-8 text-xs bg-red-500 hover:bg-red-600 text-white px-4 border-none"
                  onClick={executeDelete}
                >
                  确认删除
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Batch Delete Confirmation Overlay */}
        {batchDeleteConfirm && (
          <div className="absolute inset-0 bg-black/60 z-[310] flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-100 text-center space-y-4 animate-in fade-in zoom-in duration-200">
              <h4 className="font-bold text-sm text-red-600 flex items-center justify-center gap-1.5">
                <Trash2 className="w-4 h-4" /> 确认批量删除
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                确定要删除选中的 <span className="font-bold text-red-600 text-sm">{selectedProjectIds.length}</span> 个项目吗？此操作无法撤销。
              </p>
              <div className="flex gap-2 justify-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs px-4"
                  onClick={() => setBatchDeleteConfirm(false)}
                >
                  取消
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="h-8 text-xs bg-red-500 hover:bg-red-600 text-white px-4 border-none"
                  onClick={executeBatchDelete}
                >
                  确认删除
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Error Message Banner */}
        {errorMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-md shadow-lg z-[320] flex items-center gap-1 animate-in fade-in slide-in-from-top-4 duration-200">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
