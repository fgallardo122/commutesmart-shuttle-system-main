
import React, { useState, useEffect } from 'react';
import { AppState, ShuttleStop, UserProfile } from '../types';
import { LINE_INFO, VEHICLE_INFO } from '../constants';
import { QRCodeSVG } from 'qrcode.react';
import { fetchJson } from '../services/fetchJson';

interface Props { 
  state: AppState;
  viewMode?: 'primary' | 'realtime';
}

const PassengerView: React.FC<Props> = ({ state, viewMode = 'primary' }) => {
  const [timeLeft, setTimeLeft] = useState(180);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [nearestStop, setNearestStop] = useState<ShuttleStop | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);

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

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const data = await fetchJson<UserProfile>('/api/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setUserProfile(data);
      } catch (e) {
        console.error('Failed to fetch profile:', e);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          setUserCoords({ lat, lng });
          
          const sorted = [...state.stops].sort((a, b) => {
            const distA = Math.sqrt(Math.pow(a.lat - lat, 2) + Math.pow(a.lng - lng, 2));
            const distB = Math.sqrt(Math.pow(b.lat - lat, 2) + Math.pow(b.lng - lng, 2));
            return distA - distB;
          });
          setNearestStop(sorted[0]);
        },
        (err) => {
          console.log("定位失败:", err.code, err.message);
          setLocationError(true);
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    } else {
      setLocationError(true);
    }
  }, [state.stops]);

  const [ticketData, setTicketData] = useState<string>('');

  const refreshTicket = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const API_URL = '/api';
      const data = await fetchJson<{ ticketId: string; expiresIn: number }>(`${API_URL}/tickets/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setTicketData(data.ticketId);
      setTimeLeft(data.expiresIn);
    } catch (error) {
      console.error('Failed to refresh ticket:', error);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const qrTimer = setInterval(() => setTimeLeft(prev => {
        if (prev <= 1) {
            refreshTicket();
            return 180;
        }
        return prev - 1;
    }), 1000);

    refreshTicket(); // Initial fetch

    return () => { clearInterval(timer); clearInterval(qrTimer); };
  }, []);

  const timeStr = currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  if (viewMode === 'realtime') {
    const nextStop = state.stops.length > 0 ? state.stops[(state.currentStopIndex + 1) % state.stops.length] : null;
    
    return (
      <div className={`h-full flex ${isLandscape ? 'flex-row p-6 space-x-6' : 'flex-col p-4 space-y-4'} bg-slate-50 overflow-hidden animate-in`}>
        {/* 左侧区域：定位与位置摘要 */}
        <div className={`flex flex-col space-y-4 ${isLandscape ? 'w-1/3 shrink-0' : 'w-full'}`}>
          {/* 定位状态栏 */}
          {nearestStop ? (
            <div className="bg-emerald-500 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-emerald-100 border border-emerald-400">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <i className="fas fa-location-arrow text-sm"></i>
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-wider">您在 {nearestStop.name} 附近</span>
                  <p className="text-[9px] opacity-70 font-bold uppercase tracking-tighter">自动地理围栏追踪</p>
                </div>
              </div>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            </div>
          ) : locationError ? (
            <div className="bg-slate-100 border border-slate-200 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <i className="fas fa-location-slash text-slate-400 text-sm"></i>
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">定位不可用 - 请手动查看</span>
              </div>
            </div>
          ) : null}

          {/* 顶部位置摘要 */}
          <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl text-white relative overflow-hidden flex-1 flex flex-col justify-center">
            <div className="absolute right-[-10%] top-[-10%] w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
            <div className="flex justify-between items-start mb-6 relative z-10">
              <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 uppercase tracking-[0.2em]">实时位置追踪</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest italic">5秒前更新</span>
            </div>
            <div className="space-y-6 relative z-10">
              <div>
                <div className="flex items-baseline">
                  <p className="text-4xl font-black font-mono tracking-tighter">{state.busLocation?.distanceToNext}</p>
                  <span className="text-xs ml-2 font-bold text-slate-500 uppercase">米</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-black uppercase tracking-wider">距离下站：{nextStop?.name}</p>
              </div>
              <div>
                <div className="flex items-baseline">
                  <p className="text-2xl font-black font-mono tracking-tighter">{state.busLocation?.speed}</p>
                  <span className="text-[10px] ml-1.5 font-bold text-slate-500 uppercase">公里/小时</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-black uppercase tracking-wider">当前车速</p>
              </div>
            </div>
          </div>
        </div>

        {/* 路线进度卡片 */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 flex-1 p-6 overflow-hidden flex flex-col transform transition-all hover:shadow-md">
          <h3 className="text-sm font-black text-slate-800 mb-8 flex items-center">
            <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
            实时行车线路进度
          </h3>
          
          <div className="relative flex-1 overflow-y-auto px-2 custom-scrollbar before:absolute before:left-[15px] before:top-2 before:bottom-8 before:w-[2px] before:bg-slate-50">
            <div className="space-y-10 pb-4">
              {state.stops.map((stop, index) => {
                const isCurrent = index === state.currentStopIndex;
                const isPassed = index < state.currentStopIndex;
                const isUserHere = nearestStop?.id === stop.id;

                return (
                  <div key={stop.id} className={`relative flex items-center transition-all ${isPassed ? 'opacity-30' : 'opacity-100'}`}>
                    <div className={`w-8 h-8 rounded-full border-2 z-10 flex items-center justify-center transition-all duration-500 ${
                      isPassed ? 'bg-slate-100 border-slate-100 text-slate-400' : 
                      isCurrent ? 'bg-blue-600 border-white text-white shadow-xl shadow-blue-100 scale-125' : 
                      'bg-white border-slate-200 text-slate-300'
                    }`}>
                      <i className={`fas ${isPassed ? 'fa-check text-[10px]' : 'fa-map-marker-alt text-[12px]'}`}></i>
                    </div>
                    <div className="ml-5 flex-1">
                      <div className="flex justify-between items-center">
                        <span className={`text-sm font-black tracking-tight ${isPassed ? 'text-slate-300' : isCurrent ? 'text-blue-600' : 'text-slate-800'}`}>
                          {stop.name}
                          {isUserHere && <span className="ml-2 text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">您在此站</span>}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{stop.estimatedArrival}</span>
                      </div>
                      {isCurrent && (
                        <div className="flex items-center space-x-2 mt-1.5">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
                          <p className="text-[10px] text-blue-500 font-black uppercase tracking-wider">班车正在此站或即将抵达</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col p-4 bg-slate-50 overflow-hidden animate-in transition-all duration-500`}>
      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200 flex-1 flex flex-col overflow-hidden border border-slate-100 relative group">
        <div className={`bg-blue-600 ${isLandscape ? 'p-6' : 'p-8'} text-white shrink-0 relative overflow-hidden`}>
          <div className="absolute right-[-10%] top-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div>
              <p className="text-[10px] opacity-70 tracking-[0.3em] uppercase font-black">智慧通勤凭证</p>
              <h1 className={`${isLandscape ? 'text-2xl' : 'text-3xl'} font-black mt-2 tracking-tight`}>{VEHICLE_INFO.plate}</h1>
            </div>
            <div className="text-right">
              <div className="text-[10px] bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full font-black flex items-center space-x-2 border border-white/20">
                <i className="fas fa-check-circle"></i>
                <span className="uppercase tracking-wider">已核验</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`flex-1 flex ${isLandscape ? 'flex-row p-4 space-x-6' : 'flex-col p-8'} items-center justify-center relative bg-white overflow-hidden`}>
          {/* 左侧/上半部分：用户信息与时间 */}
          <div className={`${isLandscape ? 'w-1/2 h-full flex flex-col justify-center space-y-4' : 'w-full flex flex-col items-center'}`}>
            {/* 用户信息卡片 */}
            {userProfile && (
              <div className={`w-full ${isLandscape ? 'mb-0 py-3' : 'mb-8 py-4'} px-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center space-x-4 relative z-10 animate-in fade-in slide-in-from-top-4 duration-700`}>
                <div className={`${isLandscape ? 'w-10 h-10' : 'w-12 h-12'} bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100 transform transition-transform hover:rotate-12`}>
                  <i className={`fas fa-user-circle ${isLandscape ? 'text-xl' : 'text-2xl'}`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`${isLandscape ? 'text-xs' : 'text-sm'} font-black text-slate-800 truncate`}>{userProfile.name}</p>
                    <span className="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider ml-2 shrink-0">
                      {userProfile.position || '乘客'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 truncate uppercase tracking-wide">
                    <i className="fas fa-building mr-1 opacity-50"></i>
                    厦门商业物业公司
                  </p>
                </div>
              </div>
            )}

            <div className={`text-center ${isLandscape ? 'mt-0' : 'mb-10'} relative z-10`}>
              <div className={`${isLandscape ? 'text-3xl' : 'text-5xl'} font-mono font-black text-slate-800 tracking-tighter`}>{timeStr}</div>
              <div className="flex items-center justify-center space-x-2 mt-2">
                <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{LINE_INFO.name}</p>
                <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
              </div>
            </div>

            {/* 横屏下的站点线路显示 */}
            {isLandscape && (
              <div className="mt-2 text-center z-10">
                <div className="space-y-3">
                  <div className="bg-slate-900 text-white px-4 py-2 rounded-2xl text-[9px] font-black inline-flex items-center space-x-3 shadow-xl shadow-slate-200 uppercase tracking-[0.1em]">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>{timeLeft}秒后自动刷新</span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] whitespace-nowrap leading-relaxed">
                    {LINE_INFO.route.start} <i className="fas fa-exchange-alt mx-1 opacity-30"></i> {LINE_INFO.route.end}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右侧/下半部分：二维码 */}
          <div className={`${isLandscape ? 'w-1/2 flex flex-col items-center justify-center' : 'w-full flex flex-col items-center'}`}>
            <div className={`relative ${isLandscape ? 'p-4' : 'p-6'} bg-white rounded-[2rem] border border-slate-100 shadow-2xl z-10 transform transition-transform hover:scale-105`}>
              <div className="absolute inset-0 border-8 border-blue-500/5 rounded-[2rem] animate-pulse"></div>
              <QRCodeSVG 
                value={ticketData || '加载中...'}
                size={isLandscape ? 130 : 180} 
                level="H" 
                includeMargin={false}
                fgColor="#0f172a"
              />
              <div className="absolute inset-x-6 top-6 h-1 bg-blue-500/20 animate-scan-line blur-[1px]"></div>
            </div>

            {/* 竖屏下的站点线路显示 */}
            {!isLandscape && (
              <div className="mt-10 text-center z-10">
                <div className="space-y-4">
                  <div className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black inline-flex items-center space-x-3 shadow-xl shadow-slate-200 uppercase tracking-[0.1em]">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>{timeLeft}秒后自动刷新</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] whitespace-nowrap leading-relaxed">
                    {LINE_INFO.route.start} <i className="fas fa-exchange-alt mx-1 opacity-30"></i> {LINE_INFO.route.end}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 半透明水印 */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] select-none flex flex-wrap content-center justify-center text-[10px] font-black rotate-[-30deg] tracking-widest uppercase">
            {Array.from({length: 80}).map((_, i) => (
              <span key={i} className="mx-6 my-8 whitespace-nowrap">{VEHICLE_INFO.plate} 安全凭证 {timeStr}</span>
            ))}
          </div>
        </div>

        <div className={`p-6 bg-slate-50 border-t border-dashed border-slate-200 ${isLandscape ? 'py-3' : ''}`}>
           <div className="flex justify-between items-center text-slate-400 text-[9px] font-black uppercase tracking-widest">
             <div className="flex items-center space-x-2">
               <i className="fas fa-fingerprint text-blue-500 opacity-50"></i>
               <span>指纹码: A87B-92CD-01FX</span>
             </div>
             <span className="opacity-40">节点_{Math.random().toString(36).substring(7).toUpperCase()}</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default PassengerView;
