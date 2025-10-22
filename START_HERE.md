# 🚀 START HERE - Quick Setup

## You're 3 steps away from transcribing videos!

### Step 1: Get Your API Key (2 minutes)

1. Go to https://elevenlabs.io/
2. Sign up or log in
3. Click your profile (top right) → **API Keys**
4. Copy your API key

### Step 2: Configure (1 minute)

```bash
# Create .env file
echo "ELEVENLABS_API_KEY=paste_your_key_here" > .env
```

**Replace `paste_your_key_here` with your actual API key!**

### Step 3: Run (2 minutes)

```bash
# Install dependencies (first time only)
npm install

# Start the server
npm run dev
```

## ✅ That's it!

Open your browser at: **http://localhost:3000**

You'll see a beautiful interface where you can:
1. **Drag & drop** your video
2. Click **"Upload & Transcribe"**
3. **Wait** for processing (progress bar shows status)
4. **View results** with speaker identification
5. **Download** as JSON

---

## What Can You Upload?

✅ Video: MP4, MOV, AVI, MKV
✅ Audio: MP3, WAV, M4A
✅ Max size: 500MB

---

## Need More Info?

- **Quick setup**: [SETUP.md](SETUP.md)
- **Full guide**: [README.md](README.md)
- **Technical details**: [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

---

## Troubleshooting

### "API key not configured"
Check your .env file:
```bash
cat .env
```
Should show: `ELEVENLABS_API_KEY=your_key_here`

### Can't access http://localhost:3000
- Check if server started successfully
- Look for "Server running on http://localhost:3000" message
- Try a different port: `PORT=3001 npm run dev`

### Upload fails
- Check file is < 500MB
- Verify format is supported
- Press F12 in browser to see console errors

---

## First Time? Try This:

1. Upload a **short video** (1-2 minutes) first
2. Perfect for testing the setup
3. Longer videos take more time to process

---

**Total setup time: < 5 minutes** ⏱️

**Let's go!** 🎥✨
