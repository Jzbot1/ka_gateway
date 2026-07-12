import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Clock,
  Copy,
  Smartphone,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Crown,
  Check,
  Loader2
} from 'lucide-react';

export default function Checkout() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { apiUrl, socket } = useAuth();

  // State details
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [timeLeft, setTimeLeft] = useState(900); // 15 mins (900 seconds)
  const [status, setStatus] = useState('PENDING'); // PENDING, SUCCESS, EXPIRED, CANCELLED
  const [copied, setCopied] = useState(false);

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCancelledFeedback, setShowCancelledFeedback] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const timerRef = useRef(null);
  const pollRef = useRef(null);

  // 1. Fetch payment session
  const fetchPaymentDetails = async () => {
    try {
      const token = localStorage.getItem('token');
      const workspaceId = localStorage.getItem('workspaceId');

      const response = await axios.get(`${apiUrl}/billing/payment/payment/${orderId}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-workspace-id': workspaceId || ''
        }
      });
      setPayment(response.data);
      setLoading(false);
      
      // Calculate remaining time based on createdAt
      const createdTime = new Date(response.data.createdAt).getTime();
      const elapsed = Math.floor((Date.now() - createdTime) / 1000);
      const remaining = 900 - elapsed;

      if (remaining <= 0 || response.data.status === 'FAILED') {
        setStatus(response.data.status === 'SUCCESS' ? 'SUCCESS' : 'EXPIRED');
        setTimeLeft(0);
      } else if (response.data.status === 'SUCCESS') {
        setStatus('SUCCESS');
      } else {
        setStatus('PENDING');
        setTimeLeft(remaining);
        startTimer(remaining);
        startPolling();
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Payment session details could not be retrieved.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId && apiUrl) {
      fetchPaymentDetails();
    }
    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
    };
  }, [orderId, apiUrl]);

  // Socket success listener
  useEffect(() => {
    if (!socket) return;
    socket.on('payment.success', (data) => {
      if (data.orderId === orderId) {
        handleSuccessFinalize();
      }
    });
    return () => {
      socket.off('payment.success');
    };
  }, [socket, orderId]);

  const startTimer = (secondsVal) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let time = secondsVal;
    timerRef.current = setInterval(() => {
      time--;
      setTimeLeft(time);
      if (time <= 0) {
        clearInterval(timerRef.current);
        clearInterval(pollRef.current);
        setStatus('EXPIRED');
      }
    }, 1000);
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const workspaceId = localStorage.getItem('workspaceId');

        const response = await axios.post(`${apiUrl}/billing/payment/status`, { orderId }, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'x-workspace-id': workspaceId || ''
          }
        });
        if (response.data.status === 'SUCCESS') {
          handleSuccessFinalize();
        } else if (response.data.status === 'FAILED') {
          handleFailureFinalize();
        }
      } catch (err) {
        console.warn('Status check error:', err.message);
      }
    }, 3000);
  };

  const handleSuccessFinalize = () => {
    clearInterval(timerRef.current);
    clearInterval(pollRef.current);
    setStatus('SUCCESS');
  };

  const handleFailureFinalize = () => {
    clearInterval(timerRef.current);
    clearInterval(pollRef.current);
    setStatus('FAILED');
  };

  const handleSimulateSuccess = async () => {
    try {
      const token = localStorage.getItem('token');
      const workspaceId = localStorage.getItem('workspaceId');

      await axios.post(`${apiUrl}/billing/payment/status`, { orderId, simulateSuccess: true }, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-workspace-id': workspaceId || ''
        }
      });
      handleSuccessFinalize();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to simulate payment success');
    }
  };

  const handleCancelPayment = async () => {
    setCancelling(true);
    try {
      const token = localStorage.getItem('token');
      const workspaceId = localStorage.getItem('workspaceId');

      await axios.post(`${apiUrl}/billing/payment/cancel`, { orderId }, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-workspace-id': workspaceId || ''
        }
      });
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
      setShowCancelModal(false);
      setShowCancelledFeedback(true);
      setStatus('CANCELLED');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel payment session.');
    } finally {
      setCancelling(false);
    }
  };

  const copyVpa = () => {
    if (!payment) return;
    const vpa = payment.paytmVpa || 'demo@upi';
    navigator.clipboard.writeText(vpa);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Rendering Helpers
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-20 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-bold tracking-wider animate-pulse">AWAITING PAYMENT CONTEXT...</p>
      </div>
    );
  }

  if (error || !payment) {
    const isAccessDenied = error && error.includes('Access denied');
    return (
      <div className="flex justify-center items-center py-10 px-4 animate-in fade-in duration-200">
        <div className="glass p-6.5 rounded-3xl text-center border-slate-800/80 max-w-[360px] space-y-4">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto text-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            {isAccessDenied ? 'Access Denied' : 'Checkout Session Error'}
          </h2>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {error || 'The payment link you followed is invalid, has expired, or does not exist. Please go back and try initiating checkout again.'}
          </p>
          <button
            onClick={() => navigate('/billing')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-xl transition uppercase tracking-widest"
          >
            Return to Billing
          </button>
        </div>
      </div>
    );
  }

  const STORE_NAME = payment.storeName || 'JZ Gateway';
  const isWallet = orderId.includes('WLT_RECHG');
  const displayTitle = isWallet ? 'Wallet Credits Recharge' : `${payment.planName} Plan Purchase`;

  return (
    <div className="relative space-y-4 animate-in fade-in duration-200">
      
      {/* 4. MAIN CHECKOUT UI CARD */}
      <div className="glass p-5 rounded-3xl bg-slate-900 border-slate-800 text-center relative overflow-hidden max-w-[400px] mx-auto">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>

        <div className="store-name text-sm font-black tracking-widest text-blue-400 uppercase">
          {STORE_NAME}
        </div>
        
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 mb-4">
          {displayTitle}
        </div>

        {status === 'PENDING' && (
          <div className="space-y-4">
            
            {/* Status Badge Timer */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold font-mono uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              <span>Checkout Session</span>
              <span className="text-slate-600">|</span>
              <span>{formatTime(timeLeft)}</span>
            </div>

            {/* Amount Badge */}
            <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850">
              <span className="text-[8.5px] uppercase font-bold text-slate-500 tracking-widest">Amount Due</span>
              <p className="text-3xl font-black text-emerald-400 mt-1">₹{payment.amount.toFixed(2)}</p>
            </div>

            {/* Gateway redirect link details */}
            {payment.paymentUrl ? (
              <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-1">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest">Live Gateway payment</span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                  Your checkout session is generated. Click the button below to complete the transaction on our secure payment portal.
                </p>
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-[10.5px] text-red-400 leading-relaxed font-bold">
                Failed to generate secure checkout link from the gateway. Please cancel this session and try again.
              </div>
            )}

            {/* Live Gateway Redirect Button */}
            {payment.paymentUrl && (
              <a 
                href={payment.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest flex justify-center items-center gap-2 shadow-lg shadow-blue-500/20 transition transform active:scale-95"
              >
                <Smartphone className="w-4 h-4" />
                Proceed to Secure Payment
              </a>
            )}

            {/* Awaiting Status Message */}
            <div className="text-[10.5px] font-bold text-slate-400 flex flex-col justify-center items-center gap-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-900">
              <div className="flex items-center gap-1.5 text-amber-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Awaiting transaction verification...
              </div>
              <span className="text-[9px] text-slate-500 font-normal">This window will automatically direct to receipt details when paid.</span>
            </div>

            {/* Cancel Trigger */}
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full py-3.5 rounded-2xl bg-red-600/10 hover:bg-red-600/15 text-red-400 text-[10px] font-bold border border-red-500/20 transition uppercase tracking-wider flex justify-center items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Cancel Payment Session
            </button>
          </div>
        )}

        {status === 'EXPIRED' && (
          <div className="py-8 space-y-4">
            <XCircle className="w-14 h-14 text-red-500 mx-auto" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Payment Link Expired</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed px-4">
              This payment session has timed out. Checkout links are only valid for 15 minutes. Please go back and create a new session.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="px-6 py-2.5 bg-slate-800 text-slate-200 text-[10px] font-bold rounded-xl hover:bg-slate-700 transition uppercase tracking-wider"
            >
              Back to Billing
            </button>
          </div>
        )}

        {/* Supported Payment Badges */}
        <div className="mt-6 text-[8.5px] font-bold text-slate-500 uppercase tracking-widest border-t border-slate-850 pt-4">
          Supported Apps
          <div className="flex justify-center items-center gap-2.5 mt-3 opacity-60">
            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-bold">UPI</span>
            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-bold">Google Pay</span>
            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-bold">PhonePe</span>
            <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded font-bold">BHIM</span>
          </div>
        </div>
      </div>

      {/* CANCEL CONFIRMATION OVERLAY MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur flex justify-center items-center z-50 p-4">
          <div className="glass w-full max-w-[340px] p-5 rounded-3xl border border-red-500/20 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto text-xl mb-3">
              <XCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Cancel Transaction?</h3>
            <p className="text-[11px] text-slate-400 mt-2 mb-4 leading-relaxed">
              Are you sure you want to cancel this checkout session? This will expire your active payment link.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-xl border border-slate-700 uppercase"
              >
                No, Keep Page
              </button>
              <button
                onClick={handleCancelPayment}
                disabled={cancelling}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-xl transition uppercase flex justify-center items-center gap-1"
              >
                {cancelling ? <Loader2 className="w-3 animate-spin" /> : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLED FEEDBACK MODAL */}
      {showCancelledFeedback && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur flex justify-center items-center z-50 p-4">
          <div className="glass w-full max-w-[340px] p-5 rounded-3xl border-slate-800 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto text-xl mb-3 animate-pulse">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Transaction Cancelled</h3>
            <p className="text-[11px] text-slate-400 mt-2 mb-4 leading-relaxed">
              Your transaction session has been set to failed. You can safely return to the dashboard.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-xl transition uppercase tracking-wider flex justify-center items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* 5. SUCCESS OVERLAY MODAL */}
      {status === 'SUCCESS' && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="glass w-full max-w-[360px] p-6 rounded-3xl border-emerald-500/40 text-center shadow-2xl shadow-emerald-500/10 animate-in slide-in-from-bottom-8 duration-300">
            
            <div className="w-16 h-16 bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 rounded-full flex items-center justify-center mx-auto text-2xl mb-4 animate-bounce">
              {isWallet ? <Check className="w-8 h-8" /> : <Crown className="w-8 h-8" />}
            </div>

            <h2 className="text-md font-extrabold text-emerald-400 uppercase tracking-widest">
              {isWallet ? 'TOPUP SUCCESSFUL!' : 'UPGRADE ACTIVE!'}
            </h2>

            <p className="text-[11px] text-slate-400 leading-relaxed mt-2 mb-6 px-2">
              {isWallet 
                ? 'Your wallet balance has been successfully topped up and credited to your ledger profile.' 
                : 'Congratulations! Your premium SaaS gateway plan has been unlocked successfully.'}
            </p>

            <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-850 text-[10px] font-mono text-slate-300 inline-block mb-6">
              Receipt ID: {orderId}
            </div>

            <button
              onClick={() => navigate('/billing')}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-2xl transition text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* 6. FAILURE OVERLAY MODAL */}
      {status === 'FAILED' && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="glass w-full max-w-[360px] p-6 rounded-3xl border-red-500/40 text-center shadow-2xl shadow-red-500/10 animate-in slide-in-from-bottom-8 duration-300">
            
            <div className="w-16 h-16 bg-red-500/10 border-2 border-red-500 text-red-500 rounded-full flex items-center justify-center mx-auto text-2xl mb-4 animate-bounce">
              <XCircle className="w-8 h-8" />
            </div>

            <h2 className="text-md font-extrabold text-red-500 uppercase tracking-widest">
              PAYMENT FAILED!
            </h2>

            <p className="text-[11px] text-slate-400 leading-relaxed mt-2 mb-6 px-2">
              Unfortunately, your transaction could not be processed successfully. Please contact support or try a different payment method.
            </p>

            <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-850 text-[10px] font-mono text-slate-300 inline-block mb-6">
              Order ID: {orderId}
            </div>

            <button
              onClick={() => navigate('/billing')}
              className="w-full py-3.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black rounded-2xl transition text-xs uppercase tracking-widest shadow-lg shadow-red-500/20"
            >
              Return to Billing
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
