import React from 'react';
import {
  LayoutDashboard,
  ScanLine,
  Bot,
  Bell,
  Wallet,
  CreditCard,
  ShieldCheck,
  LogOut,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Trophy,
  Landmark
} from 'lucide-react';

/** Sidebar nav items (reference web app labels + our extra modules). */
const NAV_ITEMS = [
  { id: 'calculator', label: 'หน้าหลัก', short: 'หน้าหลัก', icon: LayoutDashboard, also: ['compare_strategies', 'add_debt', 'milestones'] },
  { id: 'payment_history', label: 'บันทึกชำระหนี้', short: 'ชำระ', icon: CreditCard, also: [] },
  { id: 'ocr', label: 'สแกนใบแจ้งหนี้', short: 'สแกน', icon: ScanLine, also: [] },
  { id: 'milestones', label: 'ความสำเร็จ', short: 'รางวัล', icon: Trophy, also: [] },
  { id: 'ai', label: 'ผู้ช่วยการเงิน', short: 'AI', icon: Bot, also: [] },
  { id: 'notifications', label: 'การแจ้งเตือน', short: 'แจ้งเตือน', icon: Bell, also: [] },
  { id: 'refinance', label: 'รีไฟแนนซ์', short: 'รีไฟแนนซ์', icon: Landmark, also: [], adminOnly: false },
  { id: 'admin', label: 'หลังบ้าน Admin', short: 'Admin', icon: ShieldCheck, also: [], adminOnly: true }
];

/** Topbar page title for the active tab. */
const TAB_TITLES = {
  calculator: 'หน้าหลัก',
  compare_strategies: 'เปรียบเทียบกลยุทธ์',

  payment_history: 'บันทึกชำระหนี้',
  ocr: 'สแกนใบแจ้งหนี้',
  ai: 'ผู้ช่วยการเงิน',
  notifications: 'การแจ้งเตือน',
  admin: 'หลังบ้าน Admin',
  milestones: 'ความสำเร็จและรางวัล',
  add_debt: 'เพิ่ม / แก้ไขหนี้',
  refinance: 'รีไฟแนนซ์'
};

export default function Header({
  activeTab,
  setActiveTab,
  debtCount,
  user,
  isAdmin,
  onLogout,
  selectedUserId,
  setSelectedUserId,
  isMobileView,
  setIsMobileView,
  sidebarOpen = true,
  setSidebarOpen
}) {
  // Admin-only items appended at the end for admin users
  const items = isAdmin ? NAV_ITEMS : NAV_ITEMS.filter(item => !item.adminOnly);
  const active = (item) => activeTab === item.id || item.also?.includes(activeTab);
  const go = (id) => setActiveTab(id);

  return (
    <>
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside className="app-sidebar">
        {/* Brand */}
        <button className="side-brand" onClick={() => go('calculator')}>
          <span>
            <Sparkles />
          </span>
          <div>
            <b>หนี้น้อย</b>
            <small>AI DEBT PLANNER</small>
          </div>
        </button>

        {/* Main menu */}
        <div className="side-caption">เมนูหลัก</div>
        <nav className="side-nav">
          {items.map(item => {
            const Icon = item.icon;
            const isActive = active(item);
            return (
              <button key={item.id} className={isActive ? 'active' : ''} onClick={() => go(item.id)}>
                <span className="side-icon">
                  <Icon />
                </span>
                <span>{item.label}</span>
                {item.id === 'calculator' && debtCount > 0 && <em>{debtCount}</em>}
                {isActive && <ChevronRight className="arrow" />}
              </button>
            );
          })}
        </nav>

        {/* AI insight card */}
        <div className="side-insight">
          <span>
            <Sparkles />
          </span>
          <b>AI กำลังดูแลแผนของคุณ</b>
          <p>ปรับแผนอัตโนมัติเมื่อยอดหนี้เปลี่ยน</p>
        </div>

        {/* User profile */}
        <div className="side-profile">
          <span className="avatar">{(user?.name || 'U').slice(0, 1)}</span>
          <div>
            <b>{user?.name || 'ผู้ใช้งาน'}</b>
            <small>{isAdmin ? 'ผู้ดูแลระบบ' : 'บัญชีส่วนตัว'}</small>
          </div>
          <button onClick={onLogout} title="ออกจากระบบ">
            <LogOut />
          </button>
        </div>
      </aside>

      {/* ================= TOPBAR ================= */}
      <header className="app-topbar">
        <div>
          <small>สวัสดีครับ คุณ{user?.name || 'ผู้ใช้งาน'} 👋</small>
          <h1>{TAB_TITLES[activeTab] || items.find(active)?.label || 'หนี้น้อย'}</h1>
        </div>

        <div className="top-actions">
          {isAdmin && (
            <select
              value={selectedUserId || 'all'}
              onChange={(e) => setSelectedUserId(e.target.value)}
              title="เลือกผู้ใช้ที่ต้องการดูข้อมูล"
            >
              <option value="all">ผู้ใช้ทั้งหมด</option>
              <option value="user1">User 1</option>
              <option value="user2">User 2</option>
              <option value="user3">User 3</option>
            </select>
          )}

          <button className="top-bell" onClick={() => go('notifications')} title="การแจ้งเตือน" aria-label="การแจ้งเตือน">
            <Bell />
            <i />
          </button>

          <button onClick={onLogout} title="ออกจากระบบ" className="text-rose-600!">
            <LogOut />
            ออกจากระบบ
          </button>
        </div>
      </header>

      {/* ================= MOBILE BOTTOM NAV ================= */}
      <nav className="mobile-bottom-nav">
        {items.slice(0, 5).map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={active(item) ? 'active' : ''} onClick={() => go(item.id)}>
              <span>
                <Icon />
              </span>
              <small>{item.short}</small>
            </button>
          );
        })}
      </nav>

      {/* ================= FLOATING SIDEBAR TOGGLE (arrow on left edge) ================= */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ left: sidebarOpen ? '252px' : '0' }}
        className="hidden lg:flex fixed top-1/2 -translate-y-1/2 z-50 items-center justify-center w-6 h-14 rounded-r-lg bg-white border border-l-0 border-slate-200 shadow-md hover:bg-slate-50 hover:text-indigo-600 text-slate-500 cursor-pointer transition-all"
        title={sidebarOpen ? 'ซ่อนเมนูด้านซ้าย' : 'แสดงเมนูด้านซ้าย'}
        aria-label={sidebarOpen ? 'ซ่อนเมนูด้านซ้าย' : 'แสดงเมนูด้านซ้าย'}
      >
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </>
  );
}
