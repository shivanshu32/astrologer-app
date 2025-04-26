# Fixing Astrologer Profile and Booking Requests Issues

This guide explains how to fix issues where booking requests aren't appearing in the astrologer app due to problems with astrologer profiles.

## Problem

The astrologer app requires a valid astrologer profile that is properly linked to the user account. If this link is broken or missing, the app won't be able to display booking requests even if they exist in the database.

## Using the Debug Functions in the App

1. **Open the Debug Screen** by going to the Profile tab and tapping "Debug" or "Debug Tools" (may vary depending on version)

2. **Check Astrologer Profile**:
   - Tap on "Check Astrologer Profile" to see if your app can find the astrologer profile
   - If it shows "Profile Not Found", follow the troubleshooting steps below

3. **Test API Connection**:
   - On the Booking Requests screen, tap "Debug Connection" > "Test API Connection"
   - This will check if the app can connect to the API and fetch bookings directly

4. **Check Bookings By Mobile**:
   - On the Booking Requests screen, tap "Debug Connection" > "Lookup Mobile" 
   - Enter your mobile number to check if there are bookings for your number
   - This bypasses the need for an astrologer profile link

## Fixing the Issue

### Option 1: Using the Backend API Directly

The backend has debug endpoints to fix the issue. Use the following commands in a terminal:

```bash
# Check if an astrologer exists for a mobile number
curl http://localhost:5000/api/debug/lookup-astrologer/9876543210

# Fix the link between user and astrologer
curl -X POST http://localhost:5000/api/debug/fix-astrologer-link \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"9876543210"}'

# Check bookings by mobile number
curl -X POST http://localhost:5000/api/debug/check-bookings-by-mobile \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"9876543210"}'
```

### Option 2: Ask the Admin to Fix It

If you can't access the backend directly, provide the following information to the administrator:

1. Your mobile number
2. Your user ID (can be found in the debug screen under AsyncStorage > userData > id)
3. Description of the issue ("Cannot see booking requests, astrologer profile not found")

The admin can run the fix-astrologer-link endpoint with your mobile number to resolve the issue.

## Common Issues and Solutions

### 1. No Astrologer Profile Exists

**Symptoms:**
- Debug screen shows "No astrologer profile could be found for your account"
- You can log in but can't see any bookings

**Solution:**
- The admin needs to create an astrologer profile for your user account using the mobile number

### 2. Profile Exists But Not Linked to User

**Symptoms:**
- You can log in but can't see bookings
- Admin can find your astrologer profile but it's not linked to your user account

**Solution:**
- Admin should use the fix-astrologer-link endpoint with your mobile number

### 3. Wrong Mobile Number

**Symptoms:**
- You can log in but bookings don't appear
- Your user account has a different mobile number than the astrologer profile

**Solution:**
- Admin should update the astrologer profile to use the same mobile number as your user account

## After Fixing

After the admin has fixed the issue:

1. **Log out and log back in** to the astrologer app
2. Check the "Astrologer Profile" in the debug screen to confirm it's working
3. Go to the Booking Requests screen to see if your bookings now appear

If the issue persists, try clearing the app's storage from the Debug screen by tapping "Clear AsyncStorage" and then log in again. 