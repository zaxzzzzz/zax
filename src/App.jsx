import React, { useState } from 'react';
import { useAuth, useIsAdmin } from './contexts/AuthContext.jsx';
import LoginPage from './components/LoginPage';
import RestrictedAccessPage from './components/RestrictedAccessPage';
import Header from './components/Header';
import HeroOverview from './components/HeroOverview';
import MobileHome from './components/MobileHome';
import DebtCalculator from './components/DebtCalculator';
import OcrScanner from './components/OcrScanner';
import AiAssistant from './components/AiAssistant';
import AdminDashboard from './components/AdminDashboard';
import NotificationCenter from './components/NotificationCenter';

// Dedicated Pages
import CompareStrategiesPage from './components/CompareStrategiesPage';
import AddEditDebtPage from './components/AddEditDebtPage';
import MilestonesPage from './components/MilestonesPage';
import PaymentHistoryPage from './components/PaymentHistoryPage';
import RefinanceDashboard from './components/RefinanceDashboard';

import { INITIAL_DEBTS, getViewDataForUser, saveUserDataToStorage, resetUserDataStorage, loadUserDataFromCloudOrStorage } from './data/mockData';
import { subscribeToUserDebts } from './services/supabaseService';
import { calculateDebtPayoff } from './utils/debtEngine';
import {
  CheckCircle2,
  Wifi,
  Battery,
  Signal
} from 'lucide-react';

import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  // Auth hooks
  const { user, login, logout, loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // If not authenticated, show login page
  if (!user) {
    return <LoginPage onLoginSuccess={login} />;
  }

  // Main app component wrapped in top-level ErrorBoundary
  return (
    <ErrorBoundary componentName="ระบบหลัก (Nee Noi App)">
      <AppContent isAdmin={isAdmin} user={user} onLogout={logout} />
    </ErrorBoundary>
  );
}

