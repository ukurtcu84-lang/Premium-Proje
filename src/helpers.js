import { Circle, TrendingUp, TrendingDown, CheckCircle2 } from 'lucide-react';

export const getTodayStr = () => new Date().toISOString().split('T')[0];
export const getCurrentTimeStr = () => new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});

export const formatCurrency = (amount, currencyCode = 'TRY') => {
  if (amount === null || amount === undefined || amount === '') return '-';
  try {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(amount);
  } catch (error) {
    return `${amount} ${currencyCode}`;
  }
};

export const getCurrencySymbol = (currencyCode) => {
  switch(currencyCode) {
    case 'USD': return '$';
    case 'EUR': return '€';
    default: return '₺';
  }
};

export const calculateProgress = (payment, budget) => {
  if (!budget || budget <= 0) return 0;
  const ratio = (payment || 0) / budget;
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
};

export const getFinancialVariance = (actualPayment, targetPayment, budget, t) => {
  if (!budget || budget <= 0) return { diff: 0, text: t.noData, color: 'text-gray-500', bg: 'bg-gray-100', icon: Circle };
  
  const actual = actualPayment || 0;
  const target = targetPayment || 0;
  
  const actualPct = Math.round((actual / budget) * 100);
  const targetPct = Math.round((target / budget) * 100);
  const diff = actualPct - targetPct;

  if (diff > 0) return { diff, text: `%${diff} ${t.ahead}`, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: TrendingUp };
  if (diff < 0) return { diff, text: `%${Math.abs(diff)} ${t.behind}`, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: TrendingDown };
  return { diff: 0, text: t.onTrack, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: CheckCircle2 };
};

export const calculateStatus = (deadlineDate, deadlineTime, completed) => {
  if (completed) return 'completed';
  if (!deadlineDate) return 'normal';
  const now = new Date();
  const deadline = new Date(`${deadlineDate}T${deadlineTime || '23:59'}`);
  const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 3600);
  if (hoursLeft < 0) return 'overdue';
  if (hoursLeft <= 24) return 'upcoming';
  return 'normal';
};

export const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const getRemainingDays = (startDateStr, durationDays, t) => {
  if (!startDateStr || !durationDays) return { remaining: 0, total: 0, text: t.unspecified, isOverdue: false };
  
  const start = new Date(startDateStr);
  const today = new Date();
  start.setHours(0,0,0,0); today.setHours(0,0,0,0);

  const elapsedDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  const totalDuration = parseInt(durationDays);
  const remainingDays = totalDuration - elapsedDays;

  if (elapsedDays < 0) return { remaining: totalDuration, total: totalDuration, text: t.notStarted, isOverdue: false };
  if (remainingDays < 0) return { remaining: 0, total: totalDuration, text: `${t.timeExceeded} (+${Math.abs(remainingDays)} / ${totalDuration})`, isOverdue: true };

  return { remaining: remainingDays, total: totalDuration, text: `${remainingDays} / ${totalDuration} ${t.daysLeft}`, isOverdue: false };
};

export const calculateDays = (start, finish) => {
  if (!start || !finish) return '-';
  const s = new Date(start);
  const f = new Date(finish);
  const diffTime = Math.abs(f - s);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
};

export const loadLocal = (key) => {
  try { const data = localStorage.getItem(key); return data ? JSON.parse(data) : null; } 
  catch(e) { return null; }
};
