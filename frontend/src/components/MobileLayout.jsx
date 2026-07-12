import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Home, 
  MessageSquare, 
  Cpu, 
  CreditCard, 
  Terminal, 
  Settings, 
  LogOut, 
  ChevronDown, 
  Bell, 
  User, 
  Globe 
} from 'lucide-react';

export default function MobileLayout({ children }) {
  const { user, workspaces, workspaceId, switchWorkspace, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const activeWorkspace = workspaces.find(w => w.workspaceId === workspaceId) || { name: 'Select Workspace' };

  const menuItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Messages', icon: MessageSquare, path: '/messages' },
    { label: 'Gateways', icon: Cpu, path: '/gateways' },
    { label: 'Billing', icon: CreditCard, path: '/billing' },
    { label: 'API Dev', icon: Terminal, path: '/developer' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center items-stretch font-sans">
      {/* Outer frame styling for desktop, centering the mobile device mockup */}
      <div className="w-full max-w-[480px] bg-slate-900 border-x border-slate-800 flex flex-col relative overflow-hidden shadow-2xl">
        
        {/* TOP STATUS BAR */}
        <header className="glass sticky top-0 z-40 px-4 py-3 flex justify-between items-center">
          {/* Workspace Switcher */}
          <div className="relative">
            <button 
              onClick={() => { setShowWorkspaceMenu(!showWorkspaceMenu); setShowProfileMenu(false); }}
              className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-full text-sm font-semibold transition"
            >
              <span className="truncate max-w-[120px]">{activeWorkspace.name}</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {showWorkspaceMenu && (
              <div className="absolute left-0 mt-2 w-56 rounded-2xl bg-slate-800 border border-slate-700/60 p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-400">Switch Workspace</div>
                {workspaces.map((ws) => (
                  <button
                    key={ws.workspaceId}
                    onClick={() => {
                      switchWorkspace(ws.workspaceId);
                      setShowWorkspaceMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition ${
                      ws.workspaceId === workspaceId ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50 text-slate-200'
                    }`}
                  >
                    {ws.name}
                  </button>
                ))}
                <div className="border-t border-slate-700/40 my-1"></div>
                <button
                  onClick={() => {
                    navigate('/workspaces/new');
                    setShowWorkspaceMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold text-blue-400 hover:bg-slate-700/50 transition"
                >
                  + Create Workspace
                </button>
              </div>
            )}
          </div>

          {/* Quick Info & Notifications */}
          <div className="flex items-center gap-2.5">
            <button className="relative p-1.5 hover:bg-slate-800 rounded-full transition text-slate-300">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setShowProfileMenu(!showProfileMenu); setShowWorkspaceMenu(false); }}
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex justify-center items-center font-bold text-white text-xs hover:scale-105 transition"
              >
                {user?.name ? user.name[0].toUpperCase() : 'U'}
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-800 border border-slate-700/60 p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  </div>
                  <div className="border-t border-slate-700/40 my-1"></div>
                  
                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => { navigate('/admin'); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-purple-400 hover:bg-slate-700/50 transition"
                    >
                      <Settings className="w-4 h-4" />
                      Super Admin
                    </button>
                  )}

                  {user?.role === 'RESELLER' && (
                    <button
                      onClick={() => { navigate('/reseller'); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-emerald-400 hover:bg-slate-700/50 transition"
                    >
                      <Globe className="w-4 h-4" />
                      Reseller Console
                    </button>
                  )}

                  <button
                    onClick={() => { logout(); navigate('/login'); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-red-400 hover:bg-slate-700/50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* MAIN VIEWPACK FOR INTERNAL SCREENS */}
        <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
          {children}
        </main>

        {/* BOTTOM NAVIGATION BAR */}
        <nav className="glass absolute bottom-0 inset-x-0 py-2.5 px-4 flex justify-between items-center z-40 border-t border-slate-800/80 shadow-inner">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
                  isActive ? 'text-blue-500 scale-105 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5.5 h-5.5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                <span className="text-[10px] tracking-wide font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
