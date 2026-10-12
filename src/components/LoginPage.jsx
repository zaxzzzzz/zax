import React, { useState } from 'react';
import { ShieldCheck, User, Lock, Eye, EyeOff, LogIn, UserPlus, Briefcase, Calendar, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth, UNREADABLE_RESPONSE_MESSAGE } from '../contexts/AuthContext';

const THAI_OCCUPATIONS = [
  'พนักงานเงินเดือน / พนักงานบริษัท',
  'ข้าราชการ / พนักงานรัฐวิสาหกิจ',
  'ฟรีแลนซ์ / อาชีพอิสระ',
  'เจ้าของกิจการ / ธุรกิจส่วนตัว',
  'ผู้รับบำนาญ / เกษียณอายุ',
  'นักเรียน / นักศึกษา',
  'รับจ้างทั่วไป / เกษตรกรรม',
  'อื่นๆ (ระบุเอง)'
];

const GENDER_OPTIONS = [
  { value: 'ชาย', label: 'ชาย' },
  { value: 'หญิง', label: 'หญิง' },
  { value: 'ไม่ระบุ', label: 'ไม่ระบุ' },
  { value: 'อื่นๆ', label: 'อื่นๆ' }
];

/**
 * Turn a thrown error into a message that is safe to show in the form.
 * Raw parser errors ("Unexpected end of JSON input", "Unexpected token '<'…")
 * are replaced with a readable Thai message so the form never crashes/prints
 * technical English to the user.
 */
export function toFriendlyAuthError(err, fallbackMessage) {
  const message = (err && err.message) || '';
  const isBodyParseFailure =
    err instanceof SyntaxError ||
    /Unexpected end of JSON input|Unexpected token|not valid JSON|bad JSON/i.test(message);
  if (isBodyParseFailure) return UNREADABLE_RESPONSE_MESSAGE;
  return message || fallbackMessage;
}

