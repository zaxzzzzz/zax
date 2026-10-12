import { saveUserDebtsToCloud, fetchUserDebtsFromCloud } from '../services/supabaseService';

const USER1_DEBTS = [
  {
    id: "debt-1",
    name: "บัตรเครดิต KTC Visa",
    lender: "ธนาคารกรุงไทย (KTC)",
    balance: 32000,
    interestRate: 16.0,
    minPayment: 2500,
    dueDate: "15 ของทุกเดือน",
    category: "credit_card",
    isScanned: false
  },
  {
    id: "debt-2",
    name: "สินเชื่อส่วนบุคคล SCB Speedy",
    lender: "ธนาคารไทยพาณิชย์",
    balance: 85000,
    interestRate: 24.5,
    minPayment: 3800,
    dueDate: "28 ของทุกเดือน",
    category: "personal_loan",
    isScanned: false
  },
  {
    id: "debt-3",
    name: "บัตรกดเงินสด Central The 1",
    lender: "กรุงศรี คอนซูมเมอร์",
    balance: 18500,
    interestRate: 22.0,
    minPayment: 1500,
    dueDate: "05 ของทุกเดือน",
    category: "cash_card",
    isScanned: false
  },
  {
    id: "debt-4",
    name: "ผ่อนรถยนต์ Krungsri Auto",
    lender: "ธนาคารกรุงศรีอยุธยา",
    balance: 240000,
    interestRate: 4.8,
    minPayment: 6200,
    dueDate: "10 ของทุกเดือน",
    category: "auto_loan",
    isScanned: false
  }
];

const USER2_DEBTS = [
  {
    id: "debt-11",
    name: "บัตรเครดิต Citibank",
    lender: "Citibank Thailand",
    balance: 18000,
    interestRate: 18.5,
    minPayment: 2200,
    dueDate: "18 ของทุกเดือน",
    category: "credit_card",
    isScanned: false
  },
  {
    id: "debt-12",
    name: "สินเชื่อบ้าน Home Loan",
    lender: "ธนาคารออมสิน",
    balance: 150000,
    interestRate: 7.1,
    minPayment: 7800,
    dueDate: "20 ของทุกเดือน",
    category: "mortgage",
    isScanned: false
  }
];

const USER3_DEBTS = [
  {
    id: "debt-21",
    name: "บัตรกดเงินสด AEON",
    lender: "AEON Credit",
    balance: 26000,
    interestRate: 20.0,
    minPayment: 1800,
    dueDate: "12 ของทุกเดือน",
    category: "cash_card",
    isScanned: false
  },
  {
    id: "debt-22",
    name: "สินเชื่อรถจักรยานยนต์",
    lender: "TMB Bank",
    balance: 52000,
    interestRate: 11.2,
    minPayment: 3900,
    dueDate: "07 ของทุกเดือน",
    category: "auto_loan",
    isScanned: false
  },
  {
    id: "debt-23",
    name: "บัตรกดเงินสด Easy Cash",
    lender: "บริษัทเงินกู้ด่วน",
    balance: 12000,
    interestRate: 28.0,
    minPayment: 1400,
    dueDate: "03 ของทุกเดือน",
    category: "cash_card",
    isScanned: false
  }
];

export const MOCK_USERS = {
  admin: {
    id: 'admin',
    name: 'Admin User',
    email: 'admin',
    password: 'admin123',
    role: 'admin'
  },
  user1: {
    id: 'user1',
    name: 'User 1',
    email: 'user1@neenoi.com',
    password: 'user1',
    role: 'user'
  },
  user2: {
    id: 'user2',
    name: 'User 2',
    email: 'user2@neenoi.com',
    password: 'user2',
    role: 'user'
  },
  user3: {
    id: 'user3',
    name: 'User 3',
    email: 'user3@neenoi.com',
    password: 'user3',
    role: 'user'
  }
};

