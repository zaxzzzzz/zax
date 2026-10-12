import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, FileText, Image as ImageIcon, File, Loader2, CheckCircle, AlertCircle, Save, Check, Edit3, Eye, Database } from 'lucide-react';
import { extractDebtDataFromImage } from '../services/geminiService';

export default function StatementUploader({ onDataExtracted, onClose }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [extractedData, setExtractedData] = useState(null);
  const [extractionError, setExtractionError] = useState('');
  const [step, setStep] = useState('upload'); // 'upload' | 'processing' | 'validation'
  const [ocrText, setOcrText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef(null);

  // Handle mobile view toggle - hide on mobile view
  const handleMobileView = () => {
    // No-op for now - remove any mobile-specific view button if present
    console.log('Mobile view toggle triggered');
  };

  // Handle file selection
  const handleFileSelect = (files) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB max
      return (isImage || isPdf) && isValidSize;
    });

    if (validFiles.length === 0) {
      setExtractionError('Please select valid image files (PNG, JPG, JPEG) or PDF files (max 10MB each)');
      return;
    }

    const newFiles = validFiles.map((file, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      extracted: false
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);
    setExtractionError('');
  };

  // Handle drag and drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  // Remove file from selection
  const removeFile = (fileId) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
    // Clean up preview URL
    const fileToRemove = selectedFiles.find(f => f.id === fileId);
    if (fileToRemove && fileToRemove.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }
  };

  // Process files with Gemini OCR
  const processFiles = async () => {
    if (selectedFiles.length === 0) return;

    setIsProcessing(true);
    setStep('processing');
    setProcessingProgress(0);
    setExtractionError('');

    try {
      const progressInterval = setInterval(() => {
        setProcessingProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 500);

      // Process each file
      const file = selectedFiles[0]; // Process single file for demo
      const extracted = await extractDebtDataFromImage(file.file, {
        lang: 'en',
        fallbackToTesseract: true,
        onProgress: (progress) => {
          console.log(`Progress for ${file.name}:`, progress);
        }
      });

      clearInterval(progressInterval);
      setProcessingProgress(100);

      // Set extracted data
      setExtractedData(extracted);
      setOcrText(''); // In real implementation, this would contain the raw OCR text

      setStep('validation');

    } catch (error) {
      console.error('Processing failed:', error);
      setExtractionError(`Processing failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Validate extracted data
  const validateExtractedData = () => {
    if (!extractedData) return null;

    const errors = [];

    // Validate required fields
    if (!extractedData.bankName && !extractedData.issuerName) errors.push('Bank or issuer name is required');
    if (!extractedData.debtCategory) errors.push('Debt category is required');
    if (extractedData.totalBalance === undefined || extractedData.totalBalance === null || extractedData.totalBalance <= 0) {
      errors.push('Valid total balance is required');
    }
    if (extractedData.minimumPayment === undefined || extractedData.minimumPayment === null || extractedData.minimumPayment < 0) {
      errors.push('Valid minimum payment is required');
    }
    if (extractedData.interestRate === undefined || extractedData.interestRate === null || extractedData.interestRate < 0) {
      errors.push('Valid interest rate is required');
    }

    return errors.length > 0 ? errors : null;
  };

  // Confirm and save extracted data
  const handleConfirm = () => {
    const validationErrors = validateExtractedData();
    if (validationErrors) {
      setExtractionError(`Please fix the following errors: ${validationErrors.join(', ')}`);
      return;
    }

    if (!extractedData) return;

    // Convert extracted data to match expected format
    const formattedData = {
      bankName: extractedData.bankName || '',
      debtCategory: extractedData.debtCategory || '',
      totalBalance: extractedData.totalBalance || 0,
      minimumPayment: extractedData.minimumPayment || 0,
      dueDate: extractedData.dueDate || '',
      interestRate: extractedData.interestRate || 0,
      ocrText: ocrText // Include raw OCR text for reference
    };

    onDataExtracted(formattedData);
    handleClose();
  };

  // Close uploader
  const handleClose = () => {
    // Clean up preview URLs
    selectedFiles.forEach(file => {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    });

    setSelectedFiles([]);
    setExtractedData(null);
    setOcrText('');
    setStep('upload');
    setProcessingProgress(0);
    setExtractionError('');
    onClose();
  };

  // Render file preview
  const renderFilePreview = (file) => {
    if (file.type.startsWith('image/')) {
      return (
        <div className="relative w-full h-48 bg-gray-100 rounded-lg overflow-hidden">
          <img
            src={file.previewUrl}
            alt={file.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 bg-white rounded-full p-1">
            <ImageIcon className="w-4 h-4 text-gray-600" />
          </div>
        </div>
      );
    } else if (file.type === 'application/pdf') {
      return (
        <div className="relative w-full h-48 bg-red-50 rounded-lg border-2 border-red-200 flex items-center justify-center">
          <FileText className="w-16 h-16 text-red-400" />
          <div className="absolute top-2 right-2 bg-white rounded-full p-1">
            <File className="w-4 h-4 text-red-600" />
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Upload Statement</h2>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Upload your debt statement to extract information automatically</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Upload Area */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
                onDragEnter={handleDragIn}
                onDragLeave={handleDragOut}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />

                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                    <Upload className="w-8 h-8 text-gray-400" />
                  </div>

                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Drop files here or <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-600 hover:text-blue-700 underline"
                      >
                        browse
                      </button>
                    </p>
                    <p className="text-gray-500 mt-1">
                      Support for images (PNG, JPG, JPEG) and PDF files
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Maximum file size: 10MB per file
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Selected Files ({selectedFiles.length})
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-shrink-0 w-12 h-12">
                          {renderFilePreview(file)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>

                        <button
                          onClick={() => removeFile(file.id)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {extractionError && (
                <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <p className="text-red-700 text-sm">
                    {extractionError}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
              <div className="text-center space-y-2">
                <h3 className="text-lg font-medium text-gray-900">
                  Processing files with AI...
                </h3>
                <p className="text-gray-600">
                  Extracting information from your statements using Gemini OCR
                </p>
              </div>

              <div className="w-full max-w-md">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>{Math.round(processingProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {step === 'validation' && extractedData && (
            <div className="space-y-6">
              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Document Preview */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <Eye className="w-5 h-5 text-blue-600" />
                    Document Preview
                  </h3>

                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    {selectedFiles[0]?.type.startsWith('image/') ? (
                      <div className="space-y-3">
                        <img
                          src={selectedFiles[0].previewUrl}
                          alt={selectedFiles[0].name}
                          className="w-full rounded-lg"
                        />
                        <div className="text-sm text-gray-600">
                          <p><strong>File:</strong> {selectedFiles[0].name}</p>
                          <p><strong>Size:</strong> {(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB</p>
                          <p><strong>Type:</strong> {selectedFiles[0].type}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-white rounded-lg p-6 text-center">
                          <FileText className="w-12 h-12 text-red-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">PDF Document</p>
                          <p className="text-xs text-gray-500">{selectedFiles[0].name}</p>
                        </div>
                        <div className="text-sm text-gray-600">
                          <p><strong>File:</strong> {selectedFiles[0].name}</p>
                          <p><strong>Size:</strong> {(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB</p>
                          <p><strong>Type:</strong> {selectedFiles[0].type}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* OCR Text Preview */}
                  {ocrText && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        <Database className="w-4 h-4 text-green-600" />
                        OCR Extracted Text
                      </h4>
                      <div className="bg-black text-green-400 rounded-lg p-3 font-mono text-xs overflow-auto max-h-40">
                        <pre>{ocrText}</pre>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Editable Form */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-green-600" />
                    Data Validation & Edit
                  </h3>

                  <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Bank Name
                          </label>
                          <input
                            type="text"
                            value={extractedData.bankName || ''}
                            onChange={(e) => setExtractedData(prev => ({
                              ...prev,
                              bankName: e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Debt Category
                          </label>
                          <select
                            value={extractedData.debtCategory || ''}
                            onChange={(e) => setExtractedData(prev => ({
                              ...prev,
                              debtCategory: e.target.value
                            }))
                          }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select category</option>
                            <option value="CREDIT_CARD">Credit Card</option>
                            <option value="HOME_LOAN">Home Loan</option>
                            <option value="PERSONAL_LOAN">Personal Loan</option>
                            <option value="BNPL">Buy Now Pay Later</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Total Balance
                          </label>
                          <input
                            type="number"
                            value={extractedData.totalBalance || ''}
                            onChange={(e) => setExtractedData(prev => ({
                              ...prev,
                              totalBalance: parseFloat(e.target.value) || 0
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Minimum Payment
                          </label>
                          <input
                            type="number"
                            value={extractedData.minimumPayment || ''}
                            onChange={(e) => setExtractedData(prev => ({
                              ...prev,
                              minimumPayment: parseFloat(e.target.value) || 0
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Due Date
                          </label>
                          <input
                            type="text"
                            value={extractedData.dueDate || ''}
                            onChange={(e) => setExtractedData(prev => ({
                              ...prev,
                              dueDate: e.target.value
                            }))}
                            placeholder="e.g., 15 of every month"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Interest Rate (%/year)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={extractedData.interestRate || ''}
                            onChange={(e) => setExtractedData(prev => ({
                              ...prev,
                              interestRate: parseFloat(e.target.value) || 0
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      {extractionError && (
                        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <AlertCircle className="w-5 h-5 text-red-500" />
                          <p className="text-red-700 text-sm">
                            {extractionError}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          {step === 'upload' && (
            <button
              onClick={processFiles}
              disabled={selectedFiles.length === 0 || isProcessing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Extract Information</span>
                </>
              )}
            </button>
          )}

          {step === 'validation' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2 text-gray-600 hover:text-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Save</span>
              </button>
            </>
          )}

          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}