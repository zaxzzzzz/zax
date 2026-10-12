/**
 * Supabase Cloud Storage & Realtime Synchronization Service
 * 
 * Manages user authentication, bound records (debts, refinance settings, cashflow data),
 * and live subscriptions for instant multi-device synchronization.
 */

import { supabase, isSupabaseConfigured, isOnline } from '../lib/supabase';

const USER_DATA_CACHE_KEY = (userId) => `nee_noi_user_v1_${userId}`;
const REFINANCE_CACHE_KEY = (userId) => `nee_noi_refinance_form_v3_${userId}`;
const CASHFLOW_CACHE_KEY = (userId) => `nee_noi_cashflow_${userId}`;

/* ==========================================
 * 1. USER AUTHENTICATION & PROFILES
 * ========================================== */

/**
 * Sign up a new user via Supabase Auth + user_profiles table.
 */
export async function signUpWithSupabase({ username, password, gender, age, occupation }) {
  if (!isSupabaseConfigured() || !isOnline()) {
    return null; // Fallback to local
  }

  const email = `${username.toLowerCase().trim()}@neenoi.com`;

  // 1. Sign up with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        gender,
        age,
        occupation,
      },
    },
  });

  if (authError) {
    // If user already registered in auth, try signing in or return error
    if (authError.message.includes('already registered')) {
      throw new Error('ชื่อผู้ใช้นี้ถูกใช้งานแล้วในระบบ Supabase Cloud');
    }
    throw new Error(`Supabase Auth Error: ${authError.message}`);
  }

  const authUser = authData?.user;
  const userId = authUser?.id || `usr_${Date.now()}`;

  // 2. Upsert profile details into `user_profiles` table
  const profileRecord = {
    user_id: userId,
    username,
    name: username,
    email,
    gender,
    age: Number(age),
    occupation,
    role: 'user',
    updated_at: new Date().toISOString(),
  };

  try {
    await supabase.from('user_profiles').upsert(profileRecord, { onConflict: 'user_id' });
  } catch (e) {
    console.warn('Could not upsert user profile to Supabase:', e);
  }

  return {
    id: userId,
    username,
    email,
    name: username,
    role: 'user',
    profile: profileRecord,
    loginTime: new Date().toISOString(),
  };
}

/**
 * Sign in existing user with Supabase Auth
 */
export async function loginWithSupabase(username, password) {
  if (!isSupabaseConfigured() || !isOnline()) {
    return null; // Fallback
  }

  const email = username.includes('@') ? username : `${username.toLowerCase().trim()}@neenoi.com`;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Return null so calling code can fallback to local predefined credentials if applicable
    return null;
  }

  const authUser = data.user;
  const userId = authUser.id;

  // Fetch full profile record from user_profiles table
  let profile = null;
  try {
    const { data: profData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profData) {
      profile = profData;
    }
  } catch (e) {
    console.warn('Error fetching profile from Supabase:', e);
  }

  return {
    id: userId,
    username: authUser.user_metadata?.username || username,
    email: authUser.email,
    name: authUser.user_metadata?.username || username,
    role: profile?.role || 'user',
    profile: profile,
    loginTime: new Date().toISOString(),
  };
}

/**
 * Log out from Supabase Auth session
 */
export async function logoutSupabase() {
  if (isSupabaseConfigured() && isOnline()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signout notice:', e);
    }
  }
}

/* ==========================================
 * 2. USER DEBTS & PLAN STORAGE (BOUND TO USER_ID)
 * ========================================== */

/**
 * Fetch user's debt planner data from Supabase Cloud DB.
 */
export async function fetchUserDebtsFromCloud(userId) {
  if (!userId || !isSupabaseConfigured() || !isOnline()) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('user_debts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching user_debts from Supabase:', error.message);
      return null;
    }

    if (data) {
      const payload = {
        debts: Array.isArray(data.debts) ? data.debts : [],
        extraBudget: Number(data.extra_budget ?? 5000),
        paymentLogs: Array.isArray(data.payment_logs) ? data.payment_logs : [],
        savedPlans: Array.isArray(data.saved_plans) ? data.saved_plans : [],
        strategy: data.strategy || null,
      };

      // Cache locally for offline availability
      try {
        localStorage.setItem(USER_DATA_CACHE_KEY(userId), JSON.stringify(payload));
      } catch (e) { /* quota */ }

      return payload;
    }
  } catch (err) {
    console.warn('Network issue fetching user_debts from Supabase:', err);
  }

  return null;
}

/**
 * Save / Upsert user's debt planner data to Supabase Cloud DB.
 */
export async function saveUserDebtsToCloud(userId, data) {
  if (!userId || userId === 'admin') return;

  const payload = {
    user_id: userId,
    debts: data.debts || [],
    extra_budget: Number(data.extraBudget ?? 0),
    payment_logs: data.paymentLogs || [],
    saved_plans: data.savedPlans || [],
    strategy: data.strategy || null,
    updated_at: new Date().toISOString(),
  };

  // Always update local cache first (instant local persistence)
  try {
    localStorage.setItem(USER_DATA_CACHE_KEY(userId), JSON.stringify({
      debts: payload.debts,
      extraBudget: payload.extra_budget,
      paymentLogs: payload.payment_logs,
      savedPlans: payload.saved_plans,
      strategy: payload.strategy,
    }));
  } catch (e) { /* ignore */ }

  if (!isSupabaseConfigured() || !isOnline()) return;

  try {
    const { error } = await supabase
      .from('user_debts')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      console.warn('Failed to upsert user_debts to Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Network error saving user_debts to Supabase:', err);
  }
}

