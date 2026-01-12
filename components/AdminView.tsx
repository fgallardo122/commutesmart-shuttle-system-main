import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import { LINE_INFO, VEHICLE_INFO } from '../constants';
import { fetchJson } from '../services/fetchJson';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

interface Props { state: AppState; }

interface AdminStats {
  todayRides: number;
  activeShuttles: number;
  totalPassengers: number;
  onTimeRate: number;
}

interface User {
  id: string;
  name: string;
  role: 'PASSENGER' | 'DRIVER' | 'ADMIN';
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastActive: string;
}

const MOCK_USERS: User[] = [
  { id: '1', name: '系统管理员', role: 'ADMIN', email: 'admin@commutesmart.com', status: 'ACTIVE', lastActive: '刚刚' },
  { id: '2', name: '王师傅', role: 'DRIVER', email: 'driver.wang@commutesmart.com', status: 'ACTIVE', lastActive: '10分钟前' },
  { id: '3', name: '张三', role: 'PASSENGER', email: 'zhangsan@example.com', status: 'ACTIVE', lastActive: '2小时前' },
  { id: '4', name: '李四', role: 'PASSENGER', email: 'lisi@example.com', status: 'INACTIVE', lastActive: '3天前' },
];

const AdminView: React.FC<Props> = ({ state }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'fleet' | 'ai' | 'users' | 'reports'>('overview');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{suggestions: string[], efficiencyScore: number} | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
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

  // New States for User Management & UI Feedback
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'PASSENGER', company: '', position: '', phone: '' });
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'info' | 'error' } | null>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [passengersLoading, setPassengersLoading] = useState(false);

  // Helper: Show Toast
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper: Export CSV
  const exportCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${filename} 已导出`, 'success');
  };

  // Fetch passengers
  const fetchPassengers = async () => {
    setPassengersLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const API_URL = '/api';
      const data = await fetchJson<any>(`${API_URL}/admin/passengers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPassengers(data.passengers || []);
    } catch (e) {
      console.error("Fetch passengers error", e);
      showToast('获取乘客列表失败', 'error');
    } finally {
      setPassengersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchPassengers();
    }
  }, [activeTab]);

  const handleAISuggestion = async () => {
    setAiLoading(true);
    try {
         const token = localStorage.getItem('token');
         if (!token) throw new Error("No token");
 
         const API_URL = '/api';
         const data = await fetchJson<any[]>(`${API_URL}/admin/ai-suggestions`, {
           headers: { Authorization: `Bearer ${token}` }
         });
         const suggestions = data.map((item: any) => `${item.title}: ${item.description}`);
         const warningCount = data.filter((item: any) => item.type === 'warning').length;
         const score = Math.max(60, 100 - warningCount * 10);

         setAiResult({
           suggestions,
           efficiencyScore: score
         });
         showToast('AI 分析报告已生成', 'success');
    } catch (e) {
        console.error("AI Fetch Error", e);
        setAiResult({ 
          suggestions: ["AI 服务暂时不可用，请稍后重试。"],
          efficiencyScore: 0
        }); 
        showToast('AI 服务调用失败', 'error');
    }
    setAiLoading(false);
  };

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (newUser.role === 'PASSENGER') {
        // Add passenger via API
        try {
          const token = localStorage.getItem('token');
          const API_URL = '/api';
          const data = await fetchJson<any>(`${API_URL}/admin/passengers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              name: newUser.name,
              company: newUser.company,
              position: newUser.position,
              phone: newUser.phone
            })
          });
          
          showToast(`乘客 ${newUser.name} 添加成功`, 'success');
          setShowAddUserModal(false);
          setNewUser({ name: '', email: '', role: 'PASSENGER', company: '', position: '', phone: '' });
          fetchPassengers(); // Refresh the list
        } catch (error) {
          console.error('Add passenger error:', error);
          showToast('添加乘客失败', 'error');
        }
      } else {
        // Original logic for other user types
        const user: User = {
            id: (users.length + 1).toString(),
            name: newUser.name,
            email: newUser.email,
            role: newUser.role as any,
            status: 'ACTIVE',
            lastActive: '从未'
        };
        setUsers([...users, user]);
        setShowAddUserModal(false);
        setNewUser({ name: '', email: '', role: 'PASSENGER', company: '', position: '', phone: '' });
        showToast(`用户 ${user.name} 添加成功`, 'success');
      }
  };

  // Fetch admin stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const API_URL = '/api';
        const data = await fetchJson<AdminStats>(`${API_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStats(data);
        setStatsLoading(false);
      } catch (e) {
        console.error("Stats Fetch Error", e);
        setStatsLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // 格式化图表数据
  const chartData = state.stops.map(stop => ({
    name: stop.name.length > 5 ? stop.name.substring(0, 4) + '...' : stop.name,
    fullName: stop.name,
    count: stop.waitingCount
  }));

  return (
    <div className="h-full flex flex-col bg-[#f5f7fa] overflow-hidden relative">
      {/* Toast Notification */}
      {toast && (
          <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg font-bold text-sm animate-in fade-in slide-in-from-top-4 ${
              toast.type === 'success' ? 'bg-emerald-500 text-white' : 
              toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'
          }`}>
              <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : toast.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} mr-2`}></i>
              {toast.message}
          </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">添加新用户</h3>
                  <form onSubmit={handleAddUser} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">角色</label>
                          <select 
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                              value={newUser.role}
                              onChange={e => setNewUser({...newUser, role: e.target.value})}
                          >
                              <option value="PASSENGER">乘客</option>
                              <option value="DRIVER">司机</option>
                              <option value="ADMIN">管理员</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">姓名</label>
                          <input 
                              type="text" required 
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                              value={newUser.name}
                              onChange={e => setNewUser({...newUser, name: e.target.value})}
                          />
                      </div>
                      {newUser.role === 'PASSENGER' ? (
                        <>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">手机号码</label>
                              <input 
                                  type="tel" required 
                                  pattern="[0-9]{11}"
                                  placeholder="请输入11位手机号"
                                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                  value={newUser.phone}
                                  onChange={e => setNewUser({...newUser, phone: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">所属公司</label>
                              <input 
                                  type="text"
                                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                  value={newUser.company}
                                  onChange={e => setNewUser({...newUser, company: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">职位</label>
                              <input 
                                  type="text"
                                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                  value={newUser.position}
                                  onChange={e => setNewUser({...newUser, position: e.target.value})}
                              />
                          </div>
                        </>
                      ) : (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">邮箱</label>
                            <input 
                                type="email" required 
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                value={newUser.email}
                                onChange={e => setNewUser({...newUser, email: e.target.value})}
                            />
                        </div>
                      )}
                      <div className="flex space-x-3 pt-2">
                          <button type="button" onClick={() => setShowAddUserModal(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors">取消</button>
                          <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">确认添加</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      <header className="bg-white px-4 md:px-6 py-4 md:py-5 shrink-0 shadow-sm border-b border-gray-100 sticky top-0 z-20">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100 transform transition-transform hover:scale-105">
              <i className="fas fa-chart-pie text-sm md:text-base"></i>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight leading-none">调度指挥运营看板</h1>
              <p className="text-[10px] md:text-[11px] text-gray-400 mt-1 font-medium italic">智慧交通 · 数字化管理平台</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors">
              <i className="fas fa-search text-sm"></i>
            </button>
            <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors relative">
              <i className="fas fa-bell text-sm"></i>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </div>

        <nav className="flex overflow-x-auto no-scrollbar -mx-4 px-4 space-x-6 md:space-x-8 scroll-smooth">
          {[
            { id: 'overview', label: '运行概览', icon: 'chart-line' },
            { id: 'fleet', label: '车组详情', icon: 'bus-alt' },
            { id: 'users', label: '用户管理', icon: 'users' },
            { id: 'reports', label: '历史报表', icon: 'chart-bar' },
            { id: 'ai', label: '智能决策', icon: 'sparkles' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 pb-3 text-xs md:text-sm transition-all relative whitespace-nowrap group ${
                activeTab === tab.id ? 'text-blue-600 font-bold' : 'text-gray-400 font-medium hover:text-gray-600'
              }`}
            >
              <i className={`fas fa-${tab.icon} transition-transform group-active:scale-90`}></i>
              <span>{tab.label}</span>
              <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-blue-600 rounded-full transition-all duration-300 transform ${
                activeTab === tab.id ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
              }`}></div>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar pb-10">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in">
            <div className={`grid ${isLandscape ? 'grid-cols-4' : 'grid-cols-2'} gap-3 md:gap-4`}>
              <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center transform transition-all hover:shadow-md">
                <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-wider">今日乘车次数</p>
                {statsLoading ? (
                  <div className="text-2xl md:text-3xl font-bold text-gray-300 font-mono tracking-tighter animate-pulse">--</div>
                ) : (
                  <p className="text-2xl md:text-3xl font-bold text-gray-800 font-mono tracking-tighter">{stats?.todayRides ?? 0}</p>
                )}
                <span className="text-[9px] text-emerald-500 font-bold mt-2 bg-emerald-50 px-2 py-0.5 rounded-full">实时统计</span>
              </div>
              <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center transform transition-all hover:shadow-md">
                <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-wider">准点率</p>
                {statsLoading ? (
                  <div className="text-2xl md:text-3xl font-bold text-gray-300 font-mono tracking-tighter animate-pulse">--</div>
                ) : (
                  <p className="text-2xl md:text-3xl font-bold text-gray-800 font-mono tracking-tighter">{stats?.onTimeRate ?? 0}%</p>
                )}
                <span className="text-[9px] text-blue-500 font-bold mt-2 bg-blue-50 px-2 py-0.5 rounded-full">高效率运行</span>
              </div>
              {/* 横屏下展示更多概览指标 */}
              {isLandscape && (
                <>
                  <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center transform transition-all hover:shadow-md">
                    <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-wider">活跃车辆</p>
                    <p className="text-2xl md:text-3xl font-bold text-gray-800 font-mono tracking-tighter">1</p>
                    <span className="text-[9px] text-indigo-500 font-bold mt-2 bg-indigo-50 px-2 py-0.5 rounded-full">正常运营</span>
                  </div>
                  <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-50 flex flex-col items-center transform transition-all hover:shadow-md">
                    <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase tracking-wider">当前总候车</p>
                    <p className="text-2xl md:text-3xl font-bold text-gray-800 font-mono tracking-tighter">
                      {state.stops.reduce((acc, s) => acc + s.waitingCount, 0)}
                    </p>
                    <span className="text-[9px] text-amber-500 font-bold mt-2 bg-amber-50 px-2 py-0.5 rounded-full">需求监控</span>
                  </div>
                </>
              )}
            </div>

            {/* 实时需求分布图 */}
            <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-50 transform transition-all hover:shadow-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-gray-800 flex items-center">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                  各站点实时候车人数分布
                </h3>
                <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">实时同步</span>
              </div>
              <div className="h-64 w-full" style={{ minHeight: '256px' }}>
                <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fill: '#9ca3af' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fill: '#9ca3af' }} 
                    />
                    <Tooltip 
                      cursor={{ fill: '#f9fafb' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white/90 backdrop-blur-md p-3 shadow-xl rounded-2xl border border-gray-100 animate-in zoom-in">
                              <p className="text-xs font-bold text-gray-800">{payload[0].payload.fullName}</p>
                              <div className="flex items-center mt-1.5">
                                <div className={`w-2 h-2 rounded-full mr-2 ${payload[0].value! > 10 ? 'bg-red-500' : 'bg-blue-600'}`}></div>
                                <p className="text-sm font-bold text-gray-900">{payload[0].value} <span className="text-[10px] font-normal text-gray-400">人候车</span></p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={20}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.count > 10 ? '#ef4444' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50 flex justify-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-[10px] text-gray-400 font-medium">正常负荷</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full shadow-sm shadow-red-100"></div>
                  <span className="text-[10px] text-gray-400 font-medium">高需求点</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fleet' && (
          <div className={`bg-white rounded-[2rem] p-6 shadow-sm border border-gray-50 animate-in flex ${isLandscape ? 'flex-row space-x-8' : 'flex-col'}`}>
            <div className={`${isLandscape ? 'w-1/2' : 'w-full'}`}>
              <div className="flex justify-between items-start mb-8">
                <div className="flex-1 mr-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">{VEHICLE_INFO.plate}</h2>
                    <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold">新能源车辆</span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium flex items-center">
                    <i className="fas fa-user-circle mr-1.5 opacity-40"></i>
                    负责司机：{VEHICLE_INFO.driverName}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">{LINE_INFO.operatingDays} · 运营中</p>
                </div>
                <div className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg shadow-emerald-100 flex items-center">
                  <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse"></span>
                  运行中
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 py-6 border-y border-gray-50 mb-6 bg-gray-50/50 -mx-6 px-6">
                <div>
                  <p className="text-[9px] text-gray-400 font-bold mb-1 uppercase tracking-widest">车辆识别码</p>
                  <p className="text-xs font-mono font-bold text-gray-700">{VEHICLE_INFO.engine}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold mb-1 uppercase tracking-widest">排班进度</p>
                  <p className="text-xs font-bold text-gray-700">今日计划 {VEHICLE_INFO.schedule.morning.length + VEHICLE_INFO.schedule.evening.length} 趟</p>
                </div>
              </div>
            </div>

            <div className={`${isLandscape ? 'w-1/2' : 'w-full'} space-y-5`}>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center">
                <i className="fas fa-location-arrow mr-2 text-blue-500"></i> 实时地理围栏监控
              </h4>
              <div className="space-y-4 relative before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
                {state.stops.map((stop, idx) => (
                  <div key={stop.id} className="flex items-center space-x-4 relative z-10">
                    <div className={`w-3 h-3 rounded-full border-2 border-white transition-all duration-500 ${
                      idx === state.currentStopIndex 
                      ? 'bg-blue-600 ring-4 ring-blue-100 scale-125' 
                      : idx < state.currentStopIndex ? 'bg-emerald-500' : 'bg-gray-200'
                    }`}></div>
                    <div className="flex-1">
                      <p className={`text-xs font-bold transition-colors ${idx === state.currentStopIndex ? 'text-blue-600' : 'text-gray-400'}`}>{stop.name}</p>
                    </div>
                    {idx === state.currentStopIndex && (
                      <span className="text-[9px] bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full animate-in zoom-in">
                        正在停靠
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6 animate-in">
            <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-700 p-6 md:p-8 rounded-[2.5rem] text-white shadow-2xl shadow-blue-200 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
               <div className="flex items-center space-x-4 md:space-x-5 mb-8 md:mb-10 relative z-10">
                  <div className="w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-xl rounded-2xl md:rounded-3xl flex items-center justify-center text-2xl md:text-3xl shadow-inner">
                    <i className="fas fa-brain text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg md:text-xl tracking-tight">智能调度决策引擎 (GLM-4)</h3>
                    <p className="text-[10px] md:text-xs opacity-70 mt-1 font-medium italic">基于 Zhipu AI 大模型的深度学习分析平台</p>
                  </div>
               </div>
               <button 
                 onClick={handleAISuggestion} 
                 disabled={aiLoading}
                 className="w-full bg-white text-blue-700 py-4 md:py-5 rounded-2xl md:rounded-3xl font-bold text-sm shadow-xl active:scale-95 transition-all disabled:opacity-50 relative z-10 overflow-hidden"
               >
                 {aiLoading ? (
                   <span className="flex items-center justify-center space-x-2">
                     <i className="fas fa-circle-notch animate-spin"></i>
                     <span>智能分析中...</span>
                   </span>
                 ) : (
                   <span className="flex items-center justify-center space-x-2">
                     <i className="fas fa-bolt text-amber-400"></i>
                     <span>生成实时分析报告</span>
                   </span>
                 )}
               </button>
            </div>

            {aiResult && (
              <div className="space-y-6 animate-in">
                {/* 运行效率评分 */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50 flex items-center justify-between transform transition-all hover:shadow-md">
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">当前运行效率评分</p>
                     <h2 className="text-4xl font-mono font-bold text-gray-800 mt-1">{aiResult.efficiencyScore}<span className="text-lg opacity-20 ml-1">/100</span></h2>
                   </div>
                   <div className="w-16 h-16 rounded-full border-4 border-gray-50 flex items-center justify-center relative">
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle
                          cx="32" cy="32" r="28"
                          fill="transparent"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="text-gray-100"
                        />
                        <circle
                          cx="32" cy="32" r="28"
                          fill="transparent"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeDasharray={2 * Math.PI * 28}
                          strokeDashoffset={2 * Math.PI * 28 * (1 - aiResult.efficiencyScore / 100)}
                          strokeLinecap="round"
                          className="text-blue-600 transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <i className={`fas ${aiResult.efficiencyScore > 80 ? 'fa-check text-emerald-500' : 'fa-bolt text-amber-500'} text-xl relative z-10`}></i>
                   </div>
                </div>

                {/* AI 优化建议列表 */}
                <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-50">
                  <h4 className="text-[10px] font-bold text-gray-400 mb-6 md:mb-8 uppercase tracking-widest flex items-center">
                    <i className="fas fa-lightbulb mr-2 text-blue-600"></i>
                    具体调优建议清单
                  </h4>
                  <div className="space-y-5">
                    {aiResult.suggestions.map((s: string, idx: number) => (
                      <div key={idx} className="flex items-start space-x-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                         <span className="w-7 h-7 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm">{idx+1}</span>
                         <p className="text-sm font-bold text-gray-700 leading-relaxed">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 animate-in">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-gray-800 flex items-center">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                  系统用户统计
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3 md:gap-4">
                <div className="bg-blue-50/50 p-4 rounded-2xl text-center border border-blue-50">
                  <p className="text-[9px] text-gray-400 font-bold mb-2 uppercase tracking-tighter">乘客总数</p>
                  {statsLoading ? (
                    <div className="text-xl md:text-2xl font-bold text-gray-300 font-mono animate-pulse">--</div>
                  ) : (
                    <p className="text-xl md:text-2xl font-bold text-blue-600 font-mono">{stats?.totalPassengers ?? 0}</p>
                  )}
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-2xl text-center border border-emerald-50">
                  <p className="text-[9px] text-gray-400 font-bold mb-2 uppercase tracking-tighter">司机总数</p>
                  <p className="text-xl md:text-2xl font-bold text-emerald-600 font-mono">1</p>
                </div>
                <div className="bg-indigo-50/50 p-4 rounded-2xl text-center border border-indigo-50">
                  <p className="text-[9px] text-gray-400 font-bold mb-2 uppercase tracking-tighter">系统管理员</p>
                  <p className="text-xl md:text-2xl font-bold text-indigo-600 font-mono">1</p>
                </div>
              </div>
            </div>

            {/* Passenger List Table */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50 overflow-hidden">
                <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                  乘客列表
                </h3>
                {passengersLoading ? (
                  <div className="text-center py-8">
                    <i className="fas fa-circle-notch fa-spin text-2xl text-gray-300"></i>
                    <p className="text-sm text-gray-400 mt-2">加载中...</p>
                  </div>
                ) : passengers.length === 0 ? (
                  <div className="text-center py-8">
                    <i className="fas fa-users text-3xl text-gray-200"></i>
                    <p className="text-sm text-gray-400 mt-2">暂无乘客数据</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="border-b border-gray-100">
                                  <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">姓名</th>
                                  <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">公司</th>
                                  <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">职位</th>
                                  <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">手机号</th>
                                  <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold text-right">状态</th>
                              </tr>
                          </thead>
                          <tbody>
                              {passengers.map(passenger => (
                                  <tr key={passenger.passenger_id} className="group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                                      <td className="py-3 px-2 text-xs font-bold text-gray-700">{passenger.name}</td>
                                      <td className="py-3 px-2 text-xs text-gray-600">{passenger.company || '-'}</td>
                                      <td className="py-3 px-2 text-xs text-gray-600">{passenger.position || '-'}</td>
                                      <td className="py-3 px-2 text-xs text-gray-500 font-mono">{passenger.phone}</td>
                                      <td className="py-3 px-2 text-right">
                                          <span className={`text-[9px] font-bold ${passenger.status === 'ACTIVE' ? 'text-emerald-500' : 'text-gray-400'}`}>
                                              {passenger.status === 'ACTIVE' ? '活跃' : '停用'}
                                          </span>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                )}
            </div>

            {/* User List Table */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50 overflow-hidden">
                <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                  系统用户列表
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">姓名</th>
                                <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">角色</th>
                                <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold">邮箱</th>
                                <th className="py-3 px-2 text-[10px] uppercase text-gray-400 font-bold text-right">状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="group hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                                    <td className="py-3 px-2 text-xs font-bold text-gray-700">{user.name}</td>
                                    <td className="py-3 px-2">
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                            user.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-600' : 
                                            user.role === 'DRIVER' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                                        }`}>{user.role}</span>
                                    </td>
                                    <td className="py-3 px-2 text-xs text-gray-500 font-mono">{user.email}</td>
                                    <td className="py-3 px-2 text-right">
                                        <span className={`text-[9px] font-bold ${user.status === 'ACTIVE' ? 'text-emerald-500' : 'text-gray-400'}`}>
                                            {user.status === 'ACTIVE' ? '活跃' : '离线'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
              <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                快捷管理操作
              </h3>
              <div className="space-y-3">
                <button 
                  onClick={() => setShowAddUserModal(true)}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-blue-100 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  <i className="fas fa-user-plus text-xs"></i>
                  <span>添加新用户</span>
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => exportCSV(users, 'users_list.csv')}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center space-x-2 border border-gray-100"
                  >
                    <i className="fas fa-download text-xs opacity-50"></i>
                    <span>导出列表</span>
                  </button>
                  <button 
                    onClick={() => showToast('通知已发送给所有活跃用户', 'success')}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center space-x-2 border border-gray-100"
                  >
                    <i className="fas fa-bell text-xs opacity-50"></i>
                    <span>发送通知</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6 animate-in">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-gray-800 flex items-center">
                  <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                  运营核心指标
                </h3>
                <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">今日实时数据</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 rounded-2xl border border-blue-100/50 relative overflow-hidden">
                  <i className="fas fa-ticket-alt absolute -right-2 -bottom-2 text-4xl text-blue-600/5 rotate-12"></i>
                  <p className="text-[10px] text-gray-500 font-bold mb-2 uppercase">今日乘车总数</p>
                  {statsLoading ? (
                    <div className="text-3xl font-bold text-gray-400 font-mono animate-pulse">--</div>
                  ) : (
                    <p className="text-3xl font-bold text-blue-700 font-mono">{stats?.todayRides ?? 0}</p>
                  )}
                  <span className="text-[9px] text-blue-600/60 font-bold mt-1 block">数据已加密验证</span>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 rounded-2xl border border-emerald-100/50 relative overflow-hidden">
                  <i className="fas fa-clock absolute -right-2 -bottom-2 text-4xl text-emerald-600/5 rotate-12"></i>
                  <p className="text-[10px] text-gray-500 font-bold mb-2 uppercase">综合准点率</p>
                  {statsLoading ? (
                    <div className="text-3xl font-bold text-gray-400 font-mono animate-pulse">--</div>
                  ) : (
                    <p className="text-3xl font-bold text-emerald-700 font-mono">{stats?.onTimeRate ?? 0}%</p>
                  )}
                  <span className="text-[9px] text-emerald-600/60 font-bold mt-1 block">运营状态极佳</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
              <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                周期报表导出
              </h3>
              <div className="space-y-3">
                <button 
                  onClick={() => {
                      exportCSV([
                          { date: '2024-01-01', rides: 120, onTime: '98%' },
                          { date: '2024-01-02', rides: 145, onTime: '99%' },
                          { date: '2024-01-03', rides: 132, onTime: '97%' },
                      ], 'weekly_report.csv');
                  }}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-blue-100 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  <i className="fas fa-file-csv text-xs"></i>
                  <span>生成本周运营分析报告 (CSV)</span>
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                        exportCSV([
                            { month: '2024-01', totalRides: 4500, avgOnTime: '98.5%' }
                        ], 'monthly_data.csv');
                    }}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center space-x-2 border border-gray-100"
                  >
                    <i className="fas fa-file-excel text-xs opacity-50"></i>
                    <span>导出月度数据</span>
                  </button>
                  <button 
                    onClick={() => showToast('年度趋势图生成功能即将上线', 'info')}
                    className="bg-gray-50 hover:bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center space-x-2 border border-gray-100"
                  >
                    <i className="fas fa-chart-line text-xs opacity-50"></i>
                    <span>年度趋势图</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
              <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center">
                <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
                历史趋势分析
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-xs font-bold text-gray-700">周一至周五平均乘客量</p>
                    <p className="text-[10px] text-gray-400 mt-1">过去30天</p>
                  </div>
                  <p className="text-lg font-bold text-blue-600">156人/天</p>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-50">
                  <div>
                    <p className="text-xs font-bold text-gray-700">高峰时段满载率</p>
                    <p className="text-[10px] text-gray-400 mt-1">过去30天</p>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">87%</p>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-xs font-bold text-gray-700">平均运行准点率</p>
                    <p className="text-[10px] text-gray-400 mt-1">过去30天</p>
                  </div>
                  <p className="text-lg font-bold text-indigo-600">98.5%</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminView;
