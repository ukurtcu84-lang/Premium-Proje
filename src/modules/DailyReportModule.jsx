import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { 
  CalendarDays, CloudSun, Users, Tractor, FileText, 
  Save, Lock, Plus, Trash2, CheckCircle2, FileDown 
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

  // Veritabanı Dinleme
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
    const reportId = `${activeProject.id}_${selectedDate}`;
    
    const reportData = {
      projectId: activeProject.id, date: selectedDate, weather, temperature,
      personnel, equipment, notes, isClosed: closeDay, updatedAt: Date.now()
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

  // ==========================================
  // PROFESYONEL PDF (YAZDIRMA) MOTORU
  // ==========================================
  const handleExportPDF = () => {
    // Tarayıcıda yeni bir pencere/sekme açarak formatlı HTML oluşturuyoruz
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Lütfen pop-up engelleyiciyi kapatın veya izin verin.");
      return;
    }

    // A4 Formatında Resmi Şantiye Raporu Tasarımı (Inline CSS)
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>Günlük Rapor - ${selectedDate}</title>
        <style>
          body { font-family: 'Arial', sans-serif; color: #1e293b; line-height: 1.5; padding: 20px 40px; margin: 0; }
          .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #1e3a8a; font-size: 24px; text-transform: uppercase; }
          .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; font-weight: bold; }
          
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
          .info-table td { padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 14px; }
          .info-table td strong { color: #334155; }
          .bg-light { background-color: #f8fafc; }

          .section-title { font-size: 16px; font-weight: bold; color: #1e40af; border-bottom: 2px solid #cbd5e1; margin-bottom: 10px; padding-bottom: 5px; margin-top: 25px; }
          
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
          .data-table th { background-color: #f1f5f9; color: #475569; font-weight: bold; text-transform: uppercase; }
          .data-table .center { text-align: center; }
          .totals { font-weight: bold; background-color: #e2e8f0 !important; }

          .notes-box { background-color: #ffffff; padding: 15px; min-height: 100px; border: 1px solid #cbd5e1; white-space: pre-wrap; font-size: 13px; border-radius: 4px; }

          .footer { margin-top: 60px; display: flex; justify-content: space-between; }
          .signature-box { width: 200px; text-align: center; }
          .signature-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 8px; font-size: 14px; font-weight: bold; }
          
          @media print {
            body { padding: 0; }
            @page { margin: 1cm; size: A4 portrait; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${activeProject.name}</h1>
          <p>GÜNLÜK ŞANTİYE RAPORU</p>
        </div>
        
        <table class="info-table">
          <tr>
            <td class="bg-light" width="20%"><strong>Tarih:</strong></td>
            <td width="30%">${formatDisplayDate(selectedDate)}</td>
            <td class="bg-light" width="20%"><strong>Durum:</strong></td>
            <td width="30%">${isClosed ? 'Kapalı (Kilitli)' : 'Taslak'}</td>
          </tr>
          <tr>
            <td class="bg-light"><strong>Hava Durumu:</strong></td>
            <td>${weather}</td>
            <td class="bg-light"><strong>Sıcaklık:</strong></td>
            <td>${temperature ? `${temperature} °C` : 'Belirtilmedi'}</td>
          </tr>
        </table>

        <div class="section-title">1. PUANTAJ (PERSONEL MEVCUDU)</div>
        ${personnel.length > 0 ? `
          <table class="data-table">
            <thead><tr><th>Taşeron / Ekip Adı</th><th class="center" style="width: 120px;">Kişi Sayısı</th></tr></thead>
            <tbody>
              ${personnel.map(p => `<tr><td>${p.company || '-'}</td><td class="center">${p.count || '0'}</td></tr>`).join('')}
              <tr class="totals"><td>TOPLAM PERSONEL</td><td class="center">${totalPersonnel}</td></tr>
            </tbody>
          </table>
        ` : '<p style="font-size: 13px; color: #64748b;">Personel kaydı girilmemiş.</p>'}

        <div class="section-title">2. MAKİNE VE EKİPMAN DURUMU</div>
        ${equipment.length > 0 ? `
          <table class="data-table">
            <thead><tr><th>Makine Adı</th><th class="center" style="width: 120px;">Adet / Saat</th></tr></thead>
            <tbody>
              ${equipment.map(e => `<tr><td>${e.name || '-'}</td><td class="center">${e.count || '0'}</td></tr>`).join('')}
            </tbody>
          </table>
        ` : '<p style="font-size: 13px; color: #64748b;">Makine kaydı girilmemiş.</p>'}

        <div class="section-title">3. GÜNÜN İMALATLARI VE NOTLAR</div>
        <div class="notes-box">${notes ? notes.replace(/\n/g, '<br>') : 'Not girilmemiş.'}</div>

        <div class="footer">
          <div class="signature-box">
            <div class="signature-line">Raporu Hazırlayan<br/><span style="font-size: 11px; font-weight: normal;">(Ad, Soyad, İmza)</span></div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Şantiye Şefi / Yetkili<br/><span style="font-size: 11px; font-weight: normal;">(Ad, Soyad, İmza)</span></div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Stillerin yüklenmesi için çeyrek saniye bekleyip yazdırma diyaloğunu açar
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

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
          
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
               <CalendarDays className="w-4 h-4" /> {t?.reportDate || 'Rapor Tarihi'}
            </label>
            {/* YENİ: PDF AL BUTONU */}
            <button 
              onClick={handleExportPDF} 
              className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 px-3 py-1.5 rounded-lg text-[11px] font-extrabold tracking-wide flex items-center gap-1.5 transition-colors border border-red-100"
            >
              <FileDown className="w-3.5 h-3.5" /> PDF AL
            </button>
          </div>

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
        <div className="flex gap-3">
          <select 
            disabled={isClosed}
            value={weather} 
            onChange={(e) => setWeather(e.target.value)}
            className="flex-[2] bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 shadow-sm disabled:opacity-60"
          >
            <option value="Güneşli">☀️ Güneşli</option>
            <option value="Bulutlu">☁️ Bulutlu</option>
            <option value="Yağmurlu">🌧️ Yağmurlu</option>
            <option value="Karlı">❄️ Karlı</option>
          </select>
          <div className="flex-1 relative">
            <input 
              disabled={isClosed}
              type="number" 
              value={temperature} 
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="Derece" 
              className="w-full bg-white border border-gray-200 rounded-xl pl-3 pr-7 py-3 text-sm font-semibold text-gray-700 shadow-sm disabled:opacity-60"
            />
            <span className="absolute right-3 top-3 text-gray-400 font-bold text-xs">°C</span>
          </div>
        </div>
      </div>

      {/* PUANTAJ (PERSONEL MEVCUDU) */}
      <div className="px-5 mt-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest flex items-center gap-1.5"><Users className="w-4 h-4"/> {t?.personnelTracker || 'Puantaj (Personel)'}</h3>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold">Toplam: {totalPersonnel}</span>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-2">
          {personnel.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Henüz personel eklenmedi.</p>}
          {personnel.map((p) => (
            // DÜZELTME: Taşma sorununu çözmek için w-full ve kesin yüzdeler kullanıldı
            <div key={p.id} className="flex items-center gap-1.5 w-full">
              <input 
                disabled={isClosed}
                type="text" 
                placeholder="Firma / Ekip" 
                value={p.company} 
                onChange={(e) => updatePersonnel(p.id, 'company', e.target.value)}
                className="w-[60%] min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2.5 text-[13px] font-medium disabled:opacity-60 focus:outline-none focus:border-emerald-400"
              />
              <input 
                disabled={isClosed}
                type="number" 
                placeholder="Kişi" 
                value={p.count} 
                onChange={(e) => updatePersonnel(p.id, 'count', e.target.value)}
                className="w-[25%] min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-1 py-2.5 text-[13px] font-bold text-center disabled:opacity-60 focus:outline-none focus:border-emerald-400"
              />
              {!isClosed ? (
                <button onClick={() => removePersonnel(p.id)} className="w-[15%] flex items-center justify-center py-2 text-red-400 hover:text-red-600 bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
              ) : (
                <div className="w-[15%]"></div> // Kapalıyken hizanın bozulmaması için boşluk
              )}
            </div>
          ))}
          {!isClosed && (
            <button onClick={addPersonnelRow} className="w-full py-2.5 mt-1 border-2 border-dashed border-emerald-200 text-emerald-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Personel Ekle
            </button>
          )}
        </div>
      </div>

      {/* MAKİNE & EKİPMAN */}
      <div className="px-5 mt-6">
        <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Tractor className="w-4 h-4"/> {t?.equipmentTracker || 'Makine & Ekipman'}</h3>
        
        <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm space-y-2">
          {equipment.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Henüz makine eklenmedi.</p>}
          {equipment.map((e) => (
             // DÜZELTME: Taşma sorununu çözmek için w-full ve kesin yüzdeler kullanıldı
            <div key={e.id} className="flex items-center gap-1.5 w-full">
              <input 
                disabled={isClosed}
                type="text" 
                placeholder="Makine Adı" 
                value={e.name} 
                onChange={(evt) => updateEquipment(e.id, 'name', evt.target.value)}
                className="w-[60%] min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2.5 text-[13px] font-medium disabled:opacity-60 focus:outline-none focus:border-amber-400"
              />
              <input 
                disabled={isClosed}
                type="number" 
                placeholder="Adet" 
                value={e.count} 
                onChange={(evt) => updateEquipment(e.id, 'count', evt.target.value)}
                className="w-[25%] min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-1 py-2.5 text-[13px] font-bold text-center disabled:opacity-60 focus:outline-none focus:border-amber-400"
              />
              {!isClosed ? (
                <button onClick={() => removeEquipment(e.id)} className="w-[15%] flex items-center justify-center py-2 text-red-400 hover:text-red-600 bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
              ) : (
                <div className="w-[15%]"></div>
              )}
            </div>
          ))}
          {!isClosed && (
            <button onClick={addEquipmentRow} className="w-full py-2.5 mt-1 border-2 border-dashed border-amber-200 text-amber-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-amber-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Makine Ekle
            </button>
          )}
        </div>
      </div>

      {/* GÜNLÜK İMALAT VE NOTLAR */}
      <div className="px-5 mt-6">
        <h3 className="text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FileText className="w-4 h-4"/> {t?.dailyNotes || 'Günün İmalatları ve Notlar'}</h3>
        <textarea 
          disabled={isClosed}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bugün sahada neler yapıldı? Aksaklıklar, gelen malzemeler..."
          className="w-full bg-white border border-gray-200 rounded-2xl p-4 text-[13px] font-medium text-gray-800 shadow-sm h-32 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-60 leading-relaxed"
        ></textarea>
      </div>

      {/* KAYDET VE KAPAT BUTONLARI */}
      <div className="px-5 mt-8 space-y-3">
        {!isClosed ? (
          <>
            <button 
              onClick={() => handleSaveReport(false)} 
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-blue-500 active:scale-95 transition-transform text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-70"
            >
              <Save className="w-4 h-4" /> {isLoading ? 'Kaydediliyor...' : (t?.saveReport || 'Taslak Olarak Kaydet')}
            </button>
            <button 
              onClick={() => {
                if(window.confirm("Günü kapattıktan sonra bu rapor üzerinde değişiklik yapılamaz. Onaylıyor musunuz?")) {
                  handleSaveReport(true);
                }
              }} 
              disabled={isLoading}
              className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-gray-800 active:scale-95 transition-transform text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-70"
            >
              <Lock className="w-4 h-4 text-amber-400" /> {t?.closeDay || 'Günü Kapat (Kilitle)'}
            </button>
          </>
        ) : (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-red-800 leading-relaxed">
              Bu günün raporu yetkili tarafından kapatılmış ve kilitlenmiştir. Düzenleme yapılamaz.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}


