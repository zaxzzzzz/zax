import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Send, 
  AlertTriangle, 
  HeartPulse, 
  Briefcase, 
  Gift, 
  RefreshCw, 
  TrendingDown, 
  Check, 
  Zap, 
  ShieldCheck, 
  MessageSquare
} from 'lucide-react';
import { formatCurrency } from '../utils/debtEngine';

export default function AiAssistant({ debts, extraBudget, setExtraBudget, setDebts, onNavigateToCalculator }) {
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [messages, setMessages] = useState([
    {
      id: 'msg-init',
      sender: 'ai',
      text: 'สวัสดีครับ! ผมคือ AI ASSISTANT ที่ช่วยวิเคราะห์และปรับแผนหนี้เพื่อลดดอกเบี้ยให้คุณจ่ายน้อยที่สุด มีคำถามหรือเกิดเหตุการณ์ฉุกเฉินอะไร สามารถแจ้งหรือเลือกสถานการณ์ด้านล่างได้เลยครับ',
      time: 'เมื่อสักครู่'
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Total balance & interest rate calculation
  const totalBalance = debts.reduce((sum, d) => sum + Number(d.balance), 0);
  const highestInterestDebt = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];

  // Preset Emergency Scenarios
  const scenarios = [
    {
      id: 'accident',
      icon: HeartPulse,
      title: 'เกิดอุบัติเหตุ / ค่ารักษาด่วน',
      desc: 'จำเป็นต้องใช้เงินก้อนฉุกเฉิน 20,000 บาทในเดือนนี้',
      color: 'red',
      prompt: 'เกิดอุบัติเหตุฉุกเฉินต้องใช้เงิน 20,000 บาท ควรปรับแผนการจ่ายหนี้เดือนนี้อย่างไรดี?'
    },
    {
      id: 'income_dip',
      icon: Briefcase,
      title: 'รายได้ลดลงชั่วคราว (ตกงาน/ย้ายงาน)',
      desc: 'ส่งจ่ายได้เฉพาะขั้นต่ำใน 3 เดือนข้างหน้า',
      color: 'amber',
      prompt: 'รายได้ลดลงชั่วคราว สามารถจ่ายได้เฉพาะยอดขั้นต่ำ 3 เดือน AI มีคำแนะนำอย่างไร?'
    },
    {
      id: 'bonus',
      icon: Gift,
      title: 'ได้รับโบนัส / เงินก้อนพิเศษ',
      desc: 'มีเงินก้อน 50,000 บาท ต้องการนำมาโปะหนี้ให้คุ้มที่สุด',
      color: 'emerald',
      prompt: 'ได้รับโบนัสพิเศษ 50,000 บาท ควรเอาไปโปะรายการหนี้ไหนเพื่อให้ประหยัดดอกเบี้ยมากที่สุด?'
    },
    {
      id: 'refinance',
      icon: RefreshCw,
      title: 'สนใจรวมหนี้ / Refinance',
      desc: 'ต้องการเปรียบเทียบการรวมหนี้ดอกเบี้ยแพงเป็นก้อนเดียว',
      color: 'blue',
      prompt: 'แนะนำแนวทางการรวมหนี้ (Refinance) บัตรเครดิตดอกเบี้ยแพงหน่อยครับ'
    }
  ];

  // Handle Scenario Selection & Generate AI Advice
  const applyScenario = (scenario) => {
    setSelectedScenario(scenario.id);
    sendMessage(scenario.prompt, scenario.id);
  };

  const sendMessage = (textToSend, scenarioId = null) => {
    const userText = textToSend || inputQuery;
    if (!userText.trim()) return;

    const userMsg = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsTyping(true);

    setTimeout(() => {
      let responseText = '';
      let actionRecommendation = null;

      if (scenarioId === 'accident') {
        responseText = `🤖 **คำแนะนำจาก AI ในกรณีเกิดอุบัติเหตุ/ใช้เงินด่วน 20,000 บาท:**\n\n1. **ปรับลดงบโปะเพิ่มชั่วคราว**: ให้ปรับงบโปะเพิ่ม (Extra Budget) เดือนนี้จาก ${formatCurrency(extraBudget)} เหลือ 0 บาท เพื่อดึงสภาพคล่องกลับมาใช้จ่าย\n2. **จ่ายขั้นต่ำเฉพาะก้อนดอกเบี้ยต่ำ**: คงการชำระขั้นต่ำทุกก้อน เพื่อไม่ให้เสียประวัติบูโร\n3. **มุ่งเน้นรักษากระแสเงินสด**: เมื่อสถานการณ์คลี่คลายในเดือนหน้า ค่อยกลับมาเริ่มโปะรายการ ${highestInterestDebt?.name || 'หนี้ดอกเบี้ยสูง'} ต่อครับ`;
        actionRecommendation = { type: 'set_extra', value: 0, label: 'ปรับงบโปะเพิ่มเป็น 0 บาทชั่วคราว' };
      } else if (scenarioId === 'bonus') {
        responseText = `🤖 **คำแนะนำจาก AI ในกรณีได้เงินโบนัส 50,000 บาท:**\n\n1. **กลยุทธ์ปิดหนี้ที่จ่ายดอกเบี้ยแพง (Avalanche)**: นำเงิน 50,000 บาท ไปโปะที่รายการ **${highestInterestDebt?.name}** (ดอกเบี้ย ${highestInterestDebt?.interestRate}% ต่อปี) ทันที!\n2. **ผลลัพธ์ที่จะได้**: การโปะหนี้ดอกเบี้ยแพงสุดก่อน จะช่วยคุณเซฟดอกเบี้ยรวมได้มากกว่า 15,000 - 28,000 บาท และตัดยอดหนี้ก้อนนี้ได้เร็วขึ้นอย่างมาก`;
        actionRecommendation = { type: 'lump_sum_payoff', debtId: highestInterestDebt?.id, amount: 50000, label: `นำ 50,000 บาท ไปโปะ ${highestInterestDebt?.name}` };
      } else if (scenarioId === 'income_dip') {
        responseText = `🤖 **คำแนะนำจาก AI กรณีรายได้ลดลงชั่วคราว:**\n\n1. **หยุดการโปะเพิ่มชั่วคราว**: ปรับงบโปะเป็น 0 บาทเป็นเวลา 3 เดือน\n2. **เจรจาปรับโครงสร้างหนี้**: สำหรับหนี้ที่มีดอกเบี้ยเกิน 20% ให้ติดต่อสถาบันการเงินเพื่อขอปรับลดยอดผ่อนต่อเดือนลง\n3. **ห้ามสร้างหนี้ใหม่เด็ดขาด**: เน้นจ่ายขั้นต่ำตรงเวลาทุกงวดเพื่อรักษาเครดิต`;
        actionRecommendation = { type: 'set_extra', value: 0, label: 'ตั้งงบโปะเป็น 0 บาท (เน้นจ่ายขั้นต่ำ)' };
      } else {
        responseText = `🤖 **วิเคราะห์คำถามของคุณ:**\n\nจากการประมวลผลด้วย AI Engine สำหรับพอร์ตหนี้ปัจจุบันของคุณที่มีทั้งหมด ${debts.length} รายการ ยอดรวม ${formatCurrency(totalBalance)}:\n\nทาง AI แนะนำให้ใช้ **กลยุทธ์ปิดหนี้ที่จ่ายดอกเบี้ยแพง (Avalanche)** เน้นจ่ายก้อน **${highestInterestDebt?.name}** (ดอกเบี้ย ${highestInterestDebt?.interestRate}%) ก่อนเป็นอันดับแรก เพราะเป็นก้อนที่ดึงดอกเบี้ยสูงที่สุดครับ!`;
        actionRecommendation = { type: 'boost_extra', value: Number(extraBudget) + 2000, label: 'เพิ่มงบโปะหนี้ +2,000 บาท/เดือน' };
      }

      const aiMsg = {
        id: `msg-ai-${Date.now()}`,
        sender: 'ai',
        text: responseText,
        action: actionRecommendation,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1200);
  };

  const handleExecuteAction = (action) => {
    if (action.type === 'set_extra') {
      setExtraBudget(action.value);
    } else if (action.type === 'boost_extra') {
      setExtraBudget(action.value);
    } else if (action.type === 'lump_sum_payoff' && action.debtId) {
      setDebts(debts.map(d => d.id === action.debtId ? {
        ...d,
        balance: Math.max(0, d.balance - action.amount)
      } : d));
    }
    onNavigateToCalculator();
  };

  return (
    <div className="ai-page space-y-6 animate-fade-in">
      
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge-gold">
                <Bot className="w-3.5 h-3.5" />
                AI ASSISTANT Engine
              </span>
              <span className="badge-green">วิเคราะห์แผนดอกเบี้ยต่ำสุด</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              ระบบ AI อัจฉริยะแนะนำและปรับแผนหนี้ตามสถานการณ์
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl">
              เลือกจำลองเหตุการณ์ฉุกเฉินเพื่อดูแนวทางรับมือ หรือพิมพ์คำถามปรึกษา AI เพื่อคำนวณหาวิธีการจ่ายที่จะเสียดอกเบี้ยน้อยที่สุดทางคณิตศาสตร์
            </p>
          </div>
        </div>
      </div>

      {/* EMERGENCY SCENARIOS CHOOSER */}
      <div className="bg-white p-6 rounded-2xl space-y-4 border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          จำลองเหตุการณ์ฉุกเฉินเพื่อปรับแผนหนี้ (Emergency Scenarios Simulator)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {scenarios.map((sc) => {
            const Icon = sc.icon;
            const isSelected = selectedScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => applyScenario(sc)}
                className={`p-4 rounded-xl border text-left transition-all space-y-2 flex flex-col justify-between cursor-pointer ${
                  isSelected 
                    ? 'bg-indigo-50 border-indigo-500 shadow-md scale-[1.02]' 
                    : 'bg-slate-50/70 border-slate-200 hover:border-indigo-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                    <Icon className="w-5 h-5" />
                  </div>
                  {isSelected && <Zap className="w-4 h-4 text-indigo-600 fill-indigo-600 animate-bounce" />}
                </div>

                <div>
                  <div className="font-bold text-xs text-slate-900 mb-1">{sc.title}</div>
                  <div className="text-[11px] text-slate-500 font-medium line-clamp-2">{sc.desc}</div>
                </div>

                <div className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 pt-2 border-t border-slate-200">
                  คลิกเพื่อจำลองแผน <Zap className="w-3 h-3" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI CHATBOX INTERFACE */}
      <div className="bg-white p-6 rounded-2xl space-y-4 flex flex-col h-[520px] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Nee Noi AI Financial Advisor
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[11px] text-slate-500 font-medium">พร้อมให้คำตอบและวิเคราะห์แผนหนี้แบบเรียลไทม์</div>
            </div>
          </div>

          <button 
            onClick={() => setMessages([messages[0]])}
            className="text-xs text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
          >
            ล้างบทสนทนา
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs space-y-2 leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white font-medium rounded-tr-none shadow-xs'
                  : 'bg-slate-100 border border-slate-200 text-slate-800 rounded-tl-none font-medium'
              }`}>
                <div className="whitespace-pre-line">{msg.text}</div>

                {/* Optional Dynamic Action Recommendation Button */}
                {msg.action && (
                  <div className="pt-2 border-t border-slate-200 mt-2">
                    <button
                      onClick={() => handleExecuteAction(msg.action)}
                      className="btn-gold text-[11px] w-full justify-center py-2 shadow-xs font-bold"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {msg.action.label}
                    </button>
                  </div>
                )}

                <div className={`text-[10px] text-right ${msg.sender === 'user' ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {msg.time}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 flex-shrink-0 font-bold text-xs">
                  คุณ
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 italic font-semibold">
              <Bot className="w-4 h-4 animate-spin" />
              AI กำลังประมวลผลคำนวณแผนหนี้...
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2 pt-3 border-t border-slate-100"
        >
          <input
            type="text"
            placeholder="พิมพ์คำถามเกี่ยวกับแผนหนี้ เช่น 'ควรโปะบัตรกสิกรก่อนไหม?'"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            className="input-dark flex-1"
          />
          <button 
            type="submit" 
            disabled={!inputQuery.trim()}
            className="btn-gold text-xs px-4 font-bold"
          >
            <Send className="w-4 h-4" />
            ส่งคำถาม
          </button>
        </form>

      </div>

    </div>
  );
}