function AppContent({ isAdmin, user, onLogout }) {
  const [selectedUserId, setSelectedUserId] = useState(isAdmin ? 'all' : user?.id || 'user1');
  const activeUserId = (isAdmin && selectedUserId && selectedUserId !== 'all') ? selectedUserId : (user?.id || 'user1');
  
  const [viewData, setViewData] = useState(() => getViewDataForUser(user?.id || 'user1', selectedUserId));
  const [debts, setDebts] = useState(viewData.debts || []);
  const [extraBudget, setExtraBudget] = useState(viewData.extraBudget ?? 5000);
  const [paymentLogs, setPaymentLogs] = useState(viewData.paymentLogs || []);
  const [savedPlans, setSavedPlans] = useState(viewData.savedPlans || []);

  const [initialPaymentAmount, setInitialPaymentAmount] = useState('');
  const [activeTab, setActiveTab] = useState('calculator');
  const [editingDebt, setEditingDebt] = useState(null);
  const [manualStrategy, setManualStrategy] = useState(viewData.strategy || null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('nee_noi_sidebar_open');
    return saved === null ? true : saved === 'true';
  });
  const [toastMessage, setToastMessage] = useState(null);

  // Persist sidebar collapsed state
  React.useEffect(() => {
    localStorage.setItem('nee_noi_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);

  // Sync state when selected user or logged in user changes & subscribe to Realtime Cloud DB updates
  React.useEffect(() => {
    if (!user) return;

    if (isAdmin && selectedUserId === 'user1' && user.id === 'admin') {
      setSelectedUserId('all');
    }

    let isSubscribed = true;

    async function loadData() {
      const nextUserId = isAdmin ? (selectedUserId || 'all') : user.id;
      let nextData = getViewDataForUser(user.id, nextUserId);

      // Async fetch from Supabase Cloud DB
      if (nextUserId !== 'all' && nextUserId !== 'admin') {
        const cloudData = await loadUserDataFromCloudOrStorage(nextUserId);
        if (cloudData && isSubscribed) {
          nextData = cloudData;
        }
      }

      if (isSubscribed) {
        setViewData(nextData);
        setDebts(nextData.debts || []);
        setExtraBudget(nextData.extraBudget ?? 0);
        setPaymentLogs(nextData.paymentLogs || []);
        setSavedPlans(nextData.savedPlans || []);
        setManualStrategy(nextData.strategy || null);
      }
    }

    loadData();

    if (!isAdmin && activeTab === 'admin') {
      setActiveTab('calculator');
    }

    // Set up Supabase Realtime listener for live multi-device updates
    let unsubscribeRealtime = () => {};
    if (activeUserId && activeUserId !== 'admin' && activeUserId !== 'all') {
      unsubscribeRealtime = subscribeToUserDebts(activeUserId, (updatedCloudData) => {
        if (!isSubscribed) return;
        setDebts(updatedCloudData.debts || []);
        setExtraBudget(updatedCloudData.extraBudget ?? 0);
        setPaymentLogs(updatedCloudData.paymentLogs || []);
        setSavedPlans(updatedCloudData.savedPlans || []);
        setManualStrategy(updatedCloudData.strategy || null);
        showToast('⚡ ซิงก์ข้อมูลล่าสุดเรียบร้อยแล้ว');
      });
    }

    return () => {
      isSubscribed = false;
      unsubscribeRealtime();
    };
  }, [user, isAdmin, selectedUserId, activeUserId]);

  // AUTO SAVE TO LOCALSTORAGE
  React.useEffect(() => {
    if (!user || (isAdmin && selectedUserId === 'all')) return;
    
    saveUserDataToStorage(activeUserId, {
      debts,
      extraBudget,
      paymentLogs,
      savedPlans,
      strategy: manualStrategy
    });
  }, [debts, extraBudget, paymentLogs, savedPlans, manualStrategy, activeUserId, user, isAdmin, selectedUserId]);

  // Overall payoff calculation
  const result = calculateDebtPayoff(debts, extraBudget, manualStrategy);

  // Toast trigger
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Auto-Save Current Plan Snapshot handler
  const handleSavePlanSnapshot = (customTitle = '') => {
    const newPlan = {
      id: `plan-${Date.now()}`,
      title: customTitle || `แผนปลดหนี้ ${new Date().toLocaleDateString('th-TH')}`,
      createdAt: new Date().toISOString(),
      dateStr: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      debtsSnapshot: debts.map(d => ({ ...d })),
      extraBudget,
      activeStrategy: manualStrategy || result.activeStrategyKey,
      payoffDateStr: result.payoffDateStr,
      totalInterestSaved: result.totalInterestSaved,
      monthsSaved: result.monthsSaved,
      debtCount: debts.length
    };

    const updated = [newPlan, ...savedPlans];
    setSavedPlans(updated);
    showToast(`💾 บันทึกแผนชำระหนี้ "${newPlan.title}" เรียบร้อยแล้ว`);
  };

  // Reset user data handler
  const handleResetData = () => {
    if (confirm('คุณต้องการรีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นใช่หรือไม่?')) {
      resetUserDataStorage(activeUserId);
      const resetData = getViewDataForUser(user.id, selectedUserId);
      setDebts(resetData.debts);
      setExtraBudget(resetData.extraBudget);
      setPaymentLogs(resetData.paymentLogs);
      setSavedPlans(resetData.savedPlans);
      showToast('🔄 รีเซ็ตข้อมูลกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว');
    }
  };

  // OCR import handler
  const handleImportScannedDebts = (newDebts) => {
    setDebts(prev => {
      const merged = [...prev, ...newDebts];
      return merged;
    });
    showToast(`🎉 นำเข้าหนี้ใหม่ ${newDebts.length} รายการเข้าสู่ระบบและบันทึกอัตโนมัติแล้ว`);
  };


  // Add / Edit Debt Handler
  const handleSaveDebtItem = (debtData) => {
    const existingIndex = debts.findIndex(d => d.id === debtData.id);
    if (existingIndex >= 0) {
      setDebts(debts.map(d => d.id === debtData.id ? debtData : d));
      showToast(`✏️ บันทึกการแก้ไขข้อมูล ${debtData.name} สำเร็จแล้ว`);
    } else {
      setDebts([...debts, debtData]);
      showToast(`🎉 เพิ่มรายการหนี้ใหม่ ${debtData.name} เข้าสู่ระบบเรียบร้อยแล้ว`);
    }
    setEditingDebt(null);
    setActiveTab('calculator');
  };

  const handleOpenAddDebtPage = () => {
    setActiveTab('ocr');
  };

  const handleOpenEditDebtPage = (debt) => {
    setEditingDebt(debt);
    setActiveTab('add_debt');
  };

  const handleNavigateToPaymentWithAmount = (amount) => {
    setInitialPaymentAmount(amount ? String(amount) : '');
    setActiveTab('payment_history');
  };

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500 selection:text-white ${isMobileView ? 'mobile-mode' : ''} ${!sidebarOpen ? 'sidebar-closed' : ''}`}>
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 animate-fade-in">
          <div className="bg-slate-900 text-white font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            <span className="text-xs sm:text-sm">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Wrapper Container (phone frame when mobile view is on) */}
      <div className={isMobileView ? "mobile-app-wrapper py-2 px-1 my-4 border border-slate-300 shadow-2xl" : "min-h-screen pb-20 lg:pb-8"}>
        
        {/* Mobile Top Status Bar (phone frame only) */}
        {isMobileView && (
          <div className="flex items-center justify-between px-6 py-2 text-[11px] text-slate-500 font-mono border-b border-slate-200 bg-white">
            <span>22:49</span>
            <div className="flex items-center gap-2">
              <Signal className="w-3 h-3 text-slate-700" />
              <Wifi className="w-3 h-3 text-indigo-600" />
              <Battery className="w-3.5 h-3.5 text-slate-700" />
            </div>
          </div>
        )}

        {/* Sidebar + Topbar Navigation */}
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          debtCount={debts.length}
          user={user}
          isAdmin={isAdmin}
          onLogout={onLogout}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          isMobileView={isMobileView}
          setIsMobileView={setIsMobileView}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        {/* Main Page Viewports */}
        <main className={`w-full mx-auto space-y-5 sm:space-y-6 ${isMobileView ? 'px-3 pb-24' : 'max-w-[1800px] px-3 sm:px-5 lg:px-8 2xl:px-10'}`}>
          
          {/* Mobile native home (phone view of the calculator tab) */}
          {activeTab === 'calculator' && isMobileView && (
            <MobileHome
              debts={debts}
              paymentLogs={paymentLogs}
              result={result}
              extraBudget={extraBudget}
              onSelectTab={setActiveTab}
            />
          )}

          {/* Top Hero Freedom Overview Bar (calculator tab, desktop) */}
          {activeTab === 'calculator' && !isMobileView && (
            <HeroOverview
              debts={debts}
              paymentLogs={paymentLogs}
              result={result}
              onSelectTab={setActiveTab}
            />
          )}

          {/* Page 1: Debt Calculator */}
          {activeTab === 'calculator' && !isMobileView && (
            <DebtCalculator
              debts={debts}
              setDebts={setDebts}
              extraBudget={extraBudget}
              setExtraBudget={setExtraBudget}
              savedPlans={savedPlans}
              setSavedPlans={setSavedPlans}
              onSavePlanSnapshot={handleSavePlanSnapshot}
              onResetData={handleResetData}
              onNavigateToCompare={() => setActiveTab('compare_strategies')}
              onNavigateToAddDebt={handleOpenAddDebtPage}
              onNavigateToEditDebt={handleOpenEditDebtPage}
              onNavigateToPayment={handleNavigateToPaymentWithAmount}
              manualStrategy={manualStrategy}
            />
          )}

          {/* Dedicated Page: Record Debt Payment & Progress Summary */}
          {activeTab === 'payment_history' && (
            <PaymentHistoryPage
              debts={debts}
              setDebts={setDebts}
              paymentLogs={paymentLogs}
              setPaymentLogs={setPaymentLogs}
              extraBudget={extraBudget}
              initialPaymentAmount={initialPaymentAmount}
              showToast={showToast}
              onBack={() => setActiveTab('calculator')}
              userName={user?.name || 'User'}
              manualStrategy={manualStrategy}
            />
          )}

          {/* Page 2: OCR Scanner Multi-Image Import */}
          {activeTab === 'ocr' && (
            <OcrScanner
              onImportDebts={handleImportScannedDebts}
              onNavigateToCalculator={() => setActiveTab('calculator')}
            />
          )}

          {/* Page 3: AI Assistant */}
          {activeTab === 'ai' && (
            <AiAssistant
              debts={debts}
              setDebts={setDebts}
              extraBudget={extraBudget}
              setExtraBudget={setExtraBudget}
              onNavigateToCalculator={() => setActiveTab('calculator')}
            />
          )}

          {/* Page 4: Due Date Notification Center */}
          {activeTab === 'notifications' && (
            <NotificationCenter
              debts={debts}
              showToast={showToast}
            />
          )}

          {/* Page 5: Backend Admin Dashboard */}
          {activeTab === 'admin' && isAdmin && (
            <ErrorBoundary componentName="Admin Dashboard (หน้าหลังบ้าน)" onNavigateHome={() => setActiveTab('calculator')}>
              <AdminDashboard
                onRefreshView={() => setViewData(getViewDataForUser(user.id, selectedUserId))}
                showToast={showToast}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'admin' && !isAdmin && (
            <RestrictedAccessPage section="หน้าจัดการข้อมูลผู้ใช้และหลังบ้าน" />
          )}

          {/* Dedicated Page 6: Compare 5 Strategies */}
          {activeTab === 'compare_strategies' && (
            <CompareStrategiesPage
              debts={debts}
              extraBudget={extraBudget}
              activeStrategy={manualStrategy}
              onSelectStrategy={(st) => setManualStrategy(st)}
              onBack={() => setActiveTab('calculator')}
            />
          )}



          {/* Dedicated Page 7: Add/Edit Debt Form */}
          {activeTab === 'add_debt' && (
            <AddEditDebtPage
              editingDebt={editingDebt}
              onSave={handleSaveDebtItem}
              onCancel={() => setActiveTab('calculator')}
            />
          )}

          {/* Dedicated Page 8: Achievements & Milestones */}
          {activeTab === 'milestones' && (
            <MilestonesPage
              debts={debts}
              paymentLogs={paymentLogs}
              result={result}
              extraBudget={extraBudget}
              onBack={() => setActiveTab('calculator')}
            />
          )}

          {/* Dedicated Page 10: Refinance Calculator & Best-Match Recommendation */}
          {activeTab === 'refinance' && (
            <RefinanceDashboard
              userName={user?.name || 'User'}
              onBack={() => setActiveTab('calculator')}
              ocrDebts={debts}
            />
          )}

        </main>

        {/* Desktop Footer */}
        {!isMobileView && (
        <footer className="max-w-[1800px] mx-auto px-3 sm:px-5 lg:px-8 2xl:px-10 mt-12 lg:mt-16 pt-6 pb-20 lg:pb-8 border-t border-slate-200 text-center text-xs text-slate-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>© 2026 หนี้น้อย (Nee Noi) - AI Debt Payoff Mobile Planner</p>
            <div className="flex items-center gap-3 text-slate-500">
              <span>ปิดหนี้ที่จ่ายดอกเบี้ยแพง (Avalanche) / Snowball / Tsunami / Snowflake / Landslide</span>
              <span>•</span>
              <span className="text-indigo-600 font-semibold">Payment Tracker Engine</span>
            </div>
          </div>
        </footer>
        )}

      </div>

    </div>
  );
}
