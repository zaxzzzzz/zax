import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  Users, 
  DollarSign, 
  Activity, 
  Cpu, 
  Search, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Sliders,
  Server,
  Database,
  Sparkles,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Building,
  Link as LinkIcon,
  UserCheck,
  FileSpreadsheet,
  Clipboard,
  Layers,
  CheckCheck,
  AlertTriangle,
  Briefcase,
  Table2
} from 'lucide-react';
import { INITIAL_ADMIN_DATA, MOCK_USERS, loadUserDataFromStorage, saveUserDataToStorage } from '../data/mockData';
import { formatCurrency } from '../utils/debtEngine';
import { exportAdminAllUsersPaymentLogsToExcel } from '../utils/excelExport';
import { extractRefinancePromoFromImage, batchExtractRefinancePromos, normalizeBankName, applyMatrixToFormFields } from '../services/geminiService';
import RateMatrixGrid from './RateMatrixGrid';
import { normalizeRateMatrix } from '../types/rateMatrix';
import {
  getPromotions, savePromotion, deletePromotion, uploadPromoImage,
  getOccupations, saveOccupation, deleteOccupation,
  PROPERTY_TYPES, FEE_WAIVER_TYPES, CUSTOMER_TYPES
} from '../services/refinancePromotionService';

/** Loan-tier presets for the tier selector (>=3M vs any). */
const LOAN_TIERS = [
  { value: 0, label: 'ทุกขนาดวงเงิน (< 3 ล้านบาท)' },
  { value: 3000000, label: '3 ล้านบาทขึ้นไป (>=3M)' }
];

const THAI_BANKS = [
  'ธนาคารกรุงศรีอยุธยา',
  'ธนาคารกสิกรไทย',
  'ธนาคารไทยพาณิชย์',
  'ธนาคารอาคารสงเคราะห์',
  'ธนาคารออมสิน',
  'ธนาคารทหารไทยธนชาต',
  'ธนาคารซีไอเอ็มบี ไทย',
  'ธนาคารกรุงเทพ',
  'ธนาคารกรุงไทย',
  'ธนาคารยูโอบี'
];

const INITIAL_FORM_STATE = {
  id: '',
  bank_name: 'ธนาคารกรุงศรีอยุธยา',
  product_name: '',
  property_types: [],
  min_income: 15000,
  customer_type: 'พนักงานประจำ',
  target_loan_amount: 0,
  min_loan_tier: 0,
  min_loan_amount: 0,
  max_loan_amount: 0,
  max_ltv_percent: 0,
  avg_3yr_rate: 2.99,
  year_1_rate: '',
  year_2_3_rate: '',
  after_year_3_rate: '',
  is_mrta: false,
  is_free_mortgage_fee: false,
  fee_waivers: [],
  variants: [],
  rate_matrix: [],
  promo_image_url: '',
  bank_ref_link: ''
};

/** Empty variant row for the manual variants editor. */
const emptyVariant = (style = 1) => ({
  style,
  style_name: `ทางเลือกที่ ${style}`,
  is_mrta: false,
  year_1_rate: '',
  year_2_3_rate: '',
  after_year_3_rate: '',
  mrr_formula: '',
  eir: 0
});

