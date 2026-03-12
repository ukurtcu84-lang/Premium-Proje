import React, { useState, useRef, useEffect } from 'react';

// Firebase modülleri
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';

// İkonlar
import { 
  Home, CheckSquare, FileText, Plus, Camera, Mic, 
  CheckCircle2, Circle, X, Trash2, Image as ImageIcon, Edit3,
  Calendar, Clock, AlertTriangle, ArrowRightCircle, 
  ChevronLeft, Building2, MapPin, Wallet,
  Briefcase, FolderKanban, MoreVertical, FilePlus2, Upload,
  Calculator, HardHat, TrendingUp, TrendingDown, Target,
  Lock, Mail, User, LogOut, Smartphone, CloudOff
} from 'lucide-react';

// --- FIREBASE YAPILANDIRMASI ---
const firebaseConfig = {
  apiKey: "AIzaSyCeGblmCa3eZtviSBh7BC0liomA2GGdBqs", 
  authDomain: "premiumproje.firebaseapp.com",
  projectId: "premiumproje",
  storageBucket: "premiumproje.firebasestorage.app",
  messagingSenderId: "60352240448",
  appId: "1:60352240448:web:a50e1696e5a7c22ccef8a5",
  measurementId: "G-SDYSXSS2R3"
};

// Uygulama başlatma
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "premiumproje";

