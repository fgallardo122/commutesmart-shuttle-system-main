-- CommuteSmart 核心业务表扩展
-- 创建日期: 2026-01-11
-- 用途: 支持班次管理、车辆管理、司机管理、行程追踪

-- ============================================
-- 1. 车辆表
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL UNIQUE,
  engine_number text,
  capacity integer DEFAULT 45,
  status text CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'RETIRED')) DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vehicles IS '车辆信息表';
COMMENT ON COLUMN vehicles.plate_number IS '车牌号码';
COMMENT ON COLUMN vehicles.engine_number IS '发动机号';
COMMENT ON COLUMN vehicles.capacity IS '载客量';
COMMENT ON COLUMN vehicles.status IS '车辆状态: ACTIVE-运营中, MAINTENANCE-维护中, RETIRED-已退役';

-- ============================================
-- 2. 司机表
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
  driver_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  name text NOT NULL,
  phone text NOT NULL,
  license_number text,
  status text CHECK (status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE')) DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE drivers IS '司机信息表';
COMMENT ON COLUMN drivers.user_id IS '关联用户ID（登录账号）';
COMMENT ON COLUMN drivers.license_number IS '驾驶证号';
COMMENT ON COLUMN drivers.status IS '司机状态: ACTIVE-在职, INACTIVE-离职, ON_LEAVE-请假';

CREATE INDEX idx_drivers_user_id ON drivers(user_id);
CREATE INDEX idx_drivers_status ON drivers(status);

-- ============================================
-- 3. 线路表
-- ============================================
CREATE TABLE IF NOT EXISTS routes (
  route_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  operating_days jsonb DEFAULT '{"type": "weekdays", "exceptions": []}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE routes IS '线路信息表';
COMMENT ON COLUMN routes.operating_days IS '运营日期配置 (JSON): {"type": "weekdays|weekends|daily", "exceptions": ["2026-01-01", "2026-01-02"]} - type指定基本运营规则，exceptions为例外日期数组';

-- ============================================
-- 4. 线路站点关联表
-- ============================================
CREATE TABLE IF NOT EXISTS route_stops (
  route_id uuid REFERENCES routes(route_id) ON DELETE CASCADE,
  stop_id integer REFERENCES stops(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  estimated_duration_minutes integer DEFAULT 10,
  PRIMARY KEY (route_id, stop_id)
);

COMMENT ON TABLE route_stops IS '线路站点关联表';
COMMENT ON COLUMN route_stops.sequence IS '站点顺序';
COMMENT ON COLUMN route_stops.estimated_duration_minutes IS '从上一站到此站的预计时长（分钟）';

CREATE INDEX idx_route_stops_route ON route_stops(route_id);

-- ============================================
-- 5. 班次表
-- ============================================
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES routes(route_id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(vehicle_id),
  driver_id uuid REFERENCES drivers(driver_id),
  departure_time time NOT NULL,
  schedule_type text CHECK (schedule_type IN ('MORNING', 'EVENING', 'MIDDAY', 'SPECIAL')) NOT NULL,
  is_active boolean DEFAULT true,
  effective_from date,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schedules IS '班次时刻表';
COMMENT ON COLUMN schedules.departure_time IS '发车时间';
COMMENT ON COLUMN schedules.schedule_type IS '班次类型: MORNING-早班, EVENING-晚班, MIDDAY-午班, SPECIAL-临时加班';
COMMENT ON COLUMN schedules.effective_from IS '生效起始日期';
COMMENT ON COLUMN schedules.effective_until IS '生效结束日期';

CREATE INDEX idx_schedules_route ON schedules(route_id);
CREATE INDEX idx_schedules_time ON schedules(departure_time);
CREATE INDEX idx_schedules_active ON schedules(is_active);

-- ============================================
-- 6. 行程表（实际运行记录）
-- ============================================
CREATE TABLE IF NOT EXISTS trips (
  trip_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES schedules(schedule_id),
  route_id uuid REFERENCES routes(route_id),
  vehicle_id uuid REFERENCES vehicles(vehicle_id),
  driver_id uuid REFERENCES drivers(driver_id),
  trip_date date NOT NULL,
  status text CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')) DEFAULT 'SCHEDULED',
  actual_departure_time timestamptz,
  actual_arrival_time timestamptz,
  delay_minutes integer DEFAULT 0,
  cancellation_reason text,
  passenger_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE trips IS '行程实际执行记录表';
COMMENT ON COLUMN trips.status IS '行程状态: SCHEDULED-已排班, IN_PROGRESS-进行中, COMPLETED-已完成, CANCELLED-已取消';
COMMENT ON COLUMN trips.delay_minutes IS '延误时长（分钟）';
COMMENT ON COLUMN trips.passenger_count IS '实际乘客数';

CREATE INDEX idx_trips_date ON trips(trip_date);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_schedule ON trips(schedule_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);

-- ============================================
-- 7. 行程事件表（异常记录）
-- ============================================
CREATE TABLE IF NOT EXISTS trip_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES trips(trip_id) ON DELETE CASCADE,
  event_type text CHECK (event_type IN ('DELAY', 'CANCELLATION', 'ROUTE_CHANGE', 'BREAKDOWN', 'TRAFFIC', 'WEATHER')) NOT NULL,
  description text,
  severity text CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')) DEFAULT 'INFO',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE trip_events IS '行程事件/异常记录表';
COMMENT ON COLUMN trip_events.event_type IS '事件类型: DELAY-延误, CANCELLATION-取消, ROUTE_CHANGE-改线, BREAKDOWN-故障, TRAFFIC-交通拥堵, WEATHER-天气原因';
COMMENT ON COLUMN trip_events.severity IS '严重程度: INFO-信息, WARNING-警告, CRITICAL-严重';

CREATE INDEX idx_trip_events_trip ON trip_events(trip_id);
CREATE INDEX idx_trip_events_type ON trip_events(event_type);

-- ============================================
-- 8. 节假日配置表
-- ============================================
CREATE TABLE IF NOT EXISTS holidays (
  holiday_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  is_workday boolean DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE holidays IS '节假日配置表';
COMMENT ON COLUMN holidays.is_workday IS '是否为工作日（调休）';

CREATE INDEX idx_holidays_date ON holidays(holiday_date);

-- ============================================
-- 9. 扩展核销记录表
-- ============================================
ALTER TABLE verification_logs 
ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(trip_id),
ADD COLUMN IF NOT EXISTS stop_id integer REFERENCES stops(id),
ADD COLUMN IF NOT EXISTS verification_status text CHECK (verification_status IN ('SUCCESS', 'FAILED')) DEFAULT 'SUCCESS',
ADD COLUMN IF NOT EXISTS failure_reason text,
ADD COLUMN IF NOT EXISTS device_info jsonb;

COMMENT ON COLUMN verification_logs.trip_id IS '关联行程ID';
COMMENT ON COLUMN verification_logs.stop_id IS '核销站点ID';
COMMENT ON COLUMN verification_logs.verification_status IS '核销状态: SUCCESS-成功, FAILED-失败';
COMMENT ON COLUMN verification_logs.failure_reason IS '失败原因: EXPIRED-已过期, ALREADY_USED-已使用, INVALID_TICKET-无效票据';
COMMENT ON COLUMN verification_logs.device_info IS '设备信息（JSON格式）';

CREATE INDEX IF NOT EXISTS idx_verification_logs_trip ON verification_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_stop ON verification_logs(stop_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_status ON verification_logs(verification_status);

-- ============================================
-- 初始化数据
-- ============================================

-- 插入当前车辆
INSERT INTO vehicles (plate_number, engine_number, capacity, status)
VALUES ('闽D01982D', 'KLG157G:70012', 45, 'ACTIVE')
ON CONFLICT (plate_number) DO NOTHING;

-- 插入司机、线路、班次（需要先有对应的user记录）
DO $$
DECLARE
  v_driver_user_id uuid;
  v_vehicle_id uuid;
  v_route_id uuid;
  v_driver_id uuid;
BEGIN
  -- 查找或创建司机用户账号
  SELECT id INTO v_driver_user_id FROM users WHERE role = 'DRIVER' LIMIT 1;
  
  IF v_driver_user_id IS NOT NULL THEN
    INSERT INTO drivers (user_id, name, phone, license_number, status)
    VALUES (v_driver_user_id, '吕庆刚', '13959282886', NULL, 'ACTIVE')
    ON CONFLICT DO NOTHING
    RETURNING driver_id INTO v_driver_id;
  END IF;
  
  -- 插入默认线路
  INSERT INTO routes (name, description, operating_days, is_active)
  VALUES (
    '两岸金融中心班车服务',
    '两岸金融中心地铁站3入口 ↔ 万科云玺',
    '{"type": "weekdays", "exceptions": []}'::jsonb,
    true
  )
  RETURNING route_id INTO v_route_id;
  
  -- 关联线路站点（修正站点名称为合同版本）
  INSERT INTO route_stops (route_id, stop_id, sequence, estimated_duration_minutes)
  VALUES 
    (v_route_id, 1, 1, 0),   -- 两岸金融中心地铁站3入口（起点）
    (v_route_id, 2, 2, 10),  -- 鼎丰财富中心
    (v_route_id, 3, 3, 10),  -- 海西金融广场
    (v_route_id, 4, 4, 10);  -- 万科云玺（终点）
  
  -- 获取车辆ID
  SELECT vehicle_id INTO v_vehicle_id FROM vehicles WHERE plate_number = '闽D01982D';
  
  -- 插入早班班次
  INSERT INTO schedules (route_id, vehicle_id, driver_id, departure_time, schedule_type, is_active)
  VALUES 
    (v_route_id, v_vehicle_id, v_driver_id, '07:45', 'MORNING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '08:05', 'MORNING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '08:25', 'MORNING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '08:45', 'MORNING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '09:05', 'MORNING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '09:25', 'MORNING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '09:45', 'MORNING', true);
  
  -- 插入晚班班次
  INSERT INTO schedules (route_id, vehicle_id, driver_id, departure_time, schedule_type, is_active)
  VALUES 
    (v_route_id, v_vehicle_id, v_driver_id, '17:45', 'EVENING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '18:05', 'EVENING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '18:25', 'EVENING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '18:45', 'EVENING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '19:05', 'EVENING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '19:25', 'EVENING', true),
    (v_route_id, v_vehicle_id, v_driver_id, '19:45', 'EVENING', true);
  
  -- 插入2026年节假日（示例）
  INSERT INTO holidays (holiday_date, name, is_workday, description)
  VALUES 
    ('2026-01-01', '元旦', false, '2026年元旦'),
    ('2026-01-02', '元旦调休', false, '2026年元旦假期'),
    ('2026-01-03', '元旦调休', false, '2026年元旦假期')
  ON CONFLICT (holiday_date) DO NOTHING;
  
END $$;

-- 更新站点名称为合同标准版本
UPDATE stops SET name = '两岸金融中心地铁站3入口', updated_at = NOW() WHERE id = 1;
