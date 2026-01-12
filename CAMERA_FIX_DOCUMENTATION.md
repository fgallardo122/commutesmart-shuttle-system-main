# Camera Switching Fix

## Problem
The camera switching functionality could not properly switch to the rear camera.

## Root Cause
The `switchCamera` function had the following issues:

1. When switching from `facingMode` to `deviceId` mode, it didn't intelligently select the camera matching the desired facing direction (front/rear)
2. When already in `deviceId` mode, the `currentFacingMode` state wasn't being updated to reflect the actual camera in use
3. The camera selection logic relied on simple list rotation which didn't guarantee switching to the specific desired camera (front vs rear)
4. Camera detection logic was duplicated in multiple places, making it harder to maintain

## Solution

### 1. Utility Functions (Lines 41-78)
Created two reusable utility functions to improve code quality:

#### `detectCameraFacingMode(camera: CameraDevice)`
- Detects whether a camera is front or rear based on its label
- Supports multiple language keywords:
  - English: "back", "rear", "environment" (rear), "front", "user", "face" (front)
  - Chinese: "后", "後" (rear), "前" (front)
- Defaults to "environment" (rear) for unknown cameras

#### `findCameraByFacingMode(cameras, desiredFacingMode)`
- Searches camera list for a camera matching the desired facing mode
- Uses `detectCameraFacingMode` for consistent detection logic

### 2. Enhanced Camera Selection (Lines 340-368)
When switching from `facingMode` to `deviceId` mode:
- **Smart lookup**: Uses `findCameraByFacingMode` to find the appropriate camera
- **Fallback**: If no matching camera found, uses rotation through the list
- **State sync**: Updates `currentCameraId`, `currentFacingMode`, and `usingFacingMode`

### 3. State Consistency in deviceId Mode (Lines 370-382)
When already in `deviceId` mode:
- **Detect camera type**: Uses `detectCameraFacingMode` to determine camera type
- **Update state**: Keeps `currentFacingMode` in sync with the actual camera

### 4. Initial Camera Detection (Lines 288-312)
- Uses `findCameraByFacingMode` for consistent camera detection
- Ensures UI displays correct device name on initial load

## Testing
Build verification passed successfully with `npm run build`.

## Files Changed
- `components/DriverView.tsx`: 
  - Added utility functions `detectCameraFacingMode` and `findCameraByFacingMode` (lines 41-78)
  - Enhanced `switchCamera` function (lines 340-389)
  - Updated initial camera detection in `startHtml5Qrcode` (lines 288-319)
- `.gitignore`: Added to exclude build artifacts and dependencies
- `CAMERA_FIX_DOCUMENTATION.md`: This documentation file

## Benefits
1. **Reliability**: Camera switching now works consistently across devices
2. **Maintainability**: Centralized detection logic eliminates code duplication
3. **Internationalization**: Supports Chinese camera labels for broader device compatibility
4. **Robustness**: Fallback mechanism ensures switching works even with unusual camera labels
