import React, { useState, useEffect } from 'react';
import { ThreadlyHexIcon } from './ThreadlyBrandIcon';
import { Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (user: any, token: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload = mode === 'register'
        ? { name: name.trim(), email: email.trim(), password }
        : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed. Please try again.');
      } else {
        localStorage.setItem('threadly_active_user_id', String(data.user.id));
        localStorage.removeItem('threadly_logged_out');
        onAuthenticated(data.user, data.token);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to the authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4 antialiased text-[#0F172A]">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5">
            <ThreadlyHexIcon size={34} />
            <span className="font-brand text-2xl font-extrabold tracking-tight text-[#0F172A]">
              Thread<span className="text-[#DC2626]">ly</span>
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace account'}
          </h1>
          <p className="text-xs text-[#64748B]">
            Collaborative shared inboxes, Gmail sync, and real-time team desk
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-7 space-y-5">
          {/* Toggle Tabs */}
          <div className="grid grid-cols-2 p-1 bg-[#F1F5F9] rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-start gap-2.5 text-xs text-[#991B1B]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <span>{error}</span>
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {mode === 'register' && (
              <div>
                <label className="block font-semibold text-[#334155] mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Manan Ramani"
                    className="w-full pl-9 pr-3 py-2 border border-[#CBD5E1] rounded-xl text-xs focus:outline-none focus:border-[#DC2626] transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-[#334155] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 border border-[#CBD5E1] rounded-xl text-xs focus:outline-none focus:border-[#DC2626] transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#334155] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Create a secure password' : 'Enter your password'}
                  className="w-full pl-9 pr-3 py-2 border border-[#CBD5E1] rounded-xl text-xs focus:outline-none focus:border-[#DC2626] transition-colors"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <span>{loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-[#94A3B8]">
          Threadly Open-Source Edition • Clean production workspace
        </p>
      </div>
    </div>
  );
};