export const USER_DATA_BY_ID = {
  user1: {
    debts: USER1_DEBTS,
    extraBudget: 5000,
    paymentLogs: [
      {
        id: 'pay-user1-1',
        debtId: 'debt-3',
        debtName: 'บัตรกดเงินสด Central The 1',
        lender: 'กรุงศรี คอนซูมเมอร์',
        amountPaid: 3500,
        previousBalance: 22000,
        remainingBalance: 18500,
        paymentDate: '2026-08-05',
        note: 'ค่างวดประจำเดือน + โปะพิเศษ'
      },
      {
        id: 'pay-user1-2',
        debtId: 'debt-1',
        debtName: 'บัตรเครดิต KTC Visa',
        lender: 'ธนาคารกรุงไทย (KTC)',
        amountPaid: 4500,
        previousBalance: 36500,
        remainingBalance: 32000,
        paymentDate: '2026-08-01',
        note: 'ค่างวดประจำเดือน'
      }
    ]
  },
  user2: {
    debts: USER2_DEBTS,
    extraBudget: 3500,
    paymentLogs: [
      {
        id: 'pay-user2-1',
        debtId: 'debt-11',
        debtName: 'บัตรเครดิต Citibank',
        lender: 'Citibank Thailand',
        amountPaid: 2800,
        previousBalance: 21000,
        remainingBalance: 18200,
        paymentDate: '2026-08-02',
        note: 'ชำระขั้นต่ำ'
      }
    ]
  },
  user3: {
    debts: USER3_DEBTS,
    extraBudget: 4200,
    paymentLogs: [
      {
        id: 'pay-user3-1',
        debtId: 'debt-21',
        debtName: 'บัตรกดเงินสด AEON',
        lender: 'AEON Credit',
        amountPaid: 2200,
        previousBalance: 28000,
        remainingBalance: 25800,
        paymentDate: '2026-08-03',
        note: 'ชำระหนี้ตามแผน'
      }
    ]
  }
};

export const INITIAL_DEBTS = USER_DATA_BY_ID.user1.debts;

export const getUserProfileByEmail = (email) => {
  const normalized = (email || '').trim().toLowerCase();
  const fallbackMap = {
    'user@example.com': 'user1',
    'user1@neenoi.com': 'user1',
    'user2@neenoi.com': 'user2',
    'user3@neenoi.com': 'user3',
    'admin': 'admin'
  };
  const userId = fallbackMap[normalized] || Object.keys(MOCK_USERS).find(key => MOCK_USERS[key].email.toLowerCase() === normalized);
  return userId ? MOCK_USERS[userId] : null;
};

export const STORAGE_PREFIX = 'nee_noi_user_v1_';

export const loadUserDataFromStorage = (userId) => {
  if (!userId || userId === 'admin') return USER_DATA_BY_ID.user1;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.debts)) {
        return {
          debts: parsed.debts,
          extraBudget: parsed.extraBudget ?? (USER_DATA_BY_ID[userId]?.extraBudget || 5000),
          paymentLogs: parsed.paymentLogs || [],
          savedPlans: parsed.savedPlans || [],
          strategy: parsed.strategy || null
        };
      }
    }
  } catch (e) {
    console.error('Error loading user data from storage:', e);
  }
  const defaultData = USER_DATA_BY_ID[userId] || USER_DATA_BY_ID.user1;
  saveUserDataToStorage(userId, defaultData);
  return defaultData;
};

export const loadUserDataFromCloudOrStorage = async (userId) => {
  if (!userId || userId === 'admin') return loadUserDataFromStorage(userId);
  try {
    const cloudData = await fetchUserDebtsFromCloud(userId);
    if (cloudData) {
      return cloudData;
    }
  } catch (e) {
    console.warn('Could not fetch user data from cloud, using local fallback:', e);
  }
  return loadUserDataFromStorage(userId);
};