// --- YARDIMCI BİLEŞENLER ---
const CircularProgress = ({ progress, size = 64, strokeWidth = 6, colorClass = "text-blue-600" }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center drop-shadow-sm" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-gray-100" />
        <circle 
          cx={size/2} cy={size/2} r={radius} 
          stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" 
          strokeDasharray={circumference} strokeDashoffset={offset} 
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-1000 ease-out`} 
        />
      </svg>
      <span className="absolute text-[13px] font-extrabold text-gray-900 tracking-tighter">
        %{progress}
      </span>
    </div>
  );
};

// --- ANA UYGULAMA ---
export default function App() {
  // Yardımcı Fonksiyonlar
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getCurrentTimeStr = () => new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});

  const formatCurrency = (amount, currencyCode = 'TRY') => {
    if (amount === null || amount === undefined || amount === '') return '-';
    try {
      return new Intl.NumberFormat('tr-TR', { 
        style: 'currency', 
        currency: currencyCode, 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      return amount + " " + currencyCode;
    }
  };

  const getCurrencySymbol = (currencyCode) => {
    switch(currencyCode) {
      case 'USD': return '$';
      case 'EUR': return '€';
      default: return '₺';
    }
  };

  const calculateProgress = (payment, budget) => {
    if (!budget || budget <= 0) return 0;
    const ratio = (payment || 0) / budget;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  };

  const getFinancialVariance = (actualPayment, targetPayment, budget) => {
    if (!budget || budget <= 0) return { diff: 0, text: 'Veri Yok', color: 'text-gray-500', bg: 'bg-gray-100', icon: Circle };
    
    const actual = actualPayment || 0;
    const target = targetPayment || 0;
    
    const actualPct = Math.round((actual / budget) * 100);
    const targetPct = Math.round((target / budget) * 100);
    const diff = actualPct - targetPct;

    if (diff > 0) return { diff, text: `%${diff} İleride`, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: TrendingUp };
    if (diff < 0) return { diff, text: `%${Math.abs(diff)} Geride`, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: TrendingDown };
    return { diff: 0, text: 'Planlamaya Uygun', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: CheckCircle2 };
  };

  const calculateStatus = (deadlineDate, deadlineTime, completed) => {
    if (completed) return 'completed';
    if (!deadlineDate) return 'normal';
    const now = new Date();
    const deadline = new Date(`${deadlineDate}T${deadlineTime || '23:59'}`);
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 3600);
    if (hoursLeft < 0) return 'overdue';
    if (hoursLeft <= 24) return 'upcoming';
    return 'normal';
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getRemainingDays = (startDateStr, durationDays) => {
    if (!startDateStr || !durationDays) return { remaining: 0, total: 0, text: 'Belirtilmedi', isOverdue: false };
    
    const start = new Date(startDateStr);
    const today = new Date();
    start.setHours(0,0,0,0); today.setHours(0,0,0,0);

    const elapsedDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    const totalDuration = parseInt(durationDays);
    const remainingDays = totalDuration - elapsedDays;

    if (elapsedDays < 0) return { remaining: totalDuration, total: totalDuration, text: `Başlamadı`, isOverdue: false };
    if (remainingDays < 0) return { remaining: 0, total: totalDuration, text: `Süre Aşıldı (+${Math.abs(remainingDays)}g / ${totalDuration}g)`, isOverdue: true };

    return { remaining: remainingDays, total: totalDuration, text: `${remainingDays}g / ${totalDuration}g Kaldı`, isOverdue: false };
  };

  // LocalStorage Yükleyici
  const loadLocal = (key) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch(e) {
      return [];
    }
  };

  // --- DURUM YÖNETİMİ ---
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [projects, setProjects] = useState(() => loadLocal('premium_projects'));
  const [tasks, setTasks] = useState(() => loadLocal('premium_tasks'));
  const [notes, setNotes] = useState(() => loadLocal('premium_notes'));
  
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [taskView, setTaskView] = useState('pending');
  const [selectedPendingTasks, setSelectedPendingTasks] = useState([]); 
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
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
    name: '', location: '', client: '', contractDate: getTodayStr(), duration: '', budget: '', currency: 'TRY', timeExtension: '', costIncrease: ''
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState(null);
  const recognitionRef = useRef(null);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeTasks = tasks.filter(t => t.projectId === activeProjectId);
  const activeNotes = notes.filter(n => n.projectId === activeProjectId).sort((a,b) => b.createdAt - a.createdAt);

  // --- EFEKTLER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        if(!isOfflineMode) setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, [isOfflineMode]);

  useEffect(() => {
    if (!user || !db || isOfflineMode) return;

    const projectsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const unsubProjects = onSnapshot(projectsRef, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(fetched.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => setErrorMessage("Firestore bağlantı hatası. Ayarları kontrol edin."));

    const tasksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubProjects(); unsubTasks(); unsubNotes(); };
  }, [user, isOfflineMode]);

  // Hata mesajı temizleyici
  useEffect(() => {
    if(errorMessage) {
      const t = setTimeout(() => setErrorMessage(''), 5000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // Ses Tanıma Kurulumu
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'tr-TR';
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (rec.target === 'task') setNewTaskText(p => p + (p ? ' ' : '') + text);
        else if (rec.target === 'note') setNewNoteText(p => p + (p ? ' ' : '') + text);
        setIsRecording(false);
      };
      rec.onend = () => setIsRecording(false);
      recognitionRef.current = rec;
    }
  }, []);

  const toggleRecording = (target) => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.target = target;
        recognitionRef.current.start();
        setIsRecording(true);
      }
    }
  };

  // --- AKSİYONLAR ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setAuthError("Giriş başarısız: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsAuthenticated(false);
    setIsOfflineMode(false);
    setActiveProjectId(null);
  };

  const startOfflineMode = () => {
    setIsOfflineMode(true);
    setIsAuthenticated(true);
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const data = { ...projectForm, budget: Number(projectForm.budget), cumulativePayment: 0, targetPayment: 0, createdAt: Date.now() };
    
    if (isOfflineMode || !user) {
      const updated = [{ id: Date.now().toString(), ...data }, ...projects];
      setProjects(updated);
      localStorage.setItem('premium_projects', JSON.stringify(updated));
      setIsProjectFormOpen(false);
      setActiveProjectId(Date.now().toString());
      return;
    }
    
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), data);
      setIsProjectFormOpen(false);
    } catch (e) { setErrorMessage("Veri kaydedilemedi."); }
  };

  const deleteProject = async (id) => {
    if(!window.confirm("Silmek istediğinize emin misiniz?")) return;
    if(isOfflineMode || !user) {
      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      localStorage.setItem('premium_projects', JSON.stringify(updated));
      setActiveProjectId(null);
      return;
    }
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', id));
    setActiveProjectId(null);
  };

  const handleAddTask = async () => {
    if(!newTaskText.trim()) return;
    const data = { projectId: activeProjectId, text: newTaskText, completed: false, deadlineDate: newTaskDate, deadlineTime: newTaskTime, createdAt: Date.now() };
    
    if(isOfflineMode || !user) {
      const updated = [{ id: Date.now().toString(), ...data }, ...tasks];
      setTasks(updated);
      localStorage.setItem('premium_tasks', JSON.stringify(updated));
      setNewTaskText('');
      return;
    }
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), data);
    setNewTaskText('');
  };

  const enterProject = (id) => { setActiveProjectId(id); setActiveTab('home'); };

  // --- TASARIM PARÇALARI ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center p-6 text-white font-sans">
        <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-blue-600 p-4 rounded-2xl mb-4 shadow-lg"><Briefcase className="w-8 h-8 text-white"/></div>
            <h1 className="text-2xl font-black text-center leading-tight">Premium Proje<br/>Yönetim Paneli</h1>
          </div>

          {authError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold mb-4">{authError}</div>}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">E-Posta</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-gray-400 ml-1">Şifre</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform">
              {isLoginMode ? "Giriş Yap" : "Kayıt Ol"}
            </button>
            <button type="button" onClick={startOfflineMode} className="w-full bg-gray-100 text-gray-500 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
              <CloudOff className="w-4 h-4"/> Giriş Yapmadan Devam Et
            </button>
          </form>
          <button onClick={() => setIsLoginMode(!isLoginMode)} className="w-full text-center mt-6 text-xs font-bold text-gray-400">
            {isLoginMode ? "Hesabınız yok mu? Kayıt olun" : "Zaten hesabınız var mı? Giriş yapın"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto border-x border-gray-200 relative overflow-hidden font-sans">
      
      {/* ÜST MESAJ PANELİ */}
      {errorMessage && (
        <div className="fixed top-4 inset-x-4 z-50 bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
          <AlertTriangle className="w-5 h-5" />
          <p className="text-xs font-bold flex-1">{errorMessage}</p>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-gray-900 text-white p-5 rounded-b-[2rem] shadow-lg sticky top-0 z-40">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {activeProjectId && <button onClick={() => setActiveProjectId(null)} className="p-2 bg-gray-800 rounded-xl"><ChevronLeft/></button>}
            <div>
              <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Premium Yönetim</p>
              <h2 className="text-lg font-bold truncate max-w-[180px]">{activeProjectId ? activeProject?.name : "Portföyüm"}</h2>
            </div>
          </div>
          <div className="flex gap-2">
            {!activeProjectId && <button onClick={() => setIsProjectFormOpen(true)} className="bg-blue-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg"><Plus className="w-4 h-4"/> Yeni</button>}
            <button onClick={handleLogout} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-red-400"><LogOut className="w-5 h-5"/></button>
          </div>
        </div>
      </div>

      {/* İÇERİK */}
      <div className="flex-1 overflow-y-auto pb-32">
        {!activeProjectId ? (
          <div className="p-5 space-y-4">
            {projects.length === 0 && <div className="text-center py-20 text-gray-400 font-bold">Henüz proje eklenmedi.</div>}
            {projects.map(p => {
              const prog = calculateProgress(p.cumulativePayment, p.budget);
              return (
                <div key={p.id} onClick={() => enterProject(p.id)} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between group active:scale-95 transition-all">
                  <div className="flex-1">
                    <h3 className="font-black text-gray-900 leading-tight mb-1 group-hover:text-blue-600">{p.name}</h3>
                    <p className="text-xs text-gray-400 font-bold flex items-center gap-1"><Building2 className="w-3 h-3"/> {p.client || "-"}</p>
                    <div className="mt-3 inline-block px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black">{formatCurrency(p.budget, p.currency)}</div>
                  </div>
                  <CircularProgress progress={prog} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {activeTab === 'home' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 z-0 opacity-50"></div>
                  <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Mali İlerleme</p>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-5xl font-black text-blue-600 tracking-tighter">%{calculateProgress(activeProject?.cumulativePayment, activeProject?.budget)}</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-6">
                      <div className="h-full bg-blue-600 transition-all duration-1000" style={{width: `${calculateProgress(activeProject?.cumulativePayment, activeProject?.budget)}%`}}></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 p-3 rounded-2xl"><p className="text-[9px] font-bold text-gray-400 uppercase">Hakediş</p><p className="text-sm font-black">{formatCurrency(activeProject?.cumulativePayment, activeProject?.currency)}</p></div>
                      <div className="bg-gray-50 p-3 rounded-2xl"><p className="text-[9px] font-bold text-gray-400 uppercase">Bütçe</p><p className="text-sm font-black">{formatCurrency(activeProject?.budget, activeProject?.currency)}</p></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-gray-400 ml-2">Hızlı İşler</h4>
                  <div className="bg-white p-4 rounded-3xl border border-gray-100 space-y-3">
                    <div className="flex gap-2">
                      <input type="text" value={newTaskText} onChange={e => setNewTaskText(e.target.value)} placeholder="İş ekle..." className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-sm outline-none font-bold" />
                      <button onClick={handleAddTask} className="bg-blue-600 text-white p-3 rounded-xl"><Plus/></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ALT MENÜ */}
      {activeProjectId && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 p-4 flex justify-around items-center z-40 shadow-2xl rounded-t-[2rem]">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-600' : 'text-gray-300'}`}><Home className="w-6 h-6"/><span className="text-[10px] font-black">Özet</span></button>
          <button onClick={() => setActiveTab('tasks')} className={`flex flex-col items-center gap-1 ${activeTab === 'tasks' ? 'text-blue-600' : 'text-gray-300'}`}><CheckSquare className="w-6 h-6"/><span className="text-[10px] font-black">İşler</span></button>
          <button onClick={() => setActiveTab('notes')} className={`flex flex-col items-center gap-1 ${activeTab === 'notes' ? 'text-blue-600' : 'text-gray-300'}`}><FileText className="w-6 h-6"/><span className="text-[10px] font-black">Notlar</span></button>
        </div>
      )}

      {/* PROJE FORMU MODALI */}
      {isProjectFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-[3rem] p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom-20">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">Yeni Proje</h3>
              <button onClick={() => setIsProjectFormOpen(false)} className="p-2 bg-gray-100 rounded-full"><X/></button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <input required placeholder="Proje Adı" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 font-bold outline-none" />
              <div className="flex gap-2">
                <select value={projectForm.currency} onChange={e => setProjectForm({...projectForm, currency: e.target.value})} className="bg-gray-50 rounded-2xl px-3 font-bold border-none outline-none"><option value="TRY">₺</option><option value="USD">$</option><option value="EUR">€</option></select>
                <input required type="number" placeholder="Bütçe" value={projectForm.budget} onChange={e => setProjectForm({...projectForm, budget: e.target.value})} className="flex-1 bg-gray-50 border-none rounded-2xl px-5 py-4 font-bold outline-none" />
              </div>
              <button type="submit" className="w-full bg-gray-900 text-white py-5 rounded-[2rem] font-black shadow-xl active:scale-95 transition-transform">Projeyi Kaydet</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

