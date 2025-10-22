# Video Transcription App

A beautiful, modern web application for transcribing videos using the ElevenLabs Speech-to-Text API.

## Features

✨ **Clean, Modern UI** - Beautiful gradient design with smooth animations
🎥 **Drag & Drop Upload** - Easy video file uploading
🎯 **Speaker Diarization** - Identifies different speakers
📊 **Real-time Progress** - Visual feedback during transcription
💾 **Export Results** - Download transcriptions as JSON
🚀 **Fast Processing** - Powered by ElevenLabs Scribe v1 model

## Supported Formats

- **Video**: MP4, MOV, AVI, MKV
- **Audio**: MP3, WAV, M4A
- **Max Size**: 500MB

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Get ElevenLabs API Key

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up or log in
3. Navigate to your profile → API Keys
4. Copy your API key

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
ELEVENLABS_API_KEY=your_actual_api_key_here

# Optional: For files >10 minutes, enable webhook-based async processing
# This requires a publicly accessible HTTPS URL
# WEBHOOK_URL=https://your-domain.com/api/webhook/transcription
```

#### Setting up Webhooks (Optional - for long files >10 min)

For files longer than 10 minutes, the app uses ElevenLabs' webhook API to process transcriptions asynchronously. This:
- ✅ **Eliminates chunking** - processes entire file as one request
- ✅ **Better diarization** - speakers identified across full audio
- ✅ **No timeouts** - transcription happens in background

**Setup Steps:**

1. **Expose your local server publicly (for development):**
   ```bash
   # Install ngrok: https://ngrok.com/
   ngrok http 3000
   ```
   This will give you a public URL like: `https://abc123.ngrok.io`

2. **Configure webhook in ElevenLabs dashboard:**
   - Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/speech-to-text)
   - Navigate to Speech-to-Text webhooks section
   - Create a new webhook with URL: `https://abc123.ngrok.io/api/webhook/transcription`
   - Choose authentication method (HMAC recommended)

3. **Add webhook URL to .env:**
   ```env
   WEBHOOK_URL=https://abc123.ngrok.io/api/webhook/transcription
   ```

4. **Restart the server**

**For production:** Replace ngrok URL with your actual domain's HTTPS endpoint.

### 4. Start the Server

```bash
npm run dev
```

The app will be available at: **http://localhost:3000**

## Usage

1. **Upload Video**
   - Drag and drop a video file, or
   - Click the upload area to browse

2. **Start Transcription**
   - Click "Upload & Transcribe"
   - Wait for processing (progress bar shows status)

3. **View Results**
   - See transcription with speaker identification
   - Timestamps for each section
   - Word-level breakdown

4. **Download**
   - Click "Download JSON" to save the transcription
   - Includes all metadata and timestamps

## API Response Format

```json
{
  "success": true,
  "fileName": "video.mp4",
  "timestamp": "2025-10-12T...",
  "transcription": {
    "words": [
      {
        "text": "Hello",
        "start": 0.5,
        "end": 1.0,
        "speaker_id": "speaker_00"
      }
    ]
  }
}
```

## Project Structure

```
├── server.js           # Express server + ElevenLabs integration
├── public/
│   ├── index.html      # Main UI
│   ├── style.css       # Styling
│   └── app.js          # Frontend logic
├── uploads/            # Temporary file storage
├── .env                # Environment variables (create this)
└── package.json        # Dependencies
```

## Tech Stack

- **Backend**: Node.js + Express
- **File Upload**: Multer
- **API**: ElevenLabs Speech-to-Text
- **Frontend**: Vanilla JavaScript
- **Styling**: Modern CSS with gradients

## Troubleshooting

### "API key not configured" error
- Make sure `.env` file exists
- Check that `ELEVENLABS_API_KEY` is set correctly
- Restart the server after adding the key

### Upload fails
- Check file size (must be < 500MB)
- Verify file format is supported
- Check console for error messages

### Transcription takes too long
- Depends on file length and ElevenLabs API load
- Typical: 1-2 minutes for a 10-minute video
- For files >10 minutes: Set up webhooks for async processing (see setup guide above)

### Webhook not receiving results
- Ensure `WEBHOOK_URL` is set in `.env`
- URL must be publicly accessible via HTTPS
- For local dev, use ngrok: `ngrok http 3000`
- Verify webhook is configured in ElevenLabs dashboard
- Check server console logs for webhook delivery
- Check that webhook URL matches exactly (including `/api/webhook/transcription`)

## Development

```bash
# Start development server
npm run dev

# The server will restart automatically on code changes
```

## API Endpoints

### GET /api/health
Check if API key is configured

**Response:**
```json
{
  "status": "ok",
  "apiKeyConfigured": true
}
```

### POST /api/transcribe
Upload and transcribe a video/audio file

**Request:**
- Content-Type: multipart/form-data
- Body: `video` (file)

**Response (synchronous - files <10 min):**
```json
{
  "success": true,
  "useWebhook": false,
  "fileName": "video.mp4",
  "videoUrl": "/api/video/...",
  "videoId": "...",
  "transcription": { ... },
  "timestamp": "2025-10-12T..."
}
```

**Response (async webhook - files >10 min):**
```json
{
  "success": true,
  "useWebhook": true,
  "requestId": "req_abc123",
  "fileName": "video.mp4",
  "videoUrl": "/api/video/...",
  "videoId": "...",
  "timestamp": "2025-10-12T..."
}
```

### GET /api/transcription/status/:requestId
Poll for async transcription status

**Response (processing):**
```json
{
  "status": "processing",
  "fileName": "video.mp4",
  "videoUrl": "/api/video/...",
  "videoId": "...",
  "transcription": null,
  "startedAt": "2025-10-21T...",
  "completedAt": null
}
```

**Response (completed):**
```json
{
  "status": "completed",
  "fileName": "video.mp4",
  "videoUrl": "/api/video/...",
  "videoId": "...",
  "transcription": { ... },
  "startedAt": "2025-10-21T...",
  "completedAt": "2025-10-21T..."
}
```

### POST /api/webhook/transcription
Webhook endpoint for ElevenLabs to deliver async transcription results

**Request (from ElevenLabs):**
```json
{
  "type": "speech_to_text_transcription",
  "data": {
    "request_id": "req_abc123",
    "transcription": {
      "language_code": "en",
      "text": "...",
      "words": [...]
    }
  }
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /api/cleanup
Delete all uploaded files

**Response:**
```json
{
  "success": true,
  "deletedCount": 5
}
```

## License

MIT

## Support

For issues with:
- **App functionality**: Check this README
- **ElevenLabs API**: Visit [ElevenLabs Docs](https://elevenlabs.io/docs/)
- **API limits**: Check your ElevenLabs dashboard

---

Built with ❤️ using ElevenLabs Speech-to-Text API
# mention-dash
# mention-dash
