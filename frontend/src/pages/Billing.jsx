import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Check, 
  Sparkles, 
  Layers,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Activity
} from 'lucide-react';

export default function Billing() {
  const { apiUrl, workspaceId } = useAuth();
  const navigate = useNavigate();
  
  // Data States
  const [subContext, setSubContext] = useState(null); // { subscription, walletBalance, transactions, monthlyUsage }
  const [plans, setPlans] = useState([]);
  
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [rechargeAmt, setRechargeAmt] = useState('100');
  const [recharging, setRecharging] = useState(false);

  const fetchBillingContext = async () => {
    try {
      const response = await axios.get(`${apiUrl}/billing/subscription`);
      setSubContext(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await axios.get(`${apiUrl}/billing/plans`);
      setPlans(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchBillingContext();
      fetchPlans();
    }
  }, [workspaceId, apiUrl]);

  // Initiate Simulated checkout (Plan Purchase)
  const handleInitiatePaytm = async (planName) => {
    setLoadingPlan(planName);
    try {
      const response = await axios.post(`${apiUrl}/billing/payment/initiate`, { planName });
      navigate(`/checkout/${response.data.orderId}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to initiate checkout payment');
    } finally {
      setLoadingPlan(null);
    }
  };

  // Initiate Wallet Recharge checkout (Simulated)
  const handleRechargeWallet = async (e) => {
    e.preventDefault();
    const amount = parseFloat(rechargeAmt);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid recharge amount');
      return;
    }

    setRecharging(true);
    try {
      // Initiate dynamic wallet topup
      const response = await axios.post(`${apiUrl}/billing/payment/initiate`, { 
        planName: 'Free', // Base plan
        amount: amount,   // Dynamic wallet recharge amount
      });
      navigate(`/checkout/${response.data.orderId}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to initiate recharge checkout');
    } finally {
      setRecharging(false);
    }
  };

  const activeSub = subContext?.subscription;
  const walletBalance = subContext?.walletBalance || 0;
  const transactions = subContext?.transactions || [];
  const monthlyUsage = subContext?.monthlyUsage || 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h1 className="text-lg font-bold text-white">Billing & Subscriptions</h1>
        <p className="text-xs text-slate-400">Upgrade pricing plans, monitor dynamic charges, or load wallet credits.</p>
      </div>

      {/* CORE FINANCIAL OVERVIEW */}
      <div className="grid grid-cols-2 gap-3.5">
        
        {/* Wallet Balance Widget */}
        <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl"></div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Wallet Balance</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-black text-emerald-400">₹{walletBalance.toFixed(2)}</h2>
            <p className="text-[8px] text-slate-500 mt-0.5">Used for message overages.</p>
          </div>
        </div>

        {/* Free Limits Widget */}
        <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-500/5 rounded-full blur-xl"></div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Free Messages</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-black text-blue-400">
              {activeSub?.plan?.name === 'Free' 
                ? `${activeSub?.freeMessagesRemaining} / 5` 
                : `${activeSub?.plan?.freeMessages || 0} / mo`}
            </h2>
            <p className="text-[8px] text-slate-500 mt-0.5">Remaining free messages.</p>
          </div>
        </div>

      </div>

      {/* ACTIVE PLAN DETAILS AND USAGE */}
      {activeSub && (
        <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Current plan</span>
              <h3 className="text-sm font-bold text-white mt-0.5 flex items-center gap-1.5">
                {activeSub.plan?.name} Plan
                <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-full">
                  {activeSub.status}
                </span>
              </h3>
            </div>
            <div className="text-right">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Monthly usage</span>
              <span className="text-xs font-black text-slate-200 block mt-0.5">
                {monthlyUsage} / {activeSub.plan?.messagesLimit === 999999 ? 'Unlimited' : activeSub.plan?.messagesLimit} msgs
              </span>
            </div>
          </div>

          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${Math.min(100, (monthlyUsage / (activeSub.plan?.messagesLimit || 1)) * 100)}%` 
              }}
            ></div>
          </div>
        </div>
      )}

      {/* RECHARGE WALLET SECTION */}
      <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800">
        <h3 className="text-xs font-bold text-white mb-3">Recharge Wallet Credits</h3>
        <form onSubmit={handleRechargeWallet} className="flex gap-2.5">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₹</span>
            <input
              type="number"
              placeholder="Enter recharge amount"
              value={rechargeAmt}
              onChange={(e) => setRechargeAmt(e.target.value)}
              className="w-full glass-input pl-7 pr-3 py-3 rounded-2xl text-xs font-bold text-white focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={recharging}
            className="px-5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl transition shadow-lg shadow-emerald-500/15"
          >
            {recharging ? 'Loading...' : 'Add Balance'}
          </button>
        </form>
        <div className="flex gap-2 mt-3">
          {['100', '200', '500', '1000'].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setRechargeAmt(amt)}
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold border transition ${
                rechargeAmt === amt 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              +₹{amt}
            </button>
          ))}
        </div>
      </div>

      {/* PRICING PLANS LIST */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1 mt-6 mb-1">Select Subscription Plan</h3>
        
        {plans.map((p) => {
          const isActive = activeSub?.planId === p.id;
          return (
            <div key={p.id} className={`glass p-4.5 rounded-3xl relative transition border flex flex-col gap-3.5 ${
              isActive ? 'border-blue-500/70 bg-slate-900/60' : 'border-slate-800/80 hover:border-slate-700/60'
            }`}>
              
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    {p.name}
                    {p.badge && (
                      <span className="text-[7.5px] px-1.5 py-0.5 rounded-md font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                        {p.badge}
                      </span>
                    )}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">{p.description || 'Limits and gateway configurations.'}</p>
                </div>
                <div className="text-right">
                  <span className="text-md font-black text-white">₹{p.price}</span>
                  <span className="text-[9px] text-slate-500 block">/{p.billingPeriod?.toLowerCase() || 'month'}</span>
                </div>
              </div>

              {/* Highlights */}
              <ul className="grid grid-cols-2 gap-2 text-slate-300 text-[10.5px]">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{p.gatewayLimit} WhatsApp Channels</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{p.messagesLimit === 999999 ? 'Unlimited' : `${p.messagesLimit} messages`}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{p.teamLimit} Team members</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{p.brandingEnabled ? 'Branding Access' : 'No branding'}</span>
                </li>
              </ul>

              <button
                onClick={() => handleInitiatePaytm(p.name)}
                disabled={isActive || loadingPlan === p.name}
                className={`w-full py-3 rounded-2xl text-[10px] font-bold transition flex justify-center items-center gap-1.5 ${
                  isActive 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                }`}
              >
                {loadingPlan === p.name ? 'Processing...' : isActive ? 'Active Plan' : `Upgrade to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* WALLET TRANSACTIONS / BILLING HISTORY */}
      <div className="glass p-4 rounded-3xl bg-slate-900 border-slate-800">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5 mb-3">
          <FileText className="w-4 h-4 text-purple-400" />
          Wallet Transactions & Invoices
        </h3>

        {transactions.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-slate-500">
            No transactions registered yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {transactions.map((t) => {
              const isDeduction = t.amount < 0;
              return (
                <div key={t.id} className="flex justify-between items-center p-3 bg-slate-950 rounded-2xl border border-slate-850">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-xl border ${
                      isDeduction 
                        ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    }`}>
                      {isDeduction ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <h4 className="text-[10.5px] font-bold text-slate-200">{t.description}</h4>
                      <p className="text-[8.5px] text-slate-500">{new Date(t.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-black ${isDeduction ? 'text-red-400' : 'text-emerald-400'}`}>
                    {isDeduction ? '-' : '+'}₹{Math.abs(t.amount).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
