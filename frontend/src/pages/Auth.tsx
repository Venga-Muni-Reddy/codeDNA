import React, { useState } from 'react';
import { authService } from '../services/api';
import { useAppStore } from '../store/useAppStore';

export const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setAuth = useAppStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const res = await authService.login(email, password);
        const { user, accessToken, refreshToken } = res.data;
        setAuth(user, accessToken, refreshToken);
      } else {
        await authService.register(name, email, password);
        // Automatically login after register
        const res = await authService.login(email, password);
        const { user, accessToken, refreshToken } = res.data;
        setAuth(user, accessToken, refreshToken);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || 'Authentication process encountered an error.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative z-10">
        <div className="text-center mb-8">
          <span className="text-4xl">🗺️</span>
          <h1 className="text-3xl font-black tracking-tight mt-2 bg-gradient-to-r from-brand-400 to-indigo-300 bg-clip-text text-transparent">
            CodeAtlas AI
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {isLogin ? 'Sign in to analyze your codebases' : 'Create an account to get started'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder="John Doe"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
              placeholder="developer@codeatlas.ai"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-lg shadow-brand-900/30 text-sm mt-6 flex items-center justify-center"
          >
            {loading ? (
              <span className="border-2 border-white/20 border-t-white rounded-full w-4 h-4 animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
          >
            {isLogin
              ? "Don't have an account? Sign Up"
              : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
