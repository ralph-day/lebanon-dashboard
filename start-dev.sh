#!/bin/bash
export PATH=/Users/ralphbaydoun/.nvm/versions/node/v20.20.2/bin:$PATH

# Start mock API server
cd /Users/ralphbaydoun/lebanon-dashboard/server
DEV_EXCEL_PATH="../Lebanon 2026 - Analysis.xlsx" node dev-mock.js &

sleep 1

# Start Vite dev server
cd /Users/ralphbaydoun/lebanon-dashboard/client
npm run dev -- --port 5173
