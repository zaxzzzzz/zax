import React from 'react';
import { Lock, ShieldAlert } from 'lucide-react';

export default function RestrictedAccessPage({ section = 'ข้อมูลนี้' }) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-2xl border border-rose-200 shadow-md max-w-md space-y-4 text-center">
        
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-rose-600" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-black text-slate-900 flex items-center justify-center gap-2">
          <Lock className="w-5 h-5 text-rose-600" />
          ข้อมูลถูกจำกัดการเข้าถึง
        </h2>

        {/* Message */}
        <p className="text-sm text-slate-600 leading-relaxed font-medium">
          {section} มีเฉพาะสำหรับ <span className="text-indigo-600 font-bold">Admin</span> เท่านั้น
        </p>

        <p className="text-xs text-slate-500 bg-slate-50 p-3.5 rounded-xl border border-slate-200 font-medium">
          หากคุณเป็น Admin โปรดตรวจสอบสถานะการเข้าสู่ระบบ หรือติดต่อผู้จัดการระบบ
        </p>

        {/* Info */}
        <div className="pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 font-medium">
            🔒 ระบบนี้ป้องกันข้อมูลส่วนตัวของผู้ใช้
          </p>
        </div>

      </div>
    </div>
  );
}
