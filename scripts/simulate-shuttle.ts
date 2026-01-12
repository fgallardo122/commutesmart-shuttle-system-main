const SHUTTLE_ID = 'default';

const STOPS = [
  { lat: 24.5123, lng: 118.1812 }, // Stop 1
  { lat: 24.5155, lng: 118.1845 }, // Stop 2
  { lat: 24.5188, lng: 118.1878 }, // Stop 3
  { lat: 24.5211, lng: 118.1911 }, // Stop 4
];

let currentIndex = 0;
let progress = 0; // 0 to 1 between stops

const API_URL = process.env.VITE_API_URL || 'http://localhost:5173/api';

async function sendLocation(data: any) {
  try {
    const response = await fetch(`${API_URL}/driver/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DRIVER_TOKEN || 'test-token'}`
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      console.error(`Failed to send location: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error sending location:`, error);
  }
}

function simulate() {
  // Simulate movement
  progress += 0.02; // Move 2% every tick
  if (progress >= 1) {
    progress = 0;
    currentIndex = (currentIndex + 1) % STOPS.length;
  }

  const currentStop = STOPS[currentIndex];
  const nextStop = STOPS[(currentIndex + 1) % STOPS.length];

  // Linear interpolation
  const lat = currentStop.lat + (nextStop.lat - currentStop.lat) * progress;
  const lng = currentStop.lng + (nextStop.lng - currentStop.lng) * progress;

  const data = {
    shuttleId: SHUTTLE_ID,
    coords: { lat, lng },
    speed: 30 + Math.random() * 10,
    heading: 90,
    currentStopIndex: currentIndex,
    distToNext: Math.floor((1 - progress) * 1000)
  };

  console.log(`Sending location: Stop ${currentIndex} -> ${(progress * 100).toFixed(0)}%`);
  sendLocation(data);
}

console.log('Starting shuttle simulator...');
console.log(`API URL: ${API_URL}`);

setInterval(simulate, 2000); // Update every 2 seconds
