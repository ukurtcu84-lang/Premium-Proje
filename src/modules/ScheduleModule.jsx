import React, { useState, useRef, useEffect } from 'react';
import { collection, doc, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { Upload, Download, FileSpreadsheet, Activity, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { calculateDays } from '../helpers';

export default function ScheduleModule({ activeProject, appId, user, db, isOfflineMode, t }) {
  const [schedules, setSchedules] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [expandedScheduleNodes, setExpandedScheduleNodes] = useState({});
  const fileInputRef = useRef(null);

  // Veritabanı Dinleme (Sadece bu projeye ait veriler)
  useEffect(() => {
    if (!user || !db || isOfflineMode || !activeProject) return;
    const schedulesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'schedules');
    const unsub = onSnapshot(schedulesRef, (snapshot) => {
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const projectSchedules = allData
        .filter(s => s.projectId === activeProject.id)
        .sort((a, b) => a.order - b.order);
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
        setSchedules(local.filter(s => s.projectId === activeProject?.id).sort((a, b) => a.order - b.order));
      } catch(e) {}
    }
  }, [isOfflineMode, activeProject]);

  const loadDummyScheduleData = async () => {
    if (!activeProject) return;
    const dummy = [
      { projectId: activeProject.id, order: 0, uid: '1', wbs: '1', name: 'Villa İnşaatı Projesi', start: '2026-04-01', finish: '2026-10-30', progress: 45, level: 0 },
      { projectId: activeProject.id, order: 1, uid: '2', wbs: '1.1', name: 'Hafriyat ve Temel İşleri', start: '2026-04-01', finish: '2026-04-15', progress: 100, level: 1 },
      { projectId: activeProject.id, order: 2, uid: '3', wbs: '1.2', name: 'Kaba Yapı İşleri', start: '2026-04-16', finish: '2026-06-30', progress: 60, level: 1 },
      { projectId: activeProject.id, order: 3, uid: '4', wbs: '1.2.1', name: 'Zemin Kat Kalıp/Demir/Beton', start: '2026-04-16', finish: '2026-05-10', progress: 100, level: 2 },
      { projectId: activeProject.id, order: 4, uid: '5', wbs: '1.2.2', name: '1. Kat Kalıp/Demir/Beton', start: '2026-05-11', finish: '2026-05-30', progress: 50, level: 2 },
      { projectId: activeProject.id, order: 5, uid: '6', wbs: '1.2.3', name: 'Çatı Katı İşleri', start: '2026-06-01', finish: '2026-06-30', progress: 0, level: 2 },
      { projectId: activeProject.id, order: 6, uid: '7', wbs: '1.3', name: 'İnce Yapı İşleri', start: '2026-07-01', finish: '2026-09-30', progress: 0, level: 1 },
      { projectId: activeProject.id, order: 7, uid: '8', wbs: '1.3.1', name: 'Alçı Sıva ve Boya', start: '2026-07-01', finish: '2026-08-15', progress: 0, level: 2 },
      { projectId: activeProject.id, order: 8, uid: '9', wbs: '1.3.2', name: 'Seramik ve Fayans Kaplama', start: '2026-08-16', finish: '2026-09-30', progress: 0, level: 2 },
    ];
    
    if (!user || !db || isOfflineMode) {
      const local = JSON.parse(localStorage.getItem('premium_schedules')) || [];
      const filtered = local.filter(s => s.projectId !== activeProject.id);
      const newSchedules = dummy.map(d => ({...d, id: Date.now().toString() + Math.random()}));
      const updated = [...filtered, ...newSchedules];
      setSchedules(newSchedules);
      localStorage.setItem('premium_schedules', JSON.stringify(updated));
      const initialExpanded = {};
      newSchedules.forEach(s => initialExpanded[s.uid] = true);
      setExpandedScheduleNodes(initialExpanded);
      return;
    }

    try {
      setIsScheduleLoading(true);
      const toDelete = schedules;
      for (const item of toDelete) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', item.id));
      }
      for (const item of dummy) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), item);
      }
      setIsScheduleLoading(false);
    } catch (e) { console.error(e); setIsScheduleLoading(false); }
  };

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

        let orderIndex = 0;
        for (let i = 0; i < taskNodes.length; i++) {
          const node = taskNodes[i];
          const getVal = (tag) => node.getElementsByTagName(tag)[0]?.textContent || '';
          const uid = getVal("UID");
          const name = getVal("Name");
          const startStr = getVal("Start").split('T')[0];
          const finishStr = getVal("Finish").split('T')[0];
          const progress = parseInt(getVal("PercentComplete")) || 0;
          const wbs = getVal("WBS");
          const outlineLevel = parseInt(getVal("OutlineLevel")) || 1;

          if (name && uid && wbs) {
            parsedTasks.push({
              projectId: activeProject.id,
              order: orderIndex++,
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
            const local = JSON.parse(localStorage.getItem('premium_schedules')) || [];
            const filtered = local.filter(s => s.projectId !== activeProject.id);
            const newSchedules = parsedTasks.map(d => ({...d, id: Date.now().toString() + Math.random()}));
            const updated = [...filtered, ...newSchedules];
            setSchedules(newSchedules);
            localStorage.setItem('premium_schedules', JSON.stringify(updated));
            const initialExpanded = {};
            newSchedules.forEach(s => initialExpanded[s.uid] = true);
            setExpandedScheduleNodes(initialExpanded);
            setIsScheduleLoading(false);
            return;
          }

          const toDelete = schedules;
          for (const item of toDelete) {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', item.id));
          }
          for (const item of parsedTasks) {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), item);
          }
        } else {
          alert(t.invalidXml);
        }
      } catch (error) {
        console.error(error);
        alert(t.readError);
      } finally {
        setIsScheduleLoading(false);
        e.target.value = null;
      }
    };
    reader.readAsText(file);
  };

  const handleExportScheduleCSV = () => {
    if (schedules.length === 0) return alert(t.noDataExport);
    const headers = [`WBS,${t.taskNameCol},${t.durationCol},${t.startCol},${t.finishCol},${t.progressCol}(%)`];
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
      <div className="px-5 pt-6 pb-4">
        <div className="flex gap-2">
          <input type="file" accept=".xml" className="hidden" ref={fileInputRef} onChange={handleScheduleFileUpload} />
          <button onClick={() => fileInputRef.current.click()} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
            <Upload className="w-4 h-4" /> {t.importXml}
          </button>
          <button onClick={handleExportScheduleCSV} className="flex-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
            <Download className="w-4 h-4" /> {t.exportCsv}
          </button>
        </div>
      </div>

      <div className="px-5 mb-5">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.scheduleOverallProgress}</p>
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

      <div className="px-4">
        <div className="flex justify-between items-center mb-2 px-1">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.tableView}</h3>
          {schedules.length === 0 && <span className="text-xs font-bold text-blue-600 cursor-pointer" onClick={loadDummyScheduleData}>{t.loadDummy}</span>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          {isScheduleLoading && <p className="text-center py-10 text-gray-500 font-bold animate-pulse">{t.readingFile}</p>}
          {!isScheduleLoading && schedules.length === 0 && (
             <div className="text-center py-12 px-4">
               <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
               <p className="text-sm font-bold text-gray-600">{t.noSchedule}</p>
               <p className="text-xs text-gray-400 mt-1">{t.noScheduleDesc}</p>
             </div>
          )}
          {!isScheduleLoading && schedules.length > 0 && (
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-gray-100/80 text-gray-500 font-bold text-[10px] uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="p-3 w-8 text-center sticky left-0 bg-gray-100/90 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)]"></th>
                    <th className="p-3 min-w-[50px]">WBS</th>
                    <th className="p-3 min-w-[200px]">{t.taskNameCol}</th>
                    <th className="p-3 text-center">{t.durationCol}</th>
                    <th className="p-3">{t.startCol}</th>
                    <th className="p-3">{t.finishCol}</th>
                    <th className="p-3 min-w-[100px] text-center">{t.progressCol}</th>
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
                        <td className="p-3 text-gray-500 font-medium">{task.start}</td>
                        <td className="p-3 text-gray-500 font-medium">{task.finish}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${task.progress}%` }}></div>
                            </div>
                            <span className={`text-[10px] font-bold w-7 text-right ${task.progress === 100 ? 'text-emerald-600' : 'text-gray-700'}`}>%{task.progress}</span>
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
        {!isScheduleLoading && schedules.length > 0 && <p className="text-[10px] text-center text-gray-400 mt-3 flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3"/> {t.scrollHint}</p>}
      </div>
    </div>
  );
}

