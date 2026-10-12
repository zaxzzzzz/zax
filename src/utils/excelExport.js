import * as XLSX from 'xlsx';

/**
 * Export User Payment History to Excel / Google Sheet compatible XLSX file
 */
export const exportPaymentHistoryToExcel = (paymentLogs, userName = 'User') => {
  if (!paymentLogs || paymentLogs.length === 0) {
    alert('ไม่มีประวัติการชำระหนี้สำหรับส่งออก');
    return;
  }

  const formattedData = paymentLogs.map((log, index) => ({
    'ลำดับ': index + 1,
    'วันที่ชำระ': log.paymentDate || '',
    'ผู้ชำระ': log.owner || userName,
    'รายการหนี้': log.debtName || '',
    'สถาบันการเงิน / เจ้าหนี้': log.lender || '',
    'จำนวนเงินที่จ่าย (บาท)': Number(log.amountPaid || 0),
    'ยอดหนี้เดิมก่อนจ่าย (บาท)': Number(log.previousBalance || 0),
    'ยอดหนี้คงเหลือหลังจ่าย (บาท)': Number(log.remainingBalance || 0),
    'สถานะการชำระหนี้': 'ตรงตามกำหนด',
    'หมายเหตุ': log.note || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);

  // Set column widths for clean readability
  worksheet['!cols'] = [
    { wch: 8 },  // ลำดับ
    { wch: 14 }, // วันที่ชำระ
    { wch: 16 }, // ผู้ชำระ
    { wch: 28 }, // รายการหนี้
    { wch: 24 }, // เจ้าหนี้
    { wch: 22 }, // จำนวนเงินที่จ่าย
    { wch: 22 }, // ยอดเดิม
    { wch: 25 }, // ยอดคงเหลือ
    { wch: 16 }, // สถานะ
    { wch: 30 }  // หมายเหตุ
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ประวัติการชำระหนี้');

  const safeFileName = `NeeNoi_Payment_History_${userName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
};

/**
 * Export Debts List to Excel
 */
export const exportDebtsToExcel = (debts, userName = 'User') => {
  if (!debts || debts.length === 0) {
    alert('ไม่มีรายการหนี้สำหรับส่งออก');
    return;
  }

  const formattedData = debts.map((debt, index) => ({
    'ลำดับ': index + 1,
    'ชื่อรายการหนี้': debt.name || '',
    'เจ้าหนี้ / สถาบันการเงิน': debt.lender || '',
    'ยอดหนี้คงเหลือ (บาท)': Number(debt.balance || 0),
    'อัตราดอกเบี้ย (% ต่อปี)': Number(debt.interestRate || 0),
    'ค่างวดขั้นต่ำ / เดือน (บาท)': Number(debt.minPayment || 0),
    'วันครบกำหนดชำระ': debt.dueDate || '',
    'หมวดหมู่': debt.category || '',
    'สแกนด้วย OCR': debt.isScanned ? 'ใช่' : 'ไม่ใช่'
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  worksheet['!cols'] = [
    { wch: 8 },  // ลำดับ
    { wch: 28 }, // ชื่อรายการ
    { wch: 24 }, // เจ้าหนี้
    { wch: 20 }, // ยอดคงเหลือ
    { wch: 20 }, // ดอกเบี้ย
    { wch: 22 }, // ขั้นต่ำ
    { wch: 18 }, // วันครบกำหนด
    { wch: 16 }, // หมวดหมู่
    { wch: 14 }  // OCR
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'รายการหนี้สิน');

  const safeFileName = `NeeNoi_Debts_${userName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
};

/**
 * Export Admin All User Payment Logs to Excel (For Admin Audit & Google Sheets)
 */
export const exportAdminAllUsersPaymentLogsToExcel = (userProfilesData) => {
  const rows = [];

  Object.entries(userProfilesData).forEach(([userId, userData]) => {
    const userName = userData.name || userId;
    const logs = userData.paymentLogs || [];

    logs.forEach((log, idx) => {
      rows.push({
        'User ID': userId,
        'ชื่อผู้ใช้งาน': userName,
        'ลำดับ': idx + 1,
        'วันที่ชำระ': log.paymentDate || '',
        'รายการหนี้': log.debtName || '',
        'สถาบันการเงิน': log.lender || '',
        'จำนวนเงินที่จ่าย (บาท)': Number(log.amountPaid || 0),
        'ยอดคงเหลือหลังจ่าย (บาท)': Number(log.remainingBalance || 0),
        'ตรงเวลาหรือไม่': 'ตรงเวลา',
        'หมายเหตุ': log.note || ''
      });
    });
  });

  if (rows.length === 0) {
    alert('ไม่มีข้อมูลประวัติการชำระหนี้ในระบบ');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 }, // User ID
    { wch: 16 }, // ชื่อผู้ใช้งาน
    { wch: 8 },  // ลำดับ
    { wch: 14 }, // วันที่ชำระ
    { wch: 28 }, // รายการหนี้
    { wch: 22 }, // สถาบันการเงิน
    { wch: 22 }, // จำนวนเงินที่จ่าย
    { wch: 24 }, // ยอดคงเหลือ
    { wch: 16 }, // ตรงเวลา
    { wch: 30 }  // หมายเหตุ
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ประวัติการชำระหนี้ทั้งหมด');

  const safeFileName = `NeeNoi_Admin_All_Users_Payment_Logs_${Date.now()}.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
};
