import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Cpu, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  QrCode, 
  Info, 
  X,
  Radio
} from 'lucide-react';

export default function Gateways() {
  const { apiUrl, socket, workspaceId } = useAuth();
  const [gateways, setGateways] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [pairingMethod, setPairingMethod] = useState('QR'); // 'QR' or 'CODE'
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const [addForm, setAddForm] = useState({
    name: '',
    provider: 'AUTO',
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
  });
  const [loading, setLoading] = useState(false);

  // Load gateways
  const fetchGateways = async () => {
    try {
      const response = await axios.get(`${apiUrl}/gateways`);
      setGateways(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchGateways();
    }
  }, [workspaceId, apiUrl]);

  // Listen to Socket.IO events for real-time gateway updates
  useEffect(() => {
    if (!socket) return;

    socket.on('gateway.status', (data) => {
      console.log('Socket update: gateway.status', data);
      setGateways((prev) => 
        prev.map((g) => g.id === data.gatewayId ? { ...g, status: data.status, phoneNumber: data.phoneNumber || g.phoneNumber } : g)
      );
      if (selectedGateway?.id === data.gatewayId && data.status === 'CONNECTED') {
        setShowQrModal(false);
      }
    });

    socket.on('qr.update', (data) => {
      console.log('Socket update: qr.update', data);
      if (selectedGateway?.id === data.gatewayId) {
        setQrCodeData(data.qr);
      }
    });

    return () => {
      socket.off('gateway.status');
      socket.off('qr.update');
    };
  }, [socket, selectedGateway]);

  const handleCreateGateway = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const credentials = addForm.provider === 'META' ? {
        accessToken: addForm.accessToken,
        phoneNumberId: addForm.phoneNumberId,
        businessAccountId: addForm.businessAccountId,
      } : addForm.accessToken ? { accessToken: addForm.accessToken } : null;

      await axios.post(`${apiUrl}/gateways`, {
        name: addForm.name,
        provider: addForm.provider,
        credentials,
      });

      fetchGateways();
      setShowAddModal(false);
      setAddForm({ name: '', provider: 'AUTO', accessToken: '', phoneNumberId: '', businessAccountId: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create gateway');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerQr = async (gateway) => {
    setSelectedGateway(gateway);
    setQrCodeData(null);
    setPairingMethod('QR');
    setPairingPhone('');
    setPairingCode(null);
    setShowQrModal(true);
    try {
      const response = await axios.get(`${apiUrl}/gateways/${gateway.id}/qr`);
      if (response.data && response.data.qr) {
        setQrCodeData(response.data.qr);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGetPairingCode = async () => {
    if (!pairingPhone) {
      alert('Please enter your phone number with country code');
      return;
    }
    setGeneratingCode(true);
    setPairingCode(null);
    try {
      const response = await axios.get(`${apiUrl}/gateways/${selectedGateway.id}/pairing-code?phone=${pairingPhone}`);
      setPairingCode(response.data.code);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate pairing code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleDisconnect = async (gatewayId) => {
    if (!confirm('Are you sure you want to disconnect this gateway?')) return;
    try {
      await axios.post(`${apiUrl}/gateways/${gatewayId}/disconnect`);
      fetchGateways();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (gatewayId) => {
    if (!confirm('Delete this gateway permanently?')) return;
    try {
      await axios.delete(`${apiUrl}/gateways/${gatewayId}`);
      fetchGateways();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-white">Gateways</h1>
          <p className="text-xs text-slate-400">Establish and coordinate WhatsApp sending channels.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white hover:scale-105 transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Tip Info */}
      <div className="glass p-3.5 rounded-2xl flex gap-2.5 items-start">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-slate-300">
          💡 **Simulation Tip:** Create a gateway containing **[Mock]** in its name. The system will automatically pair and simulate connection events after 3 seconds for instant API testing!
        </p>
      </div>

      {/* GATEWAYS GRID */}
      <div className="space-y-3">
        {gateways.length === 0 ? (
          <div className="glass p-8 text-center rounded-3xl text-slate-400">
            <Cpu className="w-12 h-12 mx-auto mb-2 text-slate-600" />
            <p className="text-sm font-semibold">No gateways linked</p>
            <p className="text-xs mt-1">Tap Add to set up your first WhatsApp pairing.</p>
          </div>
        ) : (
          gateways.map((gw) => (
            <div key={gw.id} className="glass p-4 rounded-3xl flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{gw.name}</h3>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {gw.provider}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {gw.phoneNumber ? `Phone: ${gw.phoneNumber}` : 'No phone linked'}
                  </p>
                </div>

                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  gw.status === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {gw.status === 'CONNECTED' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  {gw.status}
                </div>
              </div>

              {/* Gateway Actions */}
              <div className="flex justify-between items-center border-t border-slate-800/40 pt-2.5 mt-1">
                <div className="flex gap-2">
                  {gw.status !== 'CONNECTED' && gw.provider !== 'META' && (
                    <button 
                      onClick={() => handleTriggerQr(gw)}
                      className="flex items-center gap-1 bg-blue-600/10 text-blue-400 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-600/20 transition"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scan QR
                    </button>
                  )}
                  {gw.status === 'CONNECTED' && (
                    <button 
                      onClick={() => handleDisconnect(gw.id)}
                      className="flex items-center gap-1 bg-amber-600/10 text-amber-400 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-amber-600/20 transition"
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                <button 
                  onClick={() => handleDelete(gw.id)}
                  className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ADD GATEWAY MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="glass-premium w-full max-w-[400px] p-5 rounded-3xl relative animate-in zoom-in-95 duration-150">
            <button 
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-full text-slate-400 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-4">Add WhatsApp Gateway</h3>
            
            <form onSubmit={handleCreateGateway} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Gateway Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. My Shop Gateway [Mock]"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full glass-input p-3 rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Provider Mode</label>
                <select 
                  value={addForm.provider}
                  onChange={(e) => setAddForm({ ...addForm, provider: e.target.value })}
                  className="w-full bg-slate-850 border border-slate-700/80 p-3 rounded-xl text-sm text-white"
                >
                  <option value="AUTO">Auto Routing (Failover)</option>
                  <option value="BAILEYS">Baileys (Web QR Pairing)</option>
                  <option value="META">Meta WhatsApp Cloud API (Official)</option>
                </select>
              </div>

              {addForm.provider === 'META' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Access Token</label>
                    <input 
                      type="password"
                      placeholder="Meta Graph Token"
                      value={addForm.accessToken}
                      onChange={(e) => setAddForm({ ...addForm, accessToken: e.target.value })}
                      className="w-full glass-input p-3 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Phone Number ID</label>
                    <input 
                      type="text"
                      placeholder="Phone Number ID"
                      value={addForm.phoneNumberId}
                      onChange={(e) => setAddForm({ ...addForm, phoneNumberId: e.target.value })}
                      className="w-full glass-input p-3 rounded-xl text-sm"
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition text-sm"
              >
                {loading ? 'Creating...' : 'Create Gateway'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QR PAIRING MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="glass-premium w-full max-w-[360px] p-5 rounded-3xl text-center relative animate-in zoom-in-95 duration-150">
            <button 
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-full text-slate-400 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-2">Pair WhatsApp Account</h3>
            <p className="text-xs text-slate-400 mb-4">Choose a pairing method below to link your device.</p>

            {/* Method Tabs */}
            <div className="flex bg-slate-900/80 p-1 rounded-xl mb-4 border border-slate-800">
              <button
                onClick={() => setPairingMethod('QR')}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition ${
                  pairingMethod === 'QR' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Scan QR Code
              </button>
              <button
                onClick={() => setPairingMethod('CODE')}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition ${
                  pairingMethod === 'CODE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pairing Code
              </button>
            </div>

            {pairingMethod === 'QR' ? (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400">Scan this QR code from your phone's WhatsApp Linked Devices screen.</p>
                <div className="w-52 h-52 bg-white rounded-2xl mx-auto flex justify-center items-center p-3 relative shadow-inner">
                  {qrCodeData ? (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeData)}`}
                      alt="WhatsApp Pairing QR" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="space-y-2">
                      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">Waiting for session update...</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                <p className="text-[10px] text-slate-400 text-center">Pair by entering a verification code on your phone.</p>
                
                <div className="space-y-2">
                  <label className="block text-[9px] font-semibold text-slate-400 uppercase">WhatsApp Phone Number</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 918730063275 (with country code)"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      className="flex-1 glass-input px-3 py-2 rounded-xl text-xs"
                    />
                    <button
                      onClick={handleGetPairingCode}
                      disabled={generatingCode}
                      className="px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold rounded-xl transition text-[10px] shrink-0"
                    >
                      {generatingCode ? 'Wait...' : 'Get Code'}
                    </button>
                  </div>
                  <span className="text-[8.5px] text-slate-500 block">Include country code without prefix '+' or spaces.</span>
                </div>

                {pairingCode && (
                  <div className="space-y-2 text-center p-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 animate-in zoom-in-95">
                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Your Pairing Code</span>
                    <div className="text-xl font-black text-blue-400 tracking-[0.2em] font-mono select-all">
                      {pairingCode.length === 8 ? `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}` : pairingCode}
                    </div>
                    <p className="text-[9px] leading-relaxed text-slate-400 pt-1">
                      Open WhatsApp &gt; Linked Devices &gt; Link with Phone Number, then enter the code shown above.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-2 justify-center items-center text-[10px] text-slate-400 font-medium bg-slate-800/40 p-3 rounded-2xl">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              Do not close this modal until connection is active.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
