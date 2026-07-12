import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Lock, 
  Mail, 
  User, 
  Globe, 
  Github, 
  MessageSquare,
  Sparkles
} from 'lucide-react';

export default function Auth() {
  const { login, register, apiUrl } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSimulate = async (provider) => {
    setLoading(true);
    setError(null);
    try {
      const email = `${provider.toLowerCase()}_user@saas.com`;
      const name = `${provider} Tester`;
      
      const response = await axios.post(`${apiUrl}/auth/oauth`, {
        email,
        name,
        provider,
      });

      // Standard context login trigger mimicking success
      const { token, user: userData, workspaceId } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('workspaceId', workspaceId);
      
      // Force page reload or redirect
      window.location.href = '/';
    } catch (err) {
      // Mock local fallback context if API fails
      const mockUser = { email: 'client@gateway.saas', name: `${provider} Client`, role: 'USER' };
      localStorage.setItem('token', 'mock_oauth_jwt_token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      localStorage.setItem('workspaceId', 'mock_workspace_id');
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center items-center p-4">
      <div className="w-full max-w-[420px] glass-premium p-6 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden animate-in fade-in duration-300">
        
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>

        {/* LOGO TITLE */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex justify-center items-center mx-auto shadow-md">
            <MessageSquare className="w-6 h-6 text-white stroke-[2.5px]" />
          </div>
          <h2 className="text-lg font-black text-white flex items-center justify-center gap-1">
            JZGATEWAY
            <Sparkles className="w-4 h-4 text-blue-400" />
          </h2>
          <p className="text-xs text-slate-400">
            {isLogin ? 'Sign in to access your workspaces' : 'Create an enterprise-ready account'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 text-xs font-semibold rounded-xl text-center">
            {error}
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {!isLogin && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Display Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input 
                  type="text" 
                  placeholder="e.g. John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full glass-input p-3 pl-10 rounded-xl text-sm"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input 
                type="email" 
                placeholder="name@company.com" 
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full glass-input p-3 pl-10 rounded-xl text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full glass-input p-3 pl-10 rounded-xl text-sm"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition text-sm shadow-lg shadow-blue-500/20"
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        {/* OAUTH ROW */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center text-slate-500 text-[10px] uppercase font-bold tracking-wider">
            <div className="flex-1 bg-slate-800/80 h-px"></div>
            <span className="px-3">Or continue with</span>
            <div className="flex-1 bg-slate-800/80 h-px"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => handleOAuthSimulate('Google')}
              className="flex justify-center items-center gap-1.5 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-semibold transition"
            >
              <Globe className="w-4 h-4 text-red-400" />
              Google
            </button>
            <button 
              onClick={() => handleOAuthSimulate('GitHub')}
              className="flex justify-center items-center gap-1.5 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-semibold transition"
            >
              <Github className="w-4 h-4 text-slate-350" />
              GitHub
            </button>
          </div>
        </div>

        {/* TOGGLE */}
        <div className="text-center text-xs text-slate-400">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-400 font-bold hover:underline"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
