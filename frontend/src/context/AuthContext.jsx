import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem('workspaceId'));
  const [workspaces, setWorkspaces] = useState([]);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);

  // Synchronize axios headers with state changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  useEffect(() => {
    if (workspaceId) {
      axios.defaults.headers.common['x-workspace-id'] = workspaceId;
    } else {
      delete axios.defaults.headers.common['x-workspace-id'];
    }
  }, [workspaceId]);

  // Socket Connection management
  useEffect(() => {
    if (!token || !workspaceId) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const newSocket = io(SOCKET_URL);
    
    newSocket.on('connect', () => {
      console.log('Socket client connected. Joining workspace:', workspaceId);
      newSocket.emit('join-workspace', workspaceId);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, workspaceId]);

  // Fetch workspaces & user details on mount or token changes
  useEffect(() => {
    const initAuth = async () => {
      if (!token) {
        setUser(null);
        setWorkspaces([]);
        setLoading(false);
        return;
      }

      try {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Use workspaces endpoint as profile check
        const response = await axios.get(`${API_URL}/workspaces`);
        setWorkspaces(response.data);

        // Simulated user retrieval from token or first workspace name details
        // Get user details stored in localStorage
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        } else {
          setUser({ email: 'client@gateway.saas', name: 'Premium Client', role: 'USER' });
        }

        // Set default workspace if none selected
        if (response.data.length > 0 && !workspaceId) {
          const defaultId = response.data[0].workspaceId;
          setWorkspaceId(defaultId);
          localStorage.setItem('workspaceId', defaultId);
        }
      } catch (err) {
        console.error('Session validation failed:', err.message);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [token]);

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { token: jwtToken, user: userData, workspaceId: defWorkspaceId } = response.data;
    
    setToken(jwtToken);
    setUser(userData);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(userData));
    
    if (defWorkspaceId) {
      setWorkspaceId(defWorkspaceId);
      localStorage.setItem('workspaceId', defWorkspaceId);
    }
    return response.data;
  };

  const register = async (name, email, password) => {
    const response = await axios.post(`${API_URL}/auth/register`, { name, email, password });
    const { token: jwtToken, user: userData, workspaceId: defWorkspaceId } = response.data;

    setToken(jwtToken);
    setUser(userData);
    localStorage.setItem('token', jwtToken);
    localStorage.setItem('user', JSON.stringify(userData));

    if (defWorkspaceId) {
      setWorkspaceId(defWorkspaceId);
      localStorage.setItem('workspaceId', defWorkspaceId);
    }
    return response.data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setWorkspaceId(null);
    setWorkspaces([]);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspaceId');
    delete axios.defaults.headers.common['Authorization'];
    delete axios.defaults.headers.common['x-workspace-id'];
  };

  const switchWorkspace = (id) => {
    setWorkspaceId(id);
    localStorage.setItem('workspaceId', id);
    axios.defaults.headers.common['x-workspace-id'] = id;
    if (socket) {
      // Leave old, join new room
      socket.emit('leave-workspace', workspaceId);
      socket.emit('join-workspace', id);
    }
  };

  const refreshWorkspaces = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/workspaces`);
      setWorkspaces(response.data);
    } catch (e) {
      console.error('Failed to refresh workspaces:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        workspaceId,
        workspaces,
        socket,
        loading,
        login,
        register,
        logout,
        switchWorkspace,
        refreshWorkspaces,
        apiUrl: API_URL,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
