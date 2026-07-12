import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  MessageSquare, 
  Activity, 
  Zap, 
  Send, 
  PlusCircle, 
  Key, 
  TrendingUp, 
  X 
} from 'lucide-react';

export default function Home() {
  const { apiUrl, workspaceId } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    rate: '100%',
    gateways: 0,
  });
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({ to: '', message: '' });
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState(null);

  // Load dashboard statistics
  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await axios.get(`${apiUrl}/messages/logs`);
        const logs = response.data;
        const total = logs.length;
        const sent = logs.filter(l => l.status === 'SENT' || l.status === 'DELIVERED').length;
        const failed = logs.filter(l => l.status === 'FAILED').length;
        const rate = total > 0 ? ((sent / total) * 100).toFixed(0) + '%' : '100%';

        const gatewayResp = await axios.get(`${apiUrl}/gateways`);
        const gateways = gatewayResp.data.filter(g => g.status === 'CONNECTED').length;

        setStats({ total, sent, failed, rate, gateways });
      } catch (err) {
        console.error('Failed to load dashboard metrics:', err);
      }
    };

    if (workspaceId) {
      fetchDashboardStats();
    }
  }, [workspaceId, apiUrl]);

  // Mock analytics history
  const chartData = [
    { name: 'Mon', Sent: 45 },
    { name: 'Tue', Sent: 52 },
    { name: 'Wed', Sent: 89 },
    { name: 'Thu', Sent: 120 },
    { name: 'Fri', Sent: 95 },
    { name: 'Sat', Sent: 40 },
    { name: 'Sun', Sent: 65 },
  ];

  const handleSendMessage = async (e) => {
    e.preventDefault();
    setSending(true);
    setAlert(null);
    try {
      await axios.post(`${apiUrl}/messages/send-message`, {
        to: sendForm.to,
        message: sendForm.message,
      });
      setAlert({ type: 'success', text: 'Message enqueued successfully!' });
      setSendForm({ to: '', message: '' });
      setTimeout(() => setShowSendModal(false), 1500);
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.error || 'Failed to dispatch message.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* Welcome Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-15 transform translate-y-4">
          <Zap className="w-40 h-40" />
        </div>
        <h1 className="text-xl font-bold">JZGateway</h1>
        <p className="text-sm opacity-90 mt-1">Manage connection modules and dispatch unified API payloads instantly.</p>
        
        <div className="flex gap-2.5 mt-4">
          <button 
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 bg-white text-blue-700 font-bold text-xs py-2 px-4 rounded-xl shadow-md hover:scale-105 transition"
          >
            <Send className="w-3.5 h-3.5" />
            Send Test
          </button>
        </div>
      </div>

      {/* QUICK STATUS METRICS */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="glass p-4 rounded-3xl flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-2xl">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400">Total Sent</p>
            <p className="text-lg font-bold text-white">{stats.total}</p>
          </div>
        </div>

        <div className="glass p-4 rounded-3xl flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400">Success Rate</p>
            <p className="text-lg font-bold text-white">{stats.rate}</p>
          </div>
        </div>

        <div className="glass p-4 rounded-3xl flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400">Active Gateways</p>
            <p className="text-lg font-bold text-white">{stats.gateways}</p>
          </div>
        </div>

        <div className="glass p-4 rounded-3xl flex items-center gap-3">
          <div className="p-2.5 bg-red-500/10 text-red-400 rounded-2xl">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-slate-400">Failed jobs</p>
            <p className="text-lg font-bold text-white">{stats.failed}</p>
          </div>
        </div>
      </div>

      {/* DELIVERY GRAPH */}
      <div className="glass p-4 rounded-3xl">
        <h2 className="text-sm font-semibold text-white mb-3">Weekly API Dispatches</h2>
        <div className="w-full h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="Sent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* QUICK ACTIONS PANEL */}
      <div className="glass p-4 rounded-3xl">
        <h2 className="text-sm font-semibold text-white mb-3">Workspace Setup</h2>
        <div className="grid grid-cols-3 gap-3">
          <a href="/gateways" className="flex flex-col items-center p-3 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 transition text-center">
            <PlusCircle className="w-6 h-6 text-blue-400 mb-1" />
            <span className="text-[10px] text-slate-300 font-medium">Link QR</span>
          </a>
          <a href="/developer" className="flex flex-col items-center p-3 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 transition text-center">
            <Key className="w-6 h-6 text-yellow-400 mb-1" />
            <span className="text-[10px] text-slate-300 font-medium">API Keys</span>
          </a>
          <button 
            onClick={() => {
              // Simulated Quick OTP
              setSendForm({
                to: '',
                message: 'Your verification code for JZ Store is 458921. Valid for 5 minutes.'
              });
              setShowSendModal(true);
            }} 
            className="flex flex-col items-center p-3 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 transition text-center"
          >
            <Zap className="w-6 h-6 text-purple-400 mb-1" />
            <span className="text-[10px] text-slate-300 font-medium">Send OTP</span>
          </button>
        </div>
      </div>

      {/* SEND TEST MESSAGE MODAL */}
      {showSendModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="glass-premium w-full max-w-[400px] p-5 rounded-3xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowSendModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-full text-slate-400 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-4">Send Test Message</h3>
            
            {alert && (
              <div className={`p-3 rounded-xl text-xs font-medium mb-3 ${
                alert.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {alert.text}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Recipient Phone</label>
                <input 
                  type="text" 
                  placeholder="e.g. 15551234567" 
                  value={sendForm.to}
                  onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })}
                  className="w-full glass-input p-3 rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Message Body</label>
                <textarea 
                  rows="3" 
                  placeholder="Type message here..." 
                  value={sendForm.message}
                  onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })}
                  className="w-full glass-input p-3 rounded-xl text-sm"
                  required
                ></textarea>
              </div>

              <button 
                type="submit" 
                disabled={sending}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm flex justify-center items-center gap-1.5"
              >
                {sending ? 'Sending...' : 'Send Message'}
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
