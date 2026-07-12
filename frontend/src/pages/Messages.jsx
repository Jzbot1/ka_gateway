import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  MessageSquare, 
  Search, 
  Send, 
  Users, 
  Layers, 
  Check, 
  Clock, 
  AlertTriangle, 
  Plus, 
  X,
  Play
} from 'lucide-react';

const CAMPAIGN_TEMPLATES = [
  {
    name: 'Discount Promo',
    description: 'Promote items with code discounts',
    text: '🔥 Flash Sale! Get 20% off all items using code JZ20. Shop now at: https://jzstore.in'
  },
  {
    name: 'Order Receipt',
    description: 'Send receipt or purchase confirmations',
    text: 'Hello! Your order has been successfully processed. Thank you for shopping with us!'
  },
  {
    name: 'Payment Reminder',
    description: 'Remind users of unpaid plan balances',
    text: 'Friendly reminder: Your subscription fee is due. Complete payment securely at: http://localhost:5173/billing'
  },
  {
    name: 'System Alert',
    description: 'Broadcast maintenance/updates notifications',
    text: '⚠️ Alert: We are updating our WhatsApp routing gateways today. Systems will remain online.'
  }
];

export default function Messages() {
  const { apiUrl, socket, workspaceId } = useAuth();
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [search, setSearch] = useState('');
  
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    receivers: '',
    message: '',
  });
  const [campaignLoading, setCampaignLoading] = useState(false);

  // Load message logs
  const fetchLogs = async () => {
    try {
      const response = await axios.get(`${apiUrl}/messages/logs`, {
        params: { search }
      });
      setLogs(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  // Load campaigns
  const fetchCampaigns = async () => {
    try {
      const response = await axios.get(`${apiUrl}/messages/campaigns`);
      setCampaigns(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      if (activeTab === 'logs') fetchLogs();
      if (activeTab === 'campaigns') fetchCampaigns();
    }
  }, [workspaceId, activeTab, search, apiUrl]);

  // Hook socket to update logs in real-time
  useEffect(() => {
    if (!socket) return;

    socket.on('message.update', (updatedMsg) => {
      console.log('Socket message log update:', updatedMsg);
      setLogs((prev) => {
        const index = prev.findIndex((m) => m.id === updatedMsg.id);
        if (index !== -1) {
          return prev.map((m) => m.id === updatedMsg.id ? updatedMsg : m);
        }
        return [updatedMsg, ...prev];
      });
    });

    return () => {
      socket.off('message.update');
    };
  }, [socket]);

  const handleLaunchCampaign = async (e) => {
    e.preventDefault();
    setCampaignLoading(true);
    try {
      // Split phone list by comma or newline
      const phoneList = campaignForm.receivers
        .split(/[\n,]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (phoneList.length === 0) {
        throw new Error('Please enter at least one recipient phone number');
      }

      await axios.post(`${apiUrl}/messages/campaigns`, {
        name: campaignForm.name,
        receivers: phoneList,
        message: campaignForm.message,
      });

      setShowCampaignModal(false);
      setCampaignForm({ name: '', receivers: '', message: '' });
      setActiveTab('campaigns');
      fetchCampaigns();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to start campaign');
    } finally {
      setCampaignLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'READ':
      case 'DELIVERED':
        return <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3px]" />;
      case 'SENT':
        return <Check className="w-3.5 h-3.5 text-slate-400" />;
      case 'PENDING':
        return <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
      case 'FAILED':
      default:
        return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Header & Tabs */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-white">Dispatches</h1>
          <p className="text-xs text-slate-400">Track and schedule messaging campaign distributions.</p>
        </div>
        
        {activeTab === 'campaigns' && (
          <button 
            onClick={() => setShowCampaignModal(true)}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white hover:scale-105 transition flex items-center gap-1.5 text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            Campaign
          </button>
        )}
      </div>

      {/* Tabs Switch */}
      <div className="flex bg-slate-800/40 p-1 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex justify-center items-center gap-1.5 ${
            activeTab === 'logs' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Message Logs
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex justify-center items-center gap-1.5 ${
            activeTab === 'campaigns' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Campaigns
        </button>
      </div>

      {/* LOGS TAB VIEW */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search receiver or message body..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full glass-input p-3.5 pl-10 rounded-2xl text-xs"
            />
          </div>

          <div className="space-y-2.5">
            {logs.length === 0 ? (
              <div className="glass p-8 text-center rounded-3xl text-slate-400">
                <Layers className="w-12 h-12 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold">No message logs</p>
                <p className="text-xs mt-1">Sent messages will appear here in real-time.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="glass p-3.5 rounded-2xl flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                    <span>To: +{log.receiver}</span>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(log.status)}
                      {log.status}
                    </span>
                  </div>
                  <p className="text-xs text-white leading-relaxed mt-1 break-words">{log.content}</p>
                  
                  {log.mediaUrl && (
                    <div className="text-[9px] text-blue-400 hover:underline mt-1 break-all">
                      📎 Attach: {log.mediaUrl}
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[9px] text-slate-500 mt-2 border-t border-slate-800/40 pt-1.5">
                    <span>ID: {log.id.slice(-8).toUpperCase()}</span>
                    <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CAMPAIGNS TAB VIEW */}
      {activeTab === 'campaigns' && (
        <div className="space-y-2.5">
          {campaigns.length === 0 ? (
            <div className="glass p-8 text-center rounded-3xl text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-semibold">No marketing campaigns</p>
              <p className="text-xs mt-1">Initiate a campaign to run bulk message queues.</p>
            </div>
          ) : (
            campaigns.map((camp) => (
              <div key={camp.id} className="glass p-4 rounded-3xl flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-white">{camp.name}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Scheduled: {new Date(camp.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    camp.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    {camp.status}
                  </span>
                </div>

                {/* Progress Indicators */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>Progress</span>
                    <span>{camp.sentCount + camp.failedCount} / {camp.totalCount} sent</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                    <div 
                      style={{ width: `${(camp.sentCount / camp.totalCount) * 100}%` }}
                      className="bg-emerald-500 h-full"
                    ></div>
                    <div 
                      style={{ width: `${(camp.failedCount / camp.totalCount) * 100}%` }}
                      className="bg-red-500 h-full"
                    ></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CREATE CAMPAIGN MODAL */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="glass-premium w-full max-w-[420px] p-5 rounded-3xl relative animate-in zoom-in-95 duration-150">
            <button 
              onClick={() => setShowCampaignModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-full text-slate-400 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-4 font-sans">Create Bulk Campaign</h3>
            
            <form onSubmit={handleLaunchCampaign} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Campaign Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Summer Promo 2026"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="w-full glass-input p-3 rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                  Recipient Phones (one per line / comma separated)
                </label>
                <textarea 
                  rows="3" 
                  placeholder="15551002000&#10;15553004000"
                  value={campaignForm.receivers}
                  onChange={(e) => setCampaignForm({ ...campaignForm, receivers: e.target.value })}
                  className="w-full glass-input p-3 rounded-xl text-xs font-mono"
                  required
                ></textarea>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Select Message Template</label>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  {CAMPAIGN_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      type="button"
                      onClick={() => setCampaignForm({ ...campaignForm, message: tmpl.text })}
                      className="text-left bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 p-2.5 rounded-xl transition"
                    >
                      <div className="text-[10px] font-bold text-blue-400">{tmpl.name}</div>
                      <div className="text-[8px] text-slate-500 line-clamp-1 mt-0.5">{tmpl.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Message Content</label>
                <textarea 
                  rows="3" 
                  placeholder="Hello {{customer}}, check out our sales catalog!"
                  value={campaignForm.message}
                  onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })}
                  className="w-full glass-input p-3 rounded-xl text-sm"
                  required
                ></textarea>
              </div>

              <button 
                type="submit" 
                disabled={campaignLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm flex justify-center items-center gap-1.5"
              >
                {campaignLoading ? 'Processing...' : 'Queue Campaign'}
                <Play className="w-4 h-4 fill-white" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
