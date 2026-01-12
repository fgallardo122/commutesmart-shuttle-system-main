
import React, { useState, useEffect } from 'react';
import { UserRole, AppState, BusLocation } from './types';
import { MOCK_STOPS } from './constants';
import { login, logout } from './services/authService';
import { fetchJson } from './services/fetchJson';
import PassengerView from './components/PassengerView';
import DriverView from './components/DriverView';
import AdminView from './components/AdminView';

const API_URL = '/api';
const DEFAULT_SHUTTLE_ID = 'default';

/**
 * 核心状态 Hook：后续开发只需将此处的定时器模拟逻辑
 * 替换为 Socket.io 监听即可实现前后端对接。
 */
const useShuttleState = () => {
  const [appState, setAppState] = useState<AppState>({
    role: UserRole.PASSENGER,
    currentStopIndex: 0,
    busLocation: {
      lat: 24.5123,
      lng: 118.1812,
      speed: 0,
      heading: 0,
      lastUpdated: Date.now(),
      distanceToNext: 850
    },
    stops: []
  });

  useEffect(() => {
    fetchJson<any[]>(`${API_URL}/stops`)
      .then((data) => {
        if (Array.isArray(data)) setAppState((prev) => ({ ...prev, stops: data }));
      })
      .catch((err) => console.error('Failed to fetch stops:', err));
  }, []);

  useEffect(() => {
    if (appState.stops.length === 0) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchJson<any>(`${API_URL}/shuttle/status?shuttleId=${encodeURIComponent(DEFAULT_SHUTTLE_ID)}`);
        if (!data || cancelled) return;
        setAppState(prev => ({
          ...prev,
          busLocation: {
            ...prev.busLocation!,
            lat: data.coords?.lat ?? prev.busLocation?.lat ?? 0,
            lng: data.coords?.lng ?? prev.busLocation?.lng ?? 0,
            speed: data.speed || 0,
            heading: data.heading || 0,
            distanceToNext: data.distToNext ?? prev.busLocation?.distanceToNext ?? 0,
            lastUpdated: data.lastUpdated || Date.now()
          },
          currentStopIndex: typeof data.currentStopIndex === 'number' ? data.currentStopIndex : prev.currentStopIndex
        }));
      } catch {}
    };

    poll();
    const timer = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [appState.stops.length]);

  return { appState, setAppState };
};

