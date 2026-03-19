// ... existing code ...
import { CircularProgress } from './CircularProgress';
import ScheduleModule from './modules/ScheduleModule';
import DailyReportModule from './modules/DailyReportModule';

// FIREBASE FONKSİYONLARI
// ... existing code ...
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
// ... existing code ...
  const activeTasks = tasks.filter(t => t.projectId === activeProjectId);
  const activeNotes = notes.filter(n => n.projectId === activeProjectId).sort((a,b) => b.createdAt - a.createdAt);

  useEffect(() => {
    setSelectedPendingTasks([]);
  }, [activeTab, taskView, activeProjectId]);
// ... existing code ...
        {/* ANA İÇERİK */}
        {!activeProjectId ? renderPortfolio() : (
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'home' && renderProjectDashboard()}
            {activeTab === 'tasks' && renderProjectTasks()}
            {activeTab === 'schedule' && (
              <ScheduleModule 
                activeProject={activeProject} 
                appId={appId} user={user} db={db} 
                isOfflineMode={isOfflineMode} t={t} 
              />
            )}
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
// ... existing code ...

