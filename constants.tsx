
import { ShuttleStop } from './types';

export const MOCK_STOPS: ShuttleStop[] = [
  { id: '1', name: '两岸金融中心地铁站3入口', lat: 24.5123, lng: 118.1812, waitingCount: 12, estimatedArrival: '07:45' },
  { id: '2', name: '鼎丰财富中心', lat: 24.5155, lng: 118.1845, waitingCount: 5, estimatedArrival: '07:55' },
  { id: '3', name: '海西金融广场', lat: 24.5188, lng: 118.1878, waitingCount: 8, estimatedArrival: '08:05' },
  { id: '4', name: '万科云玺', lat: 24.5211, lng: 118.1911, waitingCount: 0, estimatedArrival: '08:15' },
];

export const LINE_INFO = {
  name: '两岸金融中心班车服务',
  operatingDays: '仅工作日运行',
  peak: {
    morningWindow: '07:45-09:45',
    eveningWindow: '17:45-19:45'
  },
  minTripsPerDay: 14,
  route: {
    start: '两岸金融中心地铁站3入口',
    end: '万科云玺',
    via: ['鼎丰财富中心', '海西金融广场']
  }
};

export const DYNAMIC_QR_REFRESH_SECONDS = 180; // 3分钟

export const VEHICLE_INFO = {
  plate: '闽 D01982D',
  engine: 'KLG157G:70012',
  driverName: '吕庆刚',
  driverPhone: '13959282886',
  schedule: {
    morning: ['07:45', '08:05', '08:25', '08:45', '09:05', '09:25', '09:45'],
    evening: ['17:45', '18:05', '18:25', '18:45', '19:05', '19:25', '19:45']
  }
};