export const saveUserDataToStorage = (userId, data) => {
  if (!userId || userId === 'admin') return;
  try {
    const payload = {
      debts: data.debts || [],
      extraBudget: data.extraBudget ?? 0,
      paymentLogs: data.paymentLogs || [],
      savedPlans: data.savedPlans || [],
      strategy: data.strategy || null
    };
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch (e) {
    console.error('Error saving user data to storage:', e);
  }
  // Async background save to Supabase Cloud
  saveUserDebtsToCloud(userId, data);
};

export const resetUserDataStorage = (userId) => {
  try {
    if (userId && userId !== 'admin') {
      localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
    } else {
      ['user1', 'user2', 'user3'].forEach(id => localStorage.removeItem(`${STORAGE_PREFIX}${id}`));
    }
  } catch (e) {
    console.error('Error resetting user data storage:', e);
  }
};

export const getViewDataForUser = (userId, selectedUserId = 'all') => {
  if (userId === 'admin' && selectedUserId === 'all') {
    const userKeys = ['user1', 'user2', 'user3'];
    const allDebts = [];
    const allLogs = [];
    let totalExtraBudget = 0;

    userKeys.forEach(pId => {
      const pData = loadUserDataFromStorage(pId);
      (pData.debts || []).forEach(debt => {
        allDebts.push({
          ...debt,
          id: `${pId}-${debt.id}`,
          originalId: debt.id,
          ownerId: pId,
          owner: MOCK_USERS[pId]?.name || pId
        });
      });
      (pData.paymentLogs || []).forEach(log => {
        allLogs.push({
          ...log,
          id: `${pId}-${log.id}`,
          originalId: log.id,
          ownerId: pId,
          debtName: `${MOCK_USERS[pId]?.name || pId} - ${log.debtName}`,
          owner: MOCK_USERS[pId]?.name || pId
        });
      });
      totalExtraBudget += Number(pData.extraBudget || 0);
    });

    return { debts: allDebts, paymentLogs: allLogs, extraBudget: totalExtraBudget, savedPlans: [] };
  }

  const targetId = (userId === 'admin' && selectedUserId && selectedUserId !== 'all')
    ? selectedUserId
    : (userId === 'admin' ? 'user1' : userId);

  return loadUserDataFromStorage(targetId);
};


// Preset image files for multi-image OCR extraction simulator
export const MOCK_OCR_SAMPLES = [
  {
    id: "scan-img-1",
    fileName: "statement_ktc_july_2026.jpg",
    fileSize: "2.4 MB",
    previewUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=400&q=80",
    extracted: {
      name: "บัตรเครดิต KTC Platinum",
      lender: "KTC",
      balance: 45000,
      interestRate: 16.0,
      minPayment: 3600,
      dueDate: "15 ส.ค. 2026",
      confidence: 0.98
    }
  },
  {
    id: "scan-img-2",
    fileName: "citi_ready_credit_bill.png",
    fileSize: "1.8 MB",
    previewUrl: "https://images.unsplash.com/photo-1556742049-0a67daf64f42?auto=format&fit=crop&w=400&q=80",
    extracted: {
      name: "บัตรกดเงินสด Citi Ready Credit",
      lender: "UOB / Citibank",
      balance: 28000,
      interestRate: 25.0,
      minPayment: 2200,
      dueDate: "20 ส.ค. 2026",
      confidence: 0.96
    }
  },
  {
    id: "scan-img-3",
    fileName: "kbank_express_loan.jpg",
    fileSize: "3.1 MB",
    previewUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80",
    extracted: {
      name: "สินเชื่อ Xpress Loan กสิกรไทย",
      lender: "ธนาคารกสิกรไทย",
      balance: 112000,
      interestRate: 21.0,
      minPayment: 4500,
      dueDate: "01 ก.ย. 2026",
      confidence: 0.99
    }
  }
];

// Preset Admin System Metrics & Logs
export const INITIAL_ADMIN_DATA = {
  metrics: {
    totalUsers: 14280,
    totalManagedDebt: 482500000, // 482.5M THB
    totalInterestSaved: 68400000, // 68.4M THB
    ocrAccuracy: "98.7%",
    aiLatency: "128 ms",
    systemStatus: "Operational / Normal"
  },
  ocrLogs: [
    {
      id: "log-101",
      timestamp: "2026-08-11 21:45:12",
      user: "User_8842",
      fileName: "statement_ktc_july_2026.jpg",
      status: "SUCCESS",
      confidence: "98%",
      extractedItems: "บัตรเครดิต KTC / 45,000 บาท / ดอกเบี้ย 16%"
    },
    {
      id: "log-102",
      timestamp: "2026-08-11 21:40:05",
      user: "User_3190",
      fileName: "bill_scb_speedy.png",
      status: "SUCCESS",
      confidence: "97%",
      extractedItems: "SCB Speedy Loan / 85,000 บาท / ดอกเบี้ย 24.5%"
    },
    {
      id: "log-103",
      timestamp: "2026-08-11 21:18:49",
      user: "User_5114",
      fileName: "slip_cam_capture_09.jpg",
      status: "SUCCESS",
      confidence: "99%",
      extractedItems: "Central Card / 18,500 บาท / ดอกเบี้ย 22%"
    }
  ],
  systemLogs: [
    { id: "s-1", time: "22:00:01", level: "INFO", message: "AI Payoff Optimization Engine recalculated model params" },
    { id: "s-2", time: "21:55:10", level: "INFO", message: "OCR Multi-image Vision Pipeline worker healthy [4 node cluster]" },
    { id: "s-3", time: "21:30:00", level: "SUCCESS", message: "Daily backup completed. Storage footprint: 1.2 GB" }
  ]
};
