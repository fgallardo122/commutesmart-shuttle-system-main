#!/bin/bash

# Configuration
SERVER_IP="43.133.35.233"
USER="ubuntu"
PASS="Aa89566530"
REMOTE_PATH="/home/ubuntu/commutesmart"

echo "========================================"
echo "CommuteSmart Deployment Script"
echo "========================================"

# 1. Build Frontend
echo "Step 1: Building frontend..."
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "Build failed! Aborting."
    exit 1
fi

# 2. Upload Files
echo "Step 2: Uploading files to server..."

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo "Error: sshpass is not installed. Please install it (brew install sshpass) or use manual password entry."
    # Fallback to standard scp/ssh if sshpass is missing? 
    # For now, let's assume user can install it or we prompt.
    echo "Trying standard scp (you may need to enter password multiple times)..."
    
    scp -r dist/* $USER@$SERVER_IP:$REMOTE_PATH/dist/
    scp api-server.cjs package.json package-lock.json $USER@$SERVER_IP:$REMOTE_PATH/
else
    sshpass -p "$PASS" scp -o StrictHostKeyChecking=no -r dist/* $USER@$SERVER_IP:$REMOTE_PATH/dist/
    sshpass -p "$PASS" scp -o StrictHostKeyChecking=no api-server.cjs package.json package-lock.json $USER@$SERVER_IP:$REMOTE_PATH/
fi

# 3. Restart Server
echo "Step 3: Restarting server..."
CMD="cd $REMOTE_PATH && npm install --production && (pm2 restart commutesmart || pm2 start api-server.cjs --name commutesmart || node api-server.cjs)"

if ! command -v sshpass &> /dev/null; then
    ssh $USER@$SERVER_IP "$CMD"
else
    sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no $USER@$SERVER_IP "$CMD"
fi

echo "========================================"
echo "Deployment Complete!"
echo "Verify at: https://tq.amtr.cloud/"
echo "========================================"
