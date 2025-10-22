import express from 'express';
import multer from 'multer';
import { ElevenLabsClient } from 'elevenlabs';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import crypto from 'crypto';

// ES module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize ElevenLabs client (only if API key is provided)
let elevenlabs = null;
if (process.env.ELEVENLABS_API_KEY) {
  try {
    elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
      timeout: 600000 // 10 minutes timeout for large files
    });
  } catch (error) {
    console.warn('⚠️  Warning: Could not initialize ElevenLabs client:', error.message);
  }
}

// In-memory storage for transcription status (in production, use Redis or a database)
const transcriptionJobs = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept audio and video files
    const allowedMimes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'audio/x-m4a',
      'audio/mp4'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video and audio files are allowed.'));
    }
  }
});

// Function to convert video to MP3
function convertToMP3(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(path.extname(inputPath), '.mp3');

    console.log(`Converting ${path.basename(inputPath)} to MP3...`);

    ffmpeg(inputPath)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioBitrate(128) // 128 kbps - good quality, smaller file size
      .on('end', () => {
        console.log(`Conversion complete: ${path.basename(outputPath)}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Conversion error:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

// Function to get audio duration
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration);
      }
    });
  });
}

// Note: Chunking functions removed - now using ElevenLabs webhook API for long files
// This provides better diarization since the entire audio is processed as one unit

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.ELEVENLABS_API_KEY
  });
});

// Webhook endpoint for async transcription results
app.post('/api/webhook/transcription', express.json(), (req, res) => {
  try {
    console.log(`\n${'🔔'.repeat(40)}`);
    console.log('📨 WEBHOOK RECEIVED FROM ELEVENLABS');
    console.log(`${'─'.repeat(80)}`);
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log(`${'─'.repeat(80)}`);

    // Verify webhook signature if secret is configured
    if (process.env.WEBHOOK_SECRET) {
      console.log('🔐 Webhook secret is configured - verifying signature...');
      const signature = req.headers['xi-signature'];

      if (!signature) {
        console.warn('⚠️  Missing webhook signature header (xi-signature)');
        console.log('📋 Available headers:', Object.keys(req.headers).join(', '));
        return res.status(401).json({ error: 'Missing signature' });
      }

      console.log('🔑 Received signature:', signature);

      // Verify HMAC signature
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      console.log('🔑 Expected signature:', expectedSignature);
      console.log('✅ Signatures match:', signature === expectedSignature);

      if (signature !== expectedSignature) {
        console.warn('⚠️  Invalid webhook signature - rejecting request');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log('✅ Webhook signature verified successfully');
    } else {
      console.log('⚠️  No webhook secret configured - skipping signature verification');
    }

    console.log(`${'─'.repeat(80)}`);
    console.log('📦 Raw webhook body:', JSON.stringify(req.body, null, 2));
    console.log(`${'─'.repeat(80)}`);

    // Validate webhook payload
    if (!req.body || req.body.type !== 'speech_to_text_transcription') {
      console.warn('⚠️  Invalid webhook payload type received');
      console.warn('   Expected: speech_to_text_transcription');
      console.warn('   Received:', req.body?.type || 'undefined');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    console.log('✅ Webhook type validated: speech_to_text_transcription');

    const { request_id, transcription } = req.body.data || {};

    console.log('🆔 Request ID from webhook:', request_id);
    console.log('📊 Transcription data present:', !!transcription);
    if (transcription) {
      console.log('📝 Transcription words count:', transcription.words?.length || 0);
    }

    if (!request_id || !transcription) {
      console.warn('⚠️  Missing required fields in webhook payload');
      console.warn('   request_id present:', !!request_id);
      console.warn('   transcription present:', !!transcription);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Look up the job
    console.log(`${'─'.repeat(80)}`);
    console.log('🔍 Looking up job in memory...');
    console.log('📊 Total jobs in memory:', transcriptionJobs.size);
    console.log('🗂️  All job IDs:', Array.from(transcriptionJobs.keys()).join(', '));

    const job = transcriptionJobs.get(request_id);

    if (!job) {
      console.warn(`⚠️  No job found for request_id: ${request_id}`);
      console.warn('❌ This request_id does not exist in our job tracking');
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('✅ Job found in memory!');
    console.log('📋 Current job status:', job.status);
    console.log('📁 Job file name:', job.fileName);

    // Update job status
    job.status = 'completed';
    job.transcription = transcription;
    job.completedAt = new Date().toISOString();

    console.log(`${'─'.repeat(80)}`);
    console.log('✅ Job updated successfully!');
    console.log('   Status: processing → completed');
    console.log('   Completed at:', job.completedAt);
    console.log('   Words transcribed:', transcription.words?.length || 0);
    console.log(`${'─'.repeat(80)}`);

    // Send success response to ElevenLabs
    console.log('📤 Sending success response to ElevenLabs');
    console.log(`${'🔔'.repeat(40)}\n`);
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ WEBHOOK ERROR:', error);
    console.error('Stack trace:', error.stack);
    console.log(`${'🔔'.repeat(40)}\n`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Status endpoint for polling transcription progress
app.get('/api/transcription/status/:requestId', (req, res) => {
  const { requestId } = req.params;

  console.log(`\n🔍 STATUS POLL REQUEST`);
  console.log(`🆔 Request ID: ${requestId}`);
  console.log(`📊 Total jobs in memory: ${transcriptionJobs.size}`);
  console.log(`🗂️  All job IDs: ${Array.from(transcriptionJobs.keys()).join(', ')}`);

  const job = transcriptionJobs.get(requestId);

  if (!job) {
    console.warn(`❌ Job not found for request_id: ${requestId}`);
    return res.status(404).json({ error: 'Job not found' });
  }

  console.log(`✅ Job found! Status: ${job.status}`);
  console.log(`📁 File: ${job.fileName}`);
  console.log(`⏱️  Started: ${job.startedAt}`);
  if (job.status === 'completed') {
    console.log(`✅ Completed: ${job.completedAt}`);
    console.log(`📝 Words: ${job.transcription?.words?.length || 0}`);
  }

  const response = {
    status: job.status,
    fileName: job.fileName,
    videoUrl: job.videoUrl,
    videoId: job.videoId,
    transcription: job.transcription,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  };

  console.log(`📤 Sending status response\n`);
  res.json(response);
});

// Agent configuration endpoint
app.get('/api/agent-config', (req, res) => {
  if (!process.env.ELEVENLABS_AGENT_ID) {
    return res.status(500).json({ error: 'Agent ID not configured' });
  }

  res.json({
    agentId: process.env.ELEVENLABS_AGENT_ID
  });
});

// Get agent details from ElevenLabs
app.get('/api/agent-details', async (req, res) => {
  if (!process.env.ELEVENLABS_AGENT_KEY || !process.env.ELEVENLABS_AGENT_ID) {
    return res.status(500).json({ error: 'Agent credentials not configured' });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${process.env.ELEVENLABS_AGENT_ID}`, {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_AGENT_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const agentData = await response.json();
    res.json(agentData);

  } catch (error) {
    console.error('Error fetching agent details:', error);
    res.status(500).json({ error: 'Failed to fetch agent details', message: error.message });
  }
});

// Simple chat endpoint (text-based responses)
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // For now, provide simple responses
    // You can enhance this with OpenAI API or other LLM services
    let response = '';

    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('summary') || lowerMessage.includes('summarize')) {
      response = 'Based on the transcription, I can help you summarize the key points. The conversation covers the main topics and themes discussed by the speakers.';
    } else if (lowerMessage.includes('speaker')) {
      response = 'The transcription includes multiple speakers. You can filter by specific speakers using the speaker filter above the transcript.';
    } else if (lowerMessage.includes('keyword') || lowerMessage.includes('search')) {
      response = 'You can search for specific keywords in the transcript using the keyword search feature. It supports both exact and fuzzy matching.';
    } else if (lowerMessage.includes('word count') || lowerMessage.includes('length')) {
      response = 'You can find the word count and duration information in the metadata section above the transcript.';
    } else if (lowerMessage.includes('download') || lowerMessage.includes('export')) {
      response = 'You can download the full transcription as a JSON file using the "Download JSON" button in the results section.';
    } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      response = 'Hello! I\'m here to help you with questions about your transcription. Feel free to ask me anything!';
    } else {
      response = 'I understand you\'re asking about the transcription. You can ask me to summarize content, explain features, or help you navigate the transcript. What would you like to know?';
    }

    res.json({ response });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Upload and transcribe endpoint
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (!elevenlabs) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(500).json({
      error: 'ElevenLabs API key not configured. Please add ELEVENLABS_API_KEY to .env file'
    });
  }

  const filePath = req.file.path;
  const fileName = req.file.originalname;
  let audioFilePath = filePath;
  let convertedFile = null;

  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎬 Starting transcription for: ${fileName}`);
    console.log(`📁 File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // Check if it's a video file - convert to MP3 to reduce size
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.m4a'];
    const fileExtension = path.extname(fileName).toLowerCase();

    if (videoExtensions.includes(fileExtension)) {
      console.log(`🎥 Video file detected - converting to MP3 for faster processing...`);
      audioFilePath = await convertToMP3(filePath);
      convertedFile = audioFilePath;
      console.log(`✅ Conversion complete`);
    }

    // Check audio duration and decide if webhook is needed
    const duration = await getAudioDuration(audioFilePath);
    const durationMinutes = Math.round(duration / 60);
    const durationSeconds = Math.round(duration);
    console.log(`⏱️  Audio duration: ${durationMinutes} minutes (${durationSeconds} seconds)`);

    // Prepare video file for playback
    const videoId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const videoFileName = `${videoId}${path.extname(fileName)}`;
    const newPath = path.join('uploads', videoFileName);
    fs.renameSync(filePath, newPath);
    console.log(`💾 Video saved as: ${videoFileName}`);

    const audioBuffer = fs.readFileSync(audioFilePath);
    const audioFileName = path.basename(audioFilePath);
    const audioFile = new File([audioBuffer], audioFileName, {
      type: 'audio/mpeg'
    });

    let transcription;
    let useWebhook = false;

    // Debug webhook configuration
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔧 Webhook Configuration Check:`);
    console.log(`   Duration: ${durationSeconds}s (threshold: 600s)`);
    console.log(`   Webhook URL configured: ${process.env.WEBHOOK_URL ? '✅ YES' : '❌ NO'}`);
    if (process.env.WEBHOOK_URL) {
      console.log(`   Webhook URL: ${process.env.WEBHOOK_URL}`);
    }
    console.log(`   Will use webhook: ${duration > 600 && process.env.WEBHOOK_URL ? '✅ YES' : '❌ NO'}`);
    console.log(`${'─'.repeat(80)}\n`);

    // Use webhook for files longer than 10 minutes (if webhook URL is configured)
    if (duration > 600 && process.env.WEBHOOK_URL) {
      console.log(`📡 File is longer than 10 minutes - using async webhook transcription`);
      useWebhook = true;

      // Generate request ID
      const requestId = `req_${videoId}`;
      console.log(`🆔 Generated request ID: ${requestId}`);

      // Create job record
      const jobData = {
        status: 'processing',
        fileName: fileName,
        videoUrl: `/api/video/${videoFileName}`,
        videoId: videoFileName,
        transcription: null,
        startedAt: new Date().toISOString(),
        completedAt: null
      };
      transcriptionJobs.set(requestId, jobData);
      console.log(`💾 Job record created in memory`);
      console.log(`📊 Current jobs in memory: ${transcriptionJobs.size}`);

      // Start async transcription with webhook
      console.log(`🚀 Calling ElevenLabs API with webhook=true...`);
      const apiCallStart = Date.now();

      transcription = await elevenlabs.speechToText.convert({
        file: audioFile,
        model_id: "scribe_v1",
        tag_audio_events: true,
        language_code: null,
        diarize: true,
        webhook: true
      });

      const apiCallDuration = Date.now() - apiCallStart;
      console.log(`✅ ElevenLabs API call completed in ${apiCallDuration}ms`);
      console.log(`📋 API Response:`, JSON.stringify(transcription, null, 2));
      console.log(`✅ Webhook transcription initiated - request_id: ${requestId}`);
      console.log(`⏳ Waiting for webhook callback from ElevenLabs...`);

      // Return immediately with request ID for polling
      const response = {
        success: true,
        useWebhook: true,
        requestId: requestId,
        fileName: fileName,
        videoUrl: `/api/video/${videoFileName}`,
        videoId: videoFileName,
        timestamp: new Date().toISOString()
      };
      console.log(`📤 Returning response to client:`, JSON.stringify(response, null, 2));
      console.log(`${'='.repeat(80)}\n`);
      res.json(response);

    } else {
      // File is short enough - transcribe synchronously
      console.log(`⚡ File is under 10 minutes or webhook not configured - transcribing synchronously`);
      console.log(`🚀 Calling ElevenLabs API (synchronous mode)...`);
      const apiCallStart = Date.now();

      transcription = await elevenlabs.speechToText.convert({
        file: audioFile,
        model_id: "scribe_v1",
        tag_audio_events: true,
        language_code: null,
        diarize: true
      });

      const apiCallDuration = Date.now() - apiCallStart;
      console.log(`✅ Transcription completed in ${apiCallDuration}ms`);
      console.log(`📊 Words transcribed: ${transcription.words?.length || 0}`);

      // Return transcription result immediately
      const response = {
        success: true,
        useWebhook: false,
        fileName: fileName,
        videoUrl: `/api/video/${videoFileName}`,
        videoId: videoFileName,
        transcription: transcription,
        timestamp: new Date().toISOString()
      };
      console.log(`📤 Returning response to client`);
      console.log(`${'='.repeat(80)}\n`);
      res.json(response);
    }

    // Clean up converted audio file if it exists
    if (convertedFile && fs.existsSync(convertedFile)) {
      fs.unlinkSync(convertedFile);
    }

  } catch (error) {
    console.error('Transcription error:', error);

    // Clean up uploaded files on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (convertedFile && fs.existsSync(convertedFile)) {
      fs.unlinkSync(convertedFile);
    }

    // Better error messages for common issues
    let errorMessage = 'Transcription failed';
    let userMessage = 'An error occurred during transcription. Please try again.';

    if (error.message.includes('timeout')) {
      errorMessage = 'Request timeout';
      userMessage = 'The file is too large and took too long to process. Try:\n• Using a smaller/shorter video\n• Compressing the video file\n• Converting to a lower quality audio format (e.g., MP3)';
    } else if (error.message.includes('file size')) {
      errorMessage = 'File too large';
      userMessage = 'The file exceeds the maximum size limit. Please use a smaller file.';
    } else if (error.message.includes('format')) {
      errorMessage = 'Unsupported format';
      userMessage = 'This file format is not supported. Please use MP4, MOV, AVI, MKV, MP3, or WAV.';
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      errorMessage = 'API quota exceeded';
      userMessage = 'The ElevenLabs API quota has been exceeded. Please try again later.';
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed';
      userMessage = 'Invalid API key. Please check your ElevenLabs API configuration.';
    }

    res.status(500).json({
      error: errorMessage,
      message: userMessage,
      technicalDetails: error.message,
      suggestion: 'For large files (600MB+), consider converting to audio-only format or compressing before upload.'
    });
  }
});

// Serve video files
app.get('/api/video/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Delete all uploaded files (cleanup endpoint)
app.post('/api/cleanup', (req, res) => {
  try {
    const files = fs.readdirSync('uploads/');
    files.forEach(file => {
      if (file !== '.gitkeep') {
        fs.unlinkSync(path.join('uploads/', file));
      }
    });
    res.json({ success: true, deletedCount: files.length });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', message: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Video Transcription Server running on http://localhost:${PORT}`);
  console.log(`📝 API Key configured: ${process.env.ELEVENLABS_API_KEY ? '✅ Yes' : '❌ No (add to .env file)'}\n`);
});
