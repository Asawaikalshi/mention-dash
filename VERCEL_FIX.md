# Vercel Deployment Fix

## The Problem
The 500 error is happening because Vercel serverless functions lose in-memory storage between requests.

## Quick Fix: Disable Webhooks Temporarily

Until we set up Vercel KV, you can still use the app for files <10 minutes.

**In your .env on Vercel**, remove or comment out:
```
# WEBHOOK_URL=https://mention-dash.vercel.app/api/webhook/transcription
```

This will make ALL files use synchronous transcription (works but may timeout on very long files).

## Proper Fix: Set Up Vercel KV

1. Go to https://vercel.com/dashboard
2. Click **Storage** → **Create Database** → **KV**
3. Name it `mention-kv`
4. Click **Connect Project** → Select `mention-dash` → **Production**
5. Push the code with the helper functions I added

The code automatically detects `KV_REST_API_URL` and uses Redis instead of memory.
