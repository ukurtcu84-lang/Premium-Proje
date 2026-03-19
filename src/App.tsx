import React, { useState, useRef, useEffect } from 'react';
import './index.css';

// DIŞARIDAN ÇAĞIRILAN MODÜLLER VE YARDIMCILAR
import { app, auth, db, appId } from './firebase';
import { i18n } from './i18n';
import { 
  getTodayStr, getCurrentTimeStr, formatCurrency, getCurrencySymbol, 
  calculateProgress, getFinancialVariance, calculateStatus, formatDisplayDate, 
  getRemainingDays, loadLocal 
} from './helpers';
import { CircularProgress } from './CircularProgress';
import ScheduleModule from './modules/ScheduleModule';
import DailyReportModule from './modules/DailyReportModule';

// FIREBASE FONKSİYONLARI
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// İKONLAR
import { 
  Home, CheckSquare, FileText, Plus, Camera, Mic, 
  CheckCircle2, Circle, X, Trash2, Image as ImageIcon, Edit3,
  Clock, AlertTriangle, ArrowRightCircle, 
  ChevronLeft, Building2, MapPin, Wallet,
  Briefcase, FolderKanban, MoreVertical, FilePlus2, Upload,
  Calculator, HardHat, Target, Lock, Mail, User, LogOut, 
  Smartphone, CloudOff, Globe, Banknote, TableProperties, ClipboardList
} from 'lucide-react';