export default function AdminDashboard({ onRefreshView, showToast: globalShowToast }) {
  const adminData = INITIAL_ADMIN_DATA;
  const [activeTab, setActiveTab] = useState('refinance_promos'); // 'refinance_promos' | 'user_mgmt' | 'ocr_logs'
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Promotions State
  const [promotions, setPromotions] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [promoForm, setPromoForm] = useState(INITIAL_FORM_STATE);
  
  // Multi-Image & Clipboard Queue State
  const [bannerQueue, setBannerQueue] = useState([]); // Array of { id, file, preview, bank_ref_link, status, extractedData }
  const [activeQueueIndex, setActiveQueueIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState('');
  const [notification, setNotification] = useState(null);
  // Gemini Vision parse-failure flag -> renders the manual empty-form fallback
  const [extractionFailed, setExtractionFailed] = useState(false);
  // Promotion row whose rate-matrix grid is expanded in the DB table
  const [expandedMatrixId, setExpandedMatrixId] = useState(null);

  // User Debt Management State
  const [managedUserId, setManagedUserId] = useState('user1');
  const [managedUserData, setManagedUserData] = useState(() => loadUserDataFromStorage('user1'));
  const [editingDebtItem, setEditingDebtItem] = useState(null);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formLender, setFormLender] = useState('');
  const [formBalance, setFormBalance] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formMin, setFormMin] = useState('');

  // Occupations master list state (admin CRUD)
  const [occupations, setOccupations] = useState([]);
  const [occForm, setOccForm] = useState({ id: '', key: '', label: '', labelEn: '', allowed: true });
  const [showOccForm, setShowOccForm] = useState(false);

  // Load promotions + occupations on mount
  useEffect(() => {
    loadPromotionsList();
    loadOccupationsList();
  }, []);

  // Reload managed user data when managedUserId changes
  useEffect(() => {
    setManagedUserData(loadUserDataFromStorage(managedUserId));
  }, [managedUserId]);

  const loadPromotionsList = async () => {
    setLoadingPromos(true);
    try {
      const data = await getPromotions();
      setPromotions(data);
    } catch (err) {
      console.error('Failed to load promotions:', err);
    } finally {
      setLoadingPromos(false);
    }
  };

  // Refresh metrics function
  const handleRefreshMetrics = async () => {
    setIsRefreshing(true);
    showNotification('🔄 กำลังรีเฟรชข้อมูลหลังบ้าน...');

    try {
      // Refresh promotions list
      await loadPromotionsList();

      // Simulate refresh delay for better UX
      await new Promise(resolve => setTimeout(resolve, 1000));

      showNotification('✅ ข้อมูลหลังบ้านได้รับการรีเฟรชเรียบร้อยแล้ว!');
    } catch (err) {
      console.error('Failed to refresh metrics:', err);
      showNotification('❌ เกิดข้อผิดพลาดในการรีเฟรชข้อมูล', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    if (globalShowToast) globalShowToast(message);
    setTimeout(() => setNotification(null), 4000);
  }, [globalShowToast]);

  // Helper to append new files into bannerQueue
  const addFilesToQueue = useCallback((files) => {
    if (!files || files.length === 0) return;

    const newItems = [];
    let processedCount = 0;

    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const item = {
          id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${idx}`,
          file,
          preview: reader.result,
          name: file.name || `Snippet Image ${idx + 1}`,
          bank_ref_link: '',
          status: 'PENDING', // 'PENDING' | 'EXTRACTED' | 'ERROR'
          extractedData: null
        };
        newItems.push(item);
        processedCount++;

        if (processedCount === files.length) {
          setBannerQueue(prev => {
            const updated = [...prev, ...newItems];
            // If first item added, update promoForm preview
            if (prev.length === 0 && newItems.length > 0) {
              setPromoForm(f => ({ ...f, promo_image_url: newItems[0].preview }));
              setActiveQueueIndex(0);
            }
            return updated;
          });
          showNotification(`📸 เพิ่มรูปภาพแบนเนอร์เข้าคิวสำเร็จ (${files.length} รูป)!`);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [showNotification]);

  // Clipboard Paste Handler (Ctrl+V / Snipping Tool Screenshot)
  useEffect(() => {
    if (activeTab !== 'refinance_promos') return;

    const handlePaste = (e) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const pastedFiles = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '');
            const renamedFile = new File([file], `snipping_tool_${timeStr}_${i + 1}.png`, { type: file.type });
            pastedFiles.push(renamedFile);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        addFilesToQueue(pastedFiles);
        showNotification(`📋 นำเข้ารูปภาพจาก Clipboard / Snipping Tool (Ctrl+V) สำเร็จ! (${pastedFiles.length} รูป)`);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeTab, addFilesToQueue, showNotification]);

  // Multi-file Input Selection Handler
  const handleMultiImageFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  };

  // Remove Item from Queue
  const handleRemoveFromQueue = (indexToRemove) => {
    setBannerQueue(prev => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (updated.length === 0) {
        setPromoForm(INITIAL_FORM_STATE);
        setActiveQueueIndex(0);
      } else {
        const newIndex = Math.min(activeQueueIndex, updated.length - 1);
        setActiveQueueIndex(newIndex);
        if (updated[newIndex]?.extractedData) {
          applyExtractedToForm(updated[newIndex].extractedData, updated[newIndex].preview, updated[newIndex].bank_ref_link);
        } else {
          setPromoForm(f => ({ ...f, promo_image_url: updated[newIndex]?.preview || '' }));
        }
      }
      return updated;
    });
  };

  // Select item from Queue to focus
  const handleSelectQueueItem = (index) => {
    setActiveQueueIndex(index);
    const item = bannerQueue[index];
    if (item) {
      if (item.extractedData) {
        applyExtractedToForm(item.extractedData, item.preview, item.bank_ref_link);
      } else {
        setPromoForm(prev => ({
          ...prev,
          promo_image_url: item.preview,
          bank_ref_link: item.bank_ref_link || prev.bank_ref_link
        }));
      }
    }
  };

  // Apply Extracted Data to Form (data binding from Gemini Vision JSON -> form inputs)
  // Sets extractionFailed=true when the AI response has no usable rates so the
  // fallback UI (manual empty form + alert) can render.
  const applyExtractedToForm = (extracted, previewUrl, refLink) => {
    if (!extracted) {
      setExtractionFailed(true);
      return;
    }
    // Normalize + backfill promo-level fields from the best matrix row
    const enriched = applyMatrixToFormFields(extracted);
    const rateMatrix = normalizeRateMatrix(enriched.rate_matrix);
    const hasAnyRate = (Number(enriched.avg_3yr_rate) || 0) > 0 ||
      (Array.isArray(enriched.variants) && enriched.variants.length > 0) ||
      rateMatrix.length > 0;
    setExtractionFailed(!hasAnyRate);
    const variants = Array.isArray(enriched.variants)
      ? enriched.variants.map((v, i) => ({
          style: Number(v.style) || (i + 1),
          style_name: v.style_name || `ทางเลือกที่ ${Number(v.style) || i + 1}`,
          is_mrta: Boolean(v.is_mrta),
          year_1_rate: v.year_1_rate || '',
          year_2_3_rate: v.year_2_3_rate || '',
          after_year_3_rate: v.after_year_3_rate || '',
          mrr_formula: v.mrr_formula || '',
          eir: Number(v.eir) || 0
        }))
      : [];
    setPromoForm(prev => ({
      ...prev,
      // Normalize AI bank name (e.g. "Krungsri" / "กรุงศรี") to the canonical Thai bank list
      bank_name: normalizeBankName(enriched.bank_name) || prev.bank_name,
      product_name: enriched.product_name || prev.product_name,
      // Structured condition arrays (already canonical from the server)
      property_types: Array.isArray(enriched.property_types) ? enriched.property_types : prev.property_types,
      customer_type: enriched.customer_type || prev.customer_type,
      min_income: (enriched.min_income !== undefined && enriched.min_income !== null)
        ? (Number(enriched.min_income) || 0)
        : prev.min_income,
      target_loan_amount: (enriched.target_loan_amount !== undefined && enriched.target_loan_amount !== null)
        ? (Number(enriched.target_loan_amount) || 0)
        : prev.target_loan_amount,
      min_loan_tier: (enriched.min_loan_tier !== undefined && enriched.min_loan_tier !== null)
        ? (Number(enriched.min_loan_tier) || 0)
        : prev.min_loan_tier,
      min_loan_amount: (enriched.min_loan_amount !== undefined && enriched.min_loan_amount !== null)
        ? (Number(enriched.min_loan_amount) || 0)
        : prev.min_loan_amount,
      max_loan_amount: (enriched.max_loan_amount !== undefined && enriched.max_loan_amount !== null)
        ? (Number(enriched.max_loan_amount) || 0)
        : prev.max_loan_amount,
      max_ltv_percent: (enriched.max_ltv_percent !== undefined && enriched.max_ltv_percent !== null)
        ? (Number(enriched.max_ltv_percent) || 0)
        : prev.max_ltv_percent,
      avg_3yr_rate: (enriched.avg_3yr_rate !== undefined && enriched.avg_3yr_rate !== null)
        ? (Number(enriched.avg_3yr_rate) || 0)
        : prev.avg_3yr_rate,
      year_1_rate: enriched.year_1_rate || prev.year_1_rate,
      year_2_3_rate: enriched.year_2_3_rate || prev.year_2_3_rate,
      after_year_3_rate: enriched.after_year_3_rate || prev.after_year_3_rate,
      is_mrta: enriched.is_mrta !== undefined ? Boolean(enriched.is_mrta) : prev.is_mrta,
      fee_waivers: Array.isArray(enriched.fee_waivers)
        ? enriched.fee_waivers
        : prev.fee_waivers,
      is_free_mortgage_fee: Array.isArray(enriched.fee_waivers) && enriched.fee_waivers.length > 0
        ? enriched.fee_waivers.includes('จดจำนอง')
        : (enriched.is_free_mortgage_fee !== undefined ? Boolean(enriched.is_free_mortgage_fee) : prev.is_free_mortgage_fee),
      variants: variants.length > 0 ? variants : prev.variants,
      rate_matrix: rateMatrix,
      promo_image_url: previewUrl || prev.promo_image_url,
      bank_ref_link: refLink || extracted.bank_ref_link || prev.bank_ref_link
    }));
  };

  // Single Active Image AI Extraction
  const handleExtractActiveImage = async () => {
    const activeItem = bannerQueue[activeQueueIndex];
    if (!activeItem) {
      return showNotification('⚠️ กรุณาอัปโหลดหรือวางรูปภาพแบนเนอร์ก่อนทำการวิเคราะห์', 'error');
    }

    setIsAnalyzing(true);
    setAiStatusMessage('กำลังส่งรูปภาพแบนเนอร์ให้ Gemini Vision...');

    try {
      const fileToProcess = activeItem.file || activeItem.preview;
      const extracted = await extractRefinancePromoFromImage(fileToProcess, {
        onProgress: (p) => setAiStatusMessage(p.status)
      });

      // Update queue item status
      setBannerQueue(prev => prev.map((item, idx) => {
        if (idx === activeQueueIndex) {
          return { ...item, status: 'EXTRACTED', extractedData: extracted };
        }
        return item;
      }));

      applyExtractedToForm(extracted, activeItem.preview, activeItem.bank_ref_link);
      setExtractionFailed(false);
      showNotification('✨ Gemini Vision สกัดข้อมูลแบนเนอร์สำเร็จ!');
    } catch (err) {
      console.error('Extraction error:', err);
      setBannerQueue(prev => prev.map((item, idx) => {
        if (idx === activeQueueIndex) {
          return { ...item, status: 'ERROR' };
        }
        return item;
      }));
      setExtractionFailed(true);

      const isHighDemand = err?.isHighDemand || err?.status === 503 || err?.status === 429 ||
        /503|429|high demand|rate limit|resource_exhausted|overloaded|unavailable|too many requests/i.test(err?.message || '');

      if (isHighDemand) {
        showNotification('ระบบ AI กำลังมีผู้ใช้งานหนาแน่น กรุณากรอกข้อมูลในตารางด้วยตนเอง', 'error');
      } else {
        showNotification(`❌ เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ: ${err.message}`, 'error');
      }
    } finally {
      setIsAnalyzing(false);
      setAiStatusMessage('');
    }
  };

  // Batch Extract ALL Images in Queue — STRICTLY SEQUENTIAL (one by one):
  // each image must completely finish and return a result before the next one
  // starts, with no artificial delays between API calls (never use Promise.all
  // for this queue). Per-image errors are caught and the loop continues.
  const handleBatchExtractAll = async () => {
    if (bannerQueue.length === 0) {
      return showNotification('⚠️ ไม่มีรูปภาพในคิว กรุณาอัปโหลดหรือวางรูปภาพก่อน', 'error');
    }

    setIsAnalyzing(true);
    const total = bannerQueue.length;
    let successCount = 0;
    let errorCount = 0;
    let hasHighDemandError = false;
    let lastStatus = null; // 'success' | 'error' | null (before first item)

    showNotification(`🤖 เริ่มวิเคราะห์คิวรูปภาพทั้งหมด ${total} รูป (ทีละรูป)...`);

    // Work on a local copy; commit the whole queue to state when finished
    const updatedQueue = [...bannerQueue];

    for (const [index, item] of updatedQueue.entries()) {
      const current = index + 1;

      // Real-time progress: report the previous result before starting the next image
      if (lastStatus === null) {
        setAiStatusMessage(`กำลังวิเคราะห์รูปที่ ${current}/${total} (${item.name})...`);
      } else if (lastStatus === 'success') {
        setAiStatusMessage(`วิเคราะห์รูปที่ ${index}/${total} สำเร็จ... กำลังวิเคราะห์รูปที่ ${current}/${total}`);
      } else {
        setAiStatusMessage(`วิเคราะห์รูปที่ ${index}/${total} ไม่สำเร็จ... กำลังวิเคราะห์รูปที่ ${current}/${total}`);
      }

      try {
        const fileToProcess = item.file || item.preview;
        const extracted = await extractRefinancePromoFromImage(fileToProcess, {
          onProgress: (p) => setAiStatusMessage(`กำลังวิเคราะห์รูปที่ ${current}/${total}: ${p.status}`)
        });
        updatedQueue[index] = { ...item, status: 'EXTRACTED', extractedData: extracted };
        successCount += 1;
        lastStatus = 'success';
      } catch (err) {
        console.error(`Item ${current}/${total} extraction failed:`, err);
        updatedQueue[index] = { ...item, status: 'ERROR' };
        errorCount += 1;
        lastStatus = 'error';
        if (err?.isHighDemand || err?.status === 503 || err?.status === 429 || /503|429|high demand|rate limit|resource_exhausted|overloaded|unavailable|too many requests/i.test(err?.message || '')) {
          hasHighDemandError = true;
        }
      }
    }

    setBannerQueue(updatedQueue);
    setIsAnalyzing(false);
    setAiStatusMessage('');

    // Apply first extracted item to form if any succeeded
    const firstSuccess = updatedQueue.find(q => q.extractedData);
    if (firstSuccess) {
      const idx = updatedQueue.indexOf(firstSuccess);
      setActiveQueueIndex(idx);
      applyExtractedToForm(firstSuccess.extractedData, firstSuccess.preview, firstSuccess.bank_ref_link);
      setExtractionFailed(false);
      showNotification(`✅ วิเคราะห์ครบทั้ง ${total} รูป (สำเร็จ ${successCount}/${total}${errorCount > 0 ? `, ไม่สำเร็จ ${errorCount}` : ''}) เรียบร้อยแล้ว!`);
    } else {
      setExtractionFailed(true);
      if (hasHighDemandError) {
        showNotification('ระบบ AI กำลังมีผู้ใช้งานหนาแน่น กรุณากรอกข้อมูลในตารางด้วยตนเอง', 'error');
      } else {
        showNotification('❌ เกิดข้อผิดพลาดในการวิเคราะห์รูปภาพ กรุณากรอกข้อมูลในตารางด้วยตนเอง', 'error');
      }
    }
  };

  // Batch Save ALL Extracted Promotions in Queue to DB
  const handleBatchSaveAllToDb = async () => {
    const itemsToSave = bannerQueue.filter(q => q.extractedData);
    if (itemsToSave.length === 0) {
      return showNotification('⚠️ ยังไม่มีรายการที่ผ่านการวิเคราะห์ด้วย AI กรุณากดวิเคราะห์รูปภาพก่อน', 'error');
    }

    try {
      for (const item of itemsToSave) {
        // Upload each banner to backend storage -> short /uploads/ URL in DB
        const storedImageUrl = await uploadPromoImage(item.preview);
        const promoToSave = {
          ...item.extractedData,
          promo_image_url: storedImageUrl,
          bank_ref_link: item.bank_ref_link || item.extractedData.bank_ref_link || ''
        };
        await savePromotion(promoToSave);
      }
      showNotification(`🎉 บันทึกโปรโมชันทั้ง ${itemsToSave.length} รายการลง Database เรียบร้อยแล้ว!`);
      setBannerQueue([]);
      setPromoForm(INITIAL_FORM_STATE);
      loadPromotionsList();
    } catch (err) {
      showNotification(`❌ ไม่สามารถบันทึกข้อมูลแบบกลุ่มได้: ${err.message}`, 'error');
    }
  };

  // Single Save Promotion Handler
  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!promoForm.bank_name.trim()) return showNotification('⚠️ กรุณาระบุชื่อธนาคาร', 'error');
    if (!promoForm.product_name.trim()) return showNotification('⚠️ กรุณาระบุชื่อแพ็กเกจ/โปรโมชัน', 'error');

    try {
      // Upload inline banner images (data URLs) to the backend storage first —
      // the DB stores a compact /uploads/xxx.png URL instead of a huge base64 blob.
      const storedImageUrl = await uploadPromoImage(promoForm.promo_image_url);
      await savePromotion({ ...promoForm, promo_image_url: storedImageUrl });
      showNotification('✅ บันทึกโปรโมชันดอกเบี้ยลง Database เรียบร้อยแล้ว!');
      setPromoForm(INITIAL_FORM_STATE);
      loadPromotionsList();
    } catch (err) {
      showNotification(`❌ ไม่สามารถบันทึกข้อมูลได้: ${err.message}`, 'error');
    }
  };

  const handleEditPromo = (promo) => {
    setPromoForm({ ...INITIAL_FORM_STATE, ...promo, variants: Array.isArray(promo.variants) ? promo.variants : [] });
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  const handleDeletePromo = async (id) => {
    if (window.confirm('คุณต้องการลบโปรโมชันนี้ออกจาก Database หรือไม่?')) {
      try {
        await deletePromotion(id);
        showNotification('🗑️ ลบโปรโมชันเรียบร้อยแล้ว');
        loadPromotionsList();
      } catch (err) {
        showNotification(`❌ ไม่สามารถลบข้อมูลได้: ${err.message}`, 'error');
      }
    }
  };

  // ---------- Occupations Master CRUD Handlers ----------
  const loadOccupationsList = async () => {
    try {
      const data = await getOccupations();
      setOccupations(data);
    } catch (err) {
      console.error('Failed to load occupations:', err);
    }
  };

  const handleSaveOccupation = async (e) => {
    e.preventDefault();
    if (!occForm.label.trim()) {
      return showNotification('⚠️ กรุณาระบุชื่ออาชีพ (ภาษาไทย)', 'error');
    }
    try {
      await saveOccupation(occForm);
      showNotification('✅ บันทึกอาชีพใน Master List เรียบร้อยแล้ว!');
      setOccForm({ id: '', key: '', label: '', labelEn: '', allowed: true });
      setShowOccForm(false);
      loadOccupationsList();
    } catch (err) {
      showNotification(`❌ บันทึกอาชีพไม่สำเร็จ: ${err.message}`, 'error');
    }
  };

  const handleDeleteOccupation = async (id) => {
    if (window.confirm('คุณต้องการลบอาชีพนี้ออกจาก Master List หรือไม่?')) {
      try {
        await deleteOccupation(id);
        showNotification('🗑️ ลบอาชีพเรียบร้อยแล้ว');
        loadOccupationsList();
      } catch (err) {
        showNotification(`❌ ลบอาชีพไม่สำเร็จ: ${err.message}`, 'error');
      }
    }
  };

  // ---------- Rate Matrix helpers ----------
  /** Expand/collapse the read-only matrix grid under a promotion row. */
  const toggleMatrixRow = (promoId) => {
    setExpandedMatrixId(prev => (prev === promoId ? null : promoId));
  };

  /** Handle matrix edits from the in-form grid. */
  const handleRateMatrixChange = (rows) => {
    setPromoForm(prev => ({ ...prev, rate_matrix: rows }));
    // Keep the promo-level avg in sync with the best (lowest) matrix row
    const best = [...rows].sort((a, b) => (Number(a.avg_3yr_rate) || 99) - (Number(b.avg_3yr_rate) || 99))[0];
    if (best && Number(best.avg_3yr_rate) > 0) {
      setPromoForm(f => ({
        ...f,
        avg_3yr_rate: Number(best.avg_3yr_rate) || f.avg_3yr_rate,
        year_1_rate: best.year_1_rate || f.year_1_rate,
        year_2_3_rate: best.year_2_3_rate || f.year_2_3_rate,
        after_year_3_rate: best.after_year_3_rate || f.after_year_3_rate
      }));
    }
  };

  // ---------- Variants editor helpers ----------
  const addVariantRow = () => {
    setPromoForm(prev => ({
      ...prev,
      variants: [...(prev.variants || []), emptyVariant((prev.variants?.length || 0) + 1)]
    }));
  };

  const removeVariantRow = (idx) => {
    setPromoForm(prev => ({
      ...prev,
      variants: (prev.variants || []).filter((_, i) => i !== idx)
    }));
  };

  const updateVariantRow = (idx, field, value) => {
    setPromoForm(prev => ({
      ...prev,
      variants: (prev.variants || []).map((v, i) => i === idx ? { ...v, [field]: value } : v)
    }));
  };

  // User Debt Management Handlers
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
      showNotification('Admin: ลบรายการหนี้สำเร็จ');
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
    showNotification(`Admin: บันทึกข้อมูลหนี้ ${formName} สำหรับ ${MOCK_USERS[managedUserId]?.name || managedUserId} สำเร็จ`);
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

  const activeQueueItem = bannerQueue[activeQueueIndex];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl font-bold text-xs flex items-center gap-2 border animate-bounce ${
          notification.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {notification.type === 'error' ? <X className="w-4 h-4 text-rose-600" /> : <Check className="w-4 h-4 text-emerald-600" />}
          {notification.message}
        </div>
      )}

      {/* Admin Top Header Banner */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden border border-purple-200 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                ADMIN BACKEND SYSTEM MANAGEMENT
              </span>
              <span className="badge-green">System Healthy</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              แผงควบคุมผู้ดูแลระบบหลังบ้าน (Backend Admin Portal)
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl">
              จัดการโปรโมชันดอกเบี้ยรีไฟแนนซ์ ( Gemini Vision AI แบบกลุ่ม & Snipping Tool Clipboard Paste)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportAllUsersPaymentHistory}
              className="btn-gold text-xs font-bold py-2.5 px-3.5 cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลดประวัติผู้ใช้ (Excel)</span>
            </button>

            <button
              onClick={handleRefreshMetrics}
              disabled={isRefreshing}
              className="btn-secondary text-xs font-semibold cursor-pointer py-2.5 px-3"
            >
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>รีเฟรชสถิติ</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between text-xs text-slate-500 font-bold mb-1">
            <span>ผู้ใช้งานทั้งหมด</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {adminData.metrics.totalUsers.toLocaleString()} คน
          </div>
          <div className="text-[11px] text-emerald-600 font-bold">↑ +12.4% เดือนนี้</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between text-xs text-slate-500 font-bold mb-1">
            <span>ยอดหนี้รวมที่ดูแลในระบบ</span>
            <DollarSign className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600">
            {formatCurrency(adminData.metrics.totalManagedDebt)}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">เฉลี่ย 33,780 ฿ / รายการ</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between text-xs text-slate-500 font-bold mb-1">
            <span>โปรโมชันรีไฟแนนซ์ใน DB</span>
            <Building className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {promotions.length} แพ็กเกจ
          </div>
          <div className="text-[11px] text-emerald-600 font-medium">พร้อมอัปเดตแบบเรียลไทม์</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all">
          <div className="flex justify-between text-xs text-slate-500 font-bold mb-1">
            <span>AI Multi-Image & Clipboard</span>
            <Clipboard className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600">
            Ctrl+V Ready
          </div>
          <div className="text-[11px] text-slate-500 font-medium">Batch Extraction Enabled</div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('refinance_promos')}
          className={`pb-3 px-4 text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'refinance_promos'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          จัดการโปรโมชันดอกเบี้ยรีไฟแนนซ์ (Refinance Rates Manager)
        </button>

        <button
          onClick={() => setActiveTab('user_mgmt')}
          className={`pb-3 px-4 text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'user_mgmt'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          จัดการผู้ใช้และหนี้สิน (User & Debt Management)
        </button>

        <button
          onClick={() => setActiveTab('occupations')}
          className={`pb-3 px-4 text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'occupations'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          อาชีพ Master List (Occupations)
        </button>

        <button
          onClick={() => setActiveTab('ocr_logs')}
          className={`pb-3 px-4 text-sm font-extrabold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ocr_logs'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Database className="w-4 h-4" />
          ประวัติการสแกน OCR หลังบ้าน (OCR Audit Logs)
        </button>
      </div>

      {/* ==================== TAB 1: REFINANCE PROMOTIONS MANAGER ==================== */}
      {activeTab === 'refinance_promos' && (
        <div className="space-y-6">

          {/* ADMIN PROMOTION FORM & MULTI-IMAGE / CLIPBOARD GEMINI VISION EXTRACTION */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="badge-gold">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Multi-Image & Clipboard Snipping Tool Enabled
                  </span>
                  <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <Clipboard className="w-3 h-3" /> กด Ctrl+V หรือ วางรูปได้เลย
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 pt-1.5">
                  {promoForm.id ? '✏️ แก้ไขโปรโมชันดอกเบี้ย' : '➕ เพิ่ม/วิเคราะห์รูปภาพแบนเนอร์โปรโมชัน (Batch Upload & Extract)'}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  สามารถอัปโหลดพร้อมกันหลายรูป หรือใช้ Snipping Tool แคปรูปแล้วกด Ctrl+V วางในหน้านี้ได้ทันที
                </p>
              </div>
              {promoForm.id && (
                <button
                  onClick={() => {
                    setPromoForm(INITIAL_FORM_STATE);
                    setBannerQueue([]);
                  }}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
            </div>

            {/* Banner Upload Dropzone + Clipboard Paste Support */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              
              {/* File Upload Box with Multiple & Paste */}
              <div className="md:col-span-1 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    อัปโหลด / วางรูปภาพ (Ctrl+V)
                  </label>
                  {bannerQueue.length > 0 && (
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                      ในคิว {bannerQueue.length} รูป
                    </span>
                  )}
                </div>
                
                <div className="border-2 border-dashed border-indigo-300 hover:border-indigo-600 rounded-xl p-4 text-center bg-white transition-all relative flex flex-col items-center justify-center min-h-36 cursor-pointer group">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleMultiImageFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title="เลือกรูปภาพทีละหลายรูป"
                  />
                  {activeQueueItem ? (
                    <div className="space-y-2 w-full">
                      <img src={activeQueueItem.preview} alt="Promo Banner Preview" className="h-28 object-contain mx-auto rounded-lg border shadow-xs" />
                      <div className="text-[10px] text-indigo-600 font-bold flex items-center justify-center gap-1">
                        <Upload className="w-3 h-3" /> เพิ่มรูปเพิ่ม (เลือกหลายไฟล์ได้) หรือกด Ctrl+V
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 p-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto text-indigo-600 group-hover:scale-110 transition-transform">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-black text-indigo-700 block">คลิก/ลากวางรูปภาพ (เลือกหลายไฟล์ได้)</span>
                      <span className="text-[10px] text-slate-500 font-bold block bg-amber-50 text-amber-800 border border-amber-200 py-1 px-2 rounded-lg">
                        📋 หรือใช้ Snipping Tool แคปรูปแล้วกด Ctrl+V ได้เลย!
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Gemini Vision AI Batch & URL Controls */}
              <div className="md:col-span-2 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <LinkIcon className="w-4 h-4 text-indigo-600" />
                    ลิงก์ URL อ้างอิงเว็บไซต์ธนาคารจริง (Bank Ref Link)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://www.krungsri.com/th/personal/loans/home-loans/refinance"
                      value={promoForm.bank_ref_link}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPromoForm(f => ({ ...f, bank_ref_link: val }));
                        if (bannerQueue[activeQueueIndex]) {
                          setBannerQueue(q => q.map((item, idx) => idx === activeQueueIndex ? { ...item, bank_ref_link: val } : item));
                        }
                      }}
                      className="input-dark text-xs py-2 flex-1"
                    />
                    {promoForm.bank_ref_link && (
                      <a
                        href={promoForm.bank_ref_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs px-3 font-semibold flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> ทดสอบลิงก์
                      </a>
                    )}
                  </div>
                </div>

                {/* AI Actions */}
                <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-100 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Extract with Gemini Vision AI
                      </h4>
                      <p className="text-[11px] text-indigo-700 mt-0.5 font-medium">
                        เลือกวิเคราะห์เฉพาะรูปที่เลือก หรือวิเคราะห์รูปภาพทั้งหมดในคิวทีเดียว
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleExtractActiveImage}
                        disabled={isAnalyzing || bannerQueue.length === 0}
                        className="btn-secondary text-xs font-bold py-2 px-3 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        วิเคราะห์รูปปัจจุบัน
                      </button>

                      <button
                        type="button"
                        onClick={handleBatchExtractAll}
                        disabled={isAnalyzing || bannerQueue.length === 0}
                        className="btn-gold text-xs font-black py-2.5 px-4 flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                      >
                        <Layers className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                        {isAnalyzing ? 'กำลังวิเคราะห์คิว...' : `วิเคราะห์คิวทั้งหมด (${bannerQueue.length} รูป)`}
                      </button>
                    </div>
                  </div>

                  {aiStatusMessage && (
                    <div className="text-xs text-indigo-700 font-bold flex items-center gap-1.5 bg-white p-2 rounded-lg border border-indigo-200">
                      <Clock className="w-4 h-4 animate-spin text-indigo-600" /> {aiStatusMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* QUEUED BANNERS THUMBNAIL CAROUSEL */}
            {bannerQueue.length > 0 && (
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    คิวรูปภาพแบนเนอร์ที่อัปโหลด/วางเข้ามา ({bannerQueue.length} รูป):
                  </span>
                  
                  {bannerQueue.some(q => q.extractedData) && (
                    <button
                      type="button"
                      onClick={handleBatchSaveAllToDb}
                      className="btn-gold text-xs font-extrabold py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 text-emerald-700" />
                      บันทึกรูปภาพที่วิเคราะห์แล้วทั้งหมดลง DB
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {bannerQueue.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectQueueItem(idx)}
                      className={`relative flex-shrink-0 w-28 h-24 rounded-xl border-2 p-1.5 bg-white cursor-pointer transition-all ${
                        activeQueueIndex === idx
                          ? 'border-indigo-600 ring-2 ring-indigo-300 shadow-md'
                          : 'border-slate-200 hover:border-indigo-300 opacity-80'
                      }`}
                    >
                      <img src={item.preview} alt={`Banner ${idx + 1}`} className="w-full h-16 object-contain rounded-md" />
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFromQueue(idx);
                        }}
                        className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-0.5 hover:bg-rose-700 shadow-md"
                        title="ลบออกจากคิว"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="mt-1 flex items-center justify-between text-[9px] font-bold">
                        <span className="truncate text-slate-600 max-w-[50px]">{idx + 1}. {item.name}</span>
                        {item.status === 'EXTRACTED' && (
                          <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-black">AI ✓</span>
                        )}
                        {item.status === 'PENDING' && (
                          <span className="bg-slate-100 text-slate-500 px-1 py-0.2 rounded">รอวิเคราะห์</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FORM INPUT FIELDS VERIFICATION */}
            <form onSubmit={handleSavePromo} className="space-y-4 pt-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b pb-2 flex items-center justify-between">
                <span>รายละเอียดโปรโมชันและเงื่อนไข (Verification & Edit Form)</span>
                {bannerQueue[activeQueueIndex]?.status === 'EXTRACTED' && (
                  <span className="badge-green">✨ เติมข้อมูลอัตโนมัติจาก Gemini Vision</span>
                )}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Bank Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อธนาคาร (bank_name) *
                  </label>
                  <select
                    value={promoForm.bank_name}
                    onChange={(e) => setPromoForm({ ...promoForm, bank_name: e.target.value })}
                    className="input-dark text-xs py-2 w-full bg-white font-medium"
                    required
                  >
                    {THAI_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                    {!THAI_BANKS.includes(promoForm.bank_name) && (
                      <option value={promoForm.bank_name}>{promoForm.bank_name} (จาก AI)</option>
                    )}
                  </select>
                </div>

                {/* Product Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อแพ็กเกจ / โปรโมชัน (product_name) *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น สินเชื่อบ้านกรุงศรีรีไฟแนนซ์ ทางเลือก 1"
                    value={promoForm.product_name}
                    onChange={(e) => setPromoForm({ ...promoForm, product_name: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                    required
                  />
                </div>

                {/* Min Income */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รายได้ขั้นต่ำที่สมัครได้ (min_income) (บาท/เดือน)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    placeholder="15000"
                    value={promoForm.min_income}
                    onChange={(e) => setPromoForm({ ...promoForm, min_income: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Loan Tier (>=3M vs any) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    เกณฑ์วงเงินกู้ขั้นต่ำ (min_loan_tier)
                  </label>
                  <select
                    value={promoForm.min_loan_tier}
                    onChange={(e) => setPromoForm({ ...promoForm, min_loan_tier: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full bg-white font-medium"
                  >
                    {LOAN_TIERS.map(tier => (
                      <option key={tier.value} value={tier.value}>{tier.label}</option>
                    ))}
                    {!LOAN_TIERS.some(t => t.value === Number(promoForm.min_loan_tier)) && (
                      <option value={promoForm.min_loan_tier}>
                        {Number(promoForm.min_loan_tier).toLocaleString()} บาท (กำหนดเอง)
                      </option>
                    )}
                  </select>
                </div>

                {/* Target loan amount (banner's reference amount) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วงเงินอ้างอิงในแบนเนอร์ (target_loan_amount) (บาท)
                  </label>
                  <input
                    type="number"
                    step="100000"
                    placeholder="0 = ไม่ระบุ"
                    value={promoForm.target_loan_amount}
                    onChange={(e) => setPromoForm({ ...promoForm, target_loan_amount: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Property types (multi-select chips) */}
                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ประเภทหลักประกันที่รับ (property_types) — ใช้สำหรับ Smart Matching แบบเข้มงวด
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PROPERTY_TYPES.map(type => {
                      const selected = (promoForm.property_types || []).includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setPromoForm(prev => ({
                              ...prev,
                              property_types: selected
                                ? (prev.property_types || []).filter(t => t !== type)
                                : [...(prev.property_types || []), type]
                            }));
                          }}
                          className={`text-[11px] font-bold px-3 py-1.5 rounded-full border-2 transition-all cursor-pointer ${
                            selected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          {selected ? '✓ ' : ''}{type}
                        </button>
                      );
                    })}
                    {(promoForm.property_types || []).length === 0 && (
                      <span className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                        ไม่เลือกเลย = รับทุกประเภททรัพย์
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ประเภทลูกค้าที่รับ (customer_type)
                  </label>
                  <select
                    value={promoForm.customer_type || 'ทุกประเภท'}
                    onChange={(e) => setPromoForm({ ...promoForm, customer_type: e.target.value })}
                    className="input-dark text-xs py-2 w-full bg-white font-medium"
                  >
                    {CUSTOMER_TYPES.map(ct => (
                      <option key={ct} value={ct}>{ct}</option>
                    ))}
                  </select>
                </div>

                {/* Min loan amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วงเงินกู้ขั้นต่ำ (min_loan_amount) (บาท)
                  </label>
                  <input
                    type="number"
                    step="100000"
                    placeholder="0 = ไม่กำหนด"
                    value={promoForm.min_loan_amount}
                    onChange={(e) => setPromoForm({ ...promoForm, min_loan_amount: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Max loan amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    วงเงินกู้สูงสุด (max_loan_amount) (บาท)
                  </label>
                  <input
                    type="number"
                    step="100000"
                    placeholder="0 = ไม่จำกัด"
                    value={promoForm.max_loan_amount}
                    onChange={(e) => setPromoForm({ ...promoForm, max_loan_amount: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Max LTV */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    LTV สูงสุด (max_ltv_percent) (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="เช่น 85 / 90 / 95 (0 = ไม่ระบุ)"
                    value={promoForm.max_ltv_percent}
                    onChange={(e) => setPromoForm({ ...promoForm, max_ltv_percent: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Avg 3Yr Rate */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 text-rose-600">
                    อัตราดอกเบี้ยเฉลี่ย 3 ปีแรก (%) (avg_3yr_rate) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="2.55"
                    value={promoForm.avg_3yr_rate}
                    onChange={(e) => setPromoForm({ ...promoForm, avg_3yr_rate: Number(e.target.value) })}
                    className="input-dark text-xs py-2 w-full font-bold text-rose-600"
                    required
                  />
                </div>

                {/* Year 1 Rate */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ดอกเบี้ยปีที่ 1 (year_1_rate)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น 1.49% หรือ คงที่ 2.20%"
                    value={promoForm.year_1_rate}
                    onChange={(e) => setPromoForm({ ...promoForm, year_1_rate: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Year 2-3 Rate */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ดอกเบี้ยปีที่ 2-3 (year_2_3_rate)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น 2.20% หรือ MRR-2.15%"
                    value={promoForm.year_2_3_rate}
                    onChange={(e) => setPromoForm({ ...promoForm, year_2_3_rate: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* After Year 3 Rate */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ดอกเบี้ยหลังปีที่ 3 (after_year_3_rate)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น MRR-1.50%"
                    value={promoForm.after_year_3_rate}
                    onChange={(e) => setPromoForm({ ...promoForm, after_year_3_rate: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                  />
                </div>

                {/* Image URL fallback text */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    URL รูปภาพแบนเนอร์ (promo_image_url)
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/banner.jpg หรือ /uploads/promo-xxx.png (อัปโหลดอัตโนมัติเมื่อบันทึก)"
                    value={promoForm.promo_image_url}
                    onChange={(e) => setPromoForm({ ...promoForm, promo_image_url: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                  />
                  {promoForm.promo_image_url && (
                    <img
                      src={promoForm.promo_image_url}
                      alt="Banner preview"
                      className="mt-2 h-16 rounded-lg border border-slate-200 object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </div>
              </div>

              {/* Switches for MRTA & Free Mortgage Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={promoForm.is_mrta}
                    onChange={(e) => setPromoForm({ ...promoForm, is_mrta: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">เงื่อนไขทำประกัน MRTA / MLTA (is_mrta)</span>
                    <span className="text-[10px] text-slate-500 block">ต้องสมัครประกันคุ้มครองวงเงินกู้เพื่อรับอัตราดอกเบี้ยนี้</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={promoForm.is_free_mortgage_fee}
                    onChange={(e) => setPromoForm({ ...promoForm, is_free_mortgage_fee: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">ฟรีค่าจดจำนอง 1% (is_free_mortgage_fee)</span>
                    <span className="text-[10px] text-slate-500 block">ธนาคารออกค่าจดจำนองให้ 1% ของวงเงินกู้</span>
                  </div>
                </label>
              </div>

              {/* GEMINI PARSE FAILURE -> MANUAL EMPTY FORM FALLBACK */}
              {extractionFailed && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-amber-800">
                        ⚠️ Gemini Vision วิเคราะห์รูปไม่สำเร็จ หรือไม่พบอัตราดอกเบี้ยที่อ่านได้
                      </h4>
                      <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                        ระบบเตรียมแบบฟอร์มว่างให้กรอกเองด้านล่างแล้ว — ตรวจสอบตัวเลขจากแบนเนอร์ต้นทางแล้วบันทึกเมื่อครบ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExtractionFailed(false)}
                    className="btn-secondary text-[11px] py-1.5 px-3 font-bold cursor-pointer"
                  >
                    รับทราบ — จะกรอกเอง
                  </button>
                </div>
              )}

              {/* FEE WAIVERS (multi-select chips) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  ค่าธรรมเนียมที่ธนาคารฟรีให้ (fee_waivers) — แสดงเป็น badge ในตาราง + ใช้คำนวณค่าธรรมเนียมจริง
                </h4>
                <div className="flex flex-wrap gap-2">
                  {FEE_WAIVER_TYPES.map(fee => {
                    const selected = (promoForm.fee_waivers || []).includes(fee);
                    return (
                      <button
                        key={fee}
                        type="button"
                        onClick={() => {
                          setPromoForm(prev => {
                            const next = selected
                              ? (prev.fee_waivers || []).filter(f => f !== fee)
                              : [...(prev.fee_waivers || []), fee];
                            return {
                              ...prev,
                              fee_waivers: next,
                              // Keep the free-mortgage-fee flag in sync with the waiver list
                              is_free_mortgage_fee: next.includes('จดจำนอง')
                            };
                          });
                        }}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-full border-2 transition-all cursor-pointer ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{fee}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* RATE MATRIX GRID — the AI-extracted condition rows, editable cell-by-cell */}
              <RateMatrixGrid
                matrix={promoForm.rate_matrix}
                onChange={handleRateMatrixChange}
                highlight={bannerQueue[activeQueueIndex]?.status === 'EXTRACTED'}
                title="ตารางเงื่อนไขดอกเบี้ยรายแถว (Rate Matrix) — ตรวจสอบกับรูปแบนเนอร์แล้วคลิกแก้ไขได้ทุกเซลล์"
              />

              {/* VARIANTS EDITOR (style 1-4 with MRTA condition, MRR formula, EIR) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      ตารางทางเลือกย่อย (variants[] — สไตล์ 1-4, เงื่อนไข MRTA, สูตร MRR, EIR)
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      สำหรับแบนเนอร์ตารางหลายแถว เช่น ทางเลือกที่ 1-2 มี MRTA / ทางเลือกที่ 3-4 ไม่มี MRTA
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addVariantRow}
                    className="btn-secondary text-[11px] py-1.5 px-3 font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> เพิ่มทางเลือก
                  </button>
                </div>

                {(promoForm.variants || []).length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-medium">
                    ยังไม่มีทางเลือกย่อย — ระบบจะใช้ดอกเบี้ยเฉลี่ย 3 ปีด้านบนเป็นค่าเริ่มต้น (แบนเนอร์ดอกเบี้ยเดียวไม่ต้องเพิ่ม)
                  </p>
                ) : (
                  <div className="space-y-2">
                    {promoForm.variants.map((variant, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-indigo-700">
                            สไตล์ที่ {variant.style || idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!variant.is_mrta}
                                onChange={(e) => updateVariantRow(idx, 'is_mrta', e.target.checked)}
                                className="w-3.5 h-3.5 cursor-pointer"
                              />
                              ต้องทำ MRTA
                            </label>
                            <button
                              type="button"
                              onClick={() => removeVariantRow(idx)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="ลบทางเลือกนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                          <input
                            type="text"
                            placeholder="ชื่อทางเลือก"
                            value={variant.style_name || ''}
                            onChange={(e) => updateVariantRow(idx, 'style_name', e.target.value)}
                            className="input-dark text-[11px] py-1.5"
                          />
                          <input
                            type="text"
                            placeholder="ปีที่ 1 เช่น 1.49%"
                            value={variant.year_1_rate || ''}
                            onChange={(e) => updateVariantRow(idx, 'year_1_rate', e.target.value)}
                            className="input-dark text-[11px] py-1.5"
                          />
                          <input
                            type="text"
                            placeholder="ปีที่ 2-3 เช่น 2.49%"
                            value={variant.year_2_3_rate || ''}
                            onChange={(e) => updateVariantRow(idx, 'year_2_3_rate', e.target.value)}
                            className="input-dark text-[11px] py-1.5"
                          />
                          <input
                            type="text"
                            placeholder="MRR เช่น MRR - 2.00%"
                            value={variant.mrr_formula || ''}
                            onChange={(e) => updateVariantRow(idx, 'mrr_formula', e.target.value)}
                            className="input-dark text-[11px] py-1.5"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="EIR %"
                            value={variant.eir || 0}
                            onChange={(e) => updateVariantRow(idx, 'eir', Number(e.target.value) || 0)}
                            className="input-dark text-[11px] py-1.5"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setPromoForm(INITIAL_FORM_STATE);
                  }}
                  className="btn-secondary text-xs px-5 py-2.5 font-bold cursor-pointer"
                >
                  ล้างฟอร์ม
                </button>

                <button
                  type="submit"
                  className="btn-gold text-xs font-black py-2.5 px-6 flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {promoForm.id ? 'อัปเดตข้อมูลใน Database' : 'บันทึกโปรโมชันลง Database'}
                </button>
              </div>
            </form>
          </div>

          {/* REFINANCE PROMOTIONS TABLE */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building className="w-5 h-5 text-indigo-600" />
                  รายการโปรโมชันดอกเบี้ยใน Database ({promotions.length} รายการ)
                </h3>
                <p className="text-xs text-slate-500 font-medium">ตารางแสดงอัตราดอกเบี้ยและลิงก์อ้างอิงของแต่ละธนาคาร</p>
              </div>
            </div>

            {loadingPromos ? (
              <div className="py-12 text-center text-xs text-slate-400 font-bold space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                <span>กำลังโหลดข้อมูลโปรโมชัน...</span>
              </div>
            ) : promotions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 font-medium space-y-2">
                <Building className="w-10 h-10 text-slate-300 mx-auto" />
                <span>ยังไม่มีข้อมูลโปรโมชันในระบบ กรุณาเพิ่มข้อมูลใหม่ด้านบน</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50">
                      <th className="py-3 px-4">ธนาคาร & แพ็กเกจ</th>
                      <th className="py-3 px-4 text-center">ดอกเบี้ยเฉลี่ย 3 ปี</th>
                      <th className="py-3 px-4">รายได้ขั้นต่ำ</th>
                      <th className="py-3 px-4">เงื่อนไขสิทธิพิเศษ</th>
                      <th className="py-3 px-4">ลิงก์อ้างอิงธนาคาร</th>
                      <th className="py-3 px-4 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {(promotions || []).map((promo) => (
                      <React.Fragment key={promo.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {promo.promo_image_url ? (
                              <img
                                src={promo.promo_image_url}
                                alt={`แบนเนอร์ ${promo.bank_name}`}
                                className="w-16 h-10 object-cover rounded-lg border border-slate-200 bg-white flex-shrink-0"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <div className="font-extrabold text-slate-900">{promo.bank_name}</div>
                              <div className="text-[11px] text-indigo-600 font-medium">{promo.product_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-base font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 inline-block">
                            {promo.avg_3yr_rate}%
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          <div>{promo.min_income > 0 ? `${promo.min_income.toLocaleString()} ฿` : 'ไม่กำหนดขั้นต่ำ'}</div>
                          {promo.customer_type && promo.customer_type !== 'ทุกประเภท' && (
                            <div className="text-[10px] text-slate-500 font-medium">👤 {promo.customer_type}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {promo.is_mrta ? (
                              <span className="bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200">
                                🛡️ MRTA Required
                              </span>
                            ) : (
                              <span className="bg-slate-50 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
                                ไม่บังคับ MRTA
                              </span>
                            )}
                            {(promo.fee_waivers || []).map(fee => (
                              <span key={fee} className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                                ฟรี{fee}
                              </span>
                            ))}
                            {(promo.property_types || []).length > 0 && (
                              <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-200">
                                🏠 {(promo.property_types || []).join(', ')}
                              </span>
                            )}
                            {Number(promo.max_ltv_percent) > 0 && (
                              <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                                LTV ≤ {promo.max_ltv_percent}%
                              </span>
                            )}
                            {(Number(promo.min_loan_amount) > 0 || Number(promo.max_loan_amount) > 0) && (
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
                                วงเงิน {Number(promo.min_loan_amount) > 0 ? `${(promo.min_loan_amount / 1000000).toLocaleString()}M` : '0'}
                                {'–'}
                                {Number(promo.max_loan_amount) > 0 ? `${(promo.max_loan_amount / 1000000).toLocaleString()}M` : '∞'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {promo.year_1_rate && `ปีแรก: ${promo.year_1_rate}`}
                            {promo.year_2_3_rate && ` | ปี 2-3: ${promo.year_2_3_rate}`}
                            {promo.after_year_3_rate && ` | หลังจากนั้น: ${promo.after_year_3_rate}`}
                          </div>
                          {(promo.variants || []).length > 0 && (
                            <div className="text-[10px] text-indigo-500 font-bold">
                              + {promo.variants.length} ทางเลือกย่อย (สไตล์ 1-{promo.variants.length})
                            </div>
                          )}
                          {(normalizeRateMatrix(promo.rate_matrix).length > 0) && (
                            <button
                              type="button"
                              onClick={() => toggleMatrixRow(promo.id)}
                              className="mt-1 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                            >
                              <Table2 className="w-3 h-3" />
                              {expandedMatrixId === promo.id ? 'ซ่อนตารางเมทริกซ์' : `ดูตารางเงื่อนไข (${normalizeRateMatrix(promo.rate_matrix).length} แถว)`}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {promo.bank_ref_link ? (
                            <a
                              href={promo.bank_ref_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-1 text-[11px]"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> เว็บไซต์ธนาคาร
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEditPromo(promo)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="แก้ไขโปรโมชัน"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePromo(promo.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="ลบโปรโมชัน"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedMatrixId === promo.id && (
                        <tr>
                          <td colSpan={7} className="px-4 py-3 bg-indigo-50/40 border-b border-indigo-100">
                            <RateMatrixGrid
                              matrix={promo.rate_matrix}
                              title={`ตารางเงื่อนไขดอกเบี้ย — ${promo.bank_name} / ${promo.product_name}`}
                            />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ==================== TAB 1.5: OCCUPATIONS MASTER CRUD ==================== */}
      {activeTab === 'occupations' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="badge-gold text-xs">
                <Briefcase className="w-3.5 h-3.5" />
                OCCUPATIONS MASTER LIST
              </span>
              <h2 className="text-lg font-black text-slate-900 pt-1">
                จัดการรายชื่ออาชีพหลัก (Master Occupations)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                รายชื่ออาชีพนี้จะแสดงใน dropdown ของฟอร์มรีไฟแนนซ์สำหรับผู้ใช้ทุกคน
              </p>
            </div>
            <button
              onClick={() => {
                setOccForm({ id: '', key: '', label: '', labelEn: '', allowed: true });
                setShowOccForm(true);
              }}
              className="btn-gold text-xs py-2.5 px-4 font-bold cursor-pointer flex items-center gap-1.5 self-start"
            >
              <Plus className="w-4 h-4" />
              เพิ่มอาชีพใหม่
            </button>
          </div>

          {showOccForm && (
            <form onSubmit={handleSaveOccupation} className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-black text-indigo-900">
                {occForm.id ? '✏️ แก้ไขอาชีพ' : '➕ เพิ่มอาชีพใหม่'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ชื่ออาชีพ (ไทย) *</label>
                  <input
                    type="text"
                    value={occForm.label}
                    onChange={(e) => setOccForm({ ...occForm, label: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                    placeholder="เช่น ครู / พยาบาล"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ชื่อภาษาอังกฤษ (labelEn)</label>
                  <input
                    type="text"
                    value={occForm.labelEn}
                    onChange={(e) => setOccForm({ ...occForm, labelEn: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                    placeholder="เช่น Teacher / Nurse"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Key (ระบบ)</label>
                  <input
                    type="text"
                    value={occForm.key}
                    onChange={(e) => setOccForm({ ...occForm, key: e.target.value })}
                    className="input-dark text-xs py-2 w-full"
                    placeholder="เช่น teacher (เว้นว่าง = สร้างอัตโนมัติ)"
                    disabled={Boolean(occForm.id)}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer p-2">
                    <input
                      type="checkbox"
                      checked={occForm.allowed}
                      onChange={(e) => setOccForm({ ...occForm, allowed: e.target.checked })}
                      className="w-4 h-4 cursor-pointer"
                    />
                    เปิดใช้งาน (แสดงในฟอร์มผู้ใช้)
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOccForm(false)}
                  className="btn-secondary text-xs py-2 px-4 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-gold text-xs py-2 px-5 font-bold cursor-pointer">
                  บันทึกอาชีพ
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">ชื่ออาชีพ (ไทย)</th>
                  <th className="py-2.5 px-3">English</th>
                  <th className="py-2.5 px-3">Key</th>
                  <th className="py-2.5 px-3 text-center">สถานะ</th>
                  <th className="py-2.5 px-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {occupations.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-400">
                      ยังไม่มีรายชื่ออาชีพ — กด "เพิ่มอาชีพใหม่" เพื่อสร้าง
                    </td>
                  </tr>
                ) : (
                  (occupations || []).map((occ) => (
                    <tr key={occ.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{occ.label}</td>
                      <td className="py-2.5 px-3 text-slate-600">{occ.labelEn || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-indigo-600">{occ.key}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                          occ.allowed !== false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {occ.allowed !== false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setOccForm({
                                id: occ.id,
                                key: occ.key || '',
                                label: occ.label || '',
                                labelEn: occ.labelEn || '',
                                allowed: occ.allowed !== false
                              });
                              setShowOccForm(true);
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="แก้ไขอาชีพ"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteOccupation(occ.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="ลบอาชีพ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: USER DEBT MANAGEMENT ==================== */}
      {activeTab === 'user_mgmt' && (
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
                {(managedUserData?.debts || []).length === 0 ? (
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
      )}

      {/* ==================== TAB 3: OCR AUDIT LOGS ==================== */}
      {activeTab === 'ocr_logs' && (
        <div className="bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                ประวัติการสแกน OCR หลังบ้าน (OCR Extraction Audit Logs)
              </h3>
              <p className="text-xs text-slate-500 font-medium">ตรวจสอบความถูกต้องและผลการดึงข้อมูลจากรูปภาพของผู้ใช้</p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อไฟล์ หรือ User ID..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="input-dark pl-9 text-xs py-2"
                />
              </div>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="input-dark text-xs py-2 w-full sm:w-36 bg-white font-medium"
              >
                <option value="ALL">ทุกสถานะ</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="PENDING">PENDING</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50">
                  <th className="py-3 px-4">Log ID & เวลา</th>
                  <th className="py-3 px-4">ผู้ใช้งาน (User ID)</th>
                  <th className="py-3 px-4">ชื่อไฟล์รูปภาพ</th>
                  <th className="py-3 px-4 text-center">สถานะ OCR</th>
                  <th className="py-3 px-4 text-center">Accuracy (%)</th>
                  <th className="py-3 px-4">ข้อมูลที่สกัดได้ (Extracted Summary)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {(filteredOcrLogs || []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500">
                      <div className="text-indigo-600 font-bold">{log.id}</div>
                      <div className="text-[10px] text-slate-400">{log.timestamp}</div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {log.user}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {log.fileName}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="badge-green">
                        <CheckCircle2 className="w-3 h-3" />
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-extrabold text-indigo-600">
                      {log.confidence}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {log.extractedItems}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SYSTEM LOGS & SERVER NODES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 space-y-3 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600" />
            System Live Activity Console
          </h3>

          <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2 h-48 overflow-y-auto">
            {(adminData?.systemLogs || []).map((sLog) => (
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

        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            การตั้งค่าและควบคุมระบบหลังบ้าน
          </h3>

          <div className="space-y-3 text-xs font-semibold">
            <button 
              onClick={() => alert('ล้างแคชระบบ OCR สำเร็จ!')}
              className="btn-secondary w-full justify-between cursor-pointer"
            >
              <span>ล้างแคช OCR Simulation</span>
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button 
              onClick={() => alert('ส่งคำสั่ง Re-train AI Engine Parameters เรียบร้อยแล้ว')}
              className="btn-secondary w-full justify-between cursor-pointer"
            >
              <span>Re-tune AI Payoff Algorithm</span>
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            </button>

            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 font-medium">
              <strong>Admin Note:</strong> ระบบ Gemini Vision API และ Database Refinance Promotion Active ทุก Node
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
