import React, { useState } from 'react';
import { 
  Bell, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  Send, 
  Check, 
  Sparkles,
  Info,
  Filter
} from 'lucide-react';
import { formatCurrency } from '../utils/debtEngine';

export default function NotificationCenter({ debts, showToast }) {
  const [paidStatusMap, setPaidStatusMap] = useState({});
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'urgent', 'paid', 'unpaid'

  // Helper to extract day number from dueDate string like "15 ของทุกเดือน" or "05 ส.ค. 2026"
  const parseDueDateNumber = (dueDateStr) => {
    if (!dueDateStr) return 15;
    const match = dueDateStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 15;
  };

  const today = new Date();
  const currentDay = today.getDate();
  const currentMonthName = today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  // Calculate days remaining & sort debts by urgency
  const notificationsList = debts.map(debt => {
    const dueDay = parseDueDateNumber(debt.dueDate);
    let daysRemaining = dueDay - currentDay;
    
    // If due day passed in current month, look forward to next month
    if (daysRemaining < 0) {
      daysRemaining += 30; // Approx 30 days cycle
    }

    let urgencyLevel = 'normal';
    if (daysRemaining <= 3) {
      urgencyLevel = 'urgent';
    } else if (daysRemaining <= 7) {
      urgencyLevel = 'warning';
    }

    return {
      ...debt,
      dueDay,
      daysRemaining,
      urgencyLevel,
      isPaidThisMonth: !!paidStatusMap[debt.id]
    };
  }).sort((a, b) => {
    if (a.isPaidThisMonth !== b.isPaidThisMonth) return a.isPaidThisMonth ? 1 : -1;
    return a.daysRemaining - b.daysRemaining;
  });

  // Apply Filter
  const filteredNotifications = notificationsList.filter(item => {
    if (filterMode === 'urgent') return item.urgencyLevel === 'urgent' && !item.isPaidThisMonth;
    if (filterMode === 'paid') return item.isPaidThisMonth;
    if (filterMode === 'unpaid') return !item.isPaidThisMonth;
    return true;
  });

  const urgentCount = notificationsList.filter(n => !n.isPaidThisMonth && n.urgencyLevel === 'urgent').length;
  const totalDueThisMonth = notificationsList.filter(n => !n.isPaidThisMonth).reduce((sum, n) => sum + Number(n.minPayment), 0);

  const handleTogglePaid = (debt) => {
    const isNowPaid = !paidStatusMap[debt.id];
    setPaidStatusMap({ ...paidStatusMap, [debt.id]: isNowPaid });

    if (isNowPaid) {
      showToast(`✅ บันทึกชำระค่างวด ${debt.name} (${formatCurrency(debt.minPayment)}) ประจำเดือนนี้เรียบร้อยแล้ว`);
    } else {
      showToast(`ℹ️ ยกเลิกสถานะชำระเงินของ ${debt.name}`);
    }
  };

  return (
    <div className="notifications-page space-y-6 animate-fade-in">
      
      {/* 1. Header Banner */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Bell className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                ศูนย์แจ้งเตือนวันครบกำหนดชำระหนี้
                {urgentCount > 0 && (
                  <span className="bg-rose-600 text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full animate-pulse">
                    ด่วน {urgentCount} รายการ
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                แจ้งเตือนกำหนดชำระประจำเดือน <span className="text-indigo-600 font-bold">{currentMonthName}</span> เพื่อป้องกันค่าปรับและดอกเบี้ยผิดนัด
              </p>
            </div>
          </div>

          <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-medium block">ค่างวดคงเหลือที่ต้องจ่ายเดือนนี้</span>
              <span className="text-lg font-black text-indigo-600">{formatCurrency(totalDueThisMonth)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filter & Cards List */}
      <div className="space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            รายการค่างวดหนี้ตามลำดับวันครบชำระ ({filteredNotifications.length} รายการ)
          </h3>

          {/* Interactive Filter Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 text-xs font-semibold">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'all' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด ({notificationsList.length})
            </button>

            <button
              onClick={() => setFilterMode('urgent')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'urgent' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ด่วน 0-3 วัน ({urgentCount})
            </button>

            <button
              onClick={() => setFilterMode('unpaid')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'unpaid' ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ยังไม่ได้จ่าย ({notificationsList.filter(n => !n.isPaidThisMonth).length})
            </button>

            <button
              onClick={() => setFilterMode('paid')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'paid' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ชำระแล้ว ({notificationsList.filter(n => n.isPaidThisMonth).length})
            </button>
          </div>
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="bg-white p-8 text-center text-slate-400 space-y-2 rounded-2xl border border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto opacity-80" />
            <p className="font-bold text-slate-800">ไม่มีรายการหนี้ในหมวดหมู่นี้</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredNotifications.map((item) => (
              <div 
                key={item.id}
                className={`p-4 transition-all border rounded-2xl ${
                  item.isPaidThisMonth 
                    ? 'opacity-70 bg-emerald-50/50 border-emerald-200' 
                    : item.urgencyLevel === 'urgent'
                    ? 'border-rose-300 bg-rose-50/50 shadow-xs'
                    : item.urgencyLevel === 'warning'
                    ? 'border-indigo-200 bg-indigo-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-base">{item.name}</span>
                      {item.isPaidThisMonth ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3" /> ชำระแล้ว
                        </span>
                      ) : item.urgencyLevel === 'urgent' ? (
                        <span className="bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> ครบกำหนดเร็วๆ นี้
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          ตามรอบปกติ
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 font-medium flex items-center gap-3">
                      <span>{item.lender}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-indigo-600 font-bold">
                        <Calendar className="w-3 h-3" /> ครบกำหนดทุกวันที่ {item.dueDay}
                      </span>
                    </div>

                    <div className="pt-2 flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">ขั้นต่ำค่างวด:</span>
                        <span className="ml-1.5 font-bold text-slate-900 text-sm">{formatCurrency(item.minPayment)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">ยอดหนี้คงเหลือ:</span>
                        <span className="ml-1.5 font-extrabold text-indigo-600">{formatCurrency(item.balance)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Days left badge */}
                  <div className="flex flex-col items-end justify-between space-y-3">
                    {!item.isPaidThisMonth && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                        item.daysRemaining === 0 
                          ? 'bg-rose-600 text-white animate-pulse'
                          : item.daysRemaining <= 3
                          ? 'bg-rose-50 text-rose-600 border border-rose-200'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}>
                        {item.daysRemaining === 0 ? 'ครบกำหนดวันนี้!' : `อีก ${item.daysRemaining} วัน`}
                      </span>
                    )}

                    <button
                      onClick={() => handleTogglePaid(item)}
                      className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        item.isPaidThisMonth
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {item.isPaidThisMonth ? 'ยกเลิกการบันทึก' : 'บันทึกจ่ายแล้ว'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Notification Tips */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex items-start gap-3 text-xs text-indigo-900 font-medium">
        <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-indigo-700">💡 เคล็ดลับการชำระหนี้ตรงเวลา:</p>
          <p>การชำระหนี้ตรงตามวันครบกำหนด ช่วยรักษาประวัติในเครดิตบูโร (NCB) และหลีกเลี่ยงการถูกปรับค่าติดตามทบดอกเบี้ยมหาศาล แนะนำให้ตั้งจ่ายอัตโนมัติล่วงหน้า 2-3 วัน</p>
        </div>
      </div>

    </div>
  );
}
