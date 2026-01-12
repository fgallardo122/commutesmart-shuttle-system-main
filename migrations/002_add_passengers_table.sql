-- Add passengers table for detailed passenger information
-- Created: 2026-01-12

CREATE TABLE IF NOT EXISTS passengers (
  passenger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  name text NOT NULL,
  company text,
  position text,
  phone text NOT NULL,
  status text CHECK (status IN ('ACTIVE', 'INACTIVE')) DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE passengers IS '乘客详细信息表';
COMMENT ON COLUMN passengers.user_id IS '关联用户ID（登录账号）';
COMMENT ON COLUMN passengers.name IS '乘客姓名';
COMMENT ON COLUMN passengers.company IS '所属公司';
COMMENT ON COLUMN passengers.position IS '职位';
COMMENT ON COLUMN passengers.phone IS '手机号码';
COMMENT ON COLUMN passengers.status IS '乘客状态: ACTIVE-活跃, INACTIVE-停用';

CREATE INDEX idx_passengers_user_id ON passengers(user_id);
CREATE INDEX idx_passengers_phone ON passengers(phone);
CREATE INDEX idx_passengers_status ON passengers(status);

-- Insert the specific passenger requested: Chen Ziyu
-- First, create a user account for the passenger
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Create user account with openid based on phone number
  INSERT INTO users (id, openid, role, status)
  VALUES (gen_random_uuid(), 'passenger_18559279970', 'PASSENGER', 1)
  ON CONFLICT (openid) DO NOTHING
  RETURNING id INTO v_user_id;
  
  -- If user already existed, get their ID
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM users WHERE openid = 'passenger_18559279970';
  END IF;
  
  -- Insert passenger details (using ON CONFLICT with proper constraint)
  INSERT INTO passengers (user_id, name, company, position, phone, status)
  VALUES (v_user_id, '陈子瑜', '厦门轨道集团商业物业公司', '经理', '18559279970', 'ACTIVE')
  ON CONFLICT (user_id) DO NOTHING;
END $$;
