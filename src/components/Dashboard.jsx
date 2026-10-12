import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  DollarSign,
  Activity,
  Cpu,
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sliders,
  Server,
  Database,
  Trash2,
  Edit3,
  Plus,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { INITIAL_ADMIN_DATA, MOCK_USERS, loadUserDataFromStorage, saveUserDataToStorage } from '../data/mockData';
import { formatCurrency } from '../utils/debtEngine';
import { exportAdminAllUsersPaymentLogsToExcel } from '../utils/excelExport';

export default function Dashboard({ onRefreshView, showToast }) {
  const [adminData, setAdminData] = useState(INITIAL_ADMIN_DATA);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Admin User & Debt Management State
  const [managedUserId, setManagedUserId] = useState('user1');
  const [managedUserData, setManagedUserData] = useState(() => loadUserDataFromStorage('user1'));

  // Form modal state for Admin Edit/Add Debt
  const [editingDebtItem, setEditingDebtItem] = useState(null);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formLender, setFormLender] = useState('');
  const [formBalance, setFormBalance] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formMin, setFormMin] = useState('');

  // Reload managed user data when managedUserId changes
  useEffect(() => {
    setManagedUserData(loadUserDataFromStorage(managedUserId));
  }, [managedUserId]);

  const handleSaveManagedUserData = (updated) => {
    setManagedUserData(updated);
    saveUserDataToStorage(managedUserId, updated);
    if (onRefreshView) onRefreshView();
  };

  const handleOpenAddForm = () => {
    setEditingDebtItem(null);
    setFormName('');
    setFormLender('');
    setFormBalance('');
    setFormRate('');
    setFormMin('');
    setShowDebtForm(true);
  };

  const handleOpenEditForm = (debt) => {
    setEditingDebtItem(debt);
    setFormName(debt.name);
    setFormLender(debt.lender || '');
    setFormBalance(String(debt.balance));
    setFormRate(String(debt.interestRate));
    setFormMin(String(debt.minPayment));
    setShowDebtForm(true);
  };

  const handleDeleteUserDebt = (debtId) => {
    if (confirm('Admin: คุณต้องการลบรายการหนี้นี้ของผู้ใช้ใช่หรือไม่?')) {
      const updatedDebts = managedUserData.debts.filter(d => d.id !== debtId);
      const updated = { ...managedUserData, debts: updatedDebts };
      handleSaveManagedUserData(updated);
      if (showToast) showToast(`Admin: ลบรายการหนี้สำเร็จ`);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!formName || !formBalance) return;

    const newDebtObj = {
      id: editingDebtItem ? editingDebtItem.id : `debt-${Date.now()}`,
      name: formName,
      lender: formLender || 'ไม่ระบุเจ้าหนี้',
      balance: Number(formBalance),
      interestRate: Number(formRate || 15),
      minPayment: Number(formMin || (Number(formBalance) * 0.05)),
      dueDate: editingDebtItem?.dueDate || '15 ของทุกเดือน',
      isScanned: false
    };

    let updatedDebts = [];
    const currentDebts = managedUserData?.debts || [];
    if (editingDebtItem) {
      updatedDebts = currentDebts.map(d => d.id === editingDebtItem.id ? newDebtObj : d);
    } else {
      updatedDebts = [...currentDebts, newDebtObj];
    }

    const updated = { ...managedUserData, debts: updatedDebts };
    handleSaveManagedUserData(updated);
    setShowDebtForm(false);
    if (showToast) showToast(`Admin: บันทึกข้อมูลหนี้ ${formName} สำหรับ ${MOCK_USERS[managedUserId]?.name || managedUserId} สำเร็จ`);
  };

  const handleExportAllUsersPaymentHistory = () => {
    const allUsersDataMap = {
      user1: { name: MOCK_USERS.user1.name, ...loadUserDataFromStorage('user1') },
      user2: { name: MOCK_USERS.user2.name, ...loadUserDataFromStorage('user2') },
      user3: { name: MOCK_USERS.user3.name, ...loadUserDataFromStorage('user3') }
    };
    exportAdminAllUsersPaymentLogsToExcel(allUsersDataMap);
  };

  const filteredOcrLogs = adminData.ocrLogs.filter(log => {
    const matchesSearch = log.user.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          log.fileName.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          log.extractedItems.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesStatus = selectedStatus === 'ALL' || log.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleRefreshMetrics = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setAdminData(prev => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          totalUsers: prev.metrics.totalUsers + Math.floor(Math.random() * 5),
          totalManagedDebt: prev.metrics.totalManagedDebt + Math.floor(Math.random() * 150000),
          aiLatency: `${110 + Math.floor(Math.random() * 30)} ms`
        }
      }));
      setIsRefreshing(false);
    }, 800);
  };

  const exportOcrLogs = () => {
    const logData = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(adminData.ocrLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", logData);
    downloadAnchor.setAttribute("download", `ocr_admin_audit_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Admin Top Header Banner */}
      <div className="bg-white border border-purple-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                ADMIN BACKEND SYSTEM
              </span>
              <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">System Healthy</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Admin Control Panel & User Management
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl font-medium">
              จัดการผู้ใช้ (User Management), แก้ไขรายการหนี้สิน, ตรวจสอบ OCR Audit Logs และดาวน์โหลดประวัติการชำระหนี้ทั้งหมด
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportAllUsersPaymentHistory}
              className="btn-gold text-xs font-bold py-2.5 px-4 cursor-pointer flex items-center gap-2 shadow-md"
              title="ดาวน์โหลดประวัติการชำระหนี้ของผู้ใช้ทุกคนสำหรับ Google Sheets / Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลดไฟล์ชำระหนี้ (Google Sheets)</span>
            </button>

            <button
              onClick={handleRefreshMetrics}
              disabled={isRefreshing}
              className="btn-secondary text-xs font-semibold cursor-pointer py-2.5 px-3"
            >
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Stats</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Users */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-bold text-slate-500">Total Users</span>
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-slate-900">
            {adminData.metrics.totalUsers.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-600 font-bold mt-1">↑ +12.4% this month</div>
        </div>

        {/* Total Managed Debt */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-bold text-slate-500">Total Managed Debt</span>
            <DollarSign className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-indigo-600">
            {formatCurrency(adminData.metrics.totalManagedDebt)}
          </div>
          <div className="text-xs text-slate-500 font-medium">Avg 33,780 THB / item</div>
        </div>

        {/* OCR Accuracy */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-bold text-slate-500">OCR Accuracy</span>
            <Activity className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-emerald-600">
            {adminData.metrics.ocrAccuracy}
          </div>
          <div className="text-xs text-emerald-600 font-medium">45,210 images scanned</div>
        </div>

        {/* AI Latency */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-bold text-slate-500">AI Latency</span>
            <Cpu className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600">
            {adminData.metrics.aiLatency}
          </div>
          <div className="text-xs text-slate-500 font-medium">Node Cluster: Normal</div>
        </div>
      </div>

      {/* ADMIN USER & DEBT MANAGEMENT SYSTEM */}
      <div className="bg-white border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <span className="badge-gold text-xs">
              <UserCheck className="w-3.5 h-3.5" />
              USER DEBT MANAGEMENT SYSTEM
            </span>
            <h2 className="text-lg font-black text-slate-900 pt-1">
              จัดการผู้ใช้และแก้ไขข้อมูลหนี้สิน (Admin Direct Access)
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              เลือกผู้ใช้งานเพื่อแก้ไข/เพิ่ม/ลบรายการหนี้ หรือปรับงบโปะเพิ่มโดยตรง
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Select User Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">เลือกผู้ใช้:</span>
              <select
                value={managedUserId}
                onChange={(e) => setManagedUserId(e.target.value)}
                className="input-dark font-bold text-xs py-2 px-3 bg-indigo-50 border-indigo-200 text-indigo-900 cursor-pointer"
              >
                <option value="user1">User 1 ({MOCK_USERS.user1.name})</option>
                <option value="user2">User 2 ({MOCK_USERS.user2.name})</option>
                <option value="user3">User 3 ({MOCK_USERS.user3.name})</option>
              </select>
            </div>

            <button
              onClick={handleOpenAddForm}
              className="btn-gold text-xs py-2 px-3 font-bold cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              เพิ่มหนี้ใหม่ให้ User
            </button>
          </div>
        </div>

        {/* User Debts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">รายการหนี้</th>
                <th className="py-2.5 px-3">เจ้าหนี้</th>
                <th className="py-2.5 px-3 text-right">ยอดคงเหลือ (บาท)</th>
                <th className="py-2.5 px-3 text-right">ดอกเบี้ย (%)</th>
                <th className="py-2.5 px-3 text-right">ขั้นต่ำ (บาท)</th>
                <th className="py-2.5 px-3 text-center">จัดการ Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {(managedUserData.debts || []).length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-slate-400">
                    ผู้ใช้รายนี้ไม่มีรายการหนี้ในระบบ
                  </td>
                </tr>
              ) : (
                (managedUserData?.debts || []).map((debt) => (
                  <tr key={debt.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-900">{debt.name}</td>
                    <td className="py-3 px-3 text-slate-600">{debt.lender}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-indigo-600">{formatCurrency(debt.balance)}</td>
                    <td className="py-3 px-3 text-right font-bold text-rose-600">{debt.interestRate}%</td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-800">{formatCurrency(debt.minPayment)}</td>
                    <td className="py-3 px-3 text-center space-x-1">
                      <button
                        onClick={() => handleOpenEditForm(debt)}
                        className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-50 font-bold cursor-pointer"
                        title="แก้ไขข้อมูลหนี้"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUserDebt(debt.id)}
                        className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 font-bold cursor-pointer"
                        title="ลบรายการหนี้"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Form for Admin Add/Edit Debt */}
        {showDebtForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in border border-slate-200">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center justify-between border-b pb-3">
                <span>{editingDebtItem ? '✏️ Admin แก้ไขหนี้ผู้ใช้' : '➕ Admin เพิ่มหนี้ให้ผู้ใช้'} ({MOCK_USERS[managedUserId]?.name})</span>
                <button onClick={() => setShowDebtForm(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
              </h3>

              <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">ชื่อรายการหนี้ *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input-dark font-medium"
                    placeholder="เช่น บัตรเครดิต KTC"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">เจ้าหนี้ / สถาบันการเงิน</label>
                  <input
                    type="text"
                    value={formLender}
                    onChange={(e) => setFormLender(e.target.value)}
                    className="input-dark font-medium"
                    placeholder="เช่น ธนาคารกรุงไทย"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">ยอดหนี้คงเหลือ (บาท) *</label>
                    <input
                      type="number"
                      value={formBalance}
                      onChange={(e) => setFormBalance(e.target.value)}
                      className="input-dark font-bold text-indigo-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">ดอกเบี้ย (% ต่อปี)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formRate}
                      onChange={(e) => setFormRate(e.target.value)}
                      className="input-dark font-bold text-rose-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ค่างวดขั้นต่ำต่อเดือน (บาท)</label>
                  <input
                    type="number"
                    value={formMin}
                    onChange={(e) => setFormMin(e.target.value)}
                    className="input-dark font-medium"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowDebtForm(false)}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="btn-gold text-xs py-2 px-4 font-bold"
                  >
                    บันทึกข้อมูล
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* OCR EXTRACTION LOGS AUDIT TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            OCR Extraction Audit Logs
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Verify accuracy and extraction results from user-uploaded images
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4">
          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search filename or User ID..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input-dark pl-9 text-xs py-2 w-full"
            />
          </div>

          {/* Filter Status */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="input-dark text-xs py-2 w-full md:w-36 bg-white font-medium"
          >
            <option value="ALL">All Status</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="ERROR">Error</option>
          </select>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Log ID & Time</th>
                <th className="py-3 px-4">User ID</th>
                <th className="py-3 px-4">Image File</th>
                <th className="py-3 px-4 text-center">OCR Status</th>
                <th className="py-3 px-4 text-center">Accuracy (%)</th>
                <th className="py-3 px-4">Extracted Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredOcrLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-500">
                    <div className="text-indigo-600 font-bold">{log.id}</div>
                    <div className="text-[10px] text-slate-400">{log.timestamp}</div>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {log.user}
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono">
                    {log.fileName}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      log.status === 'PENDING' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                      'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-extrabold text-indigo-600">
                    {log.confidence}
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-medium">
                    {log.extractedItems}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SYSTEM LOGS & SERVER NODES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Activity Console */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-indigo-600" />
              System Live Activity Console
            </h2>

            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs space-y-2 h-72 overflow-y-auto">
              {adminData.systemLogs.map((sLog) => (
                <div key={sLog.id} className="flex items-start gap-2">
                  <span className="text-slate-400">[{sLog.time}]</span>
                  <span className={sLog.level === 'SUCCESS' ? 'text-emerald-400 font-bold' : 'text-indigo-400 font-bold'}>
                    [{sLog.level}]
                  </span>
                  <span className="text-slate-300">{sLog.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Backend System Controls */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Sliders className="w-4 h-4 text-indigo-600" />
            Backend System Controls
          </h2>

          <div className="space-y-4 text-xs font-semibold">
            <button
              onClick={() => alert('OCR cache cleared successfully!')}
              className="w-full flex justify-between items-center px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-slate-800"
            >
              <span>Clear OCR Cache</span>
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => alert('AI Engine retraining parameters sent!')}
              className="w-full flex justify-between items-center px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer text-indigo-900"
            >
              <span>Retune AI Payoff Algorithm</span>
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            </button>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-medium leading-relaxed">
              <strong className="text-slate-800">Admin Note:</strong> System ready for Multi-Image Batch OCR and AI Hybrid Payoff Simulation on all nodes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}