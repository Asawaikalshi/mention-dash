// Vercel serverless function for transcription
import multer from 'multer';
import { ElevenLabsClient } from 'elevenlabs';
import path from 'path';

// Initialize ElevenLabs client
const elevenlabs = process.env.ELEVENLABS_API_KEY ? new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
  timeout: 60000
}) : null;

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Wrapper to make multer work with Vercel
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📨 Transcription request received');

    // Run multer middleware
    await runMiddleware(req, res, upload.single('video'));

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!elevenlabs) {
      return res.status(500).json({
        error: 'ElevenLabs API key not configured'
      });
    }

    const fileName = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileExtension = path.extname(fileName).toLowerCase();

    console.log(`🎬 File: ${fileName}, Size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // Only allow audio files
    const audioExtensions = ['.mp3', '.wav'];
    if (!audioExtensions.includes(fileExtension)) {
      return res.status(400).json({
        error: 'Unsupported file format',
        message: 'Only MP3 and WAV files are supported on this deployment.',
        technicalDetails: `Received: ${fileExtension}`
      });
    }

    // Create File object
    const audioFile = new File([fileBuffer], fileName, {
      type: req.file.mimetype
    });

    console.log('🚀 Calling ElevenLabs API...');
    const startTime = Date.now();

    const transcription = await elevenlabs.speechToText.convert({
      file: audioFile,
      model_id: "scribe_v1",
      tag_audio_events: true,
      language_code: null,
      diarize: true
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms, Words: ${transcription.words?.length || 0}`);

    return res.status(200).json({
      success: true,
      useWebhook: false,
      fileName: fileName,
      transcription: transcription,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error:', error);

    return res.status(500).json({
      error: error.message || 'Transcription failed',
      message: 'An error occurred during transcription',
      technicalDetails: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for multer
  },
};
