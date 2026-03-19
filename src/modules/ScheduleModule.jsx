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

  // --- PROFESYONEL SÜRÜKLE BIRAK (DRAG & DROP) STATE'LERİ ---
  const [dragInfo, setDragInfo] = useState(null); 
  // dragInfo formatı: { startIndex: number, blockIds: string[], hoverIndex: number }

  // Veritabanı Dinleme (Sıralama: "order" özelliğine göre)
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

  useEffect(() => {
    if (isOfflineMode) {
      try {
        const local = JSON.parse(localStorage.getItem('premium_schedules')) || [];
        setSchedules(
          local.filter(s => s.projectId === activeProject?.id)
               .sort((a, b) => a.order - b.order)
        );
      } catch(e) {}
    }
  }, [isOfflineMode, activeProject]);


  // --- SÜRÜKLE & BIRAK (DRAG & DROP) MOTORU ---
  
  const handleDragStart = (e, index) => {
    // Mobil sayfa kaymasını engelle
    e.target.setPointerCapture(e.pointerId);
    if (navigator.vibrate) navigator.vibrate(40);

    const task = schedules[index];
    const blockIds = [task.id];
    
    // Eğer taşınan bir Ana Görev ise, alt görevlerini (child) de "blok" olarak taşı
    let i = index + 1;
    while (i < schedules.length && schedules[i].level > task.level) {
      blockIds.push(schedules[i].id);
      i++;
    }

    setDragInfo({ startIndex: index, blockIds, hoverIndex: index });
  };

  // Drag işlemi sürerken ekranı takip etme
  useEffect(() => {
    if (!dragInfo) return;

    const handlePointerMove = (e) => {
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const tr = elem?.closest('tr[data-index]');
      
      if (tr) {
        const hIndex = parseInt(tr.getAttribute('data-index'), 10);
        // Kendi bloğunun içine sürüklenmesini engelle
        if (!dragInfo.blockIds.includes(schedules[hIndex].id)) {
          setDragInfo(prev => ({ ...prev, hoverIndex: hIndex }));
        }
      }
    };

    const handlePointerUp = async () => {
      const { startIndex, hoverIndex, blockIds } = dragInfo;
      setDragInfo(null); // Drag modunu kapat

      if (startIndex === hoverIndex) return;

      // 1. Taşınacak bloğu ve kalan görevleri ayır
      const block = schedules.slice(startIndex, startIndex + blockIds.length);
      const remaining = schedules.filter(t => !blockIds.includes(t.id));

      // 2. Yeni konumu belirle
      const targetTask = schedules[hoverIndex];
      let insertIndex = remaining.findIndex(t => t.id === targetTask.id);

      // Eğer AŞAĞI doğru taşıyorsak, hedef görevin (ve alt görevlerinin) sonrasına ekle
      if (hoverIndex > startIndex) {
        let endIdx = hoverIndex;
        while (endIdx + 1 < schedules.length && schedules[endIdx + 1].level > targetTask.level) {
          endIdx++;
        }
        const lastTargetTask = schedules[endIdx];
        insertIndex = remaining.findIndex(t => t.id === lastTargetTask.id) + 1;
      }

      if (insertIndex === -1) insertIndex = remaining.length;

      // 3. Yeni diziyi oluştur
      const newOrder = [
        ...remaining.slice(0, insertIndex),
        ...block,
        ...remaining.slice(insertIndex)
      ];

      // 4. TÜM WBS KODLARINI OTOMATİK YENİDEN HESAPLA
      const counters = [];
      const updatedTasks = newOrder.map((task, idx) => {
        const lvl = task.level;
        counters.length = lvl + 1; // Daha alt seviyeleri temizle
        counters[lvl] = (counters[lvl] || 0) + 1; // Seviyeyi 1 artır
        
        return { ...task, wbs: counters.join('.'), order: idx };
      });

      // Anında arayüzü güncelle (Kullanıcı beklemesin)
      setSchedules(updatedTasks);

      // Firebase'e kaydet
      try {
        const promises = updatedTasks.map(t => 
          updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', t.id), { 
            wbs: t.wbs, order: t.order 
          })
        );
        await Promise.all(promises);
      } catch (err) {
        console.error("Sıralama hatası:", err);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragInfo, schedules, db, user, appId]);


  // --- AKILLI WBS HESAPLAYICI (YENİ EKLENENLER İÇİN) ---
  const generateNextWbs = (targetWbs, actionType) => {
    if (schedules.length === 0) return '1';
    
    // Geçici bir hesaplama ile yeni WBS'i bulur
    const counters = [];
    let lastWbs = '1';
    schedules.forEach((task) => {
        const lvl = task.level;
        counters.length = lvl + 1;
        counters[lvl] = (counters[lvl] || 0) + 1;
    });

    if (actionType === 'root') {
      counters.length = 1;
      counters[0] = (counters[0] || 0) + 1;
      return counters.join('.');
    }
    
    return 'Otomatik'; // Sıralama motoru zaten WBS'i baştan aşağı düzeltecek
  };


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
        
        const uidToWbsMap = {};
        for (let i = 0; i < taskNodes.length; i++) {
          const uid = taskNodes[i].getElementsByTagName("UID")[0]?.textContent;
          const wbs = taskNodes[i].getElementsByTagName("WBS")[0]?.textContent;
          if (uid && wbs) uidToWbsMap[uid] = wbs;
        }

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

          const predNodes = node.getElementsByTagName("PredecessorLink");
          const predecessorsArray = [];
          for (let j = 0; j < predNodes.length; j++) {
            const pUid = predNodes[j].getElementsByTagName("PredecessorUID")[0]?.textContent;
            if (pUid && uidToWbsMap[pUid]) predecessorsArray.push(uidToWbsMap[pUid]);
          }

          if (name && wbs) {
            parsedTasks.push({
              projectId: activeProject.id, uid: uid, wbs: wbs, name: name, order: i,
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
            setSchedules(newSchedules);
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


  // --- GÖREV MODALI AÇILIŞLARI ---
  const openAddRootTask = () => {
    setTaskForm({ wbs: 'Otomatik Belirlenecek', name: '', start: getTodayStr(), finish: getTodayStr(), progress: 0, predecessors: '', level: 0 });
    setModalConfig({ mode: 'add', title: 'Ana İş Kalemi Ekle' });
    setIsTaskModalOpen(true);
  };

  const openAddSiblingTask = (targetTask) => {
    setTaskForm({ wbs: 'Otomatik Belirlenecek', name: '', start: targetTask.start || getTodayStr(), finish: targetTask.finish || getTodayStr(), progress: 0, predecessors: '', level: targetTask.level, insertAfterIndex: schedules.findIndex(t => t.id === targetTask.id) });
    setModalConfig({ mode: 'add', title: 'Aynı Seviyeye İş Ekle' });
    setIsTaskModalOpen(true);
  };

  const openAddChildTask = (targetTask) => {
    setTaskForm({ wbs: 'Otomatik Belirlenecek', name: '', start: targetTask.start || getTodayStr(), finish: targetTask.finish || getTodayStr(), progress: 0, predecessors: '', level: targetTask.level + 1, insertAfterIndex: schedules.findIndex(t => t.id === targetTask.id) });
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


  // --- KAYDETME İŞLEMİ (WBS Yeniden Hesaplama İle) ---
  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;

    if (modalConfig.mode === 'edit') {
      const taskData = {
        name: taskForm.name, start: taskForm.start, finish: taskForm.finish,
        progress: Number(taskForm.progress) || 0, predecessors: taskForm.predecessors || ''
      };
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', editingTaskId), taskData);
        setIsTaskModalOpen(false);
      } catch (error) { console.error(error); }
      return;
    }

    // YENİ EKLEME
    let newOrderIndex = schedules.length;
    if (taskForm.insertAfterIndex !== undefined) {
      // Eğer Araya Ekleniyorsa, o bloğun sonunu bul
      let endIdx = taskForm.insertAfterIndex;
      if (taskForm.level <= schedules[taskForm.insertAfterIndex].level) {
        // Kardeş (Sibling) ekleniyorsa hedef bloğun sonunu atla
        while (endIdx + 1 < schedules.length && schedules[endIdx + 1].level > schedules[taskForm.insertAfterIndex].level) {
          endIdx++;
        }
      }
      newOrderIndex = endIdx + 1;
    }

    // Araya yeni görevi yerleştir
    const taskData = {
      projectId: activeProject.id, wbs: 'TEMP', name: taskForm.name,
      start: taskForm.start, finish: taskForm.finish, progress: Number(taskForm.progress) || 0,
      level: taskForm.level !== undefined ? taskForm.level : 0, order: newOrderIndex,
      predecessors: taskForm.predecessors || '', uid: Date.now().toString(), id: Date.now().toString()
    };

    const newOrder = [
      ...schedules.slice(0, newOrderIndex),
      taskData,
      ...schedules.slice(newOrderIndex)
    ];

    // TÜM WBS VE ORDER KODLARINI BAŞTAN AŞAĞI YENİDEN HESAPLA
    const counters = [];
    const updatedTasks = newOrder.map((task, idx) => {
      const lvl = task.level;
      counters.length = lvl + 1; 
      counters[lvl] = (counters[lvl] || 0) + 1; 
      return { ...task, wbs: counters.join('.'), order: idx };
    });

    setSchedules(updatedTasks);
    setIsTaskModalOpen(false);

    try {
      // Önce yeni görevi DB'ye yaz
      const newTaskFinal = updatedTasks.find(t => t.uid === taskData.uid);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), newTaskFinal);

      // Diğer tüm görevlerin sırasını ve WBS kodunu güncelle
      const promises = updatedTasks.filter(t => t.uid !== taskData.uid).map(t => 
        updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', t.id), { wbs: t.wbs, order: t.order })
      );
      await Promise.all(promises);
    } catch (error) { console.error("Hata:", error); }
  };


  const handleDeleteTask = async (id, wbs) => {
    const hasChildren = schedules.some(t => t.wbs.startsWith(wbs + '.') && t.id !== id);
    if(hasChildren) return alert("Bu görevin altında alt iş kalemleri var! Önce alt görevleri silmelisiniz.");
    if(window.confirm("Bu iş kalemini silmek istediğinize emin misiniz?")) {
      try { 
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', id)); 
        // Not: Gerçek bir uygulamada sildikten sonra da WBS tekrar hesaplanabilir ama karmaşıklığı azaltmak için şimdilik atladık.
      } 
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
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Genel İlerleme</p>
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
          
          {isScheduleLoading && <p className="text-center py-10 text-gray-500 font-bold animate-pulse">Okunuyor...</p>}
          {!isScheduleLoading && schedules.length === 0 && (
             <div className="text-center py-12 px-4">
               <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
               <p className="text-sm font-bold text-gray-600">Henüz iş kalemi yok.</p>
             </div>
          )}
          
          {!isScheduleLoading && schedules.length > 0 && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-xs whitespace-nowrap select-none">
                <thead className="bg-gray-100/80 text-gray-500 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="p-3 w-8 text-center sticky left-0 bg-gray-100/90 z-20 shadow-[1px_0_0_rgba(0,0,0,0.05)]"></th>
                    <th className="p-3 w-8 text-center bg-gray-100/90 z-10"></th>
                    <th className="p-3 min-w-[50px]">WBS</th>
                    <th className="p-3 min-w-[200px]">Görev</th>
                    <th className="p-3 text-center">Süre</th>
                    <th className="p-3">Başlangıç</th>
                    <th className="p-3">Bitiş</th>
                    <th className="p-3 min-w-[80px] text-center">%</th>
                    <th className="p-3 text-center">Öncül</th>
                    <th className="p-3 text-center min-w-[120px]">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.map((task, index) => {
                    const hasChildren = schedules.some(t => t.wbs.startsWith(task.wbs + '.') && t.uid !== task.uid);
                    const isExpanded = expandedScheduleNodes[task.uid];
                    
                    const parentWbsParts = task.wbs.split('.');
                    parentWbsParts.pop();
                    const parentWbs = parentWbsParts.join('.');
                    const parentTask = schedules.find(t => t.wbs === parentWbs);
                    if (parentTask && expandedScheduleNodes[parentTask.uid] === false) return null;

                    const isRoot = task.level === 0;
                    
                    // Görsel Stiller (Sürükleme anı)
                    const isDraggingThis = dragInfo?.blockIds.includes(task.id);
                    const isDragOverThis = dragInfo?.hoverIndex === index && !isDraggingThis;
                    
                    let rowClass = isRoot ? 'bg-blue-50/30' : 'hover:bg-gray-50';
                    if (isDraggingThis) rowClass = 'opacity-50 bg-blue-100 shadow-inner z-50 relative border-y border-blue-300';
                    if (isDragOverThis) rowClass = dragInfo.hoverIndex > dragInfo.startIndex ? 'border-b-4 border-blue-600 bg-blue-50/50' : 'border-t-4 border-blue-600 bg-blue-50/50';

                    const textClass = isRoot ? 'font-extrabold text-gray-900' : task.level === 1 ? 'font-bold text-gray-800' : 'font-medium text-gray-600';

                    return (
                      <tr key={task.id} data-index={index} className={`transition-colors ${rowClass}`}>
                        
                        {/* TUTAMAÇ (DRAG HANDLE) HÜCRESİ */}
                        <td 
                          className="px-1 py-2 text-center sticky left-0 z-20 bg-inherit shadow-[1px_0_0_rgba(0,0,0,0.05)] cursor-grab active:cursor-grabbing"
                          style={{ touchAction: 'none' }} // Mobilde sayfa kaymasını engeller
                          onPointerDown={(e) => handleDragStart(e, index)}
                        >
                          <GripVertical className={`w-4 h-4 mx-auto ${isDraggingThis ? 'text-blue-600' : 'text-gray-400'}`} />
                        </td>

                        <td className="p-2 text-center" onClick={() => hasChildren && toggleScheduleNode(task.uid)}>
                           {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4 mx-auto text-gray-500" /> : <ChevronRight className="w-4 h-4 mx-auto text-gray-500" />) : <span className="inline-block w-4"></span>}
                        </td>
                        
                        <td className="p-3 text-[10px] font-bold text-blue-600 pointer-events-none">{task.wbs}</td>
                        <td className={`p-3 truncate max-w-[250px] pointer-events-none ${textClass}`} style={{ paddingLeft: `${Math.max(4, task.level * 16)}px` }}>{task.name}</td>
                        <td className="p-3 text-center font-bold text-gray-600 pointer-events-none">{calculateDays(task.start, task.finish)}</td>
                        <td className="p-3 text-gray-500 font-medium pointer-events-none">{task.start ? task.start.substring(5) : '-'}</td>
                        <td className="p-3 text-gray-500 font-medium pointer-events-none">{task.finish ? task.finish.substring(5) : '-'}</td>
                        
                        <td className="p-3 pointer-events-none">
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                            </div>
                            <span className={`text-[10px] font-bold w-7 text-right ${task.progress === 100 ? 'text-emerald-600' : 'text-gray-700'}`}>%{task.progress}</span>
                          </div>
                        </td>

                        <td className="p-3 text-center text-[10px] font-bold text-blue-500 pointer-events-none">
                          {task.predecessors ? (<div className="flex items-center justify-center gap-0.5"><LinkIcon className="w-3 h-3 text-gray-400"/> {task.predecessors}</div>) : '-'}
                        </td>

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
             Görevi taşımak için en soldaki 6 noktalı ikona basılı tutup sürükleyin.
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
                {modalConfig.mode === 'add' && <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1 bg-blue-50 inline-block px-2 py-1 rounded-md">Kod otomatik hesaplanacak</p>}
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveTask} className="space-y-4">
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


