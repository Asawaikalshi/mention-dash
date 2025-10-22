# Quick Setup Guide

Follow these steps to get your video transcription app running:

## Step 1: Get Your API Key

1. Visit [ElevenLabs](https://elevenlabs.io/)
2. Sign up or log in
3. Go to your profile (top right) → API Keys
4. Click "Create API Key" if needed
5. Copy your API key

## Step 2: Configure the App

Create a `.env` file in this directory:

```bash
# Copy the example file
cp .env.example .env

# Or create manually with:
echo "ELEVENLABS_API_KEY=your_key_here" > .env
```

Then edit `.env` and replace `your_key_here` with your actual API key.

## Step 3: Install & Run

```bash
# Install dependencies (only needed once)
npm install

# Start the server
npm run dev
```

## Step 4: Use the App

1. Open http://localhost:3000 in your browser
2. Drag and drop a video file (or click to browse)
3. Click "Upload & Transcribe"
4. Wait for processing (progress bar will show status)
5. View and download your transcription!

## Troubleshooting

### Server won't start
```bash
# Make sure dependencies are installed
npm install

# Check if port 3000 is already in use
# Change PORT in .env if needed
```

### "API key not configured" error
```bash
# Check .env file exists
ls -la .env

# Check content
cat .env

# Make sure it says:
# ELEVENLABS_API_KEY=your_actual_key_here
```

### Upload fails
- File must be < 500MB
- Supported formats: MP4, MOV, AVI, MKV, MP3, WAV, M4A
- Check browser console (F12) for errors

## Testing

Try with a short video first (1-2 minutes) to test the setup.

## What's Included

✅ Modern, responsive UI
✅ Drag & drop file upload
✅ Real-time progress tracking
✅ Speaker diarization (who said what)
✅ Timestamps for every word
✅ JSON export functionality
✅ Clean, professional results view

## Need Help?

Check [README.md](README.md) for detailed documentation.

---

**First time setup should take < 5 minutes!** 🚀