export default function LoginPage({ onLoginSuccess }) {
  const { loginWithCredentials, signup } = useAuth();

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup'

  // Login Form State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up Form State
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [gender, setGender] = useState('ชาย');
  const [age, setAge] = useState('');
  const [occupationSelect, setOccupationSelect] = useState(THAI_OCCUPATIONS[0]);
  const [customOccupation, setCustomOccupation] = useState('');

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const finalOccupation = occupationSelect === 'อื่นๆ (ระบุเอง)' ? customOccupation : occupationSelect;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      let userObj;
      if (loginWithCredentials) {
        userObj = await loginWithCredentials(loginUsername, loginPassword);
      }
      
      if (onLoginSuccess && userObj) {
        onLoginSuccess(userObj);
      } else {
        // Redirect to dashboard if using Next.js / standard route
        window.location.href = '/';
      }
    } catch (err) {
      setError(toFriendlyAuthError(err, 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    // Client-side validations
    if (!signupUsername.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้ (Username)');
      return;
    }
    if (!signupPassword) {
      setError('กรุณากรอกรหัสผ่าน (Password)');
      return;
    }
    if (!gender) {
      setError('กรุณาเลือกเพศ');
      return;
    }

    const parsedAge = Number(age);
    if (!age || isNaN(parsedAge) || parsedAge <= 0) {
      setError('กรุณากรอกอายุที่ถูกต้อง (อายุต้องมากกว่า 0)');
      return;
    }

    if (!finalOccupation.trim()) {
      setError('กรุณาระบุอาชีพ');
      return;
    }

    setLoading(true);

    try {
      let userObj;
      if (signup) {
        userObj = await signup({
          username: signupUsername.trim(),
          password: signupPassword,
          gender,
          age: parsedAge,
          occupation: finalOccupation.trim()
        });
      }

      setSuccessMsg('สร้างบัญชีผู้ใช้สำเร็จกำลังนำท่านเข้าสู่ระบบ...');
      
      setTimeout(() => {
        if (onLoginSuccess && userObj) {
          onLoginSuccess(userObj);
        } else {
          window.location.href = '/';
        }
      }, 500);

    } catch (err) {
      // Never surface raw JSON parser errors — show a readable Thai message instead.
      setError(toFriendlyAuthError(err, 'เกิดข้อผิดพลาดในการลงทะเบียน'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-100 flex items-center justify-center p-4">
      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl opacity-40 animate-pulse"></div>
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-md">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white">
              <ShieldCheck className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-1">
            หนี้น้อย (Nee Noi)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-semibold">
            ระบบจัดการหนี้อัจฉริยะ | Smart Debt Management System
          </p>
        </div>

        {/* Authentication Card */}
        <div className="bg-white/90 backdrop-blur-md p-6 border border-slate-200/80 shadow-2xl rounded-3xl space-y-6">
          
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setError('');
                setSuccessMsg('');
              }}
              className={`py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-500/10'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-4 h-4" />
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setError('');
                setSuccessMsg('');
              }}
              className={`py-2.5 text-sm font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'signup'
                  ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-500/10'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              สมัครสมาชิก
            </button>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* LOGIN FORM */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              
              {/* Username Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" />
                  Username (ชื่อผู้ใช้)
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="กรอกชื่อผู้ใช้ หรือ อีเมล"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm"
                  required
                />
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  Password (รหัสผ่าน)
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่าน"
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm pr-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors p-1"
                    title={showLoginPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Login Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white font-extrabold text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    เข้าสู่ระบบ
                  </>
                )}
              </button>
            </form>
          )}

          {/* SIGN UP FORM */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="space-y-4">
              
              {/* Username Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" />
                  Username (ชื่อผู้ใช้) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                  placeholder="ตั้งชื่อผู้ใช้ใหม่"
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm"
                  required
                />
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  Password (รหัสผ่าน) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="ตั้งรหัสผ่านใหม่"
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm pr-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors p-1"
                    title={showSignupPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Demographic Fields Divider */}
              <div className="pt-2 pb-1 border-t border-slate-200">
                <p className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  ข้อมูลทั่วไป (Demographics)
                </p>
              </div>

              {/* Grid for Gender & Age */}
              <div className="grid grid-cols-2 gap-3">
                {/* Gender (เพศ) Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    เพศ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm cursor-pointer"
                    required
                  >
                    {GENDER_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Age (อายุ) Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    อายุ (ปี) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="เช่น 28"
                    className="w-full px-3.5 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm"
                    required
                  />
                </div>
              </div>

              {/* Occupation (อาชีพ) Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  อาชีพ <span className="text-rose-500">*</span>
                </label>
                <select
                  value={occupationSelect}
                  onChange={(e) => setOccupationSelect(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm cursor-pointer"
                  required
                >
                  {THAI_OCCUPATIONS.map((occ) => (
                    <option key={occ} value={occ}>
                      {occ}
                    </option>
                  ))}
                </select>

                {/* Input for custom occupation when "อื่นๆ (ระบุเอง)" selected */}
                {occupationSelect === 'อื่นๆ (ระบุเอง)' && (
                  <input
                    type="text"
                    value={customOccupation}
                    onChange={(e) => setCustomOccupation(e.target.value)}
                    placeholder="ระบุอาชีพของคุณ"
                    className="w-full mt-2 px-4 py-3 bg-white border border-indigo-300 rounded-xl text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all font-medium text-sm"
                    required
                  />
                )}
              </div>

              {/* Signup Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-extrabold text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    สร้างบัญชี
                  </>
                )}
              </button>
            </form>
          )}


        </div>

        {/* Footer Info */}
        <p className="text-center text-xs text-slate-500 mt-5 font-medium">
          ระบบปลดหนี้อัจฉริยะ ปลอดภัย 100% | Smart & Secure Debt Planner
        </p>

      </div>
    </div>
  );
}
