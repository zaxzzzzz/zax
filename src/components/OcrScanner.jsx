import React, { useState, useMemo } from 'react';
import {
  Upload,
  Camera,
  FileText,
  CheckCircle,
  Sparkles,
  Scan,
  Trash2,
  ArrowRight,
  AlertCircle,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Loader2
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { MOCK_OCR_SAMPLES } from '../data/mockData';
import { parseOcrText } from '../utils/ocrParser';
import { extractDebtDataFromImage } from '../services/geminiService';

export default function OcrScanner({ onImportDebts, onNavigateToCalculator }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState('');
  const [scanResults, setScanResults] = useState([]);
  const [selectedResultIds, setSelectedResultIds] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);

  // Handle Multi-file selection
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newFiles = files.map((file, idx) => ({
      id: `uploaded-${Date.now()}-${idx}`,
      file,
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      previewUrl: URL.createObjectURL(file)
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  // Load sample multi-image mock data (preset demo data, clearly labeled)
  const loadMockSamples = () => {
    const mockFiles = MOCK_OCR_SAMPLES.map(sample => ({
      id: sample.id,
      name: sample.fileName,
      size: sample.fileSize,
      previewUrl: sample.previewUrl,
      extracted: sample.extracted
    }));

    setSelectedFiles(mockFiles);
  };

  // Real Multi-Image OCR Scan using Tesseract.js (runs inside the browser)
  const startScanProcess = async () => {
    if (selectedFiles.length === 0) return;

    setIsScanning(true);
    setScanError('');
    setScanProgress(0);
    setScanResults([]);
    setSelectedResultIds([]);

    // Files with preset demo data (sample images) skip OCR
    const presetFiles = selectedFiles.filter(f => f.extracted);
    const scanFiles = selectedFiles.filter(f => !f.extracted);

    const results = presetFiles.map(f => ({
      id: f.id,
      fileName: f.name,
      previewUrl: f.previewUrl,
      isMock: true,
      confidence: Math.round((f.extracted.confidence || 0.98) * 100),
      text: '',
      hasText: false,
      data: { ...f.extracted }
    }));

    let scanned = 0;
    if (scanFiles.length > 0) {
      let worker = null;
      const ocrOptions = {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress !== undefined) {
            const overall = Math.min(99, Math.round(((scanned + m.progress) / scanFiles.length) * 100));
            setScanProgress(overall);
          }
        }
      };
      try {
        // First run downloads the OCR model + language data (~15 MB) from CDN.
        // Thai + English are tried together; if EITHER language pack fails to
        // download the whole worker rejects, so retry English-only to keep
        // reading working (Thai text will just be skipped in that case).
        try {
          worker = await createWorker(['tha', 'eng'], 1, ocrOptions);
        } catch (langErr) {
          console.warn('Thai+English OCR worker failed, retrying with English only:', langErr);
          worker = await createWorker('eng', 1, ocrOptions);
        }
      } catch (e) {
        console.error('Failed to load Tesseract worker:', e);
        setScanError(
          'ไม่สามารถโหลดโมเดล AI อ่านภาพได้ (ครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ตเพื่อดาวน์โหลดโมเดล) — ' +
          'กรุณากรอกข้อมูลใบแจ้งหนี้ด้วยตนเองด้านล่าง หรือลองใหม่ภายหลัง'
        );
        // Fall back to manual-entry cards so the user is never blocked
        scanFiles.forEach(f => {
          results.push({
            id: f.id,
            fileName: f.name,
            previewUrl: f.previewUrl,
            isMock: false,
            confidence: 0,
            text: '',
            hasText: false,
            data: { name: '', lender: '', balance: '', interestRate: '', minPayment: '', dueDate: '' }
          });
        });
        setScanResults(results);
        setSelectedResultIds(results.map(r => r.id));
        setScanProgress(100);
        setIsScanning(false);
        return;
      }

      try {
        for (let i = 0; i < scanFiles.length; i++) {
          const f = scanFiles[i];
          let aiResult = null;
          let isAi = false;
          let confidence = 0;
          let text = '';
          let parsedData = null;

          // Attempt Gemini AI processing if file object is present
          if (f.file) {
            try {
              const geminiData = await extractDebtDataFromImage(f.file, { fallbackToTesseract: false });
              if (geminiData && (geminiData.totalBalance || geminiData.issuerName || geminiData.bankName)) {
                aiResult = geminiData;
                isAi = true;
                confidence = 99;
                text = `สกัดด้วย Gemini AI Vision:\nผู้ออกเอกสาร: ${geminiData.issuerName || geminiData.bankName}\nประเภท: ${geminiData.debtCategory || geminiData.documentType}\nยอดรวม: ฿${geminiData.totalBalance}`;
              }
            } catch (geminiErr) {
              console.warn(`Gemini AI scan skipped/failed for ${f.name}, falling back to local OCR:`, geminiErr);
            }
          }

          if (aiResult) {
            parsedData = {
              name: aiResult.name || `ใบแจ้งหนี้ - ${aiResult.issuerName || aiResult.bankName || 'Salford & Co.'}`,
              lender: aiResult.issuerName || aiResult.bankName || 'Salford & Co.',
              balance: aiResult.totalBalance !== undefined && aiResult.totalBalance !== null ? String(aiResult.totalBalance) : '',
              interestRate: aiResult.interestRate !== undefined && aiResult.interestRate !== null ? String(aiResult.interestRate) : '0',
              minPayment: aiResult.minimumPayment !== undefined && aiResult.minimumPayment !== null ? String(aiResult.minimumPayment) : String(aiResult.totalBalance || ''),
              dueDate: aiResult.dueDate || 'ไม่ระบุ'
            };
          } else {
            // Fallback to Tesseract OCR
            const imageSource = f.file || f.previewUrl;
            try {
              const { data } = await worker.recognize(imageSource);
              text = (data.text || '').trim();
              confidence = Math.round(data.confidence || 0);
            } catch (e) {
              console.warn(`OCR recognize failed for ${f.name}:`, e);
            }
            const parsed = parseOcrText(text);
            parsedData = parsed.data;
          }

          results.push({
            id: f.id,
            fileName: f.name,
            previewUrl: f.previewUrl,
            isMock: false,
            isAi,
            confidence,
            text,
            hasText: true,
            data: parsedData
          });
          scanned += 1;
        }
      } finally {
        try { await worker.terminate(); } catch (e) { /* ignore */ }
      }
    }

    setScanResults(results);
    setSelectedResultIds(results.map(r => r.id));
    setScanProgress(100);
    setIsScanning(false);
  };

  // Toggle selection for import
  const toggleSelectResult = (id) => {
    if (selectedResultIds.includes(id)) {
      setSelectedResultIds(selectedResultIds.filter(i => i !== id));
    } else {
      setSelectedResultIds([...selectedResultIds, id]);
    }
  };

  // Edit an auto-filled field before importing
  const updateResultField = (id, field, value) => {
    setScanResults(prev => prev.map(r => r.id === id ? { ...r, data: { ...r.data, [field]: value } } : r));
  };

  // Category selection state for items without a category
  const [categoryMap, setCategoryMap] = useState({});
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Check if any selected items are missing debtCategory
  const uncatItems = useMemo(() => {
    return scanResults.filter(r =>
      selectedResultIds.includes(r.id) &&
      !r.data.debtCategory &&
      Number(r.data.balance) > 0
    );
  }, [scanResults, selectedResultIds]);

  const handleConfirmImport = () => {
    // If there are unclassified items, show category picker first
    if (uncatItems.length > 0) {
      setShowCategoryPicker(true);
      return;
    }
    doImport();
  };

  const doImport = () => {
    const itemsToImport = scanResults
      .filter(r => selectedResultIds.includes(r.id))
      .map(r => ({
        id: `scanned-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: (r.data.name || '').trim() || `ใบแจ้งหนี้ ${r.fileName}`,
        lender: (r.data.lender || '').trim() || 'ไม่ระบุ',
        balance: Number(r.data.balance) || 0,
        interestRate: Number(r.data.interestRate) || 0,
        minPayment: Number(r.data.minPayment) || 0,
        dueDate: (r.data.dueDate || '').trim() || '15 ของทุกเดือน',
        debtCategory: categoryMap[r.id] || r.data.debtCategory || 'OTHER',
        isScanned: true
      }))
      .filter(item => item.balance > 0);

    if (itemsToImport.length > 0) {
      onImportDebts(itemsToImport);
      onNavigateToCalculator();
    } else {
      setScanError('ยังไม่มีรายการที่กรอกยอดหนี้คงเหลือ (บาท) — กรุณากรอกยอดหนี้อย่างน้อย 1 รายการก่อนนำเข้า');
    }
  };

  const updateCategory = (id, cat) => {
    setCategoryMap(prev => ({ ...prev, [id]: cat }));
  };

  const allCategorized = uncatItems.every(r => categoryMap[r.id]);

  return (
    <div className="ocr-page space-y-6 animate-fade-in">

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge-gold">
                <Scan className="w-3.5 h-3.5" />
                OCR Multi-Image Scanner Engine
              </span>
              <span className="badge-blue">รองรับหลายไฟล์พร้อมกัน</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              สแกนและนำเข้าใบแจ้งหนี้อัตโนมัติ (Multi-Image Import)
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl">
              สามารถเลือกหรือลากไฟล์รูปภาพใบแจ้งหนี้ <strong className="text-indigo-600">หลายรูปพร้อมกัน</strong> หรือใช้กล้องถ่ายรูป ระบบ AI OCR จะอ่านข้อความจากรูปจริง เพื่อดึงข้อมูล ยอดหนี้ อัตราดอกเบี้ย ยอดขั้นต่ำ และวันครบกำหนดให้อัตโนมัติ
            </p>
          </div>

          <button
            onClick={loadMockSamples}
            className="btn-secondary text-xs whitespace-nowrap border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            โหลดตัวอย่างรูปใบแจ้งหนี้ 3 รูป
          </button>
        </div>
      </div>

      {/* Multi-Image File Dropzone & Camera Trigger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Col: Upload Zone */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              1. เลือกไฟล์รูปภาพใบแจ้งหนี้ ( multi-image )
            </h3>
            <span className="text-xs text-slate-500 font-semibold">
              เลือกแล้ว {selectedFiles.length} รูป
            </span>
          </div>

          {/* Drag and Drop Zone */}
          <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 rounded-2xl p-8 text-center bg-slate-50/70 transition-all group relative">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              id="multiFileInput"
            />
            <div className="space-y-3 pointer-events-none">
              <div className="w-14 h-14 mx-auto rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shadow-xs">
                <ImageIcon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  ลากและวางรูปภาพใบแจ้งหนี้ที่นี่ หรือ <span className="text-indigo-600 underline">คลิกเพื่อเลือกไฟล์</span>
                </p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  รองรับไฟล์ PNG, JPG, JPEG (กด Shift หรือ Ctrl เพื่อเลือกทีละหลายๆ รูป)
                </p>
              </div>
            </div>
          </div>

          {/* Camera Capture Simulator Button */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCameraActive(!cameraActive)}
              className="btn-secondary text-xs gap-2 font-semibold"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              {cameraActive ? 'ปิดกล้องถ่ายรูป' : 'เปิดกล้องถ่ายใบแจ้งหนี้'}
            </button>

            {selectedFiles.length > 0 && (
              <button
                onClick={() => setSelectedFiles([])}
                className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ล้างไฟล์ทั้งหมด
              </button>
            )}
          </div>

          {/* Camera Simulator Popup */}
          {cameraActive && (
            <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 space-y-3 animate-fade-in text-center shadow-lg">
              <div className="h-48 bg-slate-950 rounded-lg flex flex-col items-center justify-center relative overflow-hidden border border-slate-800">
                <Camera className="w-12 h-12 text-indigo-400 mb-2 animate-bounce" />
                <p className="text-xs text-slate-400 font-medium">จำลองกล้องถ่ายรูป (Camera Simulator Viewfinder)</p>
                <div className="absolute inset-4 border border-indigo-400/40 rounded border-dashed pointer-events-none" />
              </div>
              <button
                onClick={() => {
                  const cameraMock = {
                    id: `cam-${Date.now()}`,
                    name: `camera_snapshot_${Date.now()}.jpg`,
                    size: '2.1 MB',
                    previewUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=400&q=80'
                  };
                  setSelectedFiles(prev => [...prev, cameraMock]);
                  setCameraActive(false);
                }}
                className="btn-gold text-xs w-full justify-center font-bold"
              >
                <Camera className="w-4 h-4" />
                กดถ่ายรูปใบแจ้งหนี้เพื่อเพิ่มในรายการ
              </button>
            </div>
          )}

          {/* Selected File Previews Grid */}
          {selectedFiles.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-slate-800">รายการรูปภาพที่เลือกไว้เตรียมสแกน:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selectedFiles.map((file) => (
                  <div key={file.id} className="relative group bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center gap-3">
                    <img
                      src={file.previewUrl}
                      alt={file.name}
                      className="w-12 h-12 rounded-lg object-cover bg-slate-200 border border-slate-300 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-500 font-medium">{file.size}</div>
                    </div>
                    <button
                      onClick={() => setSelectedFiles(selectedFiles.filter(f => f.id !== file.id))}
                      className="text-slate-400 hover:text-rose-600 p-1 font-bold"
                      title="ลบออก"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Start Scan Button */}
              <button
                onClick={startScanProcess}
                disabled={isScanning}
                className="btn-gold text-sm w-full justify-center py-3 mt-4 shadow-md font-bold"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    กำลังอ่านข้อความจากรูปภาพด้วย AI ({scanProgress}%)...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    เริ่มสแกนอ่านข้อมูลจากรูปภาพทั้งหมด ({selectedFiles.length} รูป)
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400 font-medium text-center">
                ครั้งแรกจะดาวน์โหลดโมเดล AI อ่านภาพ (~15 MB) และประมวลผลในเครื่องเบราว์เซอร์
              </p>
            </div>
          )}

        </div>

        {/* Right Col: Process & Scan Tips */}
        <div className="bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Scan className="w-5 h-5 text-indigo-600" />
            ข้อแนะนำการสแกน OCR
          </h3>

          <div className="space-y-3 text-xs text-slate-700">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-indigo-700 block">📷 รูปถ่ายที่ชัดเจน</span>
              <p className="text-slate-600 font-medium">ควรถ่ายรูปใบแจ้งหนี้ให้เห็นหัวกระดาษ ยอดหนี้รวม และอัตราดอกเบี้ยอย่างชัดเจน ยิ่งตัวหนังสือคมชัด ยิ่งอ่านได้แม่นยำ</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-indigo-700 block">📁 การเลือกหลายไฟล์ (Multi-Image)</span>
              <p className="text-slate-600 font-medium">หากมีใบแจ้งหนี้หลายฉบับ เช่น บัตร 3 ใบ สามารถลากไฟล์เข้ามาพร้อมกันในครั้งเดียวได้เลย</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-indigo-700 block">✏️ ตรวจสอบก่อนนำเข้า</span>
              <p className="text-slate-600 font-medium">ตัวเลขที่ AI อ่านได้อาจคลาดเคลื่อนจากภาพที่ไม่ชัด — ตรวจสอบและแก้ไขได้ก่อนกดนำเข้าตารางคำนวณ</p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-indigo-700 block">🔒 ความปลอดภัยข้อมูล</span>
              <p className="text-slate-600 font-medium">รูปภาพใบแจ้งหนี้ของคุณถูกประมวลผลภายในเบราว์เซอร์ ไม่ถูกอัปโหลดไปยังเซิร์ฟเวอร์</p>
            </div>
          </div>
        </div>

      </div>

      {/* OCR RESULTS SECTION */}
      {scanResults.length > 0 && (
        <div className="bg-white p-6 rounded-2xl space-y-5 animate-fade-in border border-indigo-200 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                ผลการอ่านข้อมูลจากรูปภาพ ({scanResults.length} รายการ)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                AI อ่านข้อความจากรูปภาพจริงและกรอกค่าให้อัตโนมัติ — กรุณาตรวจสอบและแก้ไขให้ถูกต้องก่อนนำเข้า
              </p>
            </div>

            <button
              onClick={handleConfirmImport}
              disabled={selectedResultIds.length === 0}
              className="btn-gold text-xs shadow-md font-bold"
            >
              นำเข้า {selectedResultIds.length} รายการสู่ตารางคำนวณ
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {scanError && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
              {scanError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scanResults.map((item) => {
              const isSelected = selectedResultIds.includes(item.id);
              const hasText = Boolean(item.text);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelectResult(item.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-500 shadow-md'
                      : 'bg-slate-50/50 border-slate-200 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* Card Top */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelectResult(item.id); }}
                        className="flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                      <span className="text-xs font-extrabold text-slate-900 truncate">
                        {item.data.name || 'รายการจากใบแจ้งหนี้'}
                      </span>
                    </div>

                    {item.isMock ? (
                      <span className="badge-gold text-[10px]">ข้อมูลตัวอย่าง</span>
                    ) : item.confidence > 0 ? (
                      <span className="badge-gold text-[10px]">{item.confidence}% Accuracy</span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-200/60 rounded-full px-2 py-0.5">
                        ไม่พบข้อความ
                      </span>
                    )}
                  </div>

                  {/* Editable extracted fields */}
                  <div onClick={(e) => e.stopPropagation()} className="space-y-2 pt-2 border-t border-slate-200/60">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ชื่อรายการหนี้</label>
                        <input
                          type="text"
                          value={item.data.name}
                          onChange={(e) => updateResultField(item.id, 'name', e.target.value)}
                          placeholder="เช่น บัตรเครดิต KTC"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">สถาบันการเงิน</label>
                        <input
                          type="text"
                          value={item.data.lender}
                          onChange={(e) => updateResultField(item.id, 'lender', e.target.value)}
                          placeholder="เช่น ธนาคารกสิกรไทย"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ยอดหนี้คงเหลือ (บาท)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.data.balance}
                          onChange={(e) => updateResultField(item.id, 'balance', e.target.value)}
                          placeholder="0"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">อัตราดอกเบี้ย (%/ปี)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.data.interestRate}
                          onChange={(e) => updateResultField(item.id, 'interestRate', e.target.value)}
                          placeholder="0"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ชำระขั้นต่ำ (บาท)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.data.minPayment}
                          onChange={(e) => updateResultField(item.id, 'minPayment', e.target.value)}
                          placeholder="0"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">วันครบกำหนด</label>
                        <input
                          type="text"
                          value={item.data.dueDate}
                          onChange={(e) => updateResultField(item.id, 'dueDate', e.target.value)}
                          placeholder="เช่น 15 ของทุกเดือน"
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400"
                        />
                      </div>
                    </div>

                    {!item.isMock && !hasText && (
                      <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-2 py-1.5 text-[10px] font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        ไม่พบข้อความในรูปหรือรูปไม่ชัดเจน — กรุณาตรวจสอบ / กรอกข้อมูลด้วยตนเอง
                      </div>
                    )}

                    {hasText && (
                      <details className="group">
                        <summary className="text-[10px] font-bold text-slate-500 cursor-pointer flex items-center gap-1 hover:text-indigo-600 select-none">
                          <FileText className="w-3 h-3" />
                          ดูข้อความที่ AI อ่านได้จากรูป
                        </summary>
                        <pre className="mt-1 p-2 bg-slate-900 text-emerald-300 text-[10px] leading-relaxed rounded-lg max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono">
                          {item.text}
                        </pre>
                      </details>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fade-in border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">กรุณาระบุประเภทหนี้</h3>
                <p className="text-xs text-slate-500">AI ไม่สามารถแยกประเภทหนี้ได้อัตโนมัติ กรุณาเลือกประเภทให้ถูกต้อง</p>
              </div>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {uncatItems.map(item => (
                <div key={item.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-bold text-slate-800 truncate">{item.data.name || item.fileName}</span>
                    <span className="text-xs text-slate-500 ml-auto">฿{Number(item.data.balance || 0).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { value: 'CREDIT_CARD', label: '💳 บัตรเครดิต' },
                      { value: 'PERSONAL_LOAN', label: '💰 สินเชื่อบุคคล' },
                      { value: 'HOME_LOAN', label: '🏠 สินเชื่อบ้าน' },
                      { value: 'BNPL', label: '🛒 ซื้อก่อนจ่ายทีหลัง' },
                      { value: 'COMMERCIAL_INVOICE', label: '📄 ใบแจ้งหนี้' },
                      { value: 'OTHER', label: '📋 อื่นๆ' }
                    ].map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => updateCategory(item.id, cat.value)}
                        className={`text-[11px] font-bold p-2 rounded-lg border transition-all cursor-pointer ${
                          categoryMap[item.id] === cat.value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setShowCategoryPicker(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-4 py-2"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => { setShowCategoryPicker(false); doImport(); }}
                disabled={!allCategorized}
                className={`btn-gold text-xs py-2.5 px-5 font-extrabold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                ยืนยันนำเข้า ({uncatItems.length} รายการ)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
