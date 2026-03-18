import React, { useState, useRef, useEffect } from 'react';
import { collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  Upload, Download, FileSpreadsheet, Activity, 
  ChevronDown, ChevronRight, AlertCircle, Plus, Trash2, X, Edit3,
  CornerDownRight, ListPlus, Link as LinkIcon, GripVertical
} from 'lucide-react';
import { calculateDays } from '../helpers';

const getTodayStr = () => new Date().toISOString().split('T')[0];

export default function ScheduleModule({ activeProject, appId, user, db, isOfflineMode, t }) {
  const [schedules, setSchedules] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [expandedScheduleNodes, setExpandedScheduleNodes] = useState({});
  const fileInputRef = useRef(null);

  // Modal State'leri
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ mode: 'add', title: '' }); 
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({
    wbs: '', name: '', start: getTodayStr(), finish: getTodayStr(), progress: 0, predecessors: ''
  });

  // --- SÜRÜKLE BIRAK (DRAG & DROP) STATE'LERİ ---
  const [dragState, setDragState] = useState({ isDragging: false, draggedId: null, overId: null });

  // Veritabanı Dinleme (Sıralama "order" ve "wbs" önceliğine göre yapılır)
  useEffect(() => {
    if (!user || !db || isOfflineMode || !activeProject) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'schedules');
    const unsub = onSnapshot(schedulesRef, (snapshot) => {
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const projectSchedules = allData
        .filter(s => s.projectId === activeProject.id)
        .sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          return a.wbs.localeCompare(b.wbs, undefined, { numeric: true, sensitivity: 'base' });
        });
      
      setSchedules(projectSchedules);
      
      if (projectSchedules.length > 0 && Object.keys(expandedScheduleNodes).length === 0) {
        const initialExpanded = {};
        projectSchedules.forEach(s => initialExpanded[s.uid] = true);
        setExpandedScheduleNodes(initialExpanded);
      }
    });
    return () => unsub();
  }, [user, isOfflineMode, activeProject]);


  // --- SÜRÜKLE & BIRAK MOTORU (Mobil ve Desktop Uyumlu) ---
  
  const handlePointerDown = (e, task) => {
    // Sürükleme işlemi için parmak veya mouse'u kilitle (yakala)
    e.target.setPointerCapture(e.pointerId);
    setDragState({ isDragging: true, draggedId: task.id, overId: task.id });
    if (navigator.vibrate) navigator.vibrate(40); // Mobil titreşim
  };

  const handlePointerMove = (e) => {
    if (!dragState.isDragging) return;
    
    // Parmağın altındaki elementi bul
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('tr[data-id]');
    
    if (row) {
      const targetId = row.getAttribute('data-id');
      if (targetId !== dragState.overId) {
        setDragState(prev => ({ ...prev, overId: targetId }));
      }
    }
  };

  const handlePointerUp = async (e) => {
    e.target.releasePointerCapture(e.pointerId);
    
    if (dragState.isDragging && dragState.draggedId && dragState.overId && dragState.draggedId !== dragState.overId) {
      await executeReorder(dragState.draggedId, dragState.overId);
    }
    
    setDragState({ isDragging: false, draggedId: null, overId: null });
  };

  // --- MS PROJECT MANTIKLI YENİDEN SIRALAMA VE WBS HESAPLAMA ---
  const executeReorder = async (sourceId, targetId) => {
    const sourceTask = schedules.find(t => t.id === sourceId);
    const targetTask = schedules.find(t => t.id === targetId);
    if (!sourceTask || !targetTask) return;

    // 1. Taşınan görevi ve onun ALT GÖREVLERİNİ bir "Blok" olarak ayır
    const blockToMove = schedules.filter(t => t.id === sourceId || t.wbs.startsWith(sourceTask.wbs + '.'));
    const remainingTasks = schedules.filter(t => !blockToMove.some(b => b.id === t.id));

    const originalSourceIndex = schedules.findIndex(t => t.id === sourceId);
    const originalTargetIndex = schedules.findIndex(t => t.id === targetId);
    const isDraggingDown = originalSourceIndex < originalTargetIndex;

    // 2. Yeni hedef indeksi bul
    let dropIndex = remainingTasks.findIndex(t => t.id === targetId);
    
    // Eğer aşağı doğru sürüklüyorsak, hedefin ve onun alt görevlerinin "sonuna" ekle
    if (isDraggingDown) {
      const targetBlock = remainingTasks.filter(t => t.id === targetId || t.wbs.startsWith(targetTask.wbs + '.'));
      const lastTargetItem = targetBlock[targetBlock.length - 1];
      dropIndex = remainingTasks.findIndex(t => t.id === lastTargetItem.id) + 1;
    }

    // 3. Diziyi yeni sırayla birleştir
    const newOrder = [
      ...remainingTasks.slice(0, dropIndex),
      ...blockToMove,
      ...remainingTasks.slice(dropIndex)
    ];

    // 4. OTOMATİK WBS VE ORDER (SIRA) ÜRETİCİ
    const counters = {};
    const updatedTasks = newOrder.map((task, index) => {
      // Daha alt seviyeleri temizle (Örn: level 1'deysek level 2 ve 3 sıfırlanır)
      Object.keys(counters).forEach(k => {
        if (parseInt(k) > task.level) delete counters[k];
      });
      // Bulunduğumuz seviyeyi artır
      counters[task.level] = (counters[task.level] || 0) + 1;

      // Yeni WBS'i oluştur (Örn: 1.2.3)
      let newWbs = '';
      for (let i = 0; i <= task.level; i++) {
        newWbs += (counters[i] || 1) + (i < task.level ? '.' : '');
      }
      
      return { ...task, wbs: newWbs, order: index };
    });

    // 5. Ekranı anında güncelle (Kullanıcı beklemesin)
    setSchedules(updatedTasks);

    // 6. Firebase Veritabanını Arka Planda Güncelle
    try {
      const promises = updatedTasks.map(t => 
         updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', t.id), { 
           wbs: t.wbs, 
           order: t.order 
         })
      );
      await Promise.all(promises);
    } catch(err) {
      console.error("Sıralama hatası:", err);
    }
  };


  // --- AKILLI WBS HESAPLAYICI (YENİ EKLENENLER İÇİN) ---
  const generateNextWbs = (targetWbs, actionType) => {
    if (schedules.length === 0) return '1';
    if (actionType === 'root') {
      const rootTasks = schedules.filter(s => !s.wbs.includes('.'));
      if (rootTasks.length === 0) return '1';
      const maxRoot = Math.max(...rootTasks.map(s => parseInt(s.wbs)));
      return `${maxRoot + 1}`;
    }
    if (actionType === 'child') {
      const targetLevelCount = targetWbs.split('.').length;
      const children = schedules.filter(s => s.wbs.startsWith(`${targetWbs}.`) && s.wbs.split('.').length === targetLevelCount + 1);
      if (children.length === 0) return `${targetWbs}.1`;
      const maxChild = Math.max(...children.map(s => parseInt(s.wbs.split('.').pop())));
      return `${targetWbs}.${maxChild + 1}`;
    }
    if (actionType === 'sibling') {
      const parts = targetWbs.split('.');
      if (parts.length === 1) return generateNextWbs(null, 'root');
      parts.pop();
      const parentWbs = parts.join('.');
      const siblings = schedules.filter(s => s.wbs.startsWith(`${parentWbs}.`) && s.wbs.split('.').length === parentWbs.split('.').length + 1);
      const maxSibling = Math.max(...siblings.map(s => parseInt(s.wbs.split('.').pop())));
      return `${parentWbs}.${maxSibling + 1}`;
    }
    return '1';
  };


  // --- DİĞER MODÜL FONKSİYONLARI ---
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
        
        const uidToWbsMap = {};
        for (let i = 0; i < taskNodes.length; i++) {
          const uid = taskNodes[i].getElementsByTagName("UID")[0]?.textContent;
          const wbs = taskNodes[i].getElementsByTagName("WBS")[0]?.textContent;
          if (uid && wbs) uidToWbsMap[uid] = wbs;
        }

        const parsedTasks = [];
        let orderCounter = 0;
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

          const predNodes = node.getElementsByTagName("PredecessorLink");
          const predecessorsArray = [];
          for (let j = 0; j < predNodes.length; j++) {
            const pUid = predNodes[j].getElementsByTagName("PredecessorUID")[0]?.textContent;
            if (pUid && uidToWbsMap[pUid]) predecessorsArray.push(uidToWbsMap[pUid]);
          }

          if (name && wbs) {
            parsedTasks.push({
              projectId: activeProject.id, uid: uid, wbs: wbs, name: name, order: orderCounter++,
              start: startStr, finish: finishStr, progress: progress, 
              level: outlineLevel - 1, predecessors: predecessorsArray.join(', ')
            });
          }
        }

        if (parsedTasks.length > 0) {
          if (!user || !db || isOfflineMode) {
            const local = JSON.parse(localStorage.getItem('premium_schedules')) || [];
            const filtered = local.filter(s => s.projectId !== activeProject.id);
            const newSchedules = parsedTasks.map(d => ({...d, id: Date.now().toString() + Math.random()}));
            const updated = [...filtered, ...newSchedules];
            setSchedules(newSchedules.sort((a,b) => a.wbs.localeCompare(b.wbs, undefined, {numeric:true})));
            localStorage.setItem('premium_schedules', JSON.stringify(updated));
            setIsScheduleLoading(false); return;
          }
          const toDelete = schedules;
          for (const item of toDelete) { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', item.id)); }
          for (const item of parsedTasks) { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), item); }
        } else { alert("Geçersiz XML Formatı"); }
      } catch (error) { console.error(error); alert("Okuma Hatası"); } finally { setIsScheduleLoading(false); e.target.value = null; }
    };
    reader.readAsText(file);
  };

  const openAddRootTask = () => {
    const newWbs = generateNextWbs(null, 'root');
    setTaskForm({ wbs: newWbs, name: '', start: getTodayStr(), finish: getTodayStr(), progress: 0, predecessors: '' });
    setModalConfig({ mode: 'add', title: 'Ana İş Kalemi Ekle' });
    setIsTaskModalOpen(true);
  };

  const openAddSiblingTask = (targetTask) => {
    const newWbs = generateNextWbs(targetTask.wbs, 'sibling');
    setTaskForm({ wbs: newWbs, name: '', start: targetTask.start || getTodayStr(), finish: targetTask.finish || getTodayStr(), progress: 0, predecessors: '' });
    setModalConfig({ mode: 'add', title: 'Aynı Seviyeye İş Ekle' });
    setIsTaskModalOpen(true);
  };

  const openAddChildTask = (targetTask) => {
    const newWbs = generateNextWbs(targetTask.wbs, 'child');
    setTaskForm({ wbs: newWbs, name: '', start: targetTask.start || getTodayStr(), finish: targetTask.finish || getTodayStr(), progress: 0, predecessors: '' });
    setModalConfig({ mode: 'add', title: 'Alt İş Kalemi Ekle' });
    setExpandedScheduleNodes(prev => ({...prev, [targetTask.uid]: true}));
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task) => {
    setTaskForm({ wbs: task.wbs, name: task.name, start: task.start || '', finish: task.finish || '', progress: task.progress, predecessors: task.predecessors || '' });
    setEditingTaskId(task.id);
    setModalConfig({ mode: 'edit', title: 'Görevi Düzenle' });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;

    const level = taskForm.wbs.split('.').length - 1;
    const taskData = {
      projectId: activeProject.id,
      wbs: taskForm.wbs,
      name: taskForm.name,
      start: taskForm.start,
      finish: taskForm.finish,
      progress: Number(taskForm.progress) || 0,
      level: level,
      order: schedules.length, // Sona ekle, WBS motoru zaten sıralayacak
      predecessors: taskForm.predecessors || '',
      uid: modalConfig.mode === 'edit' ? schedules.find(s=>s.id === editingTaskId)?.uid : Date.now().toString()
    };

    try {
      if (modalConfig.mode === 'edit') {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', editingTaskId), taskData);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), taskData);
        setExpandedScheduleNodes(prev => ({...prev, [taskData.uid]: true}));
      }
      setIsTaskModalOpen(false);
    } catch (error) { console.error("Görev kaydedilemedi:", error); }
  };

  const handleDeleteTask = async (id, wbs) => {
    const hasChildren = schedules.some(t => t.wbs.startsWith(wbs + '.') && t.id !== id);
    if(hasChildren) return alert("Bu görevin altında alt iş kalemleri var! Önce alt görevleri silmelisiniz.");
    if(window.confirm("Bu iş kalemini kalıcı olarak silmek istediğinize emin misiniz?")) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', id)); } 
      catch (error) { console.error("Silme hatası:", error); }
    }
  };

  const handleExportScheduleCSV = () => {
    if (schedules.length === 0) return alert("Veri yok");
    const headers = [`WBS,Görev Adı,Süre(Gün),Başlangıç,Bitiş,İlerleme(%),Öncüller`];
    const csvData = schedules.map(task => `${task.wbs},"${task.name}",${calculateDays(task.start, task.finish)},${task.start},${task.finish},${task.progress},"${task.predecessors || ''}"`);
    const csvBlob = new Blob([headers.concat(csvData).join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(csvBlob));
    link.setAttribute("download", `PMPP_Schedule_${activeProject.name}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const toggleScheduleNode = (uid) => { setExpandedScheduleNodes(prev => ({ ...prev, [uid]: !prev[uid] })); };

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
          <button onClick={openAddRootTask} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
            <ListPlus className="w-4 h-4" /> Ana İş Ekle
          </button>
          
          <input type="file" accept=".xml" className="hidden" ref={fileInputRef} onChange={handleScheduleFileUpload} />
          <button onClick={() => fileInputRef.current.click()} className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm">
            <Upload className="w-3.5 h-3.5" /> XML
          </button>

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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
          
          {isScheduleLoading && <p className="text-center py-10 text-gray-500 font-bold animate-pulse">{t?.readingFile || 'Okunuyor...'}</p>}
          
          {!isScheduleLoading && schedules.length === 0 && (
             <div className="text-center py-12 px-4">
               <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
               <p className="text-sm font-bold text-gray-600">Henüz iş kalemi yok.</p>
               <p className="text-xs text-gray-400 mt-1">Ana İş Ekle butonundan veya XML dosyasından başlayabilirsiniz.</p>
             </div>
          )}
          
          {!isScheduleLoading && schedules.length > 0 && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-xs whitespace-nowrap select-none">
                <thead className="bg-gray-100/80 text-gray-500 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    {/* Sürükle Bırak Kolonu */}
                    <th className="p-3 w-8 text-center sticky left-0 bg-gray-100/90 z-20 shadow-[1px_0_0_rgba(0,0,0,0.05)]"></th>
                    <th className="p-3 w-8 text-center bg-gray-100/90 z-10"></th>
                    <th className="p-3 min-w-[50px]">WBS</th>
                    <th className="p-3 min-w-[200px]">{t?.taskNameCol || 'Görev'}</th>
                    <th className="p-3 text-center">{t?.durationCol || 'Süre'}</th>
                    <th className="p-3">{t?.startCol || 'Başlangıç'}</th>
                    <th className="p-3">{t?.finishCol || 'Bitiş'}</th>
                    <th className="p-3 min-w-[80px] text-center">%</th>
                    <th className="p-3 text-center">Öncül</th>
                    <th className="p-3 text-center min-w-[120px]">İşlem</th>
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
                    
                    // Görsel Stiller
                    const isDraggingThis = dragState.draggedId === task.id;
                    const isDragOverThis = dragState.overId === task.id && !isDraggingThis;
                    
                    let rowClass = isRoot ? 'bg-blue-50/30' : 'hover:bg-gray-50';
                    if (isDraggingThis) rowClass = 'opacity-50 bg-amber-50';
                    if (isDragOverThis) rowClass = 'border-t-4 border-blue-500 bg-blue-50/50';

                    const textClass = isRoot ? 'font-extrabold text-gray-900' : task.level === 1 ? 'font-bold text-gray-800' : 'font-medium text-gray-600';

                    return (
                      <tr 
                        key={task.id} 
                        data-id={task.id}
                        className={`transition-colors ${rowClass}`}
                      >
                        {/* TUTAMAÇ (DRAG HANDLE) HÜCRESİ */}
                        <td 
                          className="px-1 py-2 text-center sticky left-0 z-20 bg-inherit shadow-[1px_0_0_rgba(0,0,0,0.05)] cursor-grab active:cursor-grabbing"
                          style={{ touchAction: 'none' }} // Mobilde bu kısma dokununca sayfanın kaymasını engeller!
                          onPointerDown={(e) => handlePointerDown(e, task)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                        >
                          <GripVertical className={`w-4 h-4 mx-auto ${isDraggingThis ? 'text-amber-500' : 'text-gray-300'}`} />
                        </td>

                        {/* AÇ/KAPA HÜCRESİ */}
                        <td className="p-2 text-center" onClick={() => hasChildren && toggleScheduleNode(task.uid)}>
                           {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4 mx-auto text-gray-500" /> : <ChevronRight className="w-4 h-4 mx-auto text-gray-500" />) : <span className="inline-block w-4"></span>}
                        </td>
                        
                        <td className="p-3 text-[10px] font-bold text-blue-600">{task.wbs}</td>
                        <td className={`p-3 truncate max-w-[250px] ${textClass}`} style={{ paddingLeft: `${Math.max(4, task.level * 16)}px` }}>{task.name}</td>
                        <td className="p-3 text-center font-bold text-gray-600">{calculateDays(task.start, task.finish)}</td>
                        <td className="p-3 text-gray-500 font-medium">{task.start ? task.start.substring(5) : '-'}</td>
                        <td className="p-3 text-gray-500 font-medium">{task.finish ? task.finish.substring(5) : '-'}</td>
                        
                        <td className="p-3">
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                            </div>
                            <span className={`text-[10px] font-bold w-7 text-right ${task.progress === 100 ? 'text-emerald-600' : 'text-gray-700'}`}>%{task.progress}</span>
                          </div>
                        </td>

                        <td className="p-3 text-center text-[10px] font-bold text-blue-500">
                          {task.predecessors ? (<div className="flex items-center justify-center gap-0.5"><LinkIcon className="w-3 h-3 text-gray-400"/> {task.predecessors}</div>) : '-'}
                        </td>

                        {/* HIZLI İŞLEMLER */}
                        <td className="px-2 py-1.5 text-center border-l border-gray-100 bg-white/50">
                           <div className="flex items-center justify-center gap-1.5">
                             <button onClick={() => openAddChildTask(task)} title="Alt İş Kalemi Ekle" className="p-1.5 text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 rounded-md transition-colors"><CornerDownRight className="w-3.5 h-3.5" /></button>
                             <button onClick={() => openAddSiblingTask(task)} title="Aynı Seviyeye İş Ekle" className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 bg-emerald-50 rounded-md transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                             <button onClick={() => openEditTaskModal(task)} title="Düzenle" className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 bg-gray-100 rounded-md transition-colors ml-1"><Edit3 className="w-3.5 h-3.5" /></button>
                             <button onClick={() => handleDeleteTask(task.id, task.wbs)} title="Sil" className="p-1.5 text-red-500 hover:text-white hover:bg-red-600 bg-red-50 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                           </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!isScheduleLoading && schedules.length > 0 && (
          <p className="text-[10px] text-center text-gray-400 mt-3 px-4 flex items-center justify-center gap-1">
             <AlertCircle className="w-3 h-3"/> 
             Görevi taşımak için en soldaki 6 noktalı tutamaca (grip) basılı tutup sürükleyin.
          </p>
        )}
      </div>

      {/* GÖREV EKLEME/DÜZENLEME MODALI */}
      {isTaskModalOpen && (
        <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
          <div className="bg-white rounded-3xl p-6 mb-safe shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">{modalConfig.title}</h3>
                {modalConfig.mode === 'add' && <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1 bg-blue-50 inline-block px-2 py-1 rounded-md">WBS: {taskForm.wbs}</p>}
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveTask} className="space-y-4">
              {modalConfig.mode === 'edit' && (
                <div>
                   <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">WBS Kodu (Dikkatli Düzenleyin)</label>
                   <input required type="text" value={taskForm.wbs} onChange={e => setTaskForm({...taskForm, wbs: e.target.value})} className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-600 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Görev Adı</label>
                <input required type="text" value={taskForm.name} onChange={e => setTaskForm({...taskForm, name: e.target.value})} placeholder="İş kalemini yazın" className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Başlangıç</label>
                  <input type="date" value={taskForm.start} onChange={e => setTaskForm({...taskForm, start: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bitiş</label>
                  <input type="date" value={taskForm.finish} onChange={e => setTaskForm({...taskForm, finish: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1"><LinkIcon className="w-3 h-3"/> Öncül (Bağlantı)</label>
                <input type="text" value={taskForm.predecessors} onChange={e => setTaskForm({...taskForm, predecessors: e.target.value})} placeholder="Örn: 1.2 veya 1.2, 1.4" className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-3 py-3 text-sm font-semibold text-blue-900 focus:outline-none focus:border-blue-500 shadow-sm" />
              </div>
              <div>
                 <div className="flex justify-between items-center mb-1">
                   <label className="block text-[10px] font-bold text-gray-500 uppercase">İlerleme: %{taskForm.progress}</label>
                 </div>
                 <input type="range" min="0" max="100" value={taskForm.progress} onChange={e => setTaskForm({...taskForm, progress: e.target.value})} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-1" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 mt-2 rounded-xl font-bold shadow-md hover:bg-blue-500 active:scale-95 transition-transform text-sm tracking-wide">Kaydet</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


