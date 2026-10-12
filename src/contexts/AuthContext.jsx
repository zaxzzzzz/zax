import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { loginWithSupabase, signUpWithSupabase, logoutSupabase } from '../services/supabaseService';

// Create Auth Context
const AuthContext = createContext(null);

// Readable Thai message shown when the server answers with an empty or
// non-JSON body (instead of crashing the form with
// "Unexpected end of JSON input").
export const UNREADABLE_RESPONSE_MESSAGE = 'ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้';

/**
 * Safely read a JSON response from the auth API.
 *
 * Checks the Content-Type header BEFORE parsing and catches malformed/empty
 * bodies, so `response.json()` can never throw
 * "Unexpected end of JSON input" at the call site.
 *
 * @param {Response} response
 * @returns {Promise<{ readable: boolean, data: object|null }>}
 */
export async function readJsonResponse(response) {
  const contentType = response?.headers?.get?.('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return { readable: false, data: null };
  }
  try {
    return { readable: true, data: await response.json() };
  } catch (err) {
    console.warn('[auth] Could not parse JSON response body:', err?.message);
    return { readable: false, data: null };
  }
}

export function getStoredRegisteredUsers() {
  try {
    const raw = localStorage.getItem('neenoi_registered_users');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getStoredUserProfiles() {
  try {
    const raw = localStorage.getItem('neenoi_user_profiles');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredUserProfile(profileRecord) {
  try {
    const current = getStoredUserProfiles();
    const updated = [profileRecord, ...current.filter(p => p.id !== profileRecord.id && p.userId !== profileRecord.userId)];
    localStorage.setItem('neenoi_user_profiles', JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving user profile to local storage:', e);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize from Supabase Session or localStorage on mount
  useEffect(() => {
    async function initAuth() {
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const authUser = session.user;
            const userData = {
              id: authUser.id,
              username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'User',
              email: authUser.email,
              name: authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'User',
              role: authUser.user_metadata?.role || 'user',
              loginTime: new Date().toISOString()
            };
            setUser(userData);
            localStorage.setItem('neenoi_auth_user', JSON.stringify(userData));
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Supabase auth session check failed:', err);
        }
      }

      // Fallback to local storage
      const savedUser = localStorage.getItem('neenoi_auth_user');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (error) {
          console.error('Error parsing saved user:', error);
        }
      }
      setLoading(false);
    }

    initAuth();
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('neenoi_auth_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('neenoi_auth_user');
    logoutSupabase();
  };

  const loginWithCredentials = async (username, password) => {
    const cleanUsername = (username || '').trim();
    const cleanPassword = (password || '');

    if (!cleanUsername || !cleanPassword) {
      throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    }

    // 1. Attempt Supabase Auth Cloud DB
    try {
      const sbUser = await loginWithSupabase(cleanUsername, cleanPassword);
      if (sbUser) {
        login(sbUser);
        return sbUser;
      }
    } catch (e) {
      console.warn('Supabase login fallback:', e.message);
    }

    // 2. Attempt Local Server API
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password: cleanPassword })
      });

      // Guarded parsing: check the content-type and catch empty/invalid bodies
      // so response.json() can never crash the login form.
      const { readable, data } = await readJsonResponse(res);
      if (!readable) {
        // Server claimed success but sent a body we cannot read -> Thai error.
        if (res.ok) throw new Error(UNREADABLE_RESPONSE_MESSAGE);
        // Server/proxy failure (e.g. backend offline) -> fall back to local accounts.
        console.warn(`[auth] /api/auth/login returned a non-JSON body (HTTP ${res.status}) — falling back to local accounts`);
      } else if (res.ok && data.ok && data.user) {
        login(data.user);
        return data.user;
      }
    } catch (err) {
      if (err?.message === UNREADABLE_RESPONSE_MESSAGE) throw err;
      // Network / other failures: fall through to the local accounts fallback
    }

    // 3. Default / Local accounts fallback
    const DEFAULT_ACCOUNTS = [
      { id: 'admin', username: 'admin', email: 'admin@neenoi.com', password: 'admin123', name: 'Admin User', role: 'admin' },
      { id: 'user1', username: 'user1', email: 'user1@neenoi.com', password: 'user123', name: 'User 1', role: 'user' },
      { id: 'user2', username: 'user2', email: 'user2@neenoi.com', password: 'user234', name: 'User 2', role: 'user' },
      { id: 'user3', username: 'user3', email: 'user3@neenoi.com', password: 'user345', name: 'User 3', role: 'user' }
    ];

    const registered = getStoredRegisteredUsers();
    const allAccounts = [...registered, ...DEFAULT_ACCOUNTS];

    const matched = allAccounts.find(
      acc => (acc.username.toLowerCase() === cleanUsername.toLowerCase() || (acc.email && acc.email.toLowerCase() === cleanUsername.toLowerCase()))
        && acc.password === cleanPassword
    );

    if (matched) {
      const profiles = getStoredUserProfiles();
      const matchedProfile = profiles.find(p => p.userId === matched.id || p.id === matched.id) || matched.profile || null;
      const userData = {
        id: matched.id,
        username: matched.username,
        email: matched.email || `${matched.username}@neenoi.com`,
        name: matched.name || matched.username,
        role: matched.role || 'user',
        profile: matchedProfile,
        loginTime: new Date().toISOString()
      };
      login(userData);
      return userData;
    }

    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  };

  const signup = async ({ username, password, gender, age, occupation }) => {
    const cleanUsername = (username || '').trim();
    const cleanPassword = (password || '');
    const cleanGender = (gender || '').trim();
    const ageNum = Number(age);
    const cleanOccupation = (occupation || '').trim();

    // Validation
    if (!cleanUsername) throw new Error('กรุณากรอกชื่อผู้ใช้ (Username)');
    if (!cleanPassword) throw new Error('กรุณากรอกรหัสผ่าน (Password)');
    if (!cleanGender) throw new Error('กรุณาเลือกเพศ');
    if (isNaN(ageNum) || ageNum <= 0) throw new Error('อายุต้องมากกว่า 0');
    if (!cleanOccupation) throw new Error('กรุณาระบุอาชีพ');

    // 1. Attempt Supabase Auth Cloud DB Registration
    try {
      const sbUser = await signUpWithSupabase({
        username: cleanUsername,
        password: cleanPassword,
        gender: cleanGender,
        age: ageNum,
        occupation: cleanOccupation
      });
      if (sbUser) {
        login(sbUser);
        return sbUser;
      }
    } catch (err) {
      if (err.message && err.message.includes('ถูกใช้งานแล้ว')) {
        throw err;
      }
      console.warn('Supabase signup fallback:', err.message);
    }

    // 2. Attempt Server API
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password: cleanPassword,
          gender: cleanGender,
          age: ageNum,
          occupation: cleanOccupation
        })
      });

      // Guarded parsing: check the content-type and catch empty/invalid bodies so
      // response.json() can never throw "Unexpected end of JSON input".
      const { readable, data } = await readJsonResponse(res);

      if (!readable) {
        if (res.ok) {
          // HTTP 2xx but the body is empty/invalid -> surface a Thai error instead
          // of crashing the form with a raw parser message.
          throw new Error(UNREADABLE_RESPONSE_MESSAGE);
        }
        // Server/proxy failure (e.g. backend not running) -> keep going and use
        // the local registration fallback below.
        console.warn(`[auth] /api/auth/signup returned a non-JSON body (HTTP ${res.status}) — falling back to local registration`);
      } else if (res.ok && data.ok && data.user) {
        if (data.user.profile) {
          saveStoredUserProfile(data.user.profile);
        }
        login(data.user);
        return data.user;
      } else if (data && data.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      // Re-throw readable errors (Thai validation errors, unreadable-response
      // message); swallow network failures ("fetch failed") to keep the local
      // registration fallback.
      if (err.message && !err.message.includes('fetch')) {
        throw err;
      }
    }

    // 3. Local Registration Fallback
    const DEFAULT_USERNAMES = ['admin', 'user1', 'user2', 'user3'];
    const registered = getStoredRegisteredUsers();
    if (
      DEFAULT_USERNAMES.includes(cleanUsername.toLowerCase()) ||
      registered.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())
    ) {
      throw new Error('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    }

    const newUserId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newProfile = {
      id: newUserId,
      userId: newUserId,
      gender: cleanGender,
      age: ageNum,
      occupation: cleanOccupation,
      createdAt: new Date().toISOString()
    };

    const newUser = {
      id: newUserId,
      username: cleanUsername,
      password: cleanPassword,
      name: cleanUsername,
      email: `${cleanUsername}@neenoi.com`,
      role: 'user',
      profile: newProfile,
      createdAt: new Date().toISOString()
    };

    const updatedRegistered = [newUser, ...registered];
    localStorage.setItem('neenoi_registered_users', JSON.stringify(updatedRegistered));
    saveStoredUserProfile(newProfile);

    const userData = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      profile: newProfile,
      loginTime: new Date().toISOString()
    };

    login(userData);
    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loginWithCredentials, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Helper to check if user is admin
export function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === 'admin';
}

// Helper to check if user is logged in
export function useIsAuthenticated() {
  const { user } = useAuth();
  return !!user;
}
