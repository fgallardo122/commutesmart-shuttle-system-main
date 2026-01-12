# Camera Switching Fix

## Problem
The camera switching functionality could not properly switch to the rear camera.

## Root Cause
The `switchCamera` function had the following issues:

1. When switching from `facingMode` to `deviceId` mode, it didn't intelligently select the camera matching the desired facing direction (front/rear)
2. When already in `deviceId` mode, the `currentFacingMode` state wasn't being updated to reflect the actual camera in use
3. The camera selection logic relied on simple list rotation which didn't guarantee switching to the specific desired camera (front vs rear)

## Solution

### Enhanced Camera Selection (Lines 307-343)
When switching from `facingMode` to `deviceId` mode:
- **Smart lookup**: Search for cameras by label keywords
  - Rear camera: "back", "rear", "environment"
  - Front camera: "front", "user", "face"
- **Fallback**: If no matching camera found, use rotation through the list
- **State sync**: Update both `currentCameraId`, `currentFacingMode`, and `usingFacingMode`

### State Consistency in deviceId Mode (Lines 344-360)
When already in `deviceId` mode:
- **Detect camera type**: Determine if the new camera is front or rear based on its label
- **Update state**: Keep `currentFacingMode` in sync with the actual camera

## Testing
Build verification passed successfully with `npm run build`.

## Files Changed
- `components/DriverView.tsx`: Enhanced `switchCamera` function (lines 296-361)
- `.gitignore`: Added to exclude build artifacts and dependencies