export default function App() {
  // --- STATE YÖNETİMİ ---
  const [lang, setLang] = useState(() => loadLocal('premium_lang') || 'tr');
  const t = i18n[lang];

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [projects, setProjects] = useState(() => loadLocal('premium_projects') || []);
  const [tasks, setTasks] = useState(() => loadLocal('premium_tasks') || []);
  const [notes, setNotes] = useState(() => loadLocal('premium_notes') || []);
  
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'tasks', 'schedule', 'report', 'notes'
  const [taskView, setTaskView] = useState('pending');
  const [selectedPendingTasks, setSelectedPendingTasks] = useState([]); 
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [isProjectInfoOpen, setIsProjectInfoOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(getTodayStr());
  const [newTaskTime, setNewTaskTime] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [newNoteText, setNewNoteText] = useState('');
  
  const [paymentInput, setPaymentInput] = useState('');
  const [targetPaymentInput, setTargetPaymentInput] = useState('');

  const [projectForm, setProjectForm] = useState({
    name: '', location: '', client: '', contractDate: getTodayStr(), duration: '', budget: '', currency: 'TRY', timeExtension: '', costIncrease: '', advancePayment: ''
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState(null);
  const recognitionRef = useRef(null);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeTasks = tasks.filter(task => task.projectId === activeProjectId);
  const activeNotes = notes.filter(n => n.projectId === activeProjectId).sort((a,b) => b.createdAt - a.createdAt);

  useEffect(() => { setSelectedPendingTasks([]); }, [activeTab, taskView, activeProjectId]);

  useEffect(() => {
    if(errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const toggleLanguage = () => {
    const newLang = lang === 'tr' ? 'en' : 'tr';
    setLang(newLang);
    localStorage.setItem('premium_lang', JSON.stringify(newLang));
  };

  // --- FIREBASE BAĞLANTISI ---
  useEffect(() => {
    if (!auth) { setAuthError(t.authErrorConnect); return; }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (currentUser) { setUser(currentUser); setIsAuthenticated(true); } 
        else { setUser(null); if(!isOfflineMode) setIsAuthenticated(false); }
    });
    return () => unsubscribe();
  }, [isOfflineMode, t.authErrorConnect]);

  useEffect(() => {
    if (!user || !db || isOfflineMode) return;
    const unsubProjects = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => console.error(err));

    const unsubTasks = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    const unsubNotes = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    return () => { unsubProjects(); unsubTasks(); unsubNotes(); };
  }, [user, isOfflineMode]);

  // --- SES TANIMA ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = lang === 'tr' ? 'tr-TR' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (recognitionRef.current.target === 'task') setNewTaskText(prev => prev + (prev ? ' ' : '') + transcript);
        else if (recognitionRef.current.target === 'note') setNewNoteText(prev => prev + (prev ? ' ' : '') + transcript);
        setIsRecording(false); setRecordingTarget(null);
      };
      recognition.onerror = () => { setIsRecording(false); setRecordingTarget(null); };
      recognition.onend = () => { setIsRecording(false); setRecordingTarget(null); };
      recognitionRef.current = recognition;
    }
  }, [lang]);

  const toggleRecording = (target) => {
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); setRecordingTarget(null); } 
    else {
      if (recognitionRef.current) {
        try { recognitionRef.current.target = target; recognitionRef.current.start(); setIsRecording(true); setRecordingTarget(target); } 
        catch (e) { alert("Mikrofon başlatılamadı."); }
      } else { alert("Tarayıcınız sesli dikte özelliğini desteklemiyor."); }
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault(); setAuthError(''); setIsOfflineMode(false);
    if (!auth) { setAuthError(t.authErrorConnect); return; }
    try {
        if (isLoginMode) await signInWithEmailAndPassword(auth, email, password);
        else await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Kimlik doğrulama hatası:", error);
        switch (error.code) {
            case 'auth/invalid-credential': case 'auth/user-not-found': case 'auth/wrong-password': setAuthError(t.authErrorInvalid); break;
            case 'auth/email-already-in-use': setAuthError(t.authErrorInUse); break;
            case 'auth/weak-password': setAuthError(t.authErrorWeak); break;
            case 'auth/invalid-email': setAuthError(t.authErrorEmail); break;
            case 'auth/operation-not-allowed': setAuthError(t.authErrorDisabled); break;
            default: setAuthError(error.message);
        }
    }
  };

  const handleLogout = async () => {
    try {
        if (auth) await signOut(auth);
        setIsAuthenticated(false); setActiveProjectId(null); setIsOfflineMode(false);
        setProjects(loadLocal('premium_projects') || []); setTasks(loadLocal('premium_tasks') || []); setNotes(loadLocal('premium_notes') || []);
    } catch (error) { console.error("Çıkış yapılırken hata:", error); }
  };

  const startOfflineMode = (e) => { e.preventDefault(); setIsOfflineMode(true); setIsAuthenticated(true); };

  // --- CRUD İŞLEMLERİ ---
  const closeProjectForm = () => {
    setIsProjectFormOpen(false); setEditingProjectId(null);
    setProjectForm({name: '', location: '', client: '', contractDate: getTodayStr(), duration: '', budget: '', currency: 'TRY', timeExtension: '', costIncrease: '', advancePayment: ''});
  };

  const openEditProject = () => {
    if (!activeProject) return;
    setProjectForm({
      name: activeProject.name || '', location: activeProject.location || '', client: activeProject.client || '', contractDate: activeProject.contractDate || getTodayStr(),
      duration: activeProject.duration || '', budget: activeProject.budget || '', currency: activeProject.currency || 'TRY', timeExtension: activeProject.timeExtension || '',
      costIncrease: activeProject.costIncrease || '', advancePayment: activeProject.advancePayment || ''
    });
    setEditingProjectId(activeProject.id); setIsProjectInfoOpen(false); setIsProjectFormOpen(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault(); if (!projectForm.name.trim()) return;
    const projectData = { ...projectForm, budget: Number(projectForm.budget) || 0, advancePayment: Number(projectForm.advancePayment) || 0 };

    if (editingProjectId) {
      if (!user || !db || isOfflineMode) {
        const updated = projects.map(p => p.id === editingProjectId ? { ...p, ...projectData } : p);
        setProjects(updated); localStorage.setItem('premium_projects', JSON.stringify(updated)); closeProjectForm(); return;
      }
      try { await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', editingProjectId), projectData); closeProjectForm(); } 
      catch (error) { console.error("Proje güncellenirken hata:", error); setErrorMessage("Güncelleme başarısız oldu."); }
    } else {
      projectData.cumulativePayment = 0; projectData.targetPayment = 0; projectData.createdAt = Date.now();
      if (!user || !db || isOfflineMode) {
         const fallbackProject = { id: Date.now().toString(), ...projectData };
         const updated = [fallbackProject, ...projects];
         setProjects(updated); localStorage.setItem('premium_projects', JSON.stringify(updated)); closeProjectForm(); enterProject(fallbackProject.id); return;
      }
      try {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), projectData);
        closeProjectForm(); enterProject(docRef.id);
      } catch (error) { console.error("Proje oluşturulurken hata:", error); }
    }
  };

  const deleteProject = async (id) => {
    if(window.confirm(t.deleteProjectConfirm)) {
      if (!user || !db || isOfflineMode) {
         const updated = projects.filter(p => p.id !== id); setProjects(updated); localStorage.setItem('premium_projects', JSON.stringify(updated));
         const updatedTasks = tasks.filter(task => task.projectId !== id); setTasks(updatedTasks); localStorage.setItem('premium_tasks', JSON.stringify(updatedTasks));
         const updatedNotes = notes.filter(n => n.projectId !== id); setNotes(updatedNotes); localStorage.setItem('premium_notes', JSON.stringify(updatedNotes));
         setActiveProjectId(null); return;
      }
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', id));
        const tasksToDelete = tasks.filter(task => task.projectId === id); tasksToDelete.forEach(task => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id)));
        const notesToDelete = notes.filter(n => n.projectId === id); notesToDelete.forEach(n => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', n.id)));
        setActiveProjectId(null);
      } catch (error) { console.error(error); }
    }
  };

  const handleUpdatePayment = async () => {
    if (!activeProjectId) return;
    if (!user || !db || isOfflineMode) {
      const updated = projects.map(p => p.id === activeProjectId ? { ...p, cumulativePayment: Number(paymentInput), targetPayment: Number(targetPaymentInput) } : p);
      setProjects(updated); localStorage.setItem('premium_projects', JSON.stringify(updated)); setIsPaymentModalOpen(false); setPaymentInput(''); setTargetPaymentInput(''); return;
    }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', activeProjectId), { cumulativePayment: Number(paymentInput), targetPayment: Number(targetPaymentInput) });
      setIsPaymentModalOpen(false); setPaymentInput(''); setTargetPaymentInput('');
    } catch(e) { console.error(e); }
  };

  const enterProject = (id) => { setActiveProjectId(id); setActiveTab('home'); setTaskView('pending'); };
  const leaveProject = () => { setActiveProjectId(null); };

  const handleAddTask = async () => {
    if (!newTaskText.trim() || !activeProjectId) return;
    const newTask = { projectId: activeProjectId, text: newTaskText, completed: false, deadlineDate: newTaskDate, deadlineTime: newTaskTime, createdAt: Date.now() };
    if (!user || !db || isOfflineMode) {
       const fallbackTask = { id: Date.now().toString(), ...newTask }; const updated = [fallbackTask, ...tasks]; setTasks(updated); localStorage.setItem('premium_tasks', JSON.stringify(updated));
       setNewTaskText(''); setNewTaskTime(''); setNewTaskDate(getTodayStr()); return;
    }
    try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), newTask); setNewTaskText(''); setNewTaskTime(''); setNewTaskDate(getTodayStr()); } catch(e) { console.error(e); }
  };

  const handleUpdateTask = async (id, newDate, newTime) => {
    if (!user || !db || isOfflineMode) {
      const updated = tasks.map(task => task.id === id ? { ...task, deadlineDate: newDate, deadlineTime: newTime } : task); setTasks(updated); localStorage.setItem('premium_tasks', JSON.stringify(updated)); setEditingTask(null); return;
    }
    try { await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id), { deadlineDate: newDate, deadlineTime: newTime }); setEditingTask(null); } catch(e) { console.error(e); }
  };

  const toggleTaskSelection = (id) => { setSelectedPendingTasks(selectedPendingTasks.includes(id) ? selectedPendingTasks.filter(taskId => taskId !== id) : [...selectedPendingTasks, id]); };

  const approveTaskSelection = async () => {
    if (!user || !db || isOfflineMode) {
       const updated = tasks.map(task => selectedPendingTasks.includes(task.id) ? { ...task, completed: true } : task); setTasks(updated); localStorage.setItem('premium_tasks', JSON.stringify(updated)); setSelectedPendingTasks([]); return;
    }
    try {
      const updatePromises = selectedPendingTasks.map(taskId => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId), { completed: true }));
      await Promise.all(updatePromises); setSelectedPendingTasks([]);
    } catch(e) { console.error(e); }
  };

  const revertCompletedTask = async (id) => {
    if (!user || !db || isOfflineMode) { const updated = tasks.map(task => task.id === id ? { ...task, completed: false } : task); setTasks(updated); localStorage.setItem('premium_tasks', JSON.stringify(updated)); return; }
    try { await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id), { completed: false }); } catch(e) { console.error(e); }
  };

  const deleteTask = async (id) => {
    if (!user || !db || isOfflineMode) { const updated = tasks.filter(task => task.id !== id); setTasks(updated); localStorage.setItem('premium_tasks', JSON.stringify(updated)); return; }
    try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id)); } catch(e) { console.error(e); }
  };

  const deleteNote = async (id) => {
    if(!window.confirm(t.deleteNoteConfirm)) return;
    if (!user || !db || isOfflineMode) { const updated = notes.filter(n => n.id !== id); setNotes(updated); localStorage.setItem('premium_notes', JSON.stringify(updated)); return; }
    try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id)); } catch(e) { console.error(e); }
  };

  const addNote = async (type, content) => {
    if (!activeProjectId) return;
    const newNote = { projectId: activeProjectId, type, content, date: getCurrentTimeStr(), createdAt: Date.now() };
    if (!user || !db || isOfflineMode) { 
      const fallbackNote = { id: Date.now().toString(), ...newNote }; const updated = [fallbackNote, ...notes]; setNotes(updated); localStorage.setItem('premium_notes', JSON.stringify(updated)); return; 
    }
    try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), newNote); } catch(e) { console.error(e); }
  };

  const handleAddTextNote = () => { if (!newNoteText.trim()) return; addNote('text', newNoteText); setNewNoteText(''); setIsAddModalOpen(false); };
  const handlePhotoCapture = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { addNote('image', reader.result); setIsAddModalOpen(false); }; reader.readAsDataURL(file); } };

  // --- EKRAN BİLEŞENLERİ ---
  const renderPortfolio = () => (
    <div className="flex-1 overflow-y-auto bg-gray-50 animate-in fade-in duration-300 pb-28">
      <div className="bg-gray-900 text-white px-6 py-6 flex justify-between items-center rounded-b-3xl shadow-md sticky top-0 z-20 border-b border-gray-800">
        <div>
           <div className="flex items-center gap-2 mb-0.5">
             <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">{t.appTitle}</p>
             {isOfflineMode && <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[8px] flex items-center gap-1 font-bold"><CloudOff className="w-2.5 h-2.5"/> {t.offlineBtn}</span>}
           </div>
           <h1 className="text-xl font-extrabold tracking-tight">{t.portfolio}</h1>
           {user && !isOfflineMode && <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[150px]">{user.email}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsProjectFormOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> <span className="text-sm font-bold">{t.newBtn}</span>
          </button>
          <button onClick={handleLogout} className="bg-gray-800 hover:bg-red-500 text-gray-300 hover:text-white px-3 py-2.5 rounded-xl shadow-sm active:scale-95 transition-colors border border-gray-700 hover:border-red-500">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-5 py-6 space-y-6">
        {projects.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
            <FolderKanban className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-700">{t.noProject}</h2>
            <p className="text-sm text-gray-500 mt-1">{t.noProjectDesc}</p>
          </div>
        )}

        {projects.map(project => {
          const projectTasks = tasks.filter(task => task.projectId === project.id && !task.completed).length;
          const timeInfo = getRemainingDays(project.contractDate, project.duration, t);
          const progressPercent = calculateProgress(project.cumulativePayment, project.budget);
          const variance = getFinancialVariance(project.cumulativePayment, project.targetPayment, project.budget, t);
          
          return (
            <div key={project.id} onClick={() => enterProject(project.id)} className="bg-white rounded-3xl border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)] cursor-pointer hover:shadow-lg hover:border-blue-300 active:scale-[0.98] transition-all overflow-hidden group">
              <div className="p-5 flex justify-between items-center bg-gradient-to-br from-white to-gray-50/50">
                <div className="flex-1 pr-4">
                  <h3 className="font-extrabold text-gray-900 text-lg leading-tight tracking-tight group-hover:text-blue-700 transition-colors">{project.name}</h3>
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-gray-500">
                    <Building2 className="w-3.5 h-3.5" /> <span className="truncate">{project.client || t.unspecified}</span>
                  </div>
                  {variance.diff !== 0 && (
                    <div className={`mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${variance.bg} ${variance.color} ${variance.border}`}>
                      <variance.icon className="w-3 h-3" /> {variance.text}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <CircularProgress progress={progressPercent} size={68} strokeWidth={6} colorClass={variance.diff < 0 ? "text-red-500" : "text-blue-600"} />
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/50">
                <div className="p-3 text-center flex flex-col justify-center">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.budget}</p>
                  <p className="text-xs font-extrabold text-gray-800 tracking-tight truncate px-1">{formatCurrency(project.budget, project.currency)}</p>
                </div>
                <div className="p-3 text-center flex flex-col justify-center">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.timeStatus}</p>
                  <p className={`text-[10px] font-extrabold tracking-tight ${timeInfo.isOverdue ? 'text-red-600' : 'text-gray-800'}`}>{timeInfo.text}</p>
                </div>
                <div className="p-3 text-center flex flex-col justify-center bg-blue-50/30 group-hover:bg-blue-50 transition-colors">
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-1">{t.workload}</p>
                  <p className="text-xs font-extrabold text-blue-700 tracking-tight flex items-center justify-center gap-1"><CheckSquare className="w-3.5 h-3.5"/> {projectTasks} {t.tasksLabel}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderProjectDashboard = () => {
    if (!activeProject) return null;
    const pendingTasks = activeTasks.filter(task => !task.completed);
    const overdueTasks = pendingTasks.filter(task => calculateStatus(task.deadlineDate, task.deadlineTime, false) === 'overdue');
    const progressPercent = calculateProgress(activeProject.cumulativePayment, activeProject.budget);
    const targetPercent = calculateProgress(activeProject.targetPayment, activeProject.budget);
    const variance = getFinancialVariance(activeProject.cumulativePayment, activeProject.targetPayment, activeProject.budget, t);

    return (
      <div className="px-5 pb-28 pt-6 space-y-5 animate-in fade-in duration-300">
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)] relative">
          <button onClick={openEditProject} className="absolute top-4 right-4 p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><MoreVertical className="w-5 h-5" /></button>
          
          <div className="relative">
            <div className="flex justify-between items-start mb-5 pr-8">
              <div>
                <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{t.financialProgress}</h2>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold text-blue-700 tracking-tight">%{progressPercent}</span>
                  <span className="text-sm font-bold text-gray-400">/ %{targetPercent} {t.target}</span>
                </div>
              </div>
            </div>

            <div className="relative w-full h-3 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-gray-300 rounded-full transition-all duration-500" style={{ width: `${targetPercent}%` }}></div>
                <div className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 z-10 ${variance.diff < 0 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${progressPercent}%` }}></div>
            </div>

            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border mb-6 ${variance.bg} ${variance.color} ${variance.border}`}><variance.icon className="w-4 h-4" /> Durum: {variance.text}</div>
            
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Target className="w-3 h-3"/> {t.plannedBudget}</p>
                <p className="font-extrabold text-gray-700 text-sm tracking-tight">{formatCurrency(activeProject.targetPayment, activeProject.currency)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><Wallet className="w-3 h-3"/> {t.actualPayment}</p>
                <p className="font-extrabold text-emerald-700 text-sm tracking-tight">{formatCurrency(activeProject.cumulativePayment, activeProject.currency)}</p>
              </div>
            </div>
            
            {(activeProject.advancePayment > 0) && (
              <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100 mb-5 flex justify-between items-center">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1"><Banknote className="w-3 h-3"/> {t.advancePayment}</p>
                <p className="font-extrabold text-blue-800 text-sm">{formatCurrency(activeProject.advancePayment, activeProject.currency)}</p>
              </div>
            )}

            <button onClick={() => { setPaymentInput(activeProject.cumulativePayment || ''); setTargetPaymentInput(activeProject.targetPayment || ''); setIsPaymentModalOpen(true); }} className="w-full bg-white border-2 border-blue-600 text-blue-700 py-3.5 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
              <Calculator className="w-4 h-4" /> {t.updatePayment}
            </button>
          </div>
        </div>

        {overdueTasks.length > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between cursor-pointer shadow-sm" onClick={() => setActiveTab('tasks')}>
            <div className="flex items-center gap-3"><div className="bg-red-100 p-2 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-600" /></div><div><h4 className="font-bold text-red-900 text-sm">{t.overdueAlert} {overdueTasks.length} {t.overdueSuffix}</h4></div></div><ArrowRightCircle className="w-5 h-5 text-red-500" />
          </div>
        )}

        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex justify-between items-center">{t.priorityTasks}<button onClick={() => setActiveTab('tasks')} className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2.5 py-1.5 rounded-md tracking-wider">{t.seeAll}</button></h3>
          <div className="space-y-2.5">
            {pendingTasks.slice(0, 3).map(task => (
              <div key={task.id} onClick={() => setActiveTab('tasks')} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start gap-3 cursor-pointer active:scale-95 transition-transform hover:border-blue-300 group">
                <Circle className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0 group-hover:text-blue-400 transition-colors" /><p className="text-sm font-semibold text-gray-800 flex-1 leading-snug">{task.text}</p>
              </div>
            ))}
            {pendingTasks.length === 0 && <p className="text-sm text-gray-500 text-center py-5 bg-white rounded-xl border border-dashed border-gray-300 font-medium">{t.noPendingTasks}</p>}
          </div>
        </div>
      </div>
    );
  };

  const renderProjectTasks = () => {
    const displayTasks = activeTasks.filter(task => taskView === 'pending' ? !task.completed : task.completed);
    if(taskView === 'pending') { displayTasks.sort((a, b) => { const priority = { 'overdue': 1, 'upcoming': 2, 'normal': 3 }; return priority[calculateStatus(a.deadlineDate, a.deadlineTime, a.completed)] - priority[calculateStatus(b.deadlineDate, b.deadlineTime, b.completed)]; }); }

    return (
      <div className="px-5 pb-32 pt-6 space-y-5 animate-in fade-in duration-300 relative">
        <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-2">
           <button onClick={() => setTaskView('pending')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${taskView==='pending' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.pending} ({activeTasks.filter(task=>!task.completed).length})</button>
           <button onClick={() => setTaskView('completed')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${taskView==='completed' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>{t.completed} ({activeTasks.filter(task=>task.completed).length})</button>
        </div>

        {taskView === 'pending' && (
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <div className={`flex items-center bg-gray-50 border rounded-xl px-2 transition-colors ${isRecording && recordingTarget === 'task' ? 'border-red-300 bg-red-50/50' : 'border-gray-200'}`}>
              <input type="text" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} placeholder={isRecording && recordingTarget === 'task' ? t.listening : t.taskPlaceholder} className="flex-1 bg-transparent px-2 py-3 text-sm font-semibold text-gray-900 focus:outline-none placeholder-gray-400" />
              <button onClick={() => toggleRecording('task')} className={`p-1.5 rounded-lg transition-all ${isRecording && recordingTarget === 'task' ? 'text-red-500 bg-red-100 animate-pulse' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}><Mic className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-2">
              <input type="date" value={newTaskDate} onChange={(e) => setNewTaskDate(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 focus:outline-none focus:border-blue-400" />
              <input type="time" value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)} className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-semibold text-gray-600 focus:outline-none focus:border-blue-400" />
              <button onClick={handleAddTask} className="bg-blue-600 text-white px-4 rounded-xl shadow-sm font-bold active:scale-95 transition-transform"><Plus className="w-5 h-5" /></button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {displayTasks.length === 0 && <p className="text-center text-gray-400 font-medium py-10">{t.noPendingTasks}</p>}
          {displayTasks.map(task => {
            const status = calculateStatus(task.deadlineDate, task.deadlineTime, task.completed);
            const isEditing = editingTask === task.id;
            const isSelected = selectedPendingTasks.includes(task.id);

            if (isEditing) return (
              <div key={task.id} className="bg-white p-4 rounded-2xl border-2 border-blue-400 shadow-md">
                <p className="text-sm font-bold text-gray-900 mb-3">{task.text}</p>
                <div className="flex gap-2 mb-3">
                  <input type="date" defaultValue={task.deadlineDate} id={`date-${task.id}`} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium" />
                  <input type="time" defaultValue={task.deadlineTime} id={`time-${task.id}`} className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingTask(null)} className="px-3 py-2 text-sm text-gray-500 font-bold">{t.cancel}</button>
                  <button onClick={() => handleUpdateTask(task.id, document.getElementById(`date-${task.id}`).value, document.getElementById(`time-${task.id}`).value)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">{t.save}</button>
                </div>
              </div>
            );

            return (
              <div key={task.id} onClick={() => !task.completed ? toggleTaskSelection(task.id) : revertCompletedTask(task.id)} className={`p-4 rounded-2xl border flex items-start gap-3 transition-all cursor-pointer ${task.completed ? 'bg-gray-50 border-gray-200 opacity-70' : isSelected ? 'bg-blue-50 border-blue-400 shadow-md' : status === 'overdue' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 shadow-sm hover:border-blue-200'}`}>
                <div className="mt-0.5">{task.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : isSelected ? <CheckCircle2 className="w-5 h-5 text-blue-600" /> : <Circle className={`w-5 h-5 ${status === 'overdue' ? 'text-red-500' : 'text-gray-300'}`} />}</div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold leading-snug ${task.completed ? 'text-gray-500 line-through' : isSelected ? 'text-blue-900' : status === 'overdue' ? 'text-red-900' : 'text-gray-900'}`}>{task.text}</p>
                  {(task.deadlineDate || task.deadlineTime) && !task.completed && (
                    <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-bold ${isSelected ? 'text-blue-600' : status === 'overdue' ? 'text-red-600' : 'text-gray-500'}`}>
                      {status === 'overdue' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5"/>}
                      {status === 'overdue' ? t.late + ' ' : ''}{formatDisplayDate(task.deadlineDate)} {task.deadlineTime}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {!task.completed && <button onClick={(e) => { e.stopPropagation(); setEditingTask(task.id); }} className="p-1.5 text-gray-400 hover:text-blue-600 bg-white rounded-md border border-gray-200 shadow-sm"><Edit3 className="w-4 h-4" /></button>}
                  <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="p-1.5 text-gray-400 hover:text-red-600 bg-white rounded-md border border-gray-200 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>

        {taskView === 'pending' && selectedPendingTasks.length > 0 && (
          <div className="fixed bottom-[5.5rem] left-1/2 transform -translate-x-1/2 w-full max-w-md px-5 z-40 animate-in slide-in-from-bottom-5 duration-300">
            <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 flex items-center justify-between border border-gray-700">
              <div className="flex items-center gap-3">
                 <div className="bg-blue-500/20 p-2.5 rounded-xl text-blue-400"><CheckSquare className="w-5 h-5" /></div>
                 <div><p className="text-sm font-extrabold">{selectedPendingTasks.length} {t.selectedTasks}</p><p className="text-[10px] text-gray-400 font-medium mt-0.5">{t.archiveConfirm}</p></div>
              </div>
              <button onClick={approveTaskSelection} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 active:scale-95 transition-transform shadow-md">{t.confirm} <ArrowRightCircle className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProjectNotes = () => (
    <div className="px-5 pb-28 pt-6 space-y-5 animate-in fade-in duration-300">
      <h2 className="text-xl font-extrabold text-gray-900 mb-2 tracking-tight">{t.projectNotes}</h2>
      <div className="space-y-4">
        {activeNotes.length === 0 && <p className="text-center text-gray-400 font-medium py-10">{t.noNotes}</p>}
        {activeNotes.map(note => (
          <div key={note.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative group">
            <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{note.date}</span>
              <div className="flex items-center gap-3">
                {note.type === 'image' && <ImageIcon className="w-4 h-4 text-blue-500" />}{note.type === 'text' && <FileText className="w-4 h-4 text-gray-400" />}
                <button onClick={() => deleteNote(note.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            {note.type === 'text' && <p className="text-sm text-gray-800 leading-relaxed font-medium">{note.content}</p>}
            {note.type === 'image' && <img src={note.content} alt="Not" className="w-full h-48 object-cover rounded-xl border border-gray-100" />}
          </div>
        ))}
      </div>
    </div>
  );

  // --- ANA RENDER ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center p-6 font-sans antialiased relative overflow-hidden">
        <div className="absolute top-6 right-6 z-20">
          <button onClick={toggleLanguage} className="bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-extrabold text-white shadow-sm transition-colors flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />{lang === 'tr' ? 'EN' : 'TR'}
          </button>
        </div>
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[100px] opacity-30 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[100px] opacity-30"></div>

        <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-8 relative z-10 border border-gray-100">
          <div className="flex justify-center mb-6">
            <div className="bg-gray-900 p-4 rounded-2xl shadow-lg border border-gray-700 relative">
              <Briefcase className="w-8 h-8 text-blue-500" /><div className="absolute -bottom-2 -right-2 bg-blue-600 p-1.5 rounded-lg border-2 border-white"><Smartphone className="w-3 h-3 text-white" /></div>
            </div>
          </div>
          
          <h2 className="text-2xl font-extrabold text-center text-gray-900 mb-1 tracking-tight leading-tight">{t.loginTitle1} <br/>{t.loginTitle2}</h2>
          <div className="flex justify-center mb-6"><span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-2.5 py-1 rounded-md tracking-widest uppercase">{t.cloudSync}</span></div>

          {authError && (<div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-[11px] font-semibold mb-4 flex items-start gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /><p>{authError}</p></div>)}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {!isLoginMode && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t.fullNameLabel}</label>
                <div className="relative"><User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" /><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder={t.fullNamePlaceholder} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" /></div>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t.emailLabel}</label>
              <div className="relative"><Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder={t.emailPlaceholder} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" /></div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">{t.passwordLabel}</label>
              <div className="relative"><Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" /><input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder={t.passwordPlaceholder} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" /></div>
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all tracking-wide mt-2">{isLoginMode ? t.loginBtn : t.signupBtn}</button>
            <div className="pt-2"><button type="button" onClick={startOfflineMode} className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 active:scale-95 transition-all text-xs flex items-center justify-center gap-2"><CloudOff className="w-4 h-4" /> {t.offlineBtn}</button></div>
          </form>

          <div className="mt-6 text-center"><button onClick={() => setIsLoginMode(!isLoginMode)} className="text-[13px] font-bold text-gray-500 hover:text-blue-600 transition-colors">{isLoginMode ? t.noAccount : t.hasAccount}</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased selection:bg-blue-100 selection:text-blue-900 relative">
      <div className="w-full h-full max-w-md mx-auto bg-gray-50 relative shadow-2xl min-h-screen flex flex-col border-x border-gray-200 overflow-hidden">
        
        {/* HEADER (Proje İçi) */}
        {activeProjectId && (
          <div className="bg-gray-900 text-white px-4 py-4 flex items-center justify-between rounded-b-2xl shadow-md sticky top-0 z-20 border-b border-gray-800">
            <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
              <button onClick={leaveProject} className="p-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 active:scale-95 transition-all flex-shrink-0 border border-gray-700"><ChevronLeft className="w-6 h-6 text-gray-300" /></button>
              <div className="flex-1 truncate ml-1">
                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest mb-0.5">{t.appTitle}</p>
                <h1 className="text-sm font-extrabold truncate tracking-tight">{activeProject?.name}</h1>
              </div>
            </div>
            <button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0"><Plus className="w-4 h-4" /><span className="text-sm font-bold">Not</span></button>
          </div>
        )}

        {/* ANA İÇERİK */}
        {!activeProjectId ? renderPortfolio() : (
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'home' && renderProjectDashboard()}
            {activeTab === 'tasks' && renderProjectTasks()}
            {/* İŞ PROGRAMI MODÜLÜ */}
            {activeTab === 'schedule' && (
              <ScheduleModule 
                activeProject={activeProject} 
                appId={appId} user={user} db={db} 
                isOfflineMode={isOfflineMode} t={t} 
              />
            )}
            {/* YENİ: GÜNLÜK RAPOR MODÜLÜ */}
            {activeTab === 'report' && (
              <DailyReportModule 
                activeProject={activeProject} 
                appId={appId} user={user} db={db} 
                isOfflineMode={isOfflineMode} t={t} 
              />
            )}
            {activeTab === 'notes' && renderProjectNotes()}
          </div>
        )}

        {/* ALT MENÜ */}
        {activeProjectId && (
          <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 px-2 py-3 flex justify-between items-center pb-safe z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
            <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'home' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><Home className={`w-5 h-5 ${activeTab === 'home' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">Özet</span></button>
            <button onClick={() => setActiveTab('tasks')} className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'tasks' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><CheckSquare className={`w-5 h-5 ${activeTab === 'tasks' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">İşler</span></button>
            <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'schedule' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><TableProperties className={`w-5 h-5 ${activeTab === 'schedule' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">Program</span></button>
            <button onClick={() => setActiveTab('report')} className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'report' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><ClipboardList className={`w-5 h-5 ${activeTab === 'report' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">{t?.dailyReportTab || 'Rapor'}</span></button>
            <button onClick={() => setActiveTab('notes')} className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'notes' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><FileText className={`w-5 h-5 ${activeTab === 'notes' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">Notlar</span></button>
          </div>
        )}

        {/* MODALLAR */}
        {isPaymentModalOpen && activeProject && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
            <div className="bg-white rounded-3xl p-6 mb-safe shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-extrabold text-gray-900 tracking-tight">{t.financialInput}</h3><p className="text-xs text-gray-500 font-medium mt-1">{t.budget}: <strong className="text-gray-800">{formatCurrency(activeProject.budget, activeProject.currency)}</strong></p></div>
                <button onClick={() => setIsPaymentModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                  <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1.5"><Target className="w-4 h-4" /> {t.plannedBudget} ({getCurrencySymbol(activeProject.currency)})</label>
                  <div className="relative"><span className="absolute left-4 top-3 text-sm font-bold text-gray-400">{getCurrencySymbol(activeProject.currency)}</span><input type="number" value={targetPaymentInput} onChange={(e) => setTargetPaymentInput(e.target.value)} className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-base font-extrabold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 shadow-sm" /></div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                  <label className="block text-[11px] font-bold text-emerald-700 mb-2 uppercase tracking-wider flex items-center gap-1.5"><Wallet className="w-4 h-4" /> {t.actualPayment} ({getCurrencySymbol(activeProject.currency)})</label>
                  <div className="relative"><span className="absolute left-4 top-3 text-sm font-bold text-emerald-600">{getCurrencySymbol(activeProject.currency)}</span><input type="number" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} className="w-full bg-white border border-emerald-300 rounded-xl pl-10 pr-4 py-2.5 text-base font-extrabold text-gray-900 focus:outline-none focus:border-emerald-600 focus:ring-2 shadow-sm" /></div>
                </div>
                <button onClick={handleUpdatePayment} className="w-full bg-blue-700 text-white py-4 mt-2 rounded-2xl font-bold shadow-md hover:bg-blue-800 active:scale-95 transition-transform text-sm tracking-wide">{t.updateCalculate}</button>
              </div>
            </div>
          </div>
        )}

        {isProjectFormOpen && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end">
            <div className="bg-white rounded-t-3xl h-[90vh] flex flex-col shadow-2xl">
              <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-3xl">
                <div><h3 className="text-lg font-extrabold text-gray-900 tracking-tight">{editingProjectId ? t.editProject : t.newProject}</h3></div>
                <button onClick={closeProjectForm} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <form id="new-project-form" onSubmit={handleSaveProject} className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-blue-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-100 pb-2"><Briefcase className="w-3.5 h-3.5"/> {t.basicInfo}</h4>
                    <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.projectName}</label><input required type="text" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 shadow-sm" /></div>
                    <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.client}</label><input type="text" value={projectForm.client} onChange={e => setProjectForm({...projectForm, client: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 shadow-sm" /></div>
                    <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.location}</label><div className="relative"><MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" /><input type="text" value={projectForm.location} onChange={e => setProjectForm({...projectForm, location: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div></div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-100 pb-2 mt-2"><Wallet className="w-3.5 h-3.5"/> {t.durationCost}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.contractDate}</label><input type="date" value={projectForm.contractDate} onChange={e => setProjectForm({...projectForm, contractDate: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.durationDays}</label><input type="number" min="1" value={projectForm.duration} onChange={e => setProjectForm({...projectForm, duration: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.totalBudget}</label>
                        <div className="flex gap-2">
                          <select value={projectForm.currency} onChange={e => setProjectForm({...projectForm, currency: e.target.value})} className="w-24 bg-gray-50 border border-gray-300 rounded-xl px-2 py-3 text-base font-extrabold focus:outline-none focus:border-blue-500"><option value="TRY">₺ (TL)</option><option value="USD">$ (USD)</option><option value="EUR">€ (EUR)</option></select>
                          <input required type="number" value={projectForm.budget} onChange={e => setProjectForm({...projectForm, budget: e.target.value})} placeholder="0.00" className="flex-1 w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-base font-bold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" />
                        </div>
                      </div>
                      <div>
                         <label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.advancePayment}</label>
                         <div className="relative">
                           <span className="absolute left-4 top-3.5 text-base font-bold text-gray-400">{getCurrencySymbol(projectForm.currency)}</span>
                           <input type="number" value={projectForm.advancePayment} onChange={e => setProjectForm({...projectForm, advancePayment: e.target.value})} placeholder="0.00" className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-base font-bold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" />
                         </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.timeExt}</label><input type="text" value={projectForm.timeExtension} onChange={e => setProjectForm({...projectForm, timeExtension: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">{t.costInc}</label><input type="text" value={projectForm.costIncrease} onChange={e => setProjectForm({...projectForm, costIncrease: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                    </div>
                  </div>
                </form>
              </div>
              <div className="p-5 border-t border-gray-200 bg-gray-50 pb-safe">
                <button type="submit" form="new-project-form" className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md hover:bg-gray-800 active:scale-95 transition-transform text-sm tracking-wide flex justify-center items-center gap-2"><FilePlus2 className="w-4 h-4" /> {editingProjectId ? t.saveChanges : t.createProject}</button>
              </div>
            </div>
          </div>
        )}

        {isProjectInfoOpen && activeProject && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
              <button onClick={openEditProject} className="absolute top-4 right-14 bg-blue-50 p-2 rounded-xl text-blue-600 z-10 hover:bg-blue-100 transition-colors shadow-sm"><Edit3 className="w-5 h-5" /></button>
              <button onClick={() => setIsProjectInfoOpen(false)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-xl text-gray-600 z-10 hover:bg-gray-200 transition-colors shadow-sm"><X className="w-5 h-5" /></button>
              <div className="p-6">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 border border-gray-200"><HardHat className="w-7 h-7 text-gray-700" /></div>
                <h3 className="text-2xl font-extrabold text-gray-900 mb-1 tracking-tight pr-20">{activeProject.name}</h3>
                <p className="text-sm text-gray-500 font-semibold mb-6 flex items-center gap-1.5"><MapPin className="w-4 h-4"/> {activeProject.location || t.unspecified}</p>
                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">{t.client}</p><p className="font-bold text-gray-800 text-sm">{activeProject.client || '-'}</p></div>
                  <div className="grid grid-cols-2 gap-3"><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">{t.contractDate}</p><p className="font-bold text-gray-800 text-sm">{formatDisplayDate(activeProject.contractDate) || '-'}</p></div><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">{t.durationDays}</p><p className="font-bold text-gray-800 text-sm">{activeProject.duration ? `${activeProject.duration}` : '-'}</p></div></div>
                  <div className="space-y-3">
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between"><p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mb-1 flex-shrink-0">{t.totalBudget}</p><p className="font-black text-blue-700 text-lg tracking-tight truncate pl-4">{formatCurrency(activeProject.budget, activeProject.currency)}</p></div>
                    {activeProject.advancePayment > 0 && (<div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between"><p className="text-[10px] text-emerald-600 uppercase font-bold tracking-widest mb-1 flex-shrink-0">{t.advance}</p><p className="font-black text-emerald-700 text-lg tracking-tight truncate pl-4">{formatCurrency(activeProject.advancePayment, activeProject.currency)}</p></div>)}
                  </div>
                  <div className="grid grid-cols-2 gap-3"><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">{t.timeExt}</p><p className="font-bold text-gray-800 text-sm">{activeProject.timeExtension || '-'}</p></div><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">{t.costInc}</p><p className="font-bold text-gray-800 text-sm">{activeProject.costIncrease || '-'}</p></div></div>
                </div>
                <div className="mt-8 pt-5 border-t border-gray-100"><button onClick={() => {setIsProjectInfoOpen(false); deleteProject(activeProject.id);}} className="w-full flex items-center justify-center gap-2 text-red-600 font-bold text-sm p-4 bg-red-50 hover:bg-red-100 rounded-2xl transition-colors"><Trash2 className="w-4 h-4" /> {t.deleteProjectBtn}</button></div>
              </div>
            </div>
          </div>
        )}

        {isAddModalOpen && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
            <div className="bg-white rounded-3xl p-6 mb-safe shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-extrabold text-gray-900 tracking-tight">{t.addRecord}</h3><p className="text-[11px] text-blue-600 font-bold mt-1 uppercase tracking-wider">{activeProject?.name}</p></div>
                <button onClick={() => setIsAddModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <label className="flex flex-col items-center justify-center gap-2 text-gray-700 bg-gray-50 border border-gray-200 p-4 rounded-2xl active:scale-95 transition-transform cursor-pointer shadow-sm hover:border-gray-300"><Camera className="w-6 h-6 text-gray-500" /><span className="text-[11px] font-bold uppercase tracking-wider">{t.camera}</span><input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" /></label>
                <label className="flex flex-col items-center justify-center gap-2 text-gray-700 bg-gray-50 border border-gray-200 p-4 rounded-2xl active:scale-95 transition-transform cursor-pointer shadow-sm hover:border-gray-300"><Upload className="w-6 h-6 text-gray-500" /><span className="text-[11px] font-bold uppercase tracking-wider">{t.gallery}</span><input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" /></label>
              </div>
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-1">{t.textVoiceNote}</h4>
                <div className="flex flex-col gap-3 relative">
                  <textarea value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder={isRecording && recordingTarget === 'note' ? t.listening : t.notePlaceholder} className={`w-full bg-white border rounded-2xl px-4 py-4 pr-12 text-sm font-medium focus:outline-none h-32 resize-none shadow-sm transition-colors ${isRecording && recordingTarget === 'note' ? 'border-red-300 bg-red-50/50 text-red-900' : 'border-gray-300 focus:border-blue-500'}`}></textarea>
                  <button onClick={() => toggleRecording('note')} className={`absolute right-3 top-3 p-2.5 rounded-xl transition-all ${isRecording && recordingTarget === 'note' ? 'bg-red-500 text-white animate-pulse shadow-md' : 'bg-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}><Mic className="w-4 h-4" /></button>
                  <button onClick={handleAddTextNote} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md hover:bg-gray-800 active:scale-95 transition-transform text-sm tracking-wide">{t.saveNote}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


