import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Coffee, CreditCard, KeyRound, Eye, EyeOff, Loader2, Wifi } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login, loginWithRFID } = useAuth();
  const [mode, setMode] = useState<'password' | 'rfid'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rfidInput, setRfidInput] = useState('');
  const rfidRef = useRef<HTMLInputElement>(null);
  const rfidBuffer = useRef('');
  const rfidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RFID scan listener - captures rapid keyboard input
  useEffect(() => {
    if (mode !== 'rfid') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (rfidBuffer.current.length > 4) {
          handleRFIDScan(rfidBuffer.current);
        }
        rfidBuffer.current = '';
        return;
      }
      if (e.key.length === 1) {
        rfidBuffer.current += e.key;
        if (rfidTimer.current) clearTimeout(rfidTimer.current);
        rfidTimer.current = setTimeout(() => {
          if (rfidBuffer.current.length > 4) {
            handleRFIDScan(rfidBuffer.current);
          }
          rfidBuffer.current = '';
        }, 300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  const handleRFIDScan = async (tag: string) => {
    setRfidInput(tag);
    setLoading(true);
    try {
      await loginWithRFID(tag);
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.message || 'RFID not recognized');
      setRfidInput('');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-espresso-950 flex items-center justify-center relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, #e58a33 0%, transparent 50%), 
                           radial-gradient(circle at 80% 20%, #c46920 0%, transparent 40%),
                           radial-gradient(circle at 50% 80%, #a73c12 0%, transparent 40%)`
        }} />
      </div>

      {/* Coffee beans pattern */}
      <div className="absolute inset-0 overflow-hidden opacity-5">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="absolute w-8 h-12 bg-espresso-400 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-espresso-600 rounded-3xl mb-4 shadow-2xl shadow-espresso-900/50">
            <Coffee className="w-10 h-10 text-cream-100" />
          </div>
          <h1 className="font-display text-4xl text-cream-100 tracking-tight">JPOS</h1>
          <p className="text-bark-400 font-body mt-1 text-sm">Coffee Shop Point of Sale</p>
        </div>

        {/* Card */}
        <div className="bg-espresso-900/80 backdrop-blur-xl rounded-3xl border border-espresso-700/50 shadow-2xl p-8">
          {/* Mode Toggle */}
          <div className="flex gap-2 bg-espresso-950/50 rounded-2xl p-1.5 mb-8">
            <button
              onClick={() => setMode('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                mode === 'password'
                  ? 'bg-espresso-600 text-cream-50 shadow-md'
                  : 'text-bark-400 hover:text-bark-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Password
            </button>
            <button
              onClick={() => setMode('rfid')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                mode === 'rfid'
                  ? 'bg-espresso-600 text-cream-50 shadow-md'
                  : 'text-bark-400 hover:text-bark-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              RFID Card
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-bark-300 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-espresso-950/60 border border-espresso-700 rounded-xl text-cream-100 placeholder-bark-600 text-sm focus:outline-none focus:ring-2 focus:ring-espresso-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-bark-300 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-espresso-950/60 border border-espresso-700 rounded-xl text-cream-100 placeholder-bark-600 text-sm focus:outline-none focus:ring-2 focus:ring-espresso-500 focus:border-transparent transition-all pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-500 hover:text-bark-300 transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-espresso-600 hover:bg-espresso-500 text-cream-50 font-medium rounded-xl transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className={`w-32 h-32 mx-auto mb-6 rounded-3xl bg-espresso-950/60 border-2 border-dashed flex flex-col items-center justify-center transition-all ${
                loading ? 'border-espresso-400 rfid-pulse' : 'border-espresso-700'
              }`}>
                {loading ? (
                  <Loader2 className="w-12 h-12 text-espresso-400 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-12 h-12 text-espresso-500 mb-2" />
                    <Wifi className="w-5 h-5 text-espresso-600" />
                  </>
                )}
              </div>
              <h3 className="text-cream-100 font-medium text-lg mb-1">
                {loading ? 'Authenticating...' : 'Tap Your RFID Card'}
              </h3>
              <p className="text-bark-500 text-sm">
                {loading ? `Reading: ${rfidInput}` : 'Hold your card near the reader'}
              </p>

              {/* Manual RFID input for testing */}
              <div className="mt-6 pt-6 border-t border-espresso-800">
                <p className="text-bark-600 text-xs mb-3">Or enter RFID tag manually (testing)</p>
                <div className="flex gap-2">
                  <input
                    ref={rfidRef}
                    type="text"
                    placeholder="RFID tag..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && rfidRef.current?.value) {
                        handleRFIDScan(rfidRef.current.value);
                        rfidRef.current.value = '';
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-espresso-950/60 border border-espresso-700 rounded-lg text-cream-100 placeholder-bark-600 text-sm focus:outline-none focus:ring-1 focus:ring-espresso-500"
                  />
                  <button
                    onClick={() => {
                      if (rfidRef.current?.value) {
                        handleRFIDScan(rfidRef.current.value);
                        rfidRef.current.value = '';
                      }
                    }}
                    className="px-4 py-2 bg-espresso-700 text-cream-200 rounded-lg text-sm hover:bg-espresso-600 transition-colors"
                  >
                    Scan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-bark-600 text-xs mt-6">
          JPOS v1.0 · Coffee Shop Management System
        </p>
      </div>
    </div>
  );
}
