/**
 * 日期和时间工具函数
 * 用于工作日判断、班次计算等
 */

export interface Holiday {
  holiday_date: string;
  name: string;
  is_workday: boolean;
  description?: string;
}

export interface Schedule {
  schedule_id: string;
  departure_time: string;
  schedule_type: 'MORNING' | 'EVENING' | 'MIDDAY' | 'SPECIAL';
  is_active: boolean;
}

/**
 * 判断指定日期是否为工作日
 * @param date 要检查的日期
 * @param holidays 节假日配置（可选）
 * @returns true-工作日, false-非工作日
 */
export function isWorkday(date: Date, holidays?: Holiday[]): boolean {
  const day = date.getDay();
  
  // 周六、周日默认非工作日
  const isWeekend = day === 0 || day === 6;
  
  // 检查是否在节假日配置中
  if (holidays && holidays.length > 0) {
    const dateStr = date.toISOString().split('T')[0];
    const holiday = holidays.find(h => h.holiday_date === dateStr);
    
    if (holiday) {
      // 如果是节假日但标记为工作日（调休）
      return holiday.is_workday;
    }
  }
  
  // 默认逻辑：周一到周五为工作日
  return !isWeekend;
}

/**
 * 获取下一班发车时间
 * @param schedules 班次列表
 * @param currentTime 当前时间（可选，默认为现在）
 * @returns 下一班信息，如果没有返回null
 */
export function getNextDeparture(
  schedules: Schedule[],
  currentTime?: Date
): {
  schedule: Schedule;
  time: string;
  countdown: string;
  minutesUntil: number;
} | null {
  const now = currentTime || new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // 过滤出今天有效的班次
  const activeSchedules = schedules
    .filter(s => s.is_active)
    .sort((a, b) => {
      const aTime = parseTime(a.departure_time);
      const bTime = parseTime(b.departure_time);
      return aTime - bTime;
    });
  
  // 查找下一班
  for (const schedule of activeSchedules) {
    const scheduleMinutes = parseTime(schedule.departure_time);
    
    if (scheduleMinutes > currentMinutes) {
      const minutesUntil = scheduleMinutes - currentMinutes;
      const countdown = formatCountdown(minutesUntil);
      
      return {
        schedule,
        time: schedule.departure_time,
        countdown,
        minutesUntil
      };
    }
  }
  
  // 如果今天没有下一班，返回null
  return null;
}

/**
 * 获取当前时段的班次类型
 * @param currentTime 当前时间（可选）
 * @returns 班次类型
 */
export function getCurrentPeriod(currentTime?: Date): 'MORNING' | 'EVENING' | 'MIDDAY' | 'NONE' {
  const now = currentTime || new Date();
  const hour = now.getHours();
  
  if (hour >= 7 && hour < 10) {
    return 'MORNING';
  } else if (hour >= 17 && hour < 20) {
    return 'EVENING';
  } else if (hour >= 10 && hour < 17) {
    return 'MIDDAY';
  }
  
  return 'NONE';
}

/**
 * 计算预计到达时间
 * @param departureTime 发车时间 (HH:mm格式)
 * @param stopIndex 站点索引（0-based，0为起点）
 * @param estimatedDurations 各站点预计时长数组（分钟），从第2站开始
 * @returns 预计到达时间字符串 (HH:mm格式)
 */
export function calculateArrivalTime(
  departureTime: string,
  stopIndex: number,
  estimatedDurations: number[]
): string {
  const [hours, minutes] = departureTime.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;
  
  // 累加到目标站点的时间（从第二站开始，i=1）
  for (let i = 1; i <= stopIndex; i++) {
    totalMinutes += estimatedDurations[i] || 0;
  }
  
  const arrivalHours = Math.floor(totalMinutes / 60) % 24;
  const arrivalMinutes = totalMinutes % 60;
  
  return `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMinutes).padStart(2, '0')}`;
}

/**
 * 格式化倒计时文本
 * @param minutes 剩余分钟数
 * @returns 格式化的倒计时文本
 */
export function formatCountdown(minutes: number): string {
  if (minutes < 0) return '已发车';
  if (minutes === 0) return '即将发车';
  if (minutes < 60) return `${minutes}分钟后`;
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (mins === 0) return `${hours}小时后`;
  return `${hours}小时${mins}分钟后`;
}

/**
 * 解析时间字符串为分钟数
 * @param timeStr 时间字符串 (HH:mm格式)
 * @returns 从00:00开始的分钟数
 */
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 格式化日期为中文显示
 * @param date 日期对象
 * @returns 格式化的日期字符串
 */
export function formatDateChinese(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekDay = weekDays[date.getDay()];
  
  return `${year}年${month}月${day}日 星期${weekDay}`;
}

/**
 * 判断是否在运营时间段内
 * @param currentTime 当前时间（可选）
 * @returns true-运营中, false-停运
 */
export function isOperatingHours(currentTime?: Date): boolean {
  const now = currentTime || new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentMinutes = hour * 60 + minute;
  
  // 早班: 07:45-09:45 (465-585分钟)
  const morningStart = 7 * 60 + 45;
  const morningEnd = 9 * 60 + 45;
  
  // 晚班: 17:45-19:45 (1065-1185分钟)
  const eveningStart = 17 * 60 + 45;
  const eveningEnd = 19 * 60 + 45;
  
  return (
    (currentMinutes >= morningStart && currentMinutes <= morningEnd) ||
    (currentMinutes >= eveningStart && currentMinutes <= eveningEnd)
  );
}

/**
 * 获取今天的日期字符串（YYYY-MM-DD格式）
 * @returns 日期字符串
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 使用Haversine公式计算两个地理坐标之间的距离
 * @param lat1 第一个点的纬度
 * @param lng1 第一个点的经度
 * @param lat2 第二个点的纬度
 * @param lng2 第二个点的经度
 * @returns 距离（单位：千米）
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // 地球半径（千米）
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * 判断是否临近发车（5分钟内）
 * @param departureTime 发车时间 (HH:mm)
 * @param currentTime 当前时间（可选）
 * @returns true-临近发车, false-未临近
 */
export function isNearDeparture(departureTime: string, currentTime?: Date): boolean {
  const now = currentTime || new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const departureMinutes = parseTime(departureTime);
  const diff = departureMinutes - currentMinutes;
  
  return diff >= 0 && diff <= 5;
}
