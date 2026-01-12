
export enum UserRole {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN'
}

export interface UserProfile {
  name: string;
  company: string;
  position: string;
  phone: string;
}

export interface ShuttleStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  waitingCount: number;
  estimatedArrival: string; // HH:mm
}

export interface BusLocation {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  lastUpdated: number;
  distanceToNext: number; // in meters
}

export interface AppState {
  role: UserRole;
  currentStopIndex: number;
  busLocation: BusLocation | null;
  stops: ShuttleStop[];
}
