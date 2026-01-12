/**
 * 优化后的乘客视图 - 零操作成本、直观优雅
 * 
 * UX优化重点：
 * 1. 自动检测工作日，无需用户操作
 * 2. 自动显示下一班倒计时
 * 3. 一键生成乘车码
 * 4. 智能刷新，无需手动操作
 * 5. 视觉清晰，信息层次分明
 */

import React, { useState, useEffect } from 'react';
import { AppState, ShuttleStop, UserProfile } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { fetchJson } from '../services/fetchJson';
import { 
  isWorkday, 
  getNextDeparture, 
  formatDateChinese, 
  isOperatingHours,
  isNearDeparture,
  calculateDistance,
  Holiday,
  Schedule
} from '../utils/dateUtils';

interface Props { 
  state: AppState;
  viewMode?: 'primary' | 'realtime';
}

const PassengerViewOptimized: React.FC<Props> = ({ state, viewMode = 'primary' }) => {
  // 核心状态
  const [currentTime, setCurrentTime] = useState(new Date());
  const [ticketData, setTicketData] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(180);
  const [showTicket, setShowTicket] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  // 位置状态
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [nearestStop, setNearestStop] = useState<ShuttleStop | null>(null);
  const [locationError, setLocationError] = useState(false);
  
  // 业务数据状态
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  // 计算工作日状态
  const isTodayWorkday = isWorkday(currentTime, holidays);
  const isInOperatingHours = isOperatingHours(currentTime);
  const dateDisplay = formatDateChinese(currentTime);
  
  // 计算下一班信息
  const nextDep = isTodayWorkday ? getNextDeparture(schedules, currentTime) : null;
  
  // 加载业务数据（班次和节假日）
  useEffect(() => {
    const loadData = async () => {
      try {
        setDataLoading(true);
        
        // 并行加载班次、节假日和用户信息
        const [schedulesRes, holidaysRes, profileRes] = await Promise.all([
          fetchJson<{ schedules: any[] }>('/api/schedules?active_only=true'),
          fetchJson<{ holidays: Holiday[] }>('/api/holidays'),
          fetchJson<UserProfile>('/api/profile', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          }).catch(() => null)
        ]);
        
        setSchedules(schedulesRes.schedules || []);
        setHolidays(holidaysRes.holidays || []);
        if (profileRes) setUserProfile(profileRes);
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setDataLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // 自动定位
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          setUserCoords({ lat, lng });
          
          // 计算最近站点（使用Haversine公式）
          const sorted = [...state.stops].sort((a, b) => {
            const distA = calculateDistance(lat, lng, a.lat, a.lng);
            const distB = calculateDistance(lat, lng, b.lat, b.lng);
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
  
  // 生成乘车码
  const generateTicket = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('请先登录');
        return;
      }

      const API_URL = '/api';
      const data = await fetchJson<{ ticketId: string; expiresIn: number }>(`${API_URL}/tickets/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      setTicketData(data.ticketId);
      setTimeLeft(data.expiresIn);
      setShowTicket(true);
    } catch (error) {
      console.error('生成乘车码失败:', error);
      alert('生成失败，请重试');
    }
  };
  
  // 自动刷新乘车码
  useEffect(() => {
    if (!showTicket) return;
    
    const qrTimer = setInterval(() => setTimeLeft(prev => {
        if (prev <= 1) {
            generateTicket();
            return 180;
        }
        return prev - 1;
    }), 1000);

    return () => clearInterval(qrTimer);
  }, [showTicket]);
  
  // 时钟更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const timeStr = currentTime.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  });

  // ========== 实时位置视图 ==========
  if (viewMode === 'realtime') {
    const nextStop = state.stops.length > 0 ? state.stops[(state.currentStopIndex + 1) % state.stops.length] : null;
    
    return (
      <div className="h-full flex flex-col p-4 space-y-4 bg-[#f8f9fa] overflow-y-auto custom-scrollbar">
        {/* 定位状态栏 */}
        {nearestStop && (
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <i className="fas fa-location-arrow text-emerald-500 text-xs"></i>
              <span className="text-[11px] font-bold text-emerald-700">您在 {nearestStop.name} 附近</span>
            </div>
            <span className="text-[10px] text-emerald-400">自动定位</span>
          </div>
        )}
        
        {locationError && (
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
            <div className="flex items-center space-x-2">
              <i className="fas fa-location-slash text-amber-600 text-xs"></i>
              <span className="text-[11px] font-bold text-amber-700">定位不可用</span>
            </div>
            <p className="text-[10px] text-amber-600 mt-1 ml-5">请在浏览器设置中允许位置访问</p>
          </div>
        )}

        {/* 班车实时状态 */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-50">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
              <i className="fas fa-bus mr-1"></i>
              班车行驶中
            </span>
            <span className="text-[10px] text-gray-400">实时更新</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-3xl font-bold text-gray-800">
                {state.busLocation?.distanceToNext || 0} 
                <span className="text-sm text-gray-400 ml-1">米</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">距离 {nextStop.name}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-800">
                {state.busLocation?.speed || 0} 
                <span className="text-sm text-gray-400 ml-1">km/h</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">当前车速</p>
            </div>
          </div>
        </div>

        {/* 路线进度 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-50 flex-1 p-5 overflow-hidden flex flex-col">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
            <i className="fas fa-route mr-2 text-blue-600"></i>
            行车路线
          </h3>
          
          <div className="relative flex-1 overflow-y-auto px-2">
            <div className="absolute left-[15px] top-2 bottom-8 w-[2px] bg-gray-100"></div>
            
            <div className="space-y-6">
              {state.stops.map((stop, index) => {
                const isCurrent = index === state.currentStopIndex;
                const isPassed = index < state.currentStopIndex;
                const isUserHere = nearestStop?.id === stop.id;

                return (
                  <div key={stop.id} className="relative flex items-center">
                    <div className={`w-8 h-8 rounded-full border-2 z-10 flex items-center justify-center transition-all ${
                      isPassed ? 'bg-gray-100 border-gray-200 text-gray-400' : 
                      isCurrent ? 'bg-blue-600 border-blue-100 text-white shadow-lg shadow-blue-200 ring-4 ring-blue-50' : 
                      'bg-white border-gray-200 text-gray-300'
                    }`}>
                      <i className={`fas ${isPassed ? 'fa-check text-[10px]' : isCurrent ? 'fa-bus text-[12px]' : 'fa-circle text-[8px]'}`}></i>
                    </div>
                    
                    <div className="ml-4 flex-1">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className={`text-sm font-bold ${isCurrent ? 'text-blue-600' : isPassed ? 'text-gray-400' : 'text-gray-700'}`}>
                            {stop.name}
                            {isUserHere && (
                              <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">您在这里</span>
                            )}
                          </p>
                          {isCurrent && (
                            <p className="text-[10px] text-blue-500 mt-1">即将到达</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-mono ${isPassed ? 'text-gray-300' : 'text-gray-500'}`}>
                            {stop.estimatedArrival}
                          </p>
                        </div>
                      </div>
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

  // ========== 主视图（乘车码） ==========
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-blue-50 to-white overflow-hidden">
      {/* 顶部状态栏 */}
      <div className="px-6 pt-6 pb-4 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="text-center">
          <div className="text-sm font-medium text-gray-500">{dateDisplay}</div>
          <div className="text-3xl font-bold text-gray-800 mt-1 font-mono tracking-tight">{timeStr}</div>
        </div>
        
        {/* 工作日/停运状态提示 */}
        {!isTodayWorkday && (
          <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <i className="fas fa-calendar-times text-amber-600 text-xl"></i>
              </div>
              <div className="flex-1">
                <p className="font-bold text-amber-900 text-sm">今日非工作日</p>
                <p className="text-xs text-amber-700 mt-0.5">班车停运，下个工作日恢复运营</p>
              </div>
            </div>
          </div>
        )}
        
        {/* 下一班信息 */}
        {isTodayWorkday && nextDep && (
          <div className="mt-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80 font-medium">下一班发车</p>
                <p className="text-3xl font-bold mt-1">{nextDep.time}</p>
                <p className="text-xs opacity-90 mt-1">
                  <i className="fas fa-clock mr-1"></i>
                  {nextDep.countdown}发车
                </p>
              </div>
              <div className="text-right">
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  isNearDeparture(nextDep.time, currentTime)
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-white/20'
                }`}>
                  {nextDep.schedule.schedule_type === 'MORNING' ? '早班' : '晚班'}
                </div>
                {isNearDeparture(nextDep.time, currentTime) && (
                  <p className="text-[10px] mt-1 opacity-90">即将发车</p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* 运营时间外提示 */}
        {isTodayWorkday && !nextDep && !dataLoading && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <div className="text-center">
              <i className="fas fa-moon text-gray-400 text-2xl"></i>
              <p className="text-sm font-bold text-gray-600 mt-2">今日班次已结束</p>
              <p className="text-xs text-gray-500 mt-1">
                早班 07:45-09:45 · 晚班 17:45-19:45
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 乘车码区域 */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {!showTicket ? (
          // 生成乘车码按钮
          <div className="text-center">
            <div className="mb-6">
              <i className="fas fa-qrcode text-gray-300 text-6xl"></i>
            </div>
            <button
              onClick={generateTicket}
              disabled={!isTodayWorkday || dataLoading}
              className={`px-8 py-4 rounded-2xl font-bold text-lg transition-all ${
                isTodayWorkday && !dataLoading
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-xl hover:scale-105 active:scale-95'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <i className="fas fa-ticket-alt mr-2"></i>
              {dataLoading ? '加载中...' : isTodayWorkday ? '生成乘车码' : '今日停运'}
            </button>
            <p className="text-xs text-gray-400 mt-4">
              点击后生成3分钟有效的乘车凭证
            </p>
          </div>
        ) : (
          // 显示乘车码
          <div className="w-full max-w-sm">
            {/* 防截屏水印 */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] select-none flex flex-wrap content-center justify-center text-[8px] font-bold rotate-[-20deg]">
              {Array.from({length: 40}).map((_, i) => (
                <span key={i} className="mx-3 my-4 whitespace-nowrap">乘车凭证 {timeStr}</span>
              ))}
            </div>

            <div className="relative z-10 bg-white rounded-3xl p-6 shadow-2xl border border-gray-100">
              {/* 用户信息简报 */}
              {userProfile && (
                <div className="mb-6 flex items-center space-x-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <i className="fas fa-user-circle"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{userProfile.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{userProfile.company}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">
                      {userProfile.position || '乘客'}
                    </span>
                  </div>
                </div>
              )}

              {/* 二维码 */}
              <div className="flex justify-center mb-4">
                <div className="relative p-4 bg-white rounded-2xl border-2 border-gray-100">
                  <QRCodeSVG 
                    value={ticketData || 'LOADING...'} 
                    size={220} 
                    level="H" 
                    includeMargin={false}
                    fgColor="#1a1a1a"
                  />
                  <div className="absolute inset-x-0 top-0 h-1 bg-blue-500/30 animate-scan-line blur-sm"></div>
                </div>
              </div>
              
              {/* 倒计时 */}
              <div className="text-center">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${timeLeft <= 30 ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}></div>
                    <span className={`font-bold text-sm ${timeLeft <= 30 ? 'text-red-600' : 'text-blue-600'}`}>
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')} 后自动刷新
                    </span>
                  </div>
                </div>
                
                {timeLeft <= 30 && (
                  <p className="text-xs text-red-500 mt-2 animate-pulse">
                    <i className="fas fa-exclamation-triangle mr-1"></i>
                    即将过期，请尽快使用
                  </p>
                )}
              </div>
              
              {/* 使用说明 */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 text-center">
                  请向司机出示此二维码进行核销
                </p>
              </div>
            </div>
            
            {/* 重新生成按钮 */}
            <button
              onClick={() => setShowTicket(false)}
              className="w-full mt-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium transition-colors"
            >
              返回
            </button>
          </div>
        )}
      </div>

      {/* 底部站点快捷信息 */}
      {!showTicket && nearestStop && (
        <div className="px-6 pb-6">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                  <i className="fas fa-map-marker-alt text-emerald-600"></i>
                </div>
                <div>
                  <p className="text-xs text-gray-500">您在附近</p>
                  <p className="text-sm font-bold text-gray-800">{nearestStop.name}</p>
                </div>
              </div>
              <button 
                onClick={() => {/* 切换到实时视图 */}}
                className="text-xs text-blue-600 font-medium"
              >
                查看路线
                <i className="fas fa-chevron-right ml-1"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassengerViewOptimized;
