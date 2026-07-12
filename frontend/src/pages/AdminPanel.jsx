import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, 
  Database, 
  Users, 
  Activity, 
  Globe, 
  Save, 
  Sliders,
  Sparkles,
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  TrendingUp,
  List,
  Layers,
  Settings,
  Wallet,
  X
} from 'lucide-react';

export default function AdminPanel() {
  const { apiUrl, user } = useAuth();
  const [activeTab, setActiveTab] = useState('stats');
  
  // Reseller state
  const [resellerConfig, setResellerConfig] = useState({
    domain: '',
    brandingName: '',
    logo: '',
    stripeKey: '',
  });
  const [resellerLoading, setResellerLoading] = useState(false);
  const [resellerSaved, setResellerSaved] = useState(false);
  
  // Admin stats / users
  const [adminStats, setAdminStats] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [txList, setTxList] = useState([]);
  
  // Plans list & form states
  const [plansList, setPlansList] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    price: 0,
    billingPeriod: 'MONTHLY',
    description: '',
    features: '',
    badge: '',
    displayOrder: 0,
    isActive: true,
    rateLimit: 60,
    storageLimit: 100,
    freeMessages: 0,
    gatewayLimit: 1,
    apiLimit: 1000,
    messagesLimit: 5000,
    teamLimit: 2,
    webhooksLimit: 1,
    brandingEnabled: false,
    priorityQueue: false
  });

  // Pricing rules & state
  const [pricingRules, setPricingRules] = useState([]);
  const [newRule, setNewRule] = useState({
    provider: 'BAILEYS',
    messageType: 'TEXT',
    price: 0.10
  });

  // Wallet adjustment state
  const [selectedUserForWallet, setSelectedUserForWallet] = useState(null);
  const [walletAdjustmentAmt, setWalletAdjustmentAmt] = useState('100');
  const [walletAdjustmentDesc, setWalletAdjustmentDesc] = useState('');

  // Fetch reseller settings
  const fetchResellerSettings = async () => {
    try {
      const response = await axios.get(`${apiUrl}/reseller/settings`);
      if (response.data && !response.data.message) {
        setResellerConfig({
          domain: response.data.domain || '',
          brandingName: response.data.brandingName || '',
          logo: response.data.logo || '',
          stripeKey: response.data.stripeKey || '',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Admin stats, users, pricing, and transactions
  const fetchAdminStats = async () => {
    if (user?.role !== 'ADMIN') return;
    try {
      const statsResp = await axios.get(`${apiUrl}/admin/stats`);
      setAdminStats(statsResp.data);
      
      const usersResp = await axios.get(`${apiUrl}/admin/users`);
      setUsersList(usersResp.data);

      const plansResp = await axios.get(`${apiUrl}/admin/plans`);
      setPlansList(plansResp.data);

      const pricingResp = await axios.get(`${apiUrl}/admin/pricing`);
      setPricingRules(pricingResp.data);

      const txResp = await axios.get(`${apiUrl}/admin/wallet/transactions`);
      setTxList(txResp.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchResellerSettings();
    if (user?.role === 'ADMIN') {
      setActiveTab('stats');
      fetchAdminStats();
    }
  }, [user]);

  const handleUpdateReseller = async (e) => {
    e.preventDefault();
    setResellerLoading(true);
    setResellerSaved(false);
    try {
      await axios.put(`${apiUrl}/reseller/settings`, resellerConfig);
      setResellerSaved(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update reseller options');
    } finally {
      setResellerLoading(false);
    }
  };

  // Admin Manual Subscription Upgrade Handler
  const handleUpdateSubscription = async (userId, planName) => {
    try {
      const response = await axios.put(`${apiUrl}/admin/user-subscription`, { userId, planName });
      alert(response.data.message || 'Subscription updated successfully.');
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update user subscription');
    }
  };

  // Admin Toggle Block User Handler
  const handleToggleBlock = async (userId) => {
    try {
      const response = await axios.put(`${apiUrl}/admin/users/${userId}/block`);
      alert(response.data.message || 'User block status updated.');
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to toggle user block status');
    }
  };

  // Admin Delete User Handler
  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${userName}"? This will delete all workspaces, campaigns, messages, and linked gateways for this user. This action CANNOT be undone.`)) {
      return;
    }
    try {
      const response = await axios.delete(`${apiUrl}/admin/users/${userId}`);
      alert(response.data.message || 'User deleted successfully.');
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  // Pricing Rule Update Handler
  const handleUpdatePricing = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${apiUrl}/admin/pricing`, newRule);
      alert('Pricing rule updated successfully.');
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update pricing rule');
    }
  };

  // Wallet Manual Adjustments Handler
  const handleAdjustWallet = async (e) => {
    e.preventDefault();
    if (!selectedUserForWallet) return;
    try {
      await axios.post(`${apiUrl}/admin/wallet/adjust`, {
        userId: selectedUserForWallet.id,
        amount: parseFloat(walletAdjustmentAmt),
        description: walletAdjustmentDesc
      });
      alert('Wallet adjustment successfully updated.');
      setSelectedUserForWallet(null);
      setWalletAdjustmentAmt('100');
      setWalletAdjustmentDesc('');
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to adjust wallet balance');
    }
  };

  // Plan Creator & Modifier Handlers
  const handleSavePlan = async (e) => {
    e.preventDefault();
    try {
      if (editingPlanId) {
        await axios.put(`${apiUrl}/admin/plans/${editingPlanId}`, planForm);
      } else {
        await axios.post(`${apiUrl}/admin/plans`, planForm);
      }
      setShowPlanModal(false);
      setEditingPlanId(null);
      resetPlanForm();
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save plan');
    }
  };

  const handleEditPlanClick = (plan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name || '',
      price: plan.price || 0,
      billingPeriod: plan.billingPeriod || 'MONTHLY',
      description: plan.description || '',
      features: plan.features || '',
      badge: plan.badge || '',
      displayOrder: plan.displayOrder || 0,
      isActive: plan.isActive !== false,
      rateLimit: plan.rateLimit || 60,
      storageLimit: plan.storageLimit || 100,
      freeMessages: plan.freeMessages || 0,
      gatewayLimit: plan.gatewayLimit || 1,
      apiLimit: plan.apiLimit || 1000,
      messagesLimit: plan.messagesLimit || 5000,
      teamLimit: plan.teamLimit || 2,
      webhooksLimit: plan.webhooksLimit || 1,
      brandingEnabled: plan.brandingEnabled === true,
      priorityQueue: plan.priorityQueue === true
    });
    setShowPlanModal(true);
  };

  const handleDeletePlan = async (planId) => {
    if (!confirm('Are you sure you want to delete this subscription plan?')) return;
    try {
      await axios.delete(`${apiUrl}/admin/plans/${planId}`);
      fetchAdminStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete plan');
    }
  };

  const resetPlanForm = () => {
    setPlanForm({
      name: '',
      price: 0,
      billingPeriod: 'MONTHLY',
      description: '',
      features: '',
      badge: '',
      displayOrder: 0,
      isActive: true,
      rateLimit: 60,
      storageLimit: 100,
      freeMessages: 0,
      gatewayLimit: 1,
      apiLimit: 1000,
      messagesLimit: 5000,
      teamLimit: 2,
      webhooksLimit: 1,
      brandingEnabled: false,
      priorityQueue: false
    });
  };

  // Seeding plans trigger helper
  const handleSeedPlans = async () => {
    try {
      const response = await axios.post(`${apiUrl}/admin/plans/seed`);
      alert(response.data.message || 'Seeded successfully.');
      fetchAdminStats();
    } catch (err) {
      alert('Seed failed: ' + err.message);
    }
  };

  const providers = ['BAILEYS', 'META'];
  const msgTypes = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTP', 'INVOICE', 'TEMPLATE'];

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h1 className="text-lg font-bold text-white">Management Panel</h1>
        <p className="text-xs text-slate-400">Configure subscription tiers, message rate pricing, and user wallets.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex bg-slate-800/40 p-1 rounded-2xl border border-slate-800 text-[10px] font-bold overflow-x-auto gap-1">
        {user?.role === 'ADMIN' && (
          <>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
                activeTab === 'stats' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              System Revenue
            </button>
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
                activeTab === 'plans' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Subscription Plans
            </button>
            <button
              onClick={() => setActiveTab('pricing')}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
                activeTab === 'pricing' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Outbound Pricing
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
                activeTab === 'users' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Users & Wallets
            </button>
            <button
              onClick={() => setActiveTab('txns')}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
                activeTab === 'txns' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Transactions Log
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab('reseller')}
          className={`px-4 py-2 rounded-xl transition whitespace-nowrap ${
            activeTab === 'reseller' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          White-Label Reseller
        </button>
      </div>

      {/* TAB 1: SYSTEM HEALTH AND REVENUE ANALYTICS */}
      {activeTab === 'stats' && adminStats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Total Revenue</span>
              <p className="text-xl font-black text-emerald-400 mt-0.5">₹{adminStats.metrics.totalRevenue?.toFixed(2)}</p>
            </div>
            <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Credits Spent</span>
              <p className="text-xl font-black text-slate-200 mt-0.5">₹{adminStats.metrics.totalSpent?.toFixed(2)}</p>
            </div>
            <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Total Users</span>
              <p className="text-lg font-bold text-white mt-0.5">{adminStats.metrics.totalUsers}</p>
            </div>
            <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Connected Gateways</span>
              <p className="text-lg font-bold text-white mt-0.5">{adminStats.metrics.activeGateways} / {adminStats.metrics.totalGateways}</p>
            </div>
          </div>

          {/* Infrastructure Health */}
          <div className="glass p-4 rounded-3xl space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5 border-b border-slate-850 pb-2">
              <Database className="w-4 h-4 text-purple-400" />
              Server Resources & Infrastructure
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
              <div className="flex justify-between p-2 rounded-xl bg-slate-800/30 border border-slate-850">
                <span className="text-slate-400">CPU Load</span>
                <span className="font-bold text-slate-200">{adminStats.serverHealth.cpu}</span>
              </div>
              <div className="flex justify-between p-2 rounded-xl bg-slate-800/30 border border-slate-850">
                <span className="text-slate-400">RAM Allocation</span>
                <span className="font-bold text-slate-200">{adminStats.serverHealth.memory}</span>
              </div>
              <div className="flex justify-between p-2 rounded-xl bg-slate-800/30 border border-slate-850">
                <span className="text-slate-400">Redis Server</span>
                <span className="font-bold text-emerald-400">{adminStats.serverHealth.redis}</span>
              </div>
              <div className="flex justify-between p-2 rounded-xl bg-slate-800/30 border border-slate-850">
                <span className="text-slate-400">System Uptime</span>
                <span className="font-bold text-slate-200">{adminStats.serverHealth.uptime}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTION PLAN CRUD MANAGER */}
      {activeTab === 'plans' && (
        <div className="glass p-4 rounded-3xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-850 pb-2.5">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-400" />
              SaaS Subscription Plans
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSeedPlans}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-xl border border-slate-700"
              >
                Reset Seeds
              </button>
              <button
                onClick={() => { resetPlanForm(); setEditingPlanId(null); setShowPlanModal(true); }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-xl flex items-center gap-1 shadow-lg shadow-blue-500/15"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Plan
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {plansList.map((p) => (
              <div key={p.id} className="p-3 bg-slate-800/20 rounded-2xl border border-slate-850 flex justify-between items-center gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    {p.name}
                    <span className="text-[8px] font-black text-slate-400">₹{p.price}/{p.billingPeriod?.toLowerCase()}</span>
                    {!p.isActive && (
                      <span className="text-[7px] px-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded font-extrabold">INACTIVE</span>
                    )}
                  </h4>
                  <p className="text-[10px] text-slate-500 line-clamp-1">{p.description || 'No description configured'}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEditPlanClick(p)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePlan(p.id)}
                    className="p-1.5 bg-red-950/40 hover:bg-red-900/60 rounded-lg text-red-400 border border-red-900/20 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* CREATE / EDIT PLAN FORM MODAL */}
          {showPlanModal && (
            <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex justify-center items-center z-50 p-4">
              <div className="glass-premium w-full max-w-[500px] p-5 rounded-3xl border border-slate-800/80 animate-in zoom-in-95 max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-slate-850 pb-3 mb-4">
                  <h3 className="text-sm font-black text-white">{editingPlanId ? 'Modify Subscription Plan' : 'Create Pricing Plan'}</h3>
                  <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSavePlan} className="space-y-4 text-left text-xs text-slate-300">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Plan Name</label>
                      <input
                        type="text"
                        value={planForm.name}
                        onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                        className="w-full glass-input p-3 rounded-xl"
                        placeholder="e.g. Starter"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billing Price (INR)</label>
                      <input
                        type="number"
                        value={planForm.price}
                        onChange={(e) => setPlanForm({ ...planForm, price: parseFloat(e.target.value) })}
                        className="w-full glass-input p-3 rounded-xl"
                        placeholder="e.g. 19"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Billing Period</label>
                      <select
                        value={planForm.billingPeriod}
                        onChange={(e) => setPlanForm({ ...planForm, billingPeriod: e.target.value })}
                        className="w-full glass-input p-3 rounded-xl bg-slate-900"
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Promo Badge</label>
                      <input
                        type="text"
                        value={planForm.badge}
                        onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })}
                        className="w-full glass-input p-3 rounded-xl"
                        placeholder="Popular / Recommended"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={planForm.description}
                      onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                      className="w-full glass-input p-3 rounded-xl"
                      placeholder="Pricing cards marketing copy"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Features (comma-separated)</label>
                    <textarea
                      value={planForm.features}
                      onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                      className="w-full glass-input p-3 rounded-xl h-16"
                      placeholder="3 Gateways,5000 API requests,Branding support"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Gateways</label>
                      <input
                        type="number"
                        value={planForm.gatewayLimit}
                        onChange={(e) => setPlanForm({ ...planForm, gatewayLimit: parseInt(e.target.value) })}
                        className="w-full glass-input p-2.5 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Message Limit</label>
                      <input
                        type="number"
                        value={planForm.messagesLimit}
                        onChange={(e) => setPlanForm({ ...planForm, messagesLimit: parseInt(e.target.value) })}
                        className="w-full glass-input p-2.5 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">API Requests</label>
                      <input
                        type="number"
                        value={planForm.apiLimit}
                        onChange={(e) => setPlanForm({ ...planForm, apiLimit: parseInt(e.target.value) })}
                        className="w-full glass-input p-2.5 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Rate (msgs/min)</label>
                      <input
                        type="number"
                        value={planForm.rateLimit}
                        onChange={(e) => setPlanForm({ ...planForm, rateLimit: parseInt(e.target.value) })}
                        className="w-full glass-input p-2.5 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Storage (MB)</label>
                      <input
                        type="number"
                        value={planForm.storageLimit}
                        onChange={(e) => setPlanForm({ ...planForm, storageLimit: parseFloat(e.target.value) })}
                        className="w-full glass-input p-2.5 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Free msgs (Paid Plan)</label>
                      <input
                        type="number"
                        value={planForm.freeMessages}
                        onChange={(e) => setPlanForm({ ...planForm, freeMessages: parseInt(e.target.value) })}
                        className="w-full glass-input p-2.5 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-1.5 select-none">
                      <input
                        type="checkbox"
                        checked={planForm.brandingEnabled}
                        onChange={(e) => setPlanForm({ ...planForm, brandingEnabled: e.target.checked })}
                      />
                      <span>Custom Branding</span>
                    </label>
                    <label className="flex items-center gap-1.5 select-none">
                      <input
                        type="checkbox"
                        checked={planForm.priorityQueue}
                        onChange={(e) => setPlanForm({ ...planForm, priorityQueue: e.target.checked })}
                      />
                      <span>Priority Queue</span>
                    </label>
                    <label className="flex items-center gap-1.5 select-none">
                      <input
                        type="checkbox"
                        checked={planForm.isActive}
                        onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
                      />
                      <span>Active</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20"
                  >
                    {editingPlanId ? 'Apply Plan Properties' : 'Create Pricing Tier'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OUTBOUND pricing CONFIGURATION */}
      {activeTab === 'pricing' && (
        <div className="glass p-4 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5 border-b border-slate-850 pb-2">
            <Settings className="w-4 h-4 text-emerald-400" />
            Outbound Per-Message Pricing Rules (INR)
          </h3>

          <form onSubmit={handleUpdatePricing} className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[90px]">
              <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Provider</label>
              <select
                value={newRule.provider}
                onChange={(e) => setNewRule({ ...newRule, provider: e.target.value })}
                className="w-full bg-slate-950 border border-slate-805 text-slate-300 text-[10.5px] rounded-lg p-2 focus:outline-none"
              >
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex-grow min-w-[90px]">
              <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Msg Type</label>
              <select
                value={newRule.messageType}
                onChange={(e) => setNewRule({ ...newRule, messageType: e.target.value })}
                className="w-full bg-slate-950 border border-slate-805 text-slate-300 text-[10.5px] rounded-lg p-2 focus:outline-none"
              >
                {msgTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="w-20">
              <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fee (₹)</label>
              <input
                type="number"
                step="0.01"
                value={newRule.price}
                onChange={(e) => setNewRule({ ...newRule, price: parseFloat(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-805 text-white text-[10.5px] rounded-lg p-2 focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold py-2 px-4 rounded-lg shadow transition shrink-0"
            >
              Update Pricing
            </button>
          </form>

          {/* Pricing rules table list */}
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {pricingRules.map((rule) => (
              <div key={rule.id} className="flex justify-between items-center p-3 bg-slate-950 rounded-2xl border border-slate-850">
                <div>
                  <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-800">
                    {rule.provider}
                  </span>
                  <span className="text-[10.5px] font-semibold text-slate-300 pl-2">{rule.messageType}</span>
                </div>
                <span className="text-xs font-black text-emerald-400">₹{rule.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: USERS, WALLET BALANCES AND ADJUSTMENTS */}
      {activeTab === 'users' && (
        <div className="glass p-4 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5 border-b border-slate-850 pb-2">
            <Users className="w-4 h-4 text-blue-400" />
            Registered Accounts & Wallet Balances
          </h3>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {usersList.map((u) => {
              const currentPlan = u.workspaces?.[0]?.workspace?.subscription?.plan?.name || 'Free';
              
              return (
                <div key={u.id} className="p-3.5 bg-slate-800/20 rounded-2xl border border-slate-850 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        {u.name}
                        {u.role === 'ADMIN' && (
                          <span className="text-[7px] px-1 py-0.2 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded font-black uppercase">Admin</span>
                        )}
                        {u.isBlocked && (
                          <span className="text-[7px] px-1 py-0.2 bg-red-500/15 text-red-400 border border-red-500/20 rounded font-black uppercase">Blocked</span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-500">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-semibold text-slate-500 uppercase block mb-0.5">Wallet Balance</span>
                      <span className="text-xs font-black text-emerald-400 block">₹{u.walletBalance?.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Plan:</span>
                      <select
                        value={currentPlan}
                        onChange={(e) => handleUpdateSubscription(u.id, e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold rounded-lg px-2 py-1"
                      >
                        <option value="Free">Free Tier</option>
                        <option value="Starter">Starter Plan</option>
                        <option value="Business">Business Plan</option>
                        <option value="Enterprise">Enterprise Plan</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedUserForWallet(u); }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-xl border border-slate-750 flex items-center gap-1"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        Adjust Wallet
                      </button>

                      <button
                        onClick={() => handleToggleBlock(u.id)}
                        disabled={u.role === 'ADMIN' && user.id !== u.id}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-xl border transition ${
                          u.isBlocked
                            ? 'bg-emerald-600/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600/20'
                            : 'bg-amber-600/10 text-amber-400 border-amber-500/20 hover:bg-amber-600/20'
                        }`}
                      >
                        {u.isBlocked ? 'Unblock' : 'Block'}
                      </button>

                      {u.role !== 'ADMIN' && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 text-[10px] font-bold rounded-xl transition"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* WALLET ADJUSTMENT OVERLAY MODAL */}
          {selectedUserForWallet && (
            <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex justify-center items-center z-50 p-4">
              <div className="glass-premium w-full max-w-[360px] p-5 rounded-3xl border border-slate-800/80 animate-in zoom-in-95">
                <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-3.5">
                  <h3 className="text-xs font-bold text-white">Adjust Wallet Balance</h3>
                  <button onClick={() => setSelectedUserForWallet(null)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-left space-y-1 mb-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Target User</p>
                  <p className="text-xs font-bold text-slate-200">{selectedUserForWallet.name} ({selectedUserForWallet.email})</p>
                </div>

                <form onSubmit={handleAdjustWallet} className="space-y-4 text-left">
                  <div>
                    <label className="block text-[8px] font-bold text-slate-500 uppercase mb-1">Adjustment value (positive = recharge, negative = deduction)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={walletAdjustmentAmt}
                      onChange={(e) => setWalletAdjustmentAmt(e.target.value)}
                      className="w-full glass-input p-3 rounded-xl text-xs font-bold text-white"
                      placeholder="e.g. 500 or -50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] font-bold text-slate-500 uppercase mb-1">Reason / Description</label>
                    <input
                      type="text"
                      value={walletAdjustmentDesc}
                      onChange={(e) => setWalletAdjustmentDesc(e.target.value)}
                      className="w-full glass-input p-3 rounded-xl text-xs text-white"
                      placeholder="e.g. Promo credit recharge / customer dispute resolution"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs transition uppercase tracking-wider"
                  >
                    Apply Balance Adjustment
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: GLOBAL WALLET TRANSACTIONS LEDGER */}
      {activeTab === 'txns' && (
        <div className="glass p-4 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5 border-b border-slate-850 pb-2">
            <List className="w-4 h-4 text-purple-400" />
            Global Wallet Ledger Audit
          </h3>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {txList.length === 0 ? (
              <div className="text-center py-6 text-[10px] text-slate-500">
                No transactions registered yet.
              </div>
            ) : (
              txList.map((tx) => {
                const isDeduction = tx.amount < 0;
                return (
                  <div key={tx.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-850 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-[10.5px] font-bold text-slate-200">{tx.user?.name || 'Unknown User'}</h4>
                        <p className="text-[8.5px] text-slate-500">{tx.user?.email}</p>
                      </div>
                      <span className={`text-[11px] font-black ${isDeduction ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isDeduction ? '-' : '+'}₹{Math.abs(tx.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[8.5px] text-slate-500 pt-2 border-t border-slate-900/60">
                      <span>Reason: {tx.description}</span>
                      <span>{new Date(tx.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* WHITE LABEL RESELLER TAB */}
      {activeTab === 'reseller' && (
        <div className="glass p-4 rounded-3xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-2">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              White Label Setup
            </h3>
            <span className="text-[8px] font-extrabold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">
              ACTIVE
            </span>
          </div>

          {resellerSaved && (
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold rounded-xl">
              Changes applied successfully! Your clients can now link workspaces on your domain.
            </div>
          )}

          <form onSubmit={handleUpdateReseller} className="space-y-3.5 text-left">
            <div>
              <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-1">Mapping Domain</label>
              <input 
                type="text" 
                placeholder="e.g. gateway.mycompany.com" 
                value={resellerConfig.domain}
                onChange={(e) => setResellerConfig({ ...resellerConfig, domain: e.target.value })}
                className="w-full glass-input p-3 rounded-xl text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-1">Custom Branding Name</label>
              <input 
                type="text" 
                placeholder="e.g. Brex SMS Gateway" 
                value={resellerConfig.brandingName}
                onChange={(e) => setResellerConfig({ ...resellerConfig, brandingName: e.target.value })}
                className="w-full glass-input p-3 rounded-xl text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-1">Custom Logo Link</label>
              <input 
                type="text" 
                placeholder="e.g. https://domain.com/logo.png" 
                value={resellerConfig.logo}
                onChange={(e) => setResellerConfig({ ...resellerConfig, logo: e.target.value })}
                className="w-full glass-input p-3 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-[9px] font-semibold text-slate-400 uppercase mb-1">Stripe Private Key</label>
              <input 
                type="password" 
                placeholder="sk_live_..." 
                value={resellerConfig.stripeKey}
                onChange={(e) => setResellerConfig({ ...resellerConfig, stripeKey: e.target.value })}
                className="w-full glass-input p-3 rounded-xl text-xs"
              />
            </div>

            <button 
              type="submit" 
              disabled={resellerLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition text-xs flex justify-center items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {resellerLoading ? 'Saving config...' : 'Apply Reseller Settings'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
