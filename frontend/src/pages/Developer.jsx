import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Terminal, 
  Key, 
  Trash2, 
  Copy, 
  Check, 
  Play, 
  Layers, 
  Code,
  Globe
} from 'lucide-react';

export default function Developer() {
  const { apiUrl, workspaceId } = useAuth();
  const [keys, setKeys] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeLang, setActiveLang] = useState('nodejs');
  
  // Playground state
  const [playgroundTo, setPlaygroundTo] = useState('');
  const [playgroundMsg, setPlaygroundMsg] = useState('Hello from the API Playground!');
  const [playgroundResp, setPlaygroundResp] = useState(null);
  const [playgroundLoading, setPlaygroundLoading] = useState(false);

  const fetchKeys = async () => {
    try {
      const response = await axios.get(`${apiUrl}/developers/keys`);
      setKeys(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchKeys();
    }
  }, [workspaceId, apiUrl]);

  const handleGenerateKey = async () => {
    try {
      const response = await axios.post(`${apiUrl}/developers/keys`, { type: 'LIVE' });
      setKeys([response.data, ...keys]);
    } catch (e) {
      alert('Failed to generate API Key');
    }
  };

  const handleRevokeKey = async (id) => {
    if (!confirm('Revoke this API Key permanently?')) return;
    try {
      await axios.delete(`${apiUrl}/developers/keys/${id}`);
      setKeys(keys.filter((k) => k.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text, keyId) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const runPlayground = async () => {
    if (!playgroundTo) return alert('Enter recipient phone number');
    setPlaygroundLoading(true);
    setPlaygroundResp(null);

    const activeKey = keys[0]?.key || 'ak_live_mock_key_playground';

    try {
      const response = await axios.post(`${apiUrl}/messages/send-message`, {
        to: playgroundTo,
        message: playgroundMsg,
      }, {
        headers: { 'x-api-key': activeKey }
      });
      setPlaygroundResp(response.data);
    } catch (err) {
      setPlaygroundResp(err.response?.data || { error: err.message });
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const codeSnippets = {
    nodejs: `const axios = require('axios');

axios.post('${window.location.origin || 'http://localhost:5000'}/api/messages/send-message', {
  to: '${playgroundTo || '15551234567'}',
  message: '${playgroundMsg}',
  type: 'TEXT'
}, {
  headers: { 'x-api-key': '${keys[0]?.key || 'YOUR_API_KEY'}' }
})
.then(res => console.log(res.data))
.catch(err => console.error(err));`,

    python: `import requests

url = "${window.location.origin || 'http://localhost:5000'}/api/messages/send-message"
headers = {
    "x-api-key": "${keys[0]?.key || 'YOUR_API_KEY'}",
    "Content-Type": "application/json"
}
payload = {
    "to": "${playgroundTo || '15551234567'}",
    "message": "${playgroundMsg}",
    "type": "TEXT"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,

    php: `<?php
$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, "${window.location.origin || 'http://localhost:5000'}/api/messages/send-message");
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "x-api-key: ${keys[0]?.key || 'YOUR_API_KEY'}",
    "Content-Type: application/json"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    "to" => "${playgroundTo || '15551234567'}",
    "message" => "${playgroundMsg}",
    "type" => "TEXT"
]));

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>`,
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h1 className="text-lg font-bold text-white">Developer Center</h1>
        <p className="text-xs text-slate-400">Manage credentials and verify REST request outputs.</p>
      </div>

      {/* CREDENTIALS SECTION */}
      <div className="glass p-4 rounded-3xl space-y-3.5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-white font-bold text-sm">
            <Key className="w-4.5 h-4.5 text-blue-400" />
            API Keys
          </div>
          <button 
            onClick={handleGenerateKey}
            className="text-xs bg-slate-800 text-blue-400 hover:text-blue-300 font-bold px-3 py-1.5 rounded-xl border border-slate-700/60 transition"
          >
            + Generate
          </button>
        </div>

        <div className="space-y-2">
          {keys.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No API keys created yet.</p>
          ) : (
            keys.map((k) => (
              <div key={k.id} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <code className="text-[10px] text-slate-300 font-mono select-all truncate max-w-[200px]">
                  {k.key}
                </code>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => copyToClipboard(k.key, k.id)}
                    className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition"
                  >
                    {copiedKey === k.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button 
                    onClick={() => handleRevokeKey(k.id)}
                    className="p-1.5 hover:bg-red-500/10 hover:text-red-400 rounded-lg text-slate-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* API PLAYGROUND */}
      <div className="glass p-4 rounded-3xl space-y-4">
        <div className="flex items-center gap-1.5 text-white font-bold text-sm">
          <Terminal className="w-4.5 h-4.5 text-purple-400" />
          Interactive API Playground
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">To (Phone number)</label>
            <input 
              type="text" 
              placeholder="e.g. 15551234567" 
              value={playgroundTo}
              onChange={(e) => setPlaygroundTo(e.target.value)}
              className="w-full glass-input p-3 rounded-xl text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Message Body</label>
            <input 
              type="text" 
              value={playgroundMsg}
              onChange={(e) => setPlaygroundMsg(e.target.value)}
              className="w-full glass-input p-3 rounded-xl text-xs"
            />
          </div>

          <button
            onClick={runPlayground}
            disabled={playgroundLoading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl transition flex justify-center items-center gap-1.5"
          >
            <Play className="w-3 h-3 fill-white" />
            {playgroundLoading ? 'Sending...' : 'Test Request'}
          </button>
        </div>

        {/* Playground output */}
        {playgroundResp && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Response payload</span>
            <pre className="bg-slate-950 p-3 rounded-xl text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-36">
              {JSON.stringify(playgroundResp, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* CODE INTEGRATION SNIPPETS */}
      <div className="glass p-4 rounded-3xl space-y-3.5">
        <div className="flex items-center gap-1.5 text-white font-bold text-sm">
          <Code className="w-4.5 h-4.5 text-emerald-400" />
          Integration Snippets
        </div>

        {/* Tabs for Language */}
        <div className="flex bg-slate-800/40 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
          {['nodejs', 'python', 'php'].map((lang) => (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className={`flex-1 py-1.5 rounded-lg transition uppercase ${
                activeLang === lang ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>

        {/* Code display */}
        <div className="relative">
          <button
            onClick={() => copyToClipboard(codeSnippets[activeLang], 'code')}
            className="absolute top-2 right-2 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-slate-400 transition"
          >
            {copiedKey === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <pre className="bg-slate-950 p-4 rounded-2xl text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
            {codeSnippets[activeLang]}
          </pre>
        </div>
      </div>
    </div>
  );
}
