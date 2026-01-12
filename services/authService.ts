import { UserRole } from '../types';
import { fetchJson } from './fetchJson';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    role: UserRole;
    device_id: string | null;
  };
}

export const login = async (role: UserRole): Promise<LoginResponse> => {
  // In a real app, we would get the OpenID from Wechat/Auth provider
  // For this prototype, we map roles to the mock OpenIDs seeded in the database
  let openid = '';
  switch (role) {
    case UserRole.ADMIN:
      openid = 'admin_openid_123';
      break;
    case UserRole.DRIVER:
      openid = 'driver_openid_456';
      break;
    case UserRole.PASSENGER:
      openid = 'passenger_openid_789';
      break;
  }

  return fetchJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ openid })
  });
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getToken = () => localStorage.getItem('token');
