import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
import { AppState } from '../types';
import { VEHICLE_INFO } from '../constants';
import { fetchJson } from '../services/fetchJson';

interface Props {
  state: AppState;
  viewMode?: 'primary' | 'realtime';
}

const DRIVER_OPENID = 'driver_lvqinggang_13959282886';

const DriverView: React.FC<Props> = ({ state, viewMode = 'primary' }) => {
  const [isDriving, setIsDriving] = useState(true);
  const [verifiedCount, setVerifiedCount] = useState(14);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'processing' | 'success' | 'error'>('idle');
  const [lastPassenger, setLastPassenger] = useState<string | null>(null);
  const [lastPassengerData, setLastPassengerData] = useState<{
    name: string | null;
    company: string | null;
    position: string | null;
    time: string | null;
  } | null>(null);
  const [scanFlash, setScanFlash] = useState<'none' | 'green' | 'red'>('none');
  const [toastMessage, setToastMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | null>(null);
  const [usingFacingMode, setUsingFacingMode] = useState(true);
  const [currentFacingMode, setCurrentFacingMode] = useState<"user" | "environment">("environment");
  const [scannerBoxSize, setScannerBoxSize] = useState(250);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanInFlightRef = useRef(false);
  const lastDecodedRef = useRef<{ text: string; ts: number } | null>(null);

  // 启动摄像头逻辑
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("无法启动摄像头:", err);
      alert("请检查摄像头权限设置");
    }
  };

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!showScanner) {
      if (scannerRef.current) {
        stopScanner();
      }
      // 重置摄像头状态，以便下次开启时重新检测
      setCameras([]);
      setCurrentCameraId(null);
      setScanError(null);
    }
  }, [showScanner, stopScanner]);

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

  const mapVerifyError = (raw: string) => {
    const text = raw || '';
    if (text.includes('Ticket already used')) return '票据已核销';
    if (text.includes('Invalid ticket')) return '票据无效或已过期';
    if (text.includes('Unauthorized')) return '未登录或登录已过期';
    return text;
  };

  const releaseScanLock = () => {
    scanInFlightRef.current = false;
  };

  const verifyTicket = async (ticketId: string) => {
    try {
      const API_URL = '/api';
      const data = await fetchJson<any>(`${API_URL}/tickets/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          ticketId,
          driverOpenid: DRIVER_OPENID
        })
      });
      
      if (data.valid) {
        if (data.duplicate) {
          setScanStatus('scanning');
          releaseScanLock();
          return;
        }
        setScanStatus('success');
        setScanFlash('green');
        setVerifiedCount(prev => prev + 1);
        
        let passengerDisplay = data.passengerName || (data.passengerId ? `乘客 ${data.passengerId.substring(0,5)}...` : '未知乘客');
        if (data.passengerCompany) {
          passengerDisplay = `${data.passengerName} (${data.passengerCompany})`;
        }
        setLastPassenger(passengerDisplay);
        setLastPassengerData({
          name: data.passengerName,
          company: data.passengerCompany,
          position: data.passengerPosition,
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        });
        setToastMessage({ text: `✓ 验证成功: ${passengerDisplay}`, type: 'success' });
        
        setTimeout(() => setScanFlash('none'), 500);
        setTimeout(() => setToastMessage(null), 2000);
        setTimeout(() => {
          setScanStatus('scanning');
          releaseScanLock();
        }, 1500);
      } else {
        handleScanError(mapVerifyError(data.error || '无效票据'));
      }
    } catch (error) {
      console.error("Verify failed:", error);
      handleScanError('网络错误');
    }
  };

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    if (scanStatus !== 'scanning') return;

    const now = Date.now();
    const last = lastDecodedRef.current;
    if (scanInFlightRef.current) return;
    if (last && last.text === decodedText && now - last.ts < 2000) return;

    scanInFlightRef.current = true;
    lastDecodedRef.current = { text: decodedText, ts: now };
    
    setScanStatus('processing');
    await verifyTicket(decodedText);
  }, [scanStatus]);

  const handleScanError = useCallback((error: string) => {
    setScanStatus('error');
    setScanFlash('red');
    setToastMessage({ text: `✗ 验证失败: ${error}`, type: 'error' });
    
    setTimeout(() => setScanFlash('none'), 500);
    setTimeout(() => setToastMessage(null), 3000);
    setTimeout(() => {
      setScanStatus('scanning');
      releaseScanLock();
    }, 2000);
  }, []);

  const onScanFailure = useCallback((error: any) => {
    // 忽略常规扫描错误，只在控制台输出用于调试
  }, []);

  const startHtml5Qrcode = useCallback(async (cameraConfigParam?: string | { facingMode: string }) => {
    try {
      setScanError(null);
      
      // 如果已经有扫描器在运行，先停止并清理
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch (e) {
          console.log('Stop previous scanner failed:', e);
        }
      }

      // 将实验性功能和日志设置传递给构造函数
      const scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      });
      scannerRef.current = scanner;

      // 根据屏幕方向计算扫描框大小
      const containerWidth = scannerContainerRef.current?.clientWidth || window.innerWidth;
      const containerHeight = scannerContainerRef.current?.clientHeight || window.innerHeight;
      const minSize = Math.min(containerWidth, containerHeight);
      
      // 优化：将识别区域比例从 0.5 扩大到 0.7，显著降低用户“对准”的难度
      const qrboxSize = Math.min(Math.floor(minSize * 0.7), 400);
      setScannerBoxSize(qrboxSize);

      // 决定启动配置：优先使用传入参数，否则默认使用 environment (后置)
      // 注意：Android 设备对 deviceId 支持不佳，优先推荐使用 facingMode
      const config = cameraConfigParam 
        ? cameraConfigParam 
        : { facingMode: "environment" };

      await scanner.start(
        config,
        {
          fps: 20, // 提升采样频率：从 10 提升至 20 FPS，响应更丝滑
          qrbox: { 
            width: qrboxSize, 
            height: qrboxSize
          },
          aspectRatio: 1.0,
          // 视频约束：请求高清分辨率
          videoConstraints: {
            width: { min: 640, ideal: 1280 },
            height: { min: 480, ideal: 720 }
          }
        },
        handleScanSuccess,
        onScanFailure
      );

      setScanStatus('scanning');
      
      // 启动成功后，如果是首次启动，尝试刷新设备列表（因为此时已获得权限，label 会更准确）
      if (cameras.length === 0) {
        Html5Qrcode.getCameras().then(devices => {
          if (devices && devices.length > 0) {
            setCameras(devices);
            
            // 如果我们是盲启（facingMode），尝试找到当前匹配的 deviceId 更新状态
            // 这里不做自动切换，只是为了让 UI 显示正确的设备名
            if (!currentCameraId) {
               const backCamera = devices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment')
              );
              if (backCamera) {
                setCurrentCameraId(backCamera.id);
              } else {
                setCurrentCameraId(devices[0].id);
              }
            }
          }
        }).catch(e => console.error("Refresh cameras failed", e));
      }

    } catch (err: any) {
      console.error('Html5Qrcode start error:', err);
      setScanError(err.message || '无法启动扫码器，请检查摄像头权限');
      setScanStatus('idle');
    }
  }, [handleScanSuccess, onScanFailure, cameras.length, currentCameraId]);

  // 启动扫码 - 仅首次自动执行
  useEffect(() => {
    // 如果是 idle 状态且还没有启动过，则尝试启动
    if (showScanner && scanStatus === 'idle') {
      // 首次盲启：不依赖 cameras 列表，直接用 facingMode
      const timer = setTimeout(() => {
        startHtml5Qrcode({ facingMode: "environment" });
        setUsingFacingMode(true);
        setCurrentFacingMode("environment");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showScanner, scanStatus, startHtml5Qrcode]);

  // 切换摄像头 - 混合模式
  const switchCamera = useCallback(() => {
    // 状态重置为 idle (但这不会触发上面的 useEffect，因为那里只负责首次)
    // 这里的切换由点击事件直接驱动重连逻辑
    
    // 策略1: 如果当前是用 facingMode 启动的，尝试反转 facingMode
    if (usingFacingMode) {
      // 停止当前
      // 反转 facingMode：如果当前是 environment (后置)，切换到 user (前置)，反之亦然
      const nextFacingMode = currentFacingMode === "environment" ? "user" : "environment";
      // 如果我们有 device 列表，就走 deviceId 模式
      if (cameras.length > 1) {
        // 升级为 deviceId 模式
        // 根据目标 facingMode 查找对应摄像头
        let targetCamera;
        if (nextFacingMode === "environment") {
          // 切换到后置摄像头
          targetCamera = cameras.find(c => 
            c.label.toLowerCase().includes('back') || 
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment')
          );
        } else {
          // 切换到前置摄像头
          targetCamera = cameras.find(c => 
            c.label.toLowerCase().includes('front') || 
            c.label.toLowerCase().includes('user') ||
            c.label.toLowerCase().includes('face')
          );
        }
        
        // 如果没找到特定摄像头，使用轮询方式
        if (!targetCamera) {
          const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
          const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameras.length : 0;
          targetCamera = cameras[nextIndex];
        }
        
        setCurrentCameraId(targetCamera.id);
        setCurrentFacingMode(nextFacingMode);
        setUsingFacingMode(false); // 切换到 deviceId 模式
        startHtml5Qrcode(targetCamera.id); // 直接用 deviceId 重启
      } else {
        // 如果没有列表（极少情况），使用 facingMode 切换
        // 实际上 html5-qrcode 在 Android 上对 environment/user 的支持好于 deviceId
        setCurrentFacingMode(nextFacingMode);
        startHtml5Qrcode({ facingMode: nextFacingMode });
      }
    } else {
      // 策略2: 已经是 deviceId 模式，继续轮询下一个 deviceId
      if (cameras.length > 1) {
        const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
        const nextIndex = (currentIndex + 1) % cameras.length;
        const nextCamera = cameras[nextIndex];
        
        // 更新 facingMode 状态以匹配新摄像头
        const newFacingMode = nextCamera.label.toLowerCase().includes('back') || 
                              nextCamera.label.toLowerCase().includes('rear') ||
                              nextCamera.label.toLowerCase().includes('environment') 
                              ? "environment" : "user";
        setCurrentFacingMode(newFacingMode);
        setCurrentCameraId(nextCamera.id);
        startHtml5Qrcode(nextCamera.id);
      }
    }
  }, [cameras, currentCameraId, usingFacingMode, currentFacingMode, startHtml5Qrcode]);

  const handleScanSimulation = async () => {
    if (scanStatus !== 'scanning') return;
    // Here we prompt for a ticket ID to simulate scanning one
    const ticketId = prompt("请输入乘客的票据ID (或使用摄像头扫码):");
    if (!ticketId) return;

    try {
      const token = localStorage.getItem('token');
      const API_URL = '/api';
      const data = await fetchJson<any>(`${API_URL}/tickets/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ticketId })
      });
      if (data.valid) {
        setScanStatus('success');
        setScanFlash('green');
        setVerifiedCount(prev => prev + 1);
        
        // Build passenger display name
        let passengerDisplay = data.passengerName || (data.passengerId ? `乘客 ${data.passengerId.substring(0,5)}...` : '未知乘客');
        if (data.passengerCompany) {
          passengerDisplay = `${data.passengerName} (${data.passengerCompany})`;
        }
        setLastPassenger(passengerDisplay);
        setToastMessage({ text: `✓ 验证成功: ${passengerDisplay}`, type: 'success' });
        
        // Reset flash after animation
        setTimeout(() => setScanFlash('none'), 500);
        // Hide toast after 2 seconds
        setTimeout(() => setToastMessage(null), 2000);
        // Auto reset to scanning after 1.5 seconds for continuous scanning
        setTimeout(() => {
          setScanStatus('scanning');
        }, 1500);
      } else {
        setScanStatus('error');
        setScanFlash('red');
        setToastMessage({ text: `✗ 验证失败: ${data.error || '无效票据'}`, type: 'error' });
        
        // Reset flash after animation
        setTimeout(() => setScanFlash('none'), 500);
        // Hide toast after 3 seconds
        setTimeout(() => setToastMessage(null), 3000);
        // Auto reset to scanning after 2 seconds for continuous scanning
        setTimeout(() => {
          setScanStatus('scanning');
        }, 2000);
      }
    } catch (error) {
      console.error("Verify failed:", error);
      setScanStatus('error');
      setScanFlash('red');
      setToastMessage({ text: '✗ 验证失败: 网络错误', type: 'error' });
      
      setTimeout(() => setScanFlash('none'), 500);
      setTimeout(() => setToastMessage(null), 3000);
      setTimeout(() => {
        setScanStatus('scanning');
      }, 2000);
    }
  };

  if (viewMode === 'realtime') {
    return (
      <div className={`h-full flex ${isLandscape ? 'flex-row p-6 space-x-6' : 'flex-col p-4 space-y-4'} bg-slate-50 overflow-hidden animate-in transition-all duration-500`}>
        {/* 仪表盘 */}
        <div className={`bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2rem] ${isLandscape ? 'w-1/3 p-6 flex flex-col justify-between' : 'p-6 shadow-xl text-white shrink-0 relative overflow-hidden'}`}>
          <div className="absolute right-[-10%] top-[-10%] w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">驾驶舱监控</p>
                <h2 className={`${isLandscape ? 'text-2xl' : 'text-3xl'} font-black mt-1 tracking-tight text-white`}>{VEHICLE_INFO.plate}</h2>
              </div>
              <div className="bg-emerald-500/20 backdrop-blur-md px-2 py-1 rounded-full text-[8px] font-black text-emerald-400 flex items-center border border-emerald-500/30">
                <span className="w-1 h-1 bg-emerald-400 rounded-full mr-1 animate-pulse"></span>
                GPS
              </div>
            </div>

            <div className={`grid ${isLandscape ? 'grid-cols-1 space-y-4' : 'grid-cols-2 gap-4'} relative z-10`}>
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/5">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">当前时速</p>
                <div className="flex items-baseline mt-1">
                  <p className={`${isLandscape ? 'text-2xl' : 'text-3xl'} font-black font-mono text-white`}>{state.busLocation?.speed}</p>
                  <span className="text-[9px] ml-1.5 font-bold text-slate-500 uppercase">KM/H</span>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/5">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">距离下站</p>
                <div className="flex items-baseline mt-1">
                  <p className={`${isLandscape ? 'text-2xl' : 'text-3xl'} font-black font-mono text-white`}>{state.busLocation?.distanceToNext}</p>
                  <span className="text-[9px] ml-1.5 font-bold text-slate-500 uppercase">M</span>
                </div>
              </div>
            </div>
          </div>
          
          {isLandscape && (
            <div className="mt-auto pt-6 border-t border-white/5">
              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">今日核销</p>
              <div className="flex items-baseline space-x-1">
                <p className="text-3xl font-black text-white font-mono">{verifiedCount}</p>
                <p className="text-[10px] text-slate-600 font-bold uppercase">人次</p>
              </div>
            </div>
          )}
        </div>

      {/* 路线进度 */}
      <div className="flex-1 bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 overflow-hidden flex flex-col transform transition-all hover:shadow-md">
        <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center">
          <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
          站点实时动态
        </h3>
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar relative before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-50">
          {state.stops.map((stop, index) => {
            const isCurrent = index === state.currentStopIndex;
            const isPassed = index < state.currentStopIndex;

            return (
              <div key={stop.id} className={`flex items-start space-x-4 transition-all relative z-10 ${isPassed ? 'opacity-30' : 'opacity-100'}`}>
                <div className={`w-3 h-3 rounded-full mt-1.5 border-2 border-white shadow-sm transition-all duration-500 ${
                  isCurrent ? 'bg-blue-600 ring-4 ring-blue-50 scale-125' : isPassed ? 'bg-slate-300' : 'bg-slate-100'
                }`}></div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <p className={`font-black text-sm ${isCurrent ? 'text-blue-600' : 'text-slate-800'}`}>
                      {stop.name}
                    </p>
                    <span className="text-[10px] font-bold text-slate-400">{stop.estimatedArrival}</span>
                  </div>
                  {isCurrent && (
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                        正在停靠
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-3 mt-1.5">
                    <p className="text-[10px] text-slate-400 font-bold">
                      <i className="fas fa-users mr-1 opacity-50"></i>
                      待乘: <span className={stop.waitingCount > 5 ? 'text-amber-500' : 'text-slate-600'}>{stop.waitingCount}</span>人
                    </p>
                    <div className="w-1 h-1 bg-slate-200 rounded-full"></div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      预计到达: {stop.estimatedArrival}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 核心统计 - 竖屏显示 */}
      {!isLandscape && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center">
            <p className="text-[9px] text-slate-400 font-black mb-2 uppercase tracking-widest">今日累计核销</p>
            <p className="text-4xl font-black text-slate-800 font-mono tracking-tighter">{verifiedCount}</p>
            {lastPassenger && (
              <div className="mt-2 bg-emerald-50 px-2 py-0.5 rounded-full">
                <p className="text-[9px] text-emerald-600 font-bold">{lastPassenger}</p>
              </div>
            )}
          </div>
          <div className="bg-blue-600 p-5 rounded-[2rem] shadow-xl shadow-blue-100 flex flex-col items-center text-white relative overflow-hidden">
            <div className="absolute right-[-10%] top-[-10%] w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
            <p className="text-[9px] opacity-70 font-black mb-2 uppercase tracking-widest relative z-10">当前站待乘</p>
            <p className="text-4xl font-black font-mono tracking-tighter relative z-10">
              {state.stops?.[state.currentStopIndex]?.waitingCount ?? 0}
            </p>
            <div className="mt-2 bg-white/20 px-2 py-0.5 rounded-full relative z-10">
              <p className="text-[9px] text-white font-bold uppercase tracking-tighter">实时更新</p>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4 bg-slate-50 relative animate-in">
      {/* 顶部状态栏 */}
      <div className={`p-6 rounded-[2rem] text-white flex justify-between items-center shadow-xl transition-all duration-500 relative overflow-hidden ${isDriving ? 'bg-emerald-600 shadow-emerald-100' : 'bg-rose-600 shadow-rose-100'}`}>
        <div className="absolute right-[-5%] top-[-20%] w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tight">{VEHICLE_INFO.plate}</h1>
          <div className="flex items-center space-x-2 mt-1.5">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isDriving ? 'bg-emerald-300' : 'bg-rose-300'}`}></div>
            <p className={`text-[10px] font-black uppercase tracking-widest ${isDriving ? 'text-emerald-100' : 'text-rose-100'}`}>
              {isDriving ? '正在运营 · 正常' : '停止运营 · 系统就绪'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setIsDriving(!isDriving)} 
          className="bg-white text-slate-900 px-6 py-3 rounded-2xl text-xs font-black active:scale-95 transition-all shadow-lg hover:shadow-xl relative z-10"
        >
          {isDriving ? '结束接送' : '开始接送'}
        </button>
      </div>

      {/* 核心统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center">
          <p className="text-[9px] text-slate-400 font-black mb-2 uppercase tracking-widest">今日累计核销</p>
          <p className="text-4xl font-black text-slate-800 font-mono tracking-tighter">{verifiedCount}</p>
          {lastPassenger && (
            <div className="mt-2 bg-emerald-50 px-2 py-0.5 rounded-full">
              <p className="text-[9px] text-emerald-600 font-bold">{lastPassenger}</p>
            </div>
          )}
        </div>
          <div className="bg-blue-600 p-6 rounded-[2rem] shadow-xl shadow-blue-100 flex flex-col items-center text-white relative overflow-hidden">
          <div className="absolute right-[-10%] top-[-10%] w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
          <p className="text-[9px] opacity-70 font-black mb-2 uppercase tracking-widest relative z-10">本站待乘人数</p>
          <p className="text-4xl font-black font-mono tracking-tighter relative z-10">
            {state.stops?.[state.currentStopIndex]?.waitingCount ?? 0}
          </p>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 overflow-hidden flex flex-col">
        <h2 className="text-sm font-black text-slate-800 mb-6 flex items-center">
          <div className="w-1.5 h-4 bg-blue-600 rounded-full mr-2"></div>
          最近核验历史
        </h2>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {Array.from({length: 5}).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100 opacity-60 hover:opacity-100 transition-opacity">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white shadow-sm text-emerald-500 rounded-xl flex items-center justify-center text-sm border border-slate-100">
                  <i className="fas fa-user-check"></i>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-tight">乘客 #{1000 + verifiedCount - i}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">核验时间 10:{i < 10 ? '0' : i} AM</p>
                </div>
              </div>
              <div className="bg-emerald-500/10 px-2 py-1 rounded-lg">
                <span className="text-[9px] text-emerald-600 font-black uppercase tracking-tighter">成功</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 固定到底部的超大扫码按钮 */}
      <div className="pt-2 pb-6 flex flex-col items-center">
        <button 
          onClick={() => setShowScanner(true)}
          className="w-full max-w-sm bg-slate-900 text-white py-5 rounded-[2rem] shadow-2xl shadow-slate-200 flex items-center justify-center space-x-3 active:scale-95 transition-all group overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500"></div>
          <i className="fas fa-camera text-xl relative z-10"></i>
          <span className="font-black tracking-[0.2em] uppercase text-sm relative z-10">开启扫码核验 · 扫描</span>
        </button>
      </div>

      {/* 专业扫码蒙层 - 适配竖屏/横屏 */}
      {showScanner && (
        <div 
          ref={scannerContainerRef}
          className={`fixed inset-0 bg-black z-[100] flex ${isLandscape ? 'flex-row' : 'flex-col'} overflow-hidden`}
        >
          {/* 注入 CSS 隐藏 html5-qrcode 默认 UI 及其它样式优化 */}
          <style dangerouslySetInnerHTML={{ __html: `
            #qr-shaded-region { opacity: 0 !important; pointer-events: none !important; }
            #qr-reader video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
            #qr-reader { border: none !important; }
          ` }} />

          {/* 摄像头区域 */}
          <div className={`relative ${isLandscape ? 'w-3/5 h-full' : 'w-full h-full'} bg-black overflow-hidden`}>
            {/* 摄像头容器 - 供 Html5Qrcode 使用 */}
            <div id="qr-reader" className="absolute inset-0 w-full h-full"></div>

          {/* 扫描失败提示 */}
          {scanError && (
            <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-md">
              <div className="text-center text-white p-8 max-w-sm">
                <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/30">
                  <i className="fas fa-video-slash text-3xl text-rose-500"></i>
                </div>
                <h3 className="text-xl font-black mb-2">无法启用摄像头</h3>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                  {scanError.includes('NotAllowedError') || scanError.includes('permission') 
                    ? "请在浏览器设置中允许此网站访问摄像头，并确保您使用的是 HTTPS 安全连接。" 
                    : scanError}
                </p>
                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      setScanStatus('idle');
                      startHtml5Qrcode(currentCameraId || undefined);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all"
                  >
                    重新尝试开启
                  </button>
                  <button 
                    onClick={() => {
                      const ticketId = prompt("请输入乘客的票据ID:");
                      if (ticketId) {
                        setScanStatus('processing');
                        verifyTicket(ticketId);
                      }
                    }}
                    className="w-full bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-black active:scale-95 transition-all"
                  >
                    手动输入票号
                  </button>
                  <button 
                    onClick={() => setShowScanner(false)}
                    className="w-full text-slate-500 py-2 font-bold text-xs uppercase tracking-widest mt-4"
                  >
                    返回仪表盘
                  </button>
                </div>
              </div>
            </div>
          )}

            {/* Flash overlay for visual feedback */}
            {scanFlash !== 'none' && (
              <div className={`absolute inset-0 z-[105] pointer-events-none transition-opacity duration-500 ${
                scanFlash === 'green' ? 'bg-emerald-500/40 animate-flash-green' : 'bg-red-500/40 animate-flash-red'
              }`}></div>
            )}

            {/* Floating Toast Notification (竖屏模式保留，作为补充) */}
            {toastMessage && !isLandscape && (
              <div className={`absolute top-24 left-1/2 transform -translate-x-1/2 z-[120] px-6 py-4 rounded-2xl shadow-2xl font-bold text-lg animate-in slide-in-from-top-4 fade-in ${
                toastMessage.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
              }`}>
                {toastMessage.text}
              </div>
            )}

            {/* 顶部操作栏 */}
            <div className="absolute top-0 left-0 right-0 p-4 z-[100] flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
              <button 
                onClick={() => setShowScanner(false)} 
                className="w-12 h-12 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
              
              <div className="flex flex-col items-center">
                <div className="bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm font-bold flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${scanStatus === 'scanning' ? 'bg-emerald-400' : 'bg-yellow-400'}`}></div>
                  <span>{scanStatus === 'scanning' ? '扫码已就绪' : '扫码中...'}</span>
                </div>
                {/* 摄像头切换提示 */}
                {cameras.length > 1 && (
                  <p className="text-[9px] text-white/50 mt-1 font-bold uppercase tracking-tighter">
                    {usingFacingMode ? '自动模式' : `当前: ${cameras.find(c => c.id === currentCameraId)?.label.split('(')[0] || 'Camera ' + currentCameraId?.substring(0,4)}`}
                  </p>
                )}
              </div>

              {/* 摄像头切换按钮 */}
              {/* 在盲启模式下也允许点击切换（尝试从 environment 切到 user） */}
              <button 
                onClick={switchCamera}
                className="w-12 h-12 bg-black/30 backdrop-blur-sm rounded-full flex flex-col items-center justify-center text-white active:scale-95 transition-all border border-white/10"
              >
                <i className="fas fa-sync-alt text-lg mb-0.5"></i>
                <span className="text-[7px] font-black uppercase tracking-tighter">切换</span>
              </button>
            </div>

            {/* 扫描框覆盖层 - 在视频上方显示自定义扫描框 */}
            <div className="absolute inset-0 z-[50] pointer-events-none">
              {/* 扫描框 - 使用 CSS 绘制边框，与 html5-qrcode 的 qrbox 位置一致 */}
              <div 
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                style={{ width: scannerBoxSize, height: scannerBoxSize }}
              >
                {/* 四角框 */}
                <div className={`absolute top-0 left-0 w-16 h-16 border-l-4 border-t-4 rounded-tl-xl transition-colors duration-300 ${
                  scanFlash === 'green' ? 'border-emerald-400' : scanFlash === 'red' ? 'border-red-400' : 'border-white'
                }`}></div>
                <div className={`absolute top-0 right-0 w-16 h-16 border-r-4 border-t-4 rounded-tr-xl transition-colors duration-300 ${
                  scanFlash === 'green' ? 'border-emerald-400' : scanFlash === 'red' ? 'border-red-400' : 'border-white'
                }`}></div>
                <div className={`absolute bottom-0 left-0 w-16 h-16 border-l-4 border-b-4 rounded-bl-xl transition-colors duration-300 ${
                  scanFlash === 'green' ? 'border-emerald-400' : scanFlash === 'red' ? 'border-red-400' : 'border-white'
                }`}></div>
                <div className={`absolute bottom-0 right-0 w-16 h-16 border-r-4 border-b-4 rounded-br-xl transition-colors duration-300 ${
                  scanFlash === 'green' ? 'border-emerald-400' : scanFlash === 'red' ? 'border-red-400' : 'border-white'
                }`}></div>
                
                {/* 扫描线动画 */}
                <div className={`absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan-line shadow-[0_0_20px_rgba(59,130,246,0.8)] ${
                  scanFlash === 'green' ? 'via-emerald-400 shadow-emerald-400' : scanFlash === 'red' ? 'via-red-400 shadow-red-400' : ''
                }`} style={{
                  top: scanStatus === 'scanning' ? '0%' : '50%',
                  opacity: scanStatus === 'scanning' ? 1 : 0
                }}></div>
              </div>

              {/* 遮罩 - 四周暗化，中间透明 */}
              <div className="absolute inset-0">
                <div className="absolute inset-0 bg-black/50"></div>
                <div 
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] transition-all duration-300"
                  style={{ width: scannerBoxSize, height: scannerBoxSize }}
                ></div>
              </div>
            </div>

            {/* 底部提示 (仅竖屏显示) */}
            {!isLandscape && (
              <div className="absolute bottom-0 left-0 right-0 p-6 z-10 bg-gradient-to-t from-black/60 to-transparent">
                <div className="text-center">
                  <p className="text-white font-bold tracking-widest text-base drop-shadow-lg">
                    {scanStatus === 'processing' ? '核验中...' : '将乘客二维码放入框内'}
                  </p>
                  <p className="text-white/50 text-xs mt-2 italic">
                    系统将自动识别加密凭证
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 核验结果与统计区域 (右侧面板 - 仅横屏显示) */}
          {isLandscape && (
            <div className="w-2/5 h-full bg-slate-900 flex flex-col relative z-[70] shadow-2xl border-l border-white/10">
              <div className="flex-1 flex flex-col p-8 overflow-y-auto">
                <div className="mb-8">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">核验中心 · VERIFICATION</p>
                  <h2 className="text-2xl font-black text-white">实时核验结果</h2>
                </div>

                {/* 当前核验状态卡片 */}
                <div className={`rounded-3xl p-6 transition-all duration-500 ${
                  !lastPassengerData ? 'bg-white/5 border border-white/10' : 
                  scanFlash === 'green' || scanStatus === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]' :
                  scanFlash === 'red' || scanStatus === 'error' ? 'bg-rose-500/10 border border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.1)]' :
                  'bg-white/5 border border-white/10'
                }`}>
                  {!lastPassengerData ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                        <i className="fas fa-qrcode text-2xl text-slate-600"></i>
                      </div>
                      <p className="text-slate-400 font-bold">等待扫描乘客二维码</p>
                      <p className="text-[10px] text-slate-600 mt-2 uppercase tracking-tighter">请将二维码放入左侧识别区</p>
                    </div>
                  ) : (
                    <div className="animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between mb-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                          scanFlash === 'green' || scanStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                        }`}>
                          <i className={`fas ${scanFlash === 'green' || scanStatus === 'success' ? 'fa-check' : 'fa-times'} text-2xl`}></i>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-black uppercase tracking-widest ${
                            scanFlash === 'green' || scanStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {scanFlash === 'green' || scanStatus === 'success' ? '核验通过' : '核验失败'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-1">{lastPassengerData.time}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-6">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">乘客姓名</p>
                          <p className="text-3xl font-black text-white tracking-tight leading-none">{lastPassengerData.name || '未知乘客'}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 pt-6 border-t border-white/5">
                          <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">所属单位 / 公司</p>
                            <p className="text-sm font-bold text-slate-300">{lastPassengerData.company || '个人用户'}</p>
                          </div>
                          {lastPassengerData.position && (
                            <div>
                              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">职位 / 角色</p>
                              <p className="text-sm font-bold text-slate-300">{lastPassengerData.position}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 底部统计 */}
                <div className="mt-auto pt-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-[2rem] p-5 border border-white/5">
                      <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-2">今日已核销</p>
                      <div className="flex items-baseline space-x-1">
                        <p className="text-3xl font-black text-white font-mono">{verifiedCount}</p>
                        <p className="text-[10px] text-slate-600 font-bold uppercase">人次</p>
                      </div>
                    </div>
                    <div className="bg-blue-600/10 rounded-[2rem] p-5 border border-blue-500/20">
                      <p className="text-[9px] text-blue-400 font-black uppercase tracking-widest mb-2">本站待乘</p>
                      <div className="flex items-baseline space-x-1">
                        <p className="text-3xl font-black text-white font-mono">{state.stops?.[state.currentStopIndex]?.waitingCount ?? 0}</p>
                        <p className="text-[10px] text-blue-800 font-bold uppercase">人</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverView;
