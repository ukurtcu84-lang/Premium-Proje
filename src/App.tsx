import React, { useState, useRef, useEffect } from 'react';
import './index.css';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

import { 
  Home, CheckSquare, FileText, Plus, Camera, Mic, 
  CheckCircle2, Circle, X, Trash2, Image as ImageIcon, Edit3,
  Calendar, Clock, AlertTriangle, ArrowRightCircle, 
  ChevronLeft, Building2, MapPin, Wallet, CalendarDays,
  Briefcase, FolderKanban, MoreVertical, FilePlus2, Upload,
  Calculator, HardHat, TrendingUp, TrendingDown, Target,
  Lock, Mail, User, LogOut, Smartphone, CloudOff
} from 'lucide-react';

// --- FIREBASE BAŞLATMA ---
const firebaseConfig = {
  apiKey: "AIzaSyCeGblmCa3eZtviSBh7BC0liomA2GGdBqs", 
  authDomain: "premiumproje.firebaseapp.com",
  projectId: "premiumproje",
  storageBucket: "premiumproje.firebasestorage.app",
  messagingSenderId: "60352240448",
  appId: "1:60352240448:web:a50e1696e5a7c22ccef8a5",
  measurementId: "G-SDYSXSS2R3"
};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase başlatma hatası:", e);
}

const appId = "premiumproje";

// Dairesel İlerleme Grafiği Bileşeni
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

export default function App() {
  // --- YARDIMCI FONKSİYONLAR ---
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getCurrentTimeStr = () => new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});

  const formatCurrency = (amount, currencyCode = 'TRY') => {
    if (amount === null || amount === undefined || amount === '') return '-';
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(amount);
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

  // LocalStorage Helper
  const loadLocal = (key) => {
    try { const data = localStorage.getItem(key); return data ? JSON.parse(data) : []; } 
    catch(e) { return []; }
  };

  // --- STATE ---
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form states for login/signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Veritabanı State'leri (İlk açılışta cihaz hafızasından yüklenir)
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

  useEffect(() => {
    setSelectedPendingTasks([]);
  }, [activeTab, taskView, activeProjectId]);

  // Hata mesajını otomatik gizleme
  useEffect(() => {
    if(errorMessage) {
      const t = setTimeout(() => setErrorMessage(''), 6000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // --- FIREBASE BAĞLANTISI ---
  useEffect(() => {
    if (!auth) {
        setAuthError("Firebase bağlantısı kurulamadı. Lütfen internetinizi kontrol edin.");
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (currentUser) {
            setUser(currentUser);
            setIsAuthenticated(true);
        } else {
            setUser(null);
            // Sadece çıkış yapıldığında authenticated false olur (Çevrimdışı modda değilse)
            if(!isOfflineMode) setIsAuthenticated(false);
        }
    });
    return () => unsubscribe();
  }, [isOfflineMode]);

  useEffect(() => {
    if (!user || !db || isOfflineMode) return;

    const projectsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const unsubProjects = onSnapshot(projectsRef, (snapshot) => {
      const fetchedProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(fetchedProjects.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => {
      console.error("Projeler yüklenemedi:", err);
      setErrorMessage("Veritabanı okuma hatası! Firebase Console'da Firestore Database'i kurduğunuzdan emin olun.");
    });

    const tasksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    return () => {
      unsubProjects();
      unsubTasks();
      unsubNotes();
    };
  }, [user, isOfflineMode]);

  // --- SES TANIMA ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
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
  }, []);

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
    e.preventDefault();
    setAuthError('');
    setIsOfflineMode(false);

    if (!auth) {
        setAuthError("Sistem bağlantısı kurulamadı, sayfayı yenileyin.");
        return;
    }

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error("Kimlik doğrulama hatası:", error);
        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                setAuthError("E-posta adresi veya şifre hatalı.");
                break;
            case 'auth/email-already-in-use':
                setAuthError("Bu e-posta adresi zaten kullanımda.");
                break;
            case 'auth/weak-password':
                setAuthError("Şifre çok zayıf. En az 6 karakter olmalı.");
                break;
            case 'auth/invalid-email':
                setAuthError("Geçersiz e-posta adresi formatı.");
                break;
            case 'auth/operation-not-allowed':
                setAuthError("E-posta/Şifre ile giriş Firebase Console'da kapalı. Lütfen açın.");
                break;
            default:
                setAuthError("Bir hata oluştu: " + error.message);
        }
    }
  };

  const handleLogout = async () => {
    try {
        if (auth) {
            await signOut(auth);
        }
        setIsAuthenticated(false);
        setActiveProjectId(null);
        setIsOfflineMode(false);
        
        // Çıkış yapıldığında cihaz hafızasındaki verileri state'e geri yükle
        setProjects(loadLocal('premium_projects'));
        setTasks(loadLocal('premium_tasks'));
        setNotes(loadLocal('premium_notes'));
    } catch (error) {
        console.error("Çıkış yapılırken hata:", error);
    }
  };

  const startOfflineMode = (e) => {
    e.preventDefault();
    setIsOfflineMode(true);
    setIsAuthenticated(true);
  };

  // --- CRUD İŞLEMLERİ (Bulut + LocalStorage Desteği) ---
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectForm.name.trim()) return;
    
    const newProject = { 
      cumulativePayment: 0, targetPayment: 0, ...projectForm, 
      budget: Number(projectForm.budget) || 0, createdAt: Date.now()
    };

    if (!user || !db || isOfflineMode) {
       const fallbackProject = { id: Date.now().toString(), ...newProject };
       const updated = [fallbackProject, ...projects];
       setProjects(updated);
       localStorage.setItem('premium_projects', JSON.stringify(updated)); // CİHAZA KAYDET
       setIsProjectFormOpen(false);
       enterProject(fallbackProject.id);
       return;
    }

    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), newProject);
      setIsProjectFormOpen(false);
      setProjectForm({name: '', location: '', client: '', contractDate: getTodayStr(), duration: '', budget: '', currency: 'TRY', timeExtension: '', costIncrease: ''});
      enterProject(docRef.id);
    } catch (error) { 
      console.error("Proje oluşturulurken hata:", error); 
      setErrorMessage("Veritabanı hatası! Firebase Console'dan 'Firestore Database' (Veritabanı) oluşturduğunuzdan emin olun.");
    }
  };

  const deleteProject = async (id) => {
    if(window.confirm("Bu projeyi ve içindeki tüm verileri kalıcı olarak silmek istediğinize emin misiniz?")) {
      if (!user || !db || isOfflineMode) {
         const updated = projects.filter(p => p.id !== id);
         setProjects(updated);
         localStorage.setItem('premium_projects', JSON.stringify(updated));
         
         const updatedTasks = tasks.filter(t => t.projectId !== id);
         setTasks(updatedTasks);
         localStorage.setItem('premium_tasks', JSON.stringify(updatedTasks));
         
         const updatedNotes = notes.filter(n => n.projectId !== id);
         setNotes(updatedNotes);
         localStorage.setItem('premium_notes', JSON.stringify(updatedNotes));
         
         setActiveProjectId(null); 
         return;
      }
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', id));
        const tasksToDelete = tasks.filter(t => t.projectId === id);
        tasksToDelete.forEach(t => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', t.id)));
        const notesToDelete = notes.filter(n => n.projectId === id);
        notesToDelete.forEach(n => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', n.id)));
        setActiveProjectId(null);
      } catch (error) { 
        console.error("Silme hatası:", error); 
        setErrorMessage("Silme işlemi başarısız oldu.");
      }
    }
  };

  const handleUpdatePayment = async () => {
    if (!activeProjectId) return;
    if (!user || !db || isOfflineMode) {
      const updated = projects.map(p => p.id === activeProjectId ? { ...p, cumulativePayment: Number(paymentInput), targetPayment: Number(targetPaymentInput) } : p);
      setProjects(updated);
      localStorage.setItem('premium_projects', JSON.stringify(updated));
      setIsPaymentModalOpen(false); setPaymentInput(''); setTargetPaymentInput(''); 
      return;
    }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', activeProjectId), {
        cumulativePayment: Number(paymentInput), targetPayment: Number(targetPaymentInput)
      });
      setIsPaymentModalOpen(false); setPaymentInput(''); setTargetPaymentInput('');
    } catch(e) { 
      console.error(e); 
      setErrorMessage("Güncelleme başarısız oldu.");
    }
  };

  const enterProject = (id) => { setActiveProjectId(id); setActiveTab('home'); setTaskView('pending'); };
  const leaveProject = () => { setActiveProjectId(null); };

  const handleAddTask = async () => {
    if (!newTaskText.trim() || !activeProjectId) return;
    const newTask = { 
      projectId: activeProjectId, text: newTaskText, completed: false, 
      deadlineDate: newTaskDate, deadlineTime: newTaskTime, createdAt: Date.now()
    };
    if (!user || !db || isOfflineMode) {
       const fallbackTask = { id: Date.now().toString(), ...newTask };
       const updated = [fallbackTask, ...tasks];
       setTasks(updated);
       localStorage.setItem('premium_tasks', JSON.stringify(updated));
       setNewTaskText(''); setNewTaskTime(''); setNewTaskDate(getTodayStr()); 
       return;
    }
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), newTask);
      setNewTaskText(''); setNewTaskTime(''); setNewTaskDate(getTodayStr());
    } catch(e) { 
      console.error(e); 
      setErrorMessage("Kayıt başarısız! Firestore Database ayarlarınızı kontrol edin.");
    }
  };

  const handleUpdateTask = async (id, newDate, newTime) => {
    if (!user || !db || isOfflineMode) {
      const updated = tasks.map(t => t.id === id ? { ...t, deadlineDate: newDate, deadlineTime: newTime } : t);
      setTasks(updated);
      localStorage.setItem('premium_tasks', JSON.stringify(updated));
      setEditingTask(null); 
      return;
    }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id), { deadlineDate: newDate, deadlineTime: newTime });
      setEditingTask(null);
    } catch(e) { console.error(e); setErrorMessage("Güncelleme başarısız."); }
  };

  const toggleTaskSelection = (id) => {
    if (selectedPendingTasks.includes(id)) {
      setSelectedPendingTasks(selectedPendingTasks.filter(taskId => taskId !== id));
    } else {
      setSelectedPendingTasks([...selectedPendingTasks, id]);
    }
  };

  const approveTaskSelection = async () => {
    if (!user || !db || isOfflineMode) {
       const updated = tasks.map(t => selectedPendingTasks.includes(t.id) ? { ...t, completed: true } : t);
       setTasks(updated);
       localStorage.setItem('premium_tasks', JSON.stringify(updated));
       setSelectedPendingTasks([]); 
       return;
    }
    try {
      const updatePromises = selectedPendingTasks.map(taskId => {
        return updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId), { completed: true });
      });
      await Promise.all(updatePromises);
      setSelectedPendingTasks([]);
    } catch(e) { console.error(e); setErrorMessage("İşlem başarısız."); }
  };

  const revertCompletedTask = async (id) => {
    if (!user || !db || isOfflineMode) {
       const updated = tasks.map(t => t.id === id ? { ...t, completed: false } : t);
       setTasks(updated);
       localStorage.setItem('premium_tasks', JSON.stringify(updated));
       return;
    }
    try { await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id), { completed: false }); } 
    catch(e) { console.error(e); setErrorMessage("İşlem başarısız."); }
  };

  const deleteTask = async (id) => {
    if (!user || !db || isOfflineMode) { 
      const updated = tasks.filter(t => t.id !== id);
      setTasks(updated);
      localStorage.setItem('premium_tasks', JSON.stringify(updated));
      return; 
    }
    try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id)); } 
    catch(e) { console.error(e); setErrorMessage("Silme başarısız."); }
  };

  const addNote = async (type, content) => {
    if (!activeProjectId) return;
    const newNote = { projectId: activeProjectId, type, content, date: getCurrentTimeStr(), createdAt: Date.now() };
    if (!user || !db || isOfflineMode) { 
      const fallbackNote = { id: Date.now().toString(), ...newNote };
      const updated = [fallbackNote, ...notes];
      setNotes(updated);
      localStorage.setItem('premium_notes', JSON.stringify(updated));
      return; 
    }
    try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'notes'), newNote); } 
    catch(e) { console.error(e); setErrorMessage("Not kaydedilemedi! Firestore Database ayarlarını kontrol edin."); }
  };

  const handleAddTextNote = () => {
    if (!newNoteText.trim()) return;
    addNote('text', newNoteText); setNewNoteText(''); setIsAddModalOpen(false);
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { addNote('image', reader.result); setIsAddModalOpen(false); };
      reader.readAsDataURL(file);
    }
  };

  // --- EKRANLAR ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center p-6 font-sans antialiased relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[100px] opacity-30 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[100px] opacity-30"></div>

        <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-8 relative z-10 border border-gray-100">
          <div className="flex justify-center mb-6">
            <div className="bg-gray-900 p-4 rounded-2xl shadow-lg border border-gray-700 relative">
              <Briefcase className="w-8 h-8 text-blue-500" />
              <div className="absolute -bottom-2 -right-2 bg-blue-600 p-1.5 rounded-lg border-2 border-white">
                <Smartphone className="w-3 h-3 text-white" />
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl font-extrabold text-center text-gray-900 mb-1 tracking-tight leading-tight">Premium Proje <br/>Yönetim Paneli</h2>
          <div className="flex justify-center mb-6">
             <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-2.5 py-1 rounded-md tracking-widest uppercase">Bulut Senkronize</span>
          </div>

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-[11px] font-semibold mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{authError}</p>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {!isLoginMode && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Ad Soyad</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Adınız Soyadınız" className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">E-Posta Adresi</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="ornek@sirket.com" className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
            </div>
            
            <button type="submit" className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all tracking-wide mt-2">
              {isLoginMode ? "Sisteme Giriş Yap" : "Kayıt Ol ve Başla"}
            </button>

            <div className="pt-2">
                <button type="button" onClick={startOfflineMode} className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 active:scale-95 transition-all text-xs flex items-center justify-center gap-2">
                    <CloudOff className="w-4 h-4" /> Giriş Yapmadan Devam Et (Çevrimdışı)
                </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-[13px] font-bold text-gray-500 hover:text-blue-600 transition-colors">
              {isLoginMode ? "Hesabınız yok mu? Kayıt Olun" : "Zaten hesabınız var mı? Giriş Yapın"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased selection:bg-blue-100 selection:text-blue-900 relative">
      
      {/* GLOBAL HATA MESAJI EKRANI */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-sm bg-red-500 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-4">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-bold leading-relaxed flex-1">{errorMessage}</p>
          <button onClick={() => setErrorMessage('')} className="p-1 bg-red-600 rounded-lg hover:bg-red-700 active:scale-95"><X className="w-4 h-4"/></button>
        </div>
      )}

      <div className="w-full h-full max-w-md mx-auto bg-gray-50 relative shadow-2xl min-h-screen flex flex-col border-x border-gray-200 overflow-hidden">
        
        {/* HEADER (Proje İçi) */}
        {activeProjectId && (
          <div className="bg-gray-900 text-white px-4 py-4 flex items-center justify-between rounded-b-2xl shadow-md sticky top-0 z-20 border-b border-gray-800">
            <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
              <button onClick={leaveProject} className="p-1.5 bg-gray-800 rounded-lg hover:bg-gray-700 active:scale-95 transition-all flex-shrink-0 border border-gray-700"><ChevronLeft className="w-6 h-6 text-gray-300" /></button>
              <div className="flex-1 truncate ml-1">
                <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest mb-0.5">Premium Yönetim</p>
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
            {activeTab === 'notes' && renderProjectNotes()}
          </div>
        )}

        {/* ALT MENÜ */}
        {activeProjectId && (
          <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center pb-safe z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
            <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'home' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><Home className={`w-5 h-5 ${activeTab === 'home' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">Özet</span></button>
            <button onClick={() => setActiveTab('tasks')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'tasks' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><CheckSquare className={`w-5 h-5 ${activeTab === 'tasks' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">İşler</span></button>
            <button onClick={() => setActiveTab('notes')} className={`flex flex-col items-center gap-1 w-16 transition-colors ${activeTab === 'notes' ? 'text-blue-700' : 'text-gray-400 hover:text-gray-600'}`}><FileText className={`w-5 h-5 ${activeTab === 'notes' && 'stroke-[2.5px]'}`} /><span className="text-[10px] font-bold tracking-wide">Notlar</span></button>
          </div>
        )}

        {/* MODALLAR */}
        {isPaymentModalOpen && activeProject && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
            <div className="bg-white rounded-3xl p-6 mb-safe shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-extrabold text-gray-900 tracking-tight">Finansal Veri Girişi</h3><p className="text-xs text-gray-500 font-medium mt-1">Bütçe: <strong className="text-gray-800">{formatCurrency(activeProject.budget, activeProject.currency)}</strong></p></div>
                <button onClick={() => setIsPaymentModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                  <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1.5"><Target className="w-4 h-4" /> Planlanan Ödenek ({getCurrencySymbol(activeProject.currency)})</label>
                  <div className="relative"><span className="absolute left-4 top-3 text-sm font-bold text-gray-400">{getCurrencySymbol(activeProject.currency)}</span><input type="number" value={targetPaymentInput} onChange={(e) => setTargetPaymentInput(e.target.value)} className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 text-base font-extrabold text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-2 shadow-sm" /></div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                  <label className="block text-[11px] font-bold text-emerald-700 mb-2 uppercase tracking-wider flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Gerçekleşen Hakediş ({getCurrencySymbol(activeProject.currency)})</label>
                  <div className="relative"><span className="absolute left-4 top-3 text-sm font-bold text-emerald-600">{getCurrencySymbol(activeProject.currency)}</span><input type="number" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} className="w-full bg-white border border-emerald-300 rounded-xl pl-10 pr-4 py-2.5 text-base font-extrabold text-gray-900 focus:outline-none focus:border-emerald-600 focus:ring-2 shadow-sm" /></div>
                </div>
                <button onClick={handleUpdatePayment} className="w-full bg-blue-700 text-white py-4 mt-2 rounded-2xl font-bold shadow-md hover:bg-blue-800 active:scale-95 transition-transform text-sm tracking-wide">Güncelle ve Hesapla</button>
              </div>
            </div>
          </div>
        )}

        {isProjectFormOpen && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end">
            <div className="bg-white rounded-t-3xl h-[90vh] flex flex-col shadow-2xl">
              <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-3xl">
                <div><h3 className="text-lg font-extrabold text-gray-900 tracking-tight">Yeni Proje Kartı</h3></div>
                <button onClick={() => setIsProjectFormOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <form id="new-project-form" onSubmit={handleCreateProject} className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-blue-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-100 pb-2"><Briefcase className="w-3.5 h-3.5"/> Temel Bilgiler</h4>
                    <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Proje Adı *</label><input required type="text" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 shadow-sm" /></div>
                    <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">İdare / Müşteri</label><input type="text" value={projectForm.client} onChange={e => setProjectForm({...projectForm, client: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 shadow-sm" /></div>
                    <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Proje Yeri</label><div className="relative"><MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" /><input type="text" value={projectForm.location} onChange={e => setProjectForm({...projectForm, location: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div></div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-100 pb-2 mt-2"><Wallet className="w-3.5 h-3.5"/> Süre & Maliyet</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Sözleşme Tarihi</label><input type="date" value={projectForm.contractDate} onChange={e => setProjectForm({...projectForm, contractDate: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Süresi (Gün)</label><input type="number" min="1" value={projectForm.duration} onChange={e => setProjectForm({...projectForm, duration: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">İşin Bedeli (Bütçe)</label>
                      <div className="flex gap-2">
                        <select value={projectForm.currency} onChange={e => setProjectForm({...projectForm, currency: e.target.value})} className="w-24 bg-gray-50 border border-gray-300 rounded-xl px-2 py-3 text-sm font-extrabold focus:outline-none focus:border-blue-500"><option value="TRY">₺ (TL)</option><option value="USD">$ (USD)</option><option value="EUR">€ (EUR)</option></select>
                        <input required type="number" value={projectForm.budget} onChange={e => setProjectForm({...projectForm, budget: e.target.value})} placeholder="Sadece rakam..." className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">Süre Uzatımı</label><input type="text" value={projectForm.timeExtension} onChange={e => setProjectForm({...projectForm, timeExtension: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                      <div><label className="block text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">İş Artış Tutarı</label><input type="text" value={projectForm.costIncrease} onChange={e => setProjectForm({...projectForm, costIncrease: e.target.value})} className="w-full bg-white border border-gray-300 rounded-xl px-3 py-3 text-sm font-semibold text-gray-900 focus:outline-none focus:border-blue-500 shadow-sm" /></div>
                    </div>
                  </div>
                </form>
              </div>
              <div className="p-5 border-t border-gray-200 bg-gray-50 pb-safe">
                <button type="submit" form="new-project-form" className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md hover:bg-gray-800 active:scale-95 transition-transform text-sm tracking-wide flex justify-center items-center gap-2"><FilePlus2 className="w-4 h-4" /> Projeyi Oluştur</button>
              </div>
            </div>
          </div>
        )}

        {isProjectInfoOpen && activeProject && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
              <button onClick={() => setIsProjectInfoOpen(false)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-xl text-gray-600 z-10 hover:bg-gray-200"><X className="w-5 h-5" /></button>
              <div className="p-6">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 border border-gray-200"><HardHat className="w-7 h-7 text-gray-700" /></div>
                <h3 className="text-2xl font-extrabold text-gray-900 mb-1 tracking-tight">{activeProject.name}</h3>
                <p className="text-sm text-gray-500 font-semibold mb-6 flex items-center gap-1.5"><MapPin className="w-4 h-4"/> {activeProject.location || 'Konum belirtilmedi'}</p>
                <div className="space-y-3">
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">İdare / Müşteri</p><p className="font-bold text-gray-800 text-sm">{activeProject.client || '-'}</p></div>
                  <div className="grid grid-cols-2 gap-3"><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Sözleşme Tarihi</p><p className="font-bold text-gray-800 text-sm">{formatDisplayDate(activeProject.contractDate) || '-'}</p></div><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">İşin Süresi</p><p className="font-bold text-gray-800 text-sm">{activeProject.duration ? `${activeProject.duration} Gün` : '-'}</p></div></div>
                  <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm"><p className="text-[10px] text-blue-500 uppercase font-bold tracking-widest mb-1">İşin Bedeli (Bütçe)</p><p className="font-black text-blue-700 text-xl tracking-tight">{formatCurrency(activeProject.budget, activeProject.currency)}</p></div>
                  <div className="grid grid-cols-2 gap-3"><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Süre Uzatımı</p><p className="font-bold text-gray-800 text-sm">{activeProject.timeExtension || '-'}</p></div><div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm"><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">İş Artış Tutarı</p><p className="font-bold text-gray-800 text-sm">{activeProject.costIncrease || '-'}</p></div></div>
                </div>
                <div className="mt-8 pt-5 border-t border-gray-100"><button onClick={() => {setIsProjectInfoOpen(false); deleteProject(activeProject.id);}} className="w-full flex items-center justify-center gap-2 text-red-600 font-bold text-sm p-4 bg-red-50 hover:bg-red-100 rounded-2xl transition-colors"><Trash2 className="w-4 h-4" /> Projeyi Kalıcı Olarak Sil</button></div>
              </div>
            </div>
          </div>
        )}

        {isAddModalOpen && (
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex flex-col justify-end p-4">
            <div className="bg-white rounded-3xl p-6 mb-safe shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-extrabold text-gray-900 tracking-tight">Kayıt Ekle</h3><p className="text-[11px] text-blue-600 font-bold mt-1 uppercase tracking-wider">{activeProject?.name}</p></div>
                <button onClick={() => setIsAddModalOpen(false)} className="bg-gray-100 p-2 rounded-xl active:bg-gray-200 text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <label className="flex flex-col items-center justify-center gap-2 text-gray-700 bg-gray-50 border border-gray-200 p-4 rounded-2xl active:scale-95 transition-transform cursor-pointer shadow-sm hover:border-gray-300"><Camera className="w-6 h-6 text-gray-500" /><span className="text-[11px] font-bold uppercase tracking-wider">Kamera</span><input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" /></label>
                <label className="flex flex-col items-center justify-center gap-2 text-gray-700 bg-gray-50 border border-gray-200 p-4 rounded-2xl active:scale-95 transition-transform cursor-pointer shadow-sm hover:border-gray-300"><Upload className="w-6 h-6 text-gray-500" /><span className="text-[11px] font-bold uppercase tracking-wider">Galeri</span><input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" /></label>
              </div>
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-1">Yazılı & Sesli Not</h4>
                <div className="flex flex-col gap-3 relative">
                  <textarea value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder={isRecording && recordingTarget === 'note' ? 'Sizi dinliyorum...' : "Toplantı, saha durumu, revizyon talebi..."} className={`w-full bg-white border rounded-2xl px-4 py-4 pr-12 text-sm font-medium focus:outline-none h-32 resize-none shadow-sm transition-colors ${isRecording && recordingTarget === 'note' ? 'border-red-300 bg-red-50/50 text-red-900' : 'border-gray-300 focus:border-blue-500'}`}></textarea>
                  <button onClick={() => toggleRecording('note')} className={`absolute right-3 top-3 p-2.5 rounded-xl transition-all ${isRecording && recordingTarget === 'note' ? 'bg-red-500 text-white animate-pulse shadow-md' : 'bg-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}><Mic className="w-4 h-4" /></button>
                  <button onClick={handleAddTextNote} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-md hover:bg-gray-800 active:scale-95 transition-transform text-sm tracking-wide">Notu Kaydet</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


