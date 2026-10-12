import React from 'react';
import { ArrowRight, CreditCard, Gauge, PiggyBank, Sparkles, Target, TrendingDown, WalletCards } from 'lucide-react';
import { calculateDebtProgress, formatCurrency } from '../utils/debtEngine';

export default function MobileHome({ debts = [], paymentLogs = [], result, extraBudget = 0, onSelectTab }) {
  const progress = calculateDebtProgress(debts, paymentLogs);
  const minimumTotal = debts.reduce((sum, debt) => sum + Number(debt.minPayment || 0), 0);
  const cards = [
    { label: 'ชำระแล้ว', value: formatCurrency(progress.totalPaid), hint: `${progress.progressPercent}% ของยอดเริ่มต้น`, icon: WalletCards, tone: 'green' },
    { label: 'ยอดหนี้คงเหลือ', value: formatCurrency(progress.totalRemaining), hint: `${debts.length} รายการ`, icon: CreditCard, tone: 'violet' },
    { label: 'ปลดหนี้ในอีก', value: `${result?.totalMonths || 0} เดือน`, hint: 'ตามแผน AI ปัจจุบัน', icon: Target, tone: 'amber' },
    { label: 'ประหยัดดอกเบี้ย', value: formatCurrency(result?.totalInterestSaved || 0), hint: 'เทียบแผนจ่ายขั้นต่ำ', icon: TrendingDown, tone: 'purple' },
    { label: 'ขั้นต่ำต่อเดือน', value: formatCurrency(minimumTotal), hint: 'ยอดที่ต้องจ่ายรวม', icon: Gauge, tone: 'blue' },
    { label: 'งบโปะเพิ่ม', value: formatCurrency(extraBudget), hint: 'ต่อเดือน', icon: PiggyBank, tone: 'rose' },
  ];

  return (
    <section className="mobile-native-home">
      <div className="mobile-native-heading">
        <div><small>สวัสดีครับ 👋</small><h2>ภาพรวมวันนี้</h2></div>
        <button onClick={() => onSelectTab('notifications')} aria-label="เปิดการแจ้งเตือน">•</button>
      </div>

      <div className="mobile-period-tabs"><b>วันนี้</b><span>สัปดาห์</span><span>เดือน</span><span>ทั้งหมด</span></div>

      <div className="mobile-progress-card">
        <div><span><Sparkles /> เป้าหมายปลดหนี้</span><strong>{progress.progressPercent}%</strong></div>
        <p>คุณชำระแล้ว {formatCurrency(progress.totalPaid)}</p>
        <div className="mobile-progress-track"><i style={{ width: `${progress.progressPercent}%` }} /></div>
      </div>

      <div className="mobile-metric-grid">
        {cards.map(({ label, value, hint, icon: Icon, tone }) => (
          <article key={label} className={`tone-${tone}`}>
            <div><span>{label}</span><Icon /></div>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>

      <button className="mobile-primary-action" onClick={() => onSelectTab('payment_history')}>
        <span><CreditCard /> บันทึกชำระหนี้</span><ArrowRight />
      </button>
    </section>
  );
}