const App: React.FC = () => {
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState<'primary' | 'realtime'>('primary');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginType, setLoginType] = useState<'admin' | 'passenger'>('passenger');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);
  const { appState } = useShuttleState();

  // 检测屏幕方向
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // 自动恢复登录状态
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setActiveRole(user.role);
      } catch (e) {
        console.error('Failed to restore session:', e);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleDriverLogin = () => {
    setActiveRole(UserRole.DRIVER);
  };

  const handleAdminLogin = () => {
    setLoginType('admin');
    setShowLoginModal(true);
    setLoginError(null);
  };

  const handlePassengerLogin = () => {
    setLoginType('passenger');
    setShowLoginModal(true);
    setLoginError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    try {
      const endpoint = loginType === 'admin' ? '/api/auth/login/admin' : '/api/auth/login/phone';
      const body = loginType === 'admin' 
        ? { username, password, rememberMe }
        : { phone: username, password, rememberMe };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '登录失败');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setActiveRole(loginType === 'admin' ? UserRole.ADMIN : UserRole.PASSENGER);
      setShowLoginModal(false);
    } catch (error: any) {
      setLoginError(error.message || '登录失败，请重试');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    logout();
    setActiveRole(null);
  };

  if (!activeRole) {
    return (
      <div className={`min-h-screen bg-slate-50 flex ${isLandscape ? 'flex-row p-12' : 'flex-col p-6'} items-center justify-center relative overflow-hidden transition-all duration-500`}>
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-blue-500 rounded-full blur-3xl opacity-5"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-72 h-72 bg-indigo-500 rounded-full blur-3xl opacity-5"></div>

        <div className={`relative z-10 w-full flex-1 flex flex-col ${isLandscape ? 'max-w-4xl flex-row items-center justify-around' : 'max-w-sm items-center'}`}>
          <div className={`${isLandscape ? 'w-33-percent' : 'w-48 h-24 mt-12 mb-10'} flex flex-col items-center justify-center transform transition-all hover:scale-105`}>
            <img src="/logo.png" alt="厦门商业物业公司" className="max-w-full max-h-32 object-contain drop-shadow-sm mb-6" />
            <div className="text-center">
              <h1 className={`${isLandscape ? 'text-2xl' : 'text-3xl'} font-black text-slate-900 tracking-tight`}>智慧通勤系统</h1>
              <p className="text-slate-400 text-[10px] mt-3 font-medium tracking-widest uppercase">两岸金融中心 · 智慧交通平台</p>
            </div>
          </div>
          
          <div className={`${isLandscape ? 'w-1/2 ml-12' : 'w-full mt-12'} space-y-5 flex-1 flex flex-col justify-center`}>
            <button 
              onClick={handlePassengerLogin}
              disabled={isLoggingIn}
              className="w-full bg-white p-6 rounded-3xl flex items-center space-x-4 border border-slate-100 active:bg-slate-50 active:scale-[0.98] transition-all shadow-sm group hover:shadow-md disabled:opacity-50"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg bg-blue-600 shadow-blue-100 transition-transform group-hover:scale-110`}>
                <i className="fas fa-user-circle"></i>
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-slate-800 text-lg leading-tight">乘客入口</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">乘车凭证 / 班车位置</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                <i className="fas fa-arrow-right text-xs"></i>
              </div>
            </button>

            <button 
              onClick={handleDriverLogin}
              className="w-full bg-white p-6 rounded-3xl flex items-center space-x-4 border border-slate-100 active:bg-slate-50 active:scale-[0.98] transition-all shadow-sm group hover:shadow-md"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg bg-emerald-600 shadow-emerald-100 transition-transform group-hover:scale-110`}>
                <i className="fas fa-id-card"></i>
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-slate-800 text-lg leading-tight">司机入口</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">实时定位 / 扫码核销</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                <i className="fas fa-arrow-right text-xs"></i>
              </div>
            </button>

            <button 
              onClick={handleAdminLogin}
              disabled={isLoggingIn}
              className="w-full bg-white p-6 rounded-3xl flex items-center space-x-4 border border-slate-100 active:bg-slate-50 active:scale-[0.98] transition-all shadow-sm group hover:shadow-md disabled:opacity-50"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg bg-indigo-600 shadow-indigo-100 transition-transform group-hover:scale-110`}>
                <i className="fas fa-chart-pie"></i>
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-slate-800 text-lg leading-tight">管理入口</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">全盘监控 / 智能决策</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                <i className="fas fa-arrow-right text-xs"></i>
              </div>
            </button>
          </div>
          
          <div className={`flex flex-col items-center space-y-1 opacity-30 ${isLandscape ? 'mt-8' : 'mt-auto pb-6'}`}>
            <p className="text-[10px] font-black tracking-[0.3em] uppercase">厦门商业物业公司</p>
            <p className="text-[9px] font-bold tracking-widest uppercase">智慧交通管理平台 v2.0</p>
          </div>
        </div>

          {showLoginModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-6 animate-in fade-in">
              <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-800">
                    {loginType === 'admin' ? '管理员登录' : '乘客登录'}
                  </h2>
                  <button 
                    onClick={() => setShowLoginModal(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200"
                  >
                    <i className="fas fa-times text-sm"></i>
                  </button>
                </div>

                {loginType === 'admin' && (
                  <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-xs text-amber-600 font-medium">
                      <i className="fas fa-info-circle mr-1"></i>
                      初始账号: admin / admin123
                    </p>
                  </div>
                )}

                {loginType === 'passenger' && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-xs text-blue-600 font-medium">
                      <i className="fas fa-info-circle mr-1"></i>
                      请使用手机号+密码登录
                    </p>
                  </div>
                )}

                {loginError && (
                  <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                    <p className="text-xs text-red-600 font-medium">
                      <i className="fas fa-exclamation-circle mr-1"></i>
                      {loginError}
                    </p>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                      {loginType === 'admin' ? '用户名' : '手机号'}
                    </label>
                    <input 
                      type={loginType === 'admin' ? 'text' : 'tel'}
                      name="username"
                      id="username"
                      required
                      autoComplete="username"
                      placeholder={loginType === 'admin' ? '请输入用户名' : '请输入手机号'}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">密码</label>
                    <input 
                      type="password"
                      name="password"
                      id="password"
                      required
                      autoComplete="current-password"
                      minLength={6}
                      placeholder="请输入密码"
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <label className="flex items-center cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <div className={`w-10 h-5 rounded-full transition-colors ${rememberMe ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
                        <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${rememberMe ? 'translate-x-5' : 'translate-x-0'}`}></div>
                      </div>
                      <span className="ml-3 text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-700">30天免登录</span>
                    </label>
                  </div>

                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold tracking-widest uppercase hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isLoggingIn ? (
                      <span className="flex items-center justify-center">
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        登录中...
                      </span>
                    ) : '立即登录'}
                  </button>
                </form>
              </div>
            </div>
          )}
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col w-full ${isLandscape ? 'max-w-none' : 'max-w-md'} mx-auto bg-slate-50 relative overflow-hidden shadow-2xl transition-all duration-300`}>
      <header className="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-100 safe-top shrink-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-200"></div>
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
          </div>
          <div>
            <span className="text-xs font-black text-slate-900 tracking-tight uppercase">系统连接正常</span>
            <p className="text-[9px] text-slate-400 font-bold -mt-0.5">延迟: 24MS</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
            <i className="fas fa-cog text-xs"></i>
          </button>
          <button 
            onClick={handleLogout}
            className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500 active:scale-90 transition-transform"
          >
            <i className="fas fa-power-off text-xs"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeRole === UserRole.PASSENGER && <PassengerView state={appState} viewMode={activeTab} />}
        {activeRole === UserRole.DRIVER && <DriverView state={appState} viewMode={activeTab} />}
        {activeRole === UserRole.ADMIN && <AdminView state={appState} />}
      </main>

      {activeRole !== UserRole.ADMIN && (
        <nav className={`bg-white bg-opacity-90 backdrop-blur-xl border-t border-slate-100 flex justify-around ${isLandscape ? 'px-12 py-1' : 'px-6 py-3'} safe-bottom z-50 transition-all duration-300`}>
           <button 
             onClick={() => setActiveTab('primary')}
             className={`flex flex-col items-center justify-center ${isLandscape ? 'px-8 py-1' : 'px-4 py-2'} rounded-2xl transition-all relative group ${
               activeTab === 'primary' ? 'text-blue-600' : 'text-slate-400 hover:bg-slate-50'
             }`}
           >
             <div className={`w-6 h-6 flex items-center justify-center mb-1 transition-transform group-active:scale-90 ${
               activeTab === 'primary' ? 'scale-110' : ''
             }`}>
               <i className={`fas fa-qrcode text-lg`}></i>
             </div>
             <span className="text-[10px] font-black uppercase tracking-wider">乘车凭证</span>
             {activeTab === 'primary' && (
               <div className={`absolute ${isLandscape ? '-top-1' : '-top-3'} w-1 h-1 bg-blue-600 rounded-full shadow-lg shadow-blue-200`}></div>
             )}
           </button>
           <button 
             onClick={() => setActiveTab('realtime')}
             className={`flex flex-col items-center justify-center ${isLandscape ? 'px-8 py-1' : 'px-4 py-2'} rounded-2xl transition-all relative group ${
               activeTab === 'realtime' ? 'text-blue-600' : 'text-slate-400 hover:bg-slate-50'
             }`}
           >
             <div className={`w-6 h-6 flex items-center justify-center mb-1 transition-transform group-active:scale-90 ${
               activeTab === 'realtime' ? 'scale-110' : ''
             }`}>
               <i className={`fas fa-map-marker-alt text-lg`}></i>
             </div>
             <span className="text-[10px] font-black uppercase tracking-wider">实时位置</span>
             {activeTab === 'realtime' && (
               <div className={`absolute ${isLandscape ? '-top-1' : '-top-3'} w-1 h-1 bg-blue-600 rounded-full shadow-lg shadow-blue-200`}></div>
             )}
           </button>
        </nav>
      )}
    </div>
  );
};

export default App;