/**
 * Real-time listener for user_debts changes across devices/tabs.
 */
export function subscribeToUserDebts(userId, onUpdateCallback) {
  if (!userId || !isSupabaseConfigured() || !isOnline() || !supabase) {
    return () => {};
  }

  const channelName = `realtime-user-debts-${userId}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_debts',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          const updatedData = {
            debts: Array.isArray(payload.new.debts) ? payload.new.debts : [],
            extraBudget: Number(payload.new.extra_budget ?? 5000),
            paymentLogs: Array.isArray(payload.new.payment_logs) ? payload.new.payment_logs : [],
            savedPlans: Array.isArray(payload.new.saved_plans) ? payload.new.saved_plans : [],
            strategy: payload.new.strategy || null,
          };
          onUpdateCallback(updatedData);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ==========================================
 * 3. REFINANCE SETTINGS STORAGE (BOUND TO USER_ID)
 * ========================================== */

/**
 * Fetch refinance form settings for a specific user from Supabase.
 */
export async function fetchRefinanceSettingsFromCloud(userId) {
  if (!userId || !isSupabaseConfigured() || !isOnline()) return null;

  try {
    const { data, error } = await supabase
      .from('refinance_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return null;
    if (data && data.form_data) {
      try {
        localStorage.setItem(REFINANCE_CACHE_KEY(userId), JSON.stringify(data.form_data));
      } catch (e) { /* ignore */ }
      return data.form_data;
    }
  } catch (err) {
    console.warn('Error fetching refinance settings:', err);
  }
  return null;
}

/**
 * Save refinance form settings for a specific user to Supabase.
 */
export async function saveRefinanceSettingsToCloud(userId, formData) {
  if (!userId) return;

  // Local cache
  try {
    localStorage.setItem(REFINANCE_CACHE_KEY(userId), JSON.stringify(formData));
  } catch (e) { /* ignore */ }

  if (!isSupabaseConfigured() || !isOnline()) return;

  try {
    await supabase.from('refinance_settings').upsert(
      {
        user_id: userId,
        form_data: formData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('Error saving refinance settings to Supabase:', e);
  }
}

/**
 * Realtime listener for refinance settings across devices.
 */
export function subscribeToRefinanceSettings(userId, onUpdateCallback) {
  if (!userId || !isSupabaseConfigured() || !isOnline() || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`realtime-refinance-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'refinance_settings',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new && payload.new.form_data) {
          onUpdateCallback(payload.new.form_data);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ==========================================
 * 4. CASHFLOW DATA STORAGE (BOUND TO USER_ID)
 * ========================================== */

/**
 * Fetch cashflow data (entries, starting balance, monthly budget) from Supabase.
 */
export async function fetchCashflowFromCloud(userId) {
  if (!userId || !isSupabaseConfigured() || !isOnline()) return null;

  try {
    const { data, error } = await supabase
      .from('cashflow_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return null;
    if (data) {
      return {
        entries: Array.isArray(data.entries) ? data.entries : [],
        startingBalance: Number(data.starting_balance ?? 10000),
        monthlyBudget: data.monthly_budget || { income: 0, expense: 0, incomeDay: 1 },
      };
    }
  } catch (e) {
    console.warn('Error fetching cashflow data:', e);
  }
  return null;
}

/**
 * Save cashflow data for a user to Supabase.
 */
export async function saveCashflowToCloud(userId, { entries, startingBalance, monthlyBudget }) {
  if (!userId) return;

  if (!isSupabaseConfigured() || !isOnline()) return;

  try {
    await supabase.from('cashflow_data').upsert(
      {
        user_id: userId,
        entries: entries || [],
        starting_balance: Number(startingBalance ?? 10000),
        monthly_budget: monthlyBudget || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('Error saving cashflow to Supabase:', e);
  }
}

/**
 * Realtime listener for cashflow data changes.
 */
export function subscribeToCashflow(userId, onUpdateCallback) {
  if (!userId || !isSupabaseConfigured() || !isOnline() || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`realtime-cashflow-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cashflow_data',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) {
          onUpdateCallback({
            entries: Array.isArray(payload.new.entries) ? payload.new.entries : [],
            startingBalance: Number(payload.new.starting_balance ?? 10000),
            monthlyBudget: payload.new.monthly_budget || { income: 0, expense: 0, incomeDay: 1 },
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ==========================================
 * 5. REFINANCE PROMOTIONS & MASTER DATA
 * ========================================== */

export async function fetchPromotionsFromCloud() {
  if (!isSupabaseConfigured() || !isOnline()) return null;

  try {
    const { data, error } = await supabase
      .from('refinance_promotions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) return null;
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn('Error fetching promotions from Supabase:', e);
  }
  return null;
}

export async function savePromotionToCloud(promo) {
  if (!isSupabaseConfigured() || !isOnline()) return null;

  try {
    const { data, error } = await supabase
      .from('refinance_promotions')
      .upsert(promo, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.warn('Supabase promo save error:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('Cloud promo save error:', e);
    return null;
  }
}

export async function deletePromotionFromCloud(id) {
  if (!isSupabaseConfigured() || !isOnline()) return false;

  try {
    const { error } = await supabase
      .from('refinance_promotions')
      .delete()
      .eq('id', id);

    return !error;
  } catch (e) {
    return false;
  }
}
