import React, { useState, useRef, useEffect } from 'react';
import { collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  Upload, Download, FileSpreadsheet, Activity, 
  ChevronDown, ChevronRight, AlertCircle, Plus, Trash2, X, Edit3 
} from 'lucide-react';
import { calculateDays } from '../helpers';

// Tarih yardımcısı
const getTodayStr = () => new Date().toISOString().split('T')[0];

export default function ScheduleModule({ activeProject, appId, user, db, isOfflineMode, t }) {
  const [schedules, setSchedules] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [expandedScheduleNodes, setExpandedScheduleNodes] = useState({});
  const fileInputRef = useRef(null);

  // Manuel Görev Ekleme/Düzenleme State'leri
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({
    wbs: '', name: '', start: getTodayStr(), finish: getTodayStr(), progress: 0
  });

  // Veritabanı Dinleme (WBS'e göre akıllı sıralama)
  useEffect(() => {
    if (!user || !db || isOfflineMode || !activeProject) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'schedules');
    const unsub = onSnapshot(schedulesRef, (snapshot) => {
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // WBS koduna göre numerik sıralama (Örn: 1.2, 1.10'dan önce gelir)
      const projectSchedules = allData
        .filter(s => s.projectId === activeProject.id)
        .sort((a, b) => a.wbs.localeCompare(b.wbs, undefined, { numeric: true, sensitivity: 'base' }));
      
      setSchedules(projectSchedules);
      
      if (projectSchedules.length > 0 && Object.keys(expandedScheduleNodes).length === 0) {
        const initialExpanded = {};
        projectSchedules.forEach(s => initialExpanded[s.uid] = true);
        setExpandedScheduleNodes(initialExpanded);
      }
    });
    return () => unsub();
  }, [user, isOfflineMode, activeProject]);

  // Offline Okuma Desteği
  useEffect(() => {
    if (isOfflineMode) {
      try {
        const local = JSON.parse(localStorage.getItem('premium_schedules')) || [];
        setSchedules(
          local.filter(s => s.projectId === activeProject?.id)
               .sort((a, b) => a.wbs.localeCompare(b.wbs, undefined, { numeric: true, sensitivity: 'base' }))
        );
      } catch(e) {}
    }
  }, [isOfflineMode, activeProject]);

  // --- XML YÜKLEME ---
  const handleScheduleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeProject) return;

    setIsScheduleLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const xmlText = event.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const taskNodes = xmlDoc.getElementsByTagName("Task");
        const parsedTasks = [];

        for (let i = 0; i < taskNodes.length; i++) {
          const node = taskNodes[i];
          const getVal = (tag) => node.getElementsByTagName(tag)[0]?.textContent || '';
          const uid = getVal("UID") || Date.now().toString() + i;
          const name = getVal("Name");
          const startStr = getVal("Start") ? getVal("Start").split('T')[0] : '';
          const finishStr = getVal("Finish") ? getVal("Finish").split('T')[0] : '';
          const progress = parseInt(getVal("PercentComplete")) || 0;
          const wbs = getVal("WBS");
          const outlineLevel = parseInt(getVal("OutlineLevel")) || 1;

          if (name && wbs) {
            parsedTasks.push({
              projectId: activeProject.id,
              uid: uid,
              wbs: wbs,
              name: name,
              start: startStr,
              finish: finishStr,
              progress: progress,
              level: outlineLevel - 1 
            });
          }
        }

        if (parsedTasks.length > 0) {
          if (!user || !db || isOfflineMode) {
            // Çevrimdışı kayıt
            const local = JSON.parse(localStorage.getItem('premium_schedules')) || [];
            const filtered = local.filter(s => s.projectId !== activeProject.id);
            const newSchedules = parsedTasks.map(d => ({...d, id: Date.now().toString() + Math.random()}));
            const updated = [...filtered, ...newSchedules];
            setSchedules(newSchedules.sort((a,b) => a.wbs.localeCompare(b.wbs, undefined, {numeric:true})));
            localStorage.setItem('premium_schedules', JSON.stringify(updated));
            setIsScheduleLoading(false);
            return;
          }

          // Mevcut projeye ait programı sil ve yenisini yaz
          const toDelete = schedules;
          for (const item of toDelete) {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', item.id));
          }
          for (const item of parsedTasks) {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), item);
          }
        } else {
          alert(t?.invalidXml || "Geçersiz XML Formatı");
        }
      } catch (error) {
        console.error(error);
        alert(t?.readError || "Okuma Hatası");
      } finally {
        setIsScheduleLoading(false);
        e.target.value = null;
      }
    };
    reader.readAsText(file);
  };

  // --- MANUEL GÖREV EKLEME / DÜZENLEME ---
  const openNewTaskModal = () => {
    setTaskForm({ wbs: '', name: '', start: getTodayStr(), finish: getTodayStr(), progress: 0 });
    setEditingTaskId(null);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task) => {
    setTaskForm({
      wbs: task.wbs, name: task.name, start: task.start || '', finish: task.finish || '', progress: task.progress
    });
    setEditingTaskId(task.id);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.wbs.trim() || !taskForm.name.trim()) return;

    // WBS'teki nokta sayısına göre hiyerarşi seviyesini (level) hesapla
    const level = taskForm.wbs.split('.').length - 1;

    const taskData = {
      projectId: activeProject.id,
      wbs: taskForm.wbs,
      name: taskForm.name,
      start: taskForm.start,
      finish: taskForm.finish,
      progress: Number(taskForm.progress) || 0,
      level: level,
      uid: editingTaskId ? schedules.find(s=>s.id === editingTaskId)?.uid : Date.now().toString()
    };

    try {
      if (editingTaskId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', editingTaskId), taskData);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), taskData);
        // Yeni eklenen görevi varsayılan olarak açık (expanded) yap
        setExpandedScheduleNodes(prev => ({...prev, [taskData.uid]: true}));
      }
      setIsTaskModalOpen(false);
    } catch (error) {
      console.error("Görev kaydedilemedi:", error);
    }
  };

  const handleDeleteTask = async (id) => {
    if(window.confirm("Bu iş programı görevini silmek istediğinize emin misiniz?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', id));
      } catch (error) {
        console.error("Silme hatası:", error);
      }
    }
  };

  // --- DIŞA AKTARMA ---
  const handleExportScheduleCSV = () => {
    if (schedules.length === 0) return alert(t?.noDataExport || "Veri yok");
    const headers = [`WBS,Görev Adı,Süre(Gün),Başlangıç,Bitiş,İlerleme(%)`];
    const csvData = schedules.map(task => `${task.wbs},"${task.name}",${calculateDays(task.start, task.finish)},${task.start},${task.finish},${task.progress}`);
    const csvBlob = new Blob([headers.concat(csvData).join("\n")], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    const url = URL.createObjectURL(csvBlob);
    link.setAttribute("href", url);
    link.setAttribute("download", `PMPP_Schedule_${activeProject.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleScheduleNode = (uid) => {
    setExpandedScheduleNodes(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  const calculateScheduleOverallProgress = () => {
    if (schedules.length === 0) return 0;
    const rootTasks = schedules.filter(task => task.level === 0);
    if(rootTasks.length > 0) {
      const sum = rootTasks.reduce((acc, curr) => acc + curr.progress, 0);
      return Math.round(sum / rootTasks.length);
    }
    return 0;
  };

  return (
    <div className="pb-28 animate-in fade-in duration-300">
      
      {/* ÜST BUTONLAR */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex gap-2">
          {/* Yeni Görev Butonu */}
          <button onClick={openNewTaskModal} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Yeni Görev
          </button>
          
          {/* XML Yükle */}
          <input type="file" accept=".xml" className="hidden" ref={fileInputRef} onChange={handleScheduleFileUpload} />
          <button onClick={() => fileInputRef.current.click()} className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm">
            <Upload className="w-3.5 h-3.5" /> XML
          </button>

          {/* Dışa Aktar */}
          <button onClick={handleExportScheduleCSV} className="flex-1 bg-gray-900 text-white hover:bg-gray-800 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm">
            <Download className="w-3.5 h-3.5" /> İndir
          </button>
        </div>
      </div>

      {/* İLERLEME ÖZETİ */}
      <div className="px-5 mb-5">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t?.scheduleOverallProgress || 'Genel İlerleme'}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-blue-700 tracking-tight">%{calculateScheduleOverallProgress()}</span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-full border-4 border-gray-100 flex items-center justify-center relative">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
               <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-blue-600" strokeDasharray="150" strokeDashoffset={150 - (150 * calculateScheduleOverallProgress()) / 100} strokeLinecap="round" />
            </svg>
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
        </div>
      </div>

      {/* TABLO BÖLÜMÜ */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-2 px-1">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t?.tableView || 'Tablo Görünümü'}</h3>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          {isScheduleLoading && <p className="text-center py-10 text-gray-500 font-bold animate-pulse">{t?.readingFile || 'Okunuyor...'}</p>}
          
          {!isScheduleLoading && schedules.length === 0 && (
             <div className="text-center py-12 px-4">
               <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
               <p className="text-sm font-bold text-gray-600">{t?.noSchedule || 'Henüz program yok'}</p>
               <p className="text-xs text-gray-400 mt-1">Yeni Görev ekleyebilir veya XML yükleyebilirsiniz.</p>
             </div>
          )}
          
          {!isScheduleLoading && schedules.length > 0 && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-gray-100/80 text-gray-500 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="p-3 w-8 text-center sticky left-0 bg-gray-100/90 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]"></th>
                    <th className="p-3 min-w-[50px]">WBS</th>
                    <th className="p-3 min-w-[200px]">{t?.taskNameCol || 'Görev'}</th>
                    <th className="p-3 text-center">{t?.durationCol || 'Süre(Gün)'}</th>
                    <th className="p-3">{t?.startCol || 'Başlangıç'}</th>
                    <th className="p-3">{t?.finishCol || 'Bitiş'}</th>
                    <th className="p-3 min-w-[100px] text-center">{t?.progressCol || 'İlerleme'}</th>
                    <th className="p-3 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.map((task) => {
                    const hasChildren = schedules.some(t => t.wbs.startsWith(task.wbs + '.') && t.uid !== task.uid);
                    const isExpanded = expandedScheduleNodes[task.uid];
                    
                    const parentWbsParts = task.wbs.split('.');
                    parentWbsParts.pop();
                    const parentWbs = parentWbsParts.join('.');
                    const parentTask = schedules.find(t => t.wbs === parentWbs);
                    if (parentTask && expandedScheduleNodes[parentTask.uid] === false) return null;

                    const isRoot = task.level === 0;
                    const rowClass = isRoot ? 'bg-blue-50/30' : 'hover:bg-gray-50';
                    const textClass = isRoot ? 'font-extrabold text-gray-900' : task.level === 1 ? 'font-bold text-gray-800' : 'font-medium text-gray-600';

                    return (
                      <tr key={task.id} className={`transition-colors ${rowClass}`}>
                        
                        <td className="p-2 text-center sticky left-0 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)] cursor-pointer bg-inherit" onClick={() => hasChildren && toggleScheduleNode(task.uid)}>
                          {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4 mx-auto text-gray-500" /> : <ChevronRight className="w-4 h-4 mx-auto text-gray-500" />) : <span className="inline-block w-4"></span>}
                        </td>
                        
                        <td className="p-3 text-[10px] font-bold text-blue-600">{task.wbs}</td>
                        
                        <td className={`p-3 truncate max-w-[250px] ${textClass}`} style={{ paddingLeft: `${Math.max(12, task.level * 16)}px` }}>{task.name}</td>
                        
                        <td className="p-3 text-center font-bold text-gray-600">{calculateDays(task.start, task.finish)}</td>
                        
                        <td className="p-3 text-gray-500 font-medium">{task.start || '-'}</td>
                        <td className="p-3 text-gray-500 font-medium">{task.finish || '-'}</td>
                        
                        <td className="p-3">
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                            </div>
                            <span className={`text-[10px] font-bold w-7 text-right ${task.progress === 100 ? 'text-emerald-600' : 'text-gray-700'}`}>%{task.progress}</span>
                          </div>
                        </td>

                        {/* MANUEL DÜZENLEME VE SİLME BUTONLARI */}
                        <td className="p-3 text-center flex items-center justify-center gap-2">
                           <button onClick={() => openEditTaskModal(task)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-white rounded-md border border-gray-200 shadow-sm"><Edit3 className="w-3 h-3" /></button>
                           <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 text-gray-400 hover:text-red-600 bg-white rounded-md border border-gray-200 shadow-sm"><Trash2 className="w-3 h-3" /></button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!isScheduleLoading && schedules.length > 0 && <p className="text-[10px] text-center text-gray-400 mt-3 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3"/> {t?.scrollHint}</p>}
      </div>

      {/* MANUEL GÖREV EKLEME/DÜZENLEME MODALI */}
      {isTaskModalOpen && (
        <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
          <div className="bg-white rounded-3xl p-6 mb-safe shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">
                  {editingTaskId ? 'Görevi Düzenle' : 'Yeni Görev Ekle'}
                </h3>
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                 <div className="col-span-1">
                   <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">WBS Kodu</label>
                   <input required type="text" value={taskForm.wbs} onChange={e => setTaskForm({...taskForm, wbs: e.target.value})} placeholder="Örn: 1.1.2" className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-bold text-blue-600 focus:outline-none focus:border-blue-500" />
                 </div>
                 <div className="col-span-3">
                   <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Görev Adı</label>
                   <input required type="text" value={taskForm.name} onChange={e => setTaskForm({...taskForm, name: e.target.value})} placeholder="İş kalemini yazın" className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500" />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Başlangıç</label>
                  <input type="date" value={taskForm.start} onChange={e => setTaskForm({...taskForm, start: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bitiş</label>
                  <input type="date" value={taskForm.finish} onChange={e => setTaskForm({...taskForm, finish: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                 <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">İlerleme Yüzdesi: %{taskForm.progress}</label>
                 <input type="range" min="0" max="100" value={taskForm.progress} onChange={e => setTaskForm({...taskForm, progress: e.target.value})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
              </div>

              <button type="submit" className="w-full bg-blue-600 text-white py-3.5 mt-2 rounded-xl font-bold shadow-md hover:bg-blue-500 active:scale-95 transition-transform text-sm tracking-wide">
                Kaydet
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}


