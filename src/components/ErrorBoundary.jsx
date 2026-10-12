import React from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react';

/**
 * ErrorBoundary Component
 * Prevents "White Screen of Death" by catching runtime render exceptions,
 * displaying a friendly Thai fallback UI, showing technical details, and providing a retry/reset button.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught a runtime exception:', error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleCopyDetails = () => {
    const text = `Error: ${this.state.error?.message || this.state.error}\n\nStack Trace:\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard.writeText(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, reset: this.handleReset })
          : this.props.fallback;
      }

      return (
        <div className="min-h-[380px] w-full p-6 bg-slate-50 border-2 border-rose-200 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center my-6">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-4 text-rose-600 shadow-sm">
            <AlertTriangle className="w-10 h-10" />
          </div>

          <h3 className="text-xl font-black text-slate-900 mb-2">
            ⚠️ เกิดข้อผิดพลาดในการแสดงผลหน้าจอ
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mb-6 leading-relaxed font-medium">
            {this.props.componentName
              ? `เกิดข้อผิดพลาดในการทำงานของส่วนประกอบ ${this.props.componentName} ระบบสกัดกั้นข้อผิดพลาดเพื่อป้องกันหน้าจอขาว`
              : 'เกิดข้อผิดพลาดที่ไม่คาดคิดในระบบขณะประมวลผลข้อมูล ระบบจับข้อผิดพลาดได้เพื่อป้องกันแอปพลิเคชันล่มเป็นหน้าจอขาว'}
          </p>

          {/* Technical Error Stack Container */}
          <div className="w-full max-w-2xl bg-slate-900 text-slate-100 rounded-xl p-4 text-left mb-6 font-mono text-xs overflow-auto max-h-48 border border-slate-800 shadow-inner">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-rose-400 font-bold">
              <span className="truncate max-w-[80%]">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
              </span>
              <button
                type="button"
                onClick={this.handleCopyDetails}
                className="text-[11px] font-sans flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg cursor-pointer transition-colors flex-shrink-0"
              >
                {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {this.state.copied ? 'คัดลอกแล้ว' : 'คัดลอกรายละเอียด'}
              </button>
            </div>
            {this.state.errorInfo?.componentStack && (
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap font-mono leading-normal">
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              type="button"
              onClick={this.handleReset}
              className="btn-primary py-2.5 px-5 font-bold flex items-center gap-2 cursor-pointer text-sm shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              ลองใหม่อีกครั้ง
            </button>
            {this.props.onNavigateHome && (
              <button
                type="button"
                onClick={this.props.onNavigateHome}
                className="btn-secondary py-2.5 px-5 font-bold flex items-center gap-2 cursor-pointer text-sm"
              >
                <Home className="w-4 h-4" />
                กลับหน้าหลัก
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
