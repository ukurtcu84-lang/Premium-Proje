import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { 
  CalendarDays, CloudSun, Users, Tractor, FileText, 
  Save, Lock, Plus, Trash2, CheckCircle2 
} from 'lucide-react';

const getTodayStr = () => new Date().toISOString().split('T')[0];

export default function DailyReportModule({ activeProject, appId, user, db, isOfflineMode, t }) {
  const [reports, setReports] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Form State
  const [weather, setWeather] = useState('Güneşli');
  const [temperature, setTemperature] = useState('');
  const [personnel, setPersonnel] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [notes, setNotes] = useState('');
  const [isClosed, setIsClosed] = useState(false);

  // Veritabanı Dinleme (Projenin Tüm Raporları)
  useEffect(() => {
    if (!user || !db || isOfflineMode || !activeProject) return;
    const reportsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'dailyReports');
    const unsub = onSnapshot(reportsRef, (snapshot) => {
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReports(allData.filter(r => r.projectId === activeProject.id));
    });
    return () => unsub();
  }, [user, isOfflineMode, activeProject, appId, db]);

  // Seçilen tarihe göre formu doldur
  useEffect(() => {
    const currentReport = reports.find(r => r.date === selectedDate);
    if (currentReport) {
      setWeather(currentReport.weather || 'Güneşli');
      setTemperature(currentReport.temperature || '');
      setPersonnel(currentReport.personnel || []);
      setEquipment(currentReport.equipment || []);
      setNotes(currentReport.notes || '');
      setIsClosed(currentReport.isClosed || false);
    } else {
      // O gün için rapor yoksa formu sıfırla
      setWeather('Güneşli');
      setTemperature('');
      setPersonnel([]);
      setEquipment([]);
      setNotes('');
      setIsClosed(false);
    }
  }, [selectedDate, reports]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleSaveReport = async (closeDay = false) => {
    if (isClosed) return showToast(t?.dayClosedMsg || "Günü kapatılmış rapor değiştirilemez.");
    
    setIsLoading(true);
    // Benzersiz ID olarak proje ID + Tarih kullanıyoruz
    const reportId = `${activeProject.id}_${selectedDate}`;
    
    const reportData = {
      projectId: activeProject.id,
      date: selectedDate,
      weather,
      temperature,
      personnel,
      equipment,
      notes,
      isClosed: closeDay,
      updatedAt: Date.now()
    };

    try {
      if (!user || !db || isOfflineMode) {
         showToast("Çevrimdışı modda kaydedildi (Simülasyon).");
      } else {
         await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailyReports', reportId), reportData);
         showToast(closeDay ? "Gün kapatıldı ve kilitlendi." : "Rapor başarıyla kaydedildi.");
      }
    } catch (error) {
      console.error(error);
      showToast("Kayıt sırasında hata oluştu!");
    } finally {
      setIsLoading(false);
    }
  };

  // Dinamik Liste İşlemleri
  const addPersonnelRow = () => setPersonnel([...personnel, { id: Date.now(), company: '', count: '' }]);
  const updatePersonnel = (id, field, value) => setPersonnel(personnel.map(p => p.id === id ? { ...p, [field]: value } : p));
  const removePersonnel = (id) => setPersonnel(personnel.filter(p => p.id !== id));

  const addEquipmentRow = () => setEquipment([...equipment, { id: Date.now(), name: '', count: '' }]);
  const updateEquipment = (id, field, value) => setEquipment(equipment.map(e => e.id === id ? { ...e, [field]: value } : e));
  const removeEquipment = (id) => setEquipment(equipment.filter(e => e.id !== id));

  const totalPersonnel = personnel.reduce((sum, p) => sum + (parseInt(p.count) || 0), 0);

  return (
    <div className="pb-28 animate-in fade-in duration-300">
      
      {/* TOAST MESAJI */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {toastMessage}
        </div>
      )}

      {/* ÜST BİLGİ VE TARİH SEÇİCİ */}
      <div className="px-5 pt-6 pb-2">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-3 relative overflow-hidden">
          {isClosed && (
             <div className="absolute top-0 right-0 bg-red-500 text-white px-3 py-1 rounded-bl-xl text-[10px] font-extrabold flex items-center gap-1 shadow-sm">
               <Lock className="w-3 h-3" /> GÜN KAPALI
             </div>
          )}
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
             <CalendarDays className="w-4 h-4" /> {t?.reportDate || 'Rapor Tarihi'}
          </label>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-bold text-blue-700 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* HAVA DURUMU */}
      <div className="px-5 mt-4">
        <h3 className="text-[11px] font-bold text-blue-700 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CloudSun className="w-4 h-4"/> {t?.weather || 'Hava Durumu'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <select disabled={isClosed} value={weather} onChange={(e) => setWeather(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 shadow-sm disabled:opacity-60">
            <option value="Güneşli">☀️ Güneşli</option>
            <option value="Bulutlu">☁️ Bulutlu</option>
            <option value="Yağmurlu">🌧️ Yağmurlu</option>
            <option value="Karlı">❄️ Karlı</option>
          </select>
          <div className="relative">
            <input disabled={isClosed} type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="Derece..." className="w-full bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-3 text-sm font-semibold text-gray-700 shadow-sm disabled:opacity-60" />
            <span className="absolute right-4 top-3 text-gray-400 font-bold">°C</span>
          </div>
        </div>
      </div>

      {/* PUANTAJ (PERSONEL MEVCUDU) */}
      <div className="px-5 mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1.5"><Users className="w-4 h-4"/> {t?.personnelTracker || 'Puantaj (Personel)'}</h3>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold">Toplam: {totalPersonnel}</span>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-3">
          {personnel.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Henüz personel eklenmedi.</p>}
          {personnel.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input disabled={isClosed} type="text" placeholder="Taşeron / Ekip Adı" value={p.company} onChange={(e) => updatePersonnel(p.id, 'company', e.target.value)} className="flex-[2] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" />
              <input disabled={isClosed} type="number" placeholder="Kişi" value={p.count} onChange={(e) => updatePersonnel(p.id, 'count', e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-center disabled:opacity-60" />
              {!isClosed && <button onClick={() => removePersonnel(p.id)} className="p-2 text-red-400 hover:text-red-600 bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
            </div>
          ))}
          {!isClosed && <button onClick={addPersonnelRow} className="w-full py-2 border-2 border-dashed border-emerald-200 text-emerald-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-50 transition-colors"><Plus className="w-3.5 h-3.5" /> Personel Ekle</button>}
        </div>
      </div>

      {/* MAKİNE & EKİPMAN */}
      <div className="px-5 mt-6">
        <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Tractor className="w-4 h-4"/> {t?.equipmentTracker || 'Makine & Ekipman'}</h3>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-3">
          {equipment.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Henüz makine eklenmedi.</p>}
          {equipment.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <input disabled={isClosed} type="text" placeholder="Makine Adı (Örn: Ekskavatör)" value={e.name} onChange={(evt) => updateEquipment(e.id, 'name', evt.target.value)} className="flex-[2] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" />
              <input disabled={isClosed} type="number" placeholder="Adet" value={e.count} onChange={(evt) => updateEquipment(e.id, 'count', evt.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-center disabled:opacity-60" />
              {!isClosed && <button onClick={() => removeEquipment(e.id)} className="p-2 text-red-400 hover:text-red-600 bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
            </div>
          ))}
          {!isClosed && <button onClick={addEquipmentRow} className="w-full py-2 border-2 border-dashed border-amber-200 text-amber-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-amber-50 transition-colors"><Plus className="w-3.5 h-3.5" /> Makine Ekle</button>}
        </div>
      </div>

      {/* GÜNLÜK İMALAT VE NOTLAR */}
      <div className="px-5 mt-6">
        <h3 className="text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4"/> {t?.dailyNotes || 'Günün İmalatları ve Notlar'}</h3>
        <textarea 
          disabled={isClosed} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Bugün sahada neler yapıldı? Aksaklıklar, gelen malzemeler..."
          className="w-full bg-white border border-gray-200 rounded-2xl p-4 text-sm font-medium text-gray-800 shadow-sm h-32 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-60"
        ></textarea>
      </div>

      {/* KAYDET VE KAPAT BUTONLARI */}
      <div className="px-5 mt-8 space-y-3">
        {!isClosed ? (
          <>
            <button onClick={() => handleSaveReport(false)} disabled={isLoading} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-blue-500 active:scale-95 transition-transform text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-70">
              <Save className="w-4 h-4" /> {isLoading ? 'Kaydediliyor...' : (t?.saveReport || 'Taslak Olarak Kaydet')}
            </button>
            <button onClick={() => { if(window.confirm("Günü kapattıktan sonra bu rapor üzerinde değişiklik yapılamaz. Onaylıyor musunuz?")) handleSaveReport(true); }} disabled={isLoading} className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-800 active:scale-95 transition-transform text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-70">
              <Lock className="w-4 h-4 text-amber-400" /> {t?.closeDay || 'Günü Kapat (Kilitle)'}
            </button>
          </>
        ) : (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-xs font-bold text-red-800 leading-relaxed">Bu günün raporu yetkili tarafından kapatılmış ve kilitlenmiştir. Düzenleme yapılamaz.</p>
          </div>
        )}
      </div>

    </div>
  );
}


