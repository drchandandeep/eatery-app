// context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';

const AuthContext = createContext(null);
const STORAGE_KEY = 'eatery.auth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const { token: savedToken, user: savedUser } = JSON.parse(raw);
          setToken(savedToken);
          setUser(savedUser);
          setAuthToken(savedToken);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(nextToken, nextUser) {
    setToken(nextToken);
    setUser(nextUser);
    setAuthToken(nextToken);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
  }

  async function login(email, password) {
    const { token: t, user: u } = await api.login({ email, password });
    await persist(t, u);
  }

  // Customer signup: must include store_id (picked from a nearby-store list)
  // and an address with lat/lng, which the backend validates is within that
  // store's 5-6km service area. Both the store link and this address are
  // then permanent on the account.
  async function signup({ name, email, password, phone, storeId, address }) {
    const { token: t, user: u } = await api.signup({
      name,
      email,
      password,
      phone,
      store_id: storeId,
      address,
    });
    await persist(t, u);
  }

  // Store owner registration: creates the store (locked email + address)
  // and its store_admin account in one step. Subscription still needs to
  // be activated separately (see api.subscribeStore).
  async function registerStore(payload) {
    const { token: t, user: u } = await api.registerStore(payload);
    await persist(t, u);
  }

  async function logout() {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, registerStore, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
