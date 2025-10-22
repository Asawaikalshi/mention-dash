// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectedFile = document.getElementById('selectedFile');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeBtn = document.getElementById('removeBtn');
const transcribeBtn = document.getElementById('transcribeBtn');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');

const uploadSection = document.getElementById('uploadSection');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

const resultsSection = document.getElementById('resultsSection');
const resultsMeta = document.getElementById('resultsMeta');
const transcriptContent = document.getElementById('transcriptContent');
const downloadBtn = document.getElementById('downloadBtn');
const newBtn = document.getElementById('newBtn');

const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');

// State
let selectedVideoFile = null;
let transcriptionData = null;

// Make transcriptionData globally accessible for the agent
window.transcriptionData = null;

// Upload Area Click
uploadArea.addEventListener('click', () => {
    if (!selectedVideoFile) {
        fileInput.click();
    }
});

// File Input Change
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileSelect(file);
    }
});

// Drag and Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file) {
        handleFileSelect(file);
    }
});

// Handle File Selection
function handleFileSelect(file) {
    // Validate file type
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
                       'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/mp4'];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|mkv|mp3|wav|m4a)$/i)) {
        alert('Please select a valid video or audio file');
        return;
    }

    // Validate file size (10GB)
    if (file.size > 10 * 1024 * 1024 * 1024) {
        alert('File size must be less than 10GB');
        return;
    }

    selectedVideoFile = file;

    // Update UI
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    document.querySelector('.upload-content').style.display = 'none';
    selectedFile.style.display = 'flex';
    transcribeBtn.disabled = false;
}

// Remove File
removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFileSelection();
});

function resetFileSelection() {
    selectedVideoFile = null;
    fileInput.value = '';

    document.querySelector('.upload-content').style.display = 'block';
    selectedFile.style.display = 'none';
    transcribeBtn.disabled = true;
}

// Transcribe Button
transcribeBtn.addEventListener('click', async () => {
    if (!selectedVideoFile) return;

    // Hide upload section, show progress
    uploadSection.style.display = 'none';
    progressSection.style.display = 'block';
    resultsSection.style.display = 'none';
    errorSection.style.display = 'none';

    try {
        await uploadAndTranscribe(selectedVideoFile);
    } catch (error) {
        showError(error.message);
    }
});

// Extract audio from video using ffmpeg.wasm
let ffmpegInstance = null;

async function extractAudio(videoFile) {
    try {
        progressText.textContent = 'Loading audio extraction tool...';
        progressFill.style.width = '10%';

        // Initialize ffmpeg instance
        if (!ffmpegInstance) {
            // Wait for ffmpeg to be loaded
            while (!window.FFmpeg) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            ffmpegInstance = new window.FFmpeg();

            // Load ffmpeg core with blob URLs to avoid CORS issues
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

            console.log('📦 Downloading ffmpeg core files (this may take a moment)...');
            const coreURL = await window.toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
            const wasmURL = await window.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
            const workerURL = await window.toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript');

            console.log('🔧 Initializing ffmpeg...');
            await ffmpegInstance.load({
                coreURL,
                wasmURL,
                workerURL
            });

            console.log('✅ FFmpeg.wasm initialized and ready');
        }

        progressText.textContent = 'Extracting audio from video...';
        progressFill.style.width = '20%';

        // Write video to ffmpeg virtual filesystem
        const inputFileName = 'input' + videoFile.name.substring(videoFile.name.lastIndexOf('.'));
        await ffmpegInstance.writeFile(inputFileName, await window.fetchFile(videoFile));

        progressFill.style.width = '30%';

        // Extract audio to MP3
        const outputFileName = 'output.mp3';
        await ffmpegInstance.exec([
            '-i', inputFileName,
            '-vn', // No video
            '-acodec', 'libmp3lame',
            '-q:a', '2', // High quality
            outputFileName
        ]);

        progressText.textContent = 'Audio extraction complete!';
        progressFill.style.width = '45%';

        // Read the output file
        const data = await ffmpegInstance.readFile(outputFileName);

        // Clean up
        await ffmpegInstance.deleteFile(inputFileName);
        await ffmpegInstance.deleteFile(outputFileName);

        // Create blob from extracted audio
        const audioBlob = new Blob([data.buffer], { type: 'audio/mpeg' });
        console.log(`✅ Extracted ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB of audio`);

        return audioBlob;

    } catch (error) {
        console.error('❌ Audio extraction failed:', error);
        throw new Error('Failed to extract audio from video: ' + error.message);
    }
}

// Upload and Transcribe
async function uploadAndTranscribe(file) {
    let fileToUpload = file;
    let originalVideoFile = null;

    try {
        // Check if it's a video file that needs audio extraction
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.m4a'];
        const audioExtensions = ['.mp3', '.wav'];
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

        if (videoExtensions.includes(fileExtension)) {
            console.log('🎥 Video file detected - extracting audio...');
            originalVideoFile = file;

            // Extract audio from video
            const audioBlob = await extractAudio(file);

            // Create a File object from the blob
            fileToUpload = new File([audioBlob], file.name.replace(fileExtension, '.mp3'), {
                type: 'audio/mpeg'
            });

            console.log(`✅ Using extracted audio: ${fileToUpload.name}`);
        } else if (audioExtensions.includes(fileExtension)) {
            console.log('🎵 Audio file detected - uploading directly');
        } else {
            throw new Error('Unsupported file format. Please upload MP4, MOV, MP3, or WAV files.');
        }

        const formData = new FormData();
        formData.append('video', fileToUpload);

        // Update progress
        progressFill.style.width = '50%';
        progressText.textContent = 'Uploading file...';

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = 50 + (e.loaded / e.total) * 25; // 50-75% is upload
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = `Uploading... ${Math.round(percentComplete)}%`;
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);

                // Add video URL to response if we extracted audio from video
                if (originalVideoFile) {
                    response.clientVideoUrl = URL.createObjectURL(originalVideoFile);
                    response.clientVideoFile = originalVideoFile.name;
                    console.log('📹 Created video URL for playback:', response.clientVideoFile);
                }

                // Check if using webhook (async processing)
                if (response.useWebhook && response.requestId) {
                    progressFill.style.width = '75%';
                    progressText.textContent = 'Processing transcription (this may take several minutes)...';

                    // Poll for results
                    pollTranscriptionStatus(response.requestId, response, originalVideoFile);
                } else {
                    // Synchronous response - display immediately
                    progressFill.style.width = '100%';
                    progressText.textContent = 'Transcription complete!';

                    setTimeout(() => {
                        displayResults(response);
                    }, 500);
                }
            } else {
                // Try to parse JSON error, but handle HTML error pages too
                let errorMessage = 'Transcription failed';
                try {
                    const error = JSON.parse(xhr.responseText);
                    errorMessage = error.error || error.message || 'Transcription failed';
                } catch (e) {
                    // Server returned HTML (probably a 500 error page)
                    console.error('Server returned HTML error:', xhr.responseText);
                    errorMessage = `Server error (${xhr.status}). Check browser console for details.`;
                }
                showError(errorMessage);
            }
        });

        xhr.addEventListener('error', () => {
            showError('Network error occurred');
        });

        xhr.open('POST', '/api/transcribe');
        xhr.send(formData);

    } catch (error) {
        console.error('❌ Upload failed:', error);
        showError(error.message);
    }
}

// Poll for webhook transcription status
async function pollTranscriptionStatus(requestId, initialResponse) {
    const maxAttempts = 120; // 120 attempts = 10 minutes max (5 sec intervals)
    let attempts = 0;

    console.log(`\n${'='.repeat(80)}`);
    console.log('🔄 STARTING WEBHOOK POLLING');
    console.log(`🆔 Request ID: ${requestId}`);
    console.log(`⏱️  Max attempts: ${maxAttempts} (${maxAttempts * 5 / 60} minutes)`);
    console.log(`${'='.repeat(80)}\n`);

    const poll = async () => {
        attempts++;
        console.log(`\n📡 Poll attempt #${attempts}/${maxAttempts}`);

        try {
            console.log(`🌐 Fetching: /api/transcription/status/${requestId}`);
            const response = await fetch(`/api/transcription/status/${requestId}`);
            console.log(`📨 Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`📦 Response data:`, data);
            console.log(`📊 Status: ${data.status}`);

            if (data.status === 'completed' && data.transcription) {
                // Transcription is done!
                console.log(`✅ TRANSCRIPTION COMPLETED!`);
                console.log(`📝 Words received: ${data.transcription.words?.length || 0}`);
                console.log(`⏱️  Total polling time: ${attempts * 5} seconds`);
                console.log(`${'='.repeat(80)}\n`);

                progressFill.style.width = '100%';
                progressText.textContent = 'Transcription complete!';

                setTimeout(() => {
                    displayResults({
                        ...initialResponse,
                        transcription: data.transcription,
                        success: true
                    });
                }, 500);

            } else if (data.status === 'processing') {
                // Still processing - update progress message
                const elapsed = Math.floor((attempts * 5) / 60);
                console.log(`⏳ Still processing... (${elapsed} min elapsed)`);
                progressText.textContent = `Processing transcription... (${elapsed} min elapsed)`;

                // Animate progress bar slightly
                const currentProgress = 50 + Math.min(40, attempts);
                progressFill.style.width = currentProgress + '%';

                if (attempts < maxAttempts) {
                    // Poll again in 5 seconds
                    console.log(`⏰ Scheduling next poll in 5 seconds...`);
                    setTimeout(poll, 5000);
                } else {
                    console.error(`❌ TIMEOUT: Exceeded max attempts (${maxAttempts})`);
                    throw new Error('Transcription timeout - please try again or contact support');
                }

            } else {
                console.error(`❌ Unknown status received: ${data.status}`);
                throw new Error('Unknown transcription status: ' + data.status);
            }

        } catch (error) {
            console.error('❌ POLLING ERROR:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                attempt: attempts
            });
            console.log(`${'='.repeat(80)}\n`);
            progressSection.style.display = 'none';
            alert('Error checking transcription status: ' + error.message);
        }
    };

    // Start polling
    console.log('🚀 Starting first poll immediately...');
    poll();
}

// Display Results
function displayResults(response) {
    transcriptionData = response;
    window.transcriptionData = response; // Make available to agent

    // Show video player if video URL is available (server-provided or client-side)
    const videoUrl = response.clientVideoUrl || response.videoUrl;
    if (videoUrl) {
        const videoPlayerSection = document.getElementById('videoPlayerSection');
        const videoPlayer = document.getElementById('videoPlayer');

        videoPlayer.src = videoUrl;
        videoPlayerSection.style.display = 'block';
        console.log('🎬 Video player ready:', response.clientVideoFile || response.fileName);
    }

    progressSection.style.display = 'none';
    resultsSection.style.display = 'block';

    // Display metadata
    const transcription = response.transcription;
    const wordCount = transcription.words ? transcription.words.length : 0;
    const speakers = transcription.words ?
        [...new Set(transcription.words.map(w => w.speaker_id).filter(Boolean))].length : 0;

    const duration = transcription.words && transcription.words.length > 0 ?
        Math.round(transcription.words[transcription.words.length - 1].end) : 0;

    resultsMeta.innerHTML = `
        <div class="meta-item">
            <div class="meta-label">File Name</div>
            <div class="meta-value">${response.fileName}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Word Count</div>
            <div class="meta-value">${wordCount}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Speakers</div>
            <div class="meta-value">${speakers || 'N/A'}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Duration</div>
            <div class="meta-value">${formatDuration(duration)}</div>
        </div>
    `;

    // Display transcript
    displayTranscript(transcription);

    // Setup speaker filter after transcript is displayed
    setupSpeakerFilter(transcription);

    // Generate and display word frequency analytics
    displayWordFrequencyAnalytics(transcription);
}

// Display Transcript
function displayTranscript(transcription) {
    if (!transcription.words || transcription.words.length === 0) {
        transcriptContent.innerHTML = '<p>No transcription data available.</p>';
        return;
    }

    // Group words by speaker
    const speakerGroups = [];
    let currentGroup = null;

    transcription.words.forEach(word => {
        if (!currentGroup || currentGroup.speaker !== word.speaker_id) {
            currentGroup = {
                speaker: word.speaker_id || 'Unknown',
                startTime: word.start,
                words: []
            };
            speakerGroups.push(currentGroup);
        }
        currentGroup.words.push(word);
    });

    // Render speaker groups
    transcriptContent.innerHTML = speakerGroups.map((group, index) => `
        <div class="speaker-block speaker-${index % 3}">
            <div class="speaker-header">
                <div class="speaker-name">
                    ${group.speaker}
                </div>
                <div class="timestamp">${formatTime(group.startTime)}</div>
            </div>
            <div class="speaker-text">
                ${group.words.map(word =>
                    `<span class="word" data-start="${word.start}" data-end="${word.end}">${word.text}</span>`
                ).join(' ')}
            </div>
        </div>
    `).join('');

    // Setup keyword input listener
    setupKeywordSearch();

    // Add click handlers to words for video seeking
    document.querySelectorAll('.word').forEach(wordEl => {
        wordEl.addEventListener('click', () => {
            const startTime = parseFloat(wordEl.dataset.start);
            seekToTime(startTime);
        });
    });
}

// Setup Speaker Filter
function setupSpeakerFilter(transcription) {
    if (!transcription.words || transcription.words.length === 0) return;

    // Get unique speakers
    const speakers = [...new Set(transcription.words.map(w => w.speaker_id).filter(Boolean))];

    if (speakers.length === 0) return;

    const speakerFilterSection = document.getElementById('speakerFilterSection');
    const speakerFilterOptions = document.getElementById('speakerFilterOptions');

    // Show speaker filter section
    speakerFilterSection.style.display = 'block';

    // Create filter buttons
    const allButton = document.createElement('button');
    allButton.className = 'speaker-filter-btn active';
    allButton.textContent = 'All Speakers';
    allButton.dataset.speaker = 'all';
    speakerFilterOptions.appendChild(allButton);

    speakers.forEach(speaker => {
        const button = document.createElement('button');
        button.className = 'speaker-filter-btn';
        button.textContent = speaker;
        button.dataset.speaker = speaker;
        speakerFilterOptions.appendChild(button);
    });

    // Add click handlers
    speakerFilterOptions.addEventListener('click', (e) => {
        if (e.target.classList.contains('speaker-filter-btn')) {
            const clickedBtn = e.target;
            const isAllButton = clickedBtn.dataset.speaker === 'all';
            const allButton = speakerFilterOptions.querySelector('[data-speaker="all"]');

            if (isAllButton) {
                // If "All Speakers" clicked, deactivate all others and activate only it
                speakerFilterOptions.querySelectorAll('.speaker-filter-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                allButton.classList.add('active');
            } else {
                // If individual speaker clicked, toggle it
                clickedBtn.classList.toggle('active');

                // Deactivate "All Speakers"
                allButton.classList.remove('active');

                // If no individual speakers are selected, activate "All Speakers"
                const anyActive = Array.from(speakerFilterOptions.querySelectorAll('.speaker-filter-btn:not([data-speaker="all"])')).some(btn => btn.classList.contains('active'));
                if (!anyActive) {
                    allButton.classList.add('active');
                }
            }

            // Re-run keyword highlighting
            const keywordInput = document.getElementById('keywordInput');
            const keywords = keywordInput.value
                .split(',')
                .map(k => k.trim().toLowerCase())
                .filter(k => k.length > 0);

            if (keywords.length > 0) {
                highlightKeywords(keywords);
                updateKeywordStats(keywords);
            }
        }
    });
}

// Setup Keyword Search
function setupKeywordSearch() {
    const keywordInput = document.getElementById('keywordInput');
    const exactMatchToggle = document.getElementById('exactMatchToggle');
    const exactLabel = document.getElementById('exactLabel');
    const fuzzyLabel = document.getElementById('fuzzyLabel');
    const searchBtn = document.getElementById('searchBtn');
    const closeResultsBtn = document.getElementById('closeResultsBtn');
    const closeOccurrencesBtn = document.getElementById('closeOccurrencesBtn');

    // Handle toggle changes
    exactMatchToggle.addEventListener('change', () => {
        if (exactMatchToggle.checked) {
            exactLabel.classList.add('active');
            fuzzyLabel.classList.remove('active');
        } else {
            exactLabel.classList.remove('active');
            fuzzyLabel.classList.add('active');
        }

        // Re-run highlighting with current keywords
        const keywords = keywordInput.value
            .split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        if (keywords.length > 0) {
            highlightKeywords(keywords);
            updateKeywordStats(keywords);
        }
    });

    // Handle keyword input
    keywordInput.addEventListener('input', (e) => {
        const keywords = e.target.value
            .split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        highlightKeywords(keywords);
        updateKeywordStats(keywords);
    });

    // Handle search button click
    searchBtn.addEventListener('click', () => {
        const keywords = keywordInput.value
            .split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        if (keywords.length > 0) {
            showKeywordResultsTable(keywords);
        }
    });

    // Handle close results button
    closeResultsBtn.addEventListener('click', () => {
        document.getElementById('keywordResultsSection').style.display = 'none';
    });

    // Handle close occurrences button
    closeOccurrencesBtn.addEventListener('click', () => {
        document.getElementById('keywordOccurrences').style.display = 'none';
    });
}

// Get Selected Speakers
function getSelectedSpeakers() {
    const allButton = document.querySelector('.speaker-filter-btn[data-speaker="all"]');

    // If "All Speakers" is active, return 'all'
    if (allButton && allButton.classList.contains('active')) {
        return 'all';
    }

    // Otherwise, get all active individual speaker buttons
    const activeSpeakerBtns = document.querySelectorAll('.speaker-filter-btn.active:not([data-speaker="all"])');
    return Array.from(activeSpeakerBtns).map(btn => btn.dataset.speaker);
}

// Highlight Keywords in Transcript
function highlightKeywords(keywords) {
    console.log('[highlightKeywords] Starting with keywords:', keywords);

    const exactMatchToggle = document.getElementById('exactMatchToggle');
    const isExactMode = exactMatchToggle ? exactMatchToggle.checked : true;
    console.log('[highlightKeywords] Exact mode:', isExactMode);

    // Get selected speakers
    const selectedSpeakers = getSelectedSpeakers();

    // Remove all highlights first
    document.querySelectorAll('.word').forEach(wordEl => {
        wordEl.classList.remove('highlighted');
    });

    // For each speaker block, check for phrase matches
    const speakerBlocks = document.querySelectorAll('.speaker-block');
    console.log('[highlightKeywords] Found speaker blocks:', speakerBlocks.length);

    speakerBlocks.forEach((speakerBlock, blockIndex) => {
        const speakerName = speakerBlock.querySelector('.speaker-name').textContent.trim();

        // Check speaker filter
        if (selectedSpeakers !== 'all' && !selectedSpeakers.includes(speakerName)) {
            return;
        }

        const speakerTextEl = speakerBlock.querySelector('.speaker-text');
        if (!speakerTextEl) return;

        const fullText = speakerTextEl.textContent.trim();
        const wordElements = speakerTextEl.querySelectorAll('.word');

        console.log(`[highlightKeywords] Block ${blockIndex} - Speaker: ${speakerName}, Text length: ${fullText.length}, Words: ${wordElements.length}`);

        // Check each keyword
        keywords.forEach(keyword => {
            // Check if this keyword phrase exists in the full text
            if (matchesPhraseInText(keyword, fullText, isExactMode)) {
                // Highlight matching words
                // For single words, highlight exact matches
                // For multi-word phrases, highlight all words in the phrase
                const keywordWords = keyword.trim().split(/\s+/); // Don't lowercase here, let matchesKeyword handle it

                if (keywordWords.length === 1) {
                    // Single word - use original matching logic
                    wordElements.forEach(wordEl => {
                        const wordText = wordEl.textContent.trim();
                        if (matchesKeyword(keyword, wordText, isExactMode)) {
                            wordEl.classList.add('highlighted');
                        }
                    });
                } else {
                    // Multi-word phrase - highlight all words that are part of the phrase
                    const allWords = Array.from(wordElements);

                    for (let i = 0; i <= allWords.length - keywordWords.length; i++) {
                        let allMatch = true;
                        for (let j = 0; j < keywordWords.length; j++) {
                            const wordText = allWords[i + j].textContent.trim();
                            const keywordWord = keywordWords[j];
                            // Use the matching function to check if words match
                            if (!matchesKeyword(keywordWord, wordText, isExactMode)) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            // Highlight this sequence
                            for (let j = 0; j < keywordWords.length; j++) {
                                allWords[i + j].classList.add('highlighted');
                            }
                        }
                    }
                }
            }
        });
    });
}

// Show Keyword Results Table
function showKeywordResultsTable(keywords) {
    const exactMatchToggle = document.getElementById('exactMatchToggle');
    const isExactMode = exactMatchToggle ? exactMatchToggle.checked : true;

    // Get selected speakers
    const selectedSpeakers = getSelectedSpeakers();

    // Collect occurrences for each keyword
    const keywordData = {};
    keywords.forEach(keyword => {
        keywordData[keyword] = {
            count: 0,
            occurrences: []
        };
    });

    // Check each speaker block for phrase matches
    const speakerBlocks = document.querySelectorAll('.speaker-block');
    speakerBlocks.forEach(speakerBlock => {
        const speakerName = speakerBlock.querySelector('.speaker-name').textContent.trim();

        // Check speaker filter
        if (selectedSpeakers !== 'all' && !selectedSpeakers.includes(speakerName)) {
            return;
        }

        const speakerTextEl = speakerBlock.querySelector('.speaker-text');
        if (!speakerTextEl) return;

        const fullText = speakerTextEl.textContent.trim();
        const wordElements = speakerTextEl.querySelectorAll('.word');

        keywords.forEach(keyword => {
            // Check if phrase exists in this speaker block
            if (matchesPhraseInText(keyword, fullText, isExactMode)) {
                // Count occurrences of the phrase
                const keywordWords = keyword.trim().split(/\s+/); // Don't lowercase here
                const allWords = Array.from(wordElements);

                if (keywordWords.length === 1) {
                    // Single word - check each word individually
                    allWords.forEach((wordEl, wordIndex) => {
                        const wordText = wordEl.textContent.trim();
                        if (matchesKeyword(keyword, wordText, isExactMode)) {
                            keywordData[keyword].count++;

                            // Get context (surrounding words)
                            const contextStart = Math.max(0, wordIndex - 5);
                            const contextEnd = Math.min(allWords.length, wordIndex + 6);
                            const contextWords = allWords.slice(contextStart, contextEnd);

                            const contextText = contextWords.map((w) => {
                                if (w === wordEl) {
                                    return `<span class="match">${w.textContent}</span>`;
                                }
                                return w.textContent;
                            }).join(' ');

                            keywordData[keyword].occurrences.push({
                                speaker: speakerName,
                                text: contextText,
                                time: parseFloat(wordEl.dataset.start)
                            });
                        }
                    });
                } else {
                    // Multi-word phrase - find all occurrences
                    for (let i = 0; i <= allWords.length - keywordWords.length; i++) {
                        let allMatch = true;
                        for (let j = 0; j < keywordWords.length; j++) {
                            const wordText = allWords[i + j].textContent.trim();
                            const keywordWord = keywordWords[j];
                            // Use the matching function to check if words match
                            if (!matchesKeyword(keywordWord, wordText, isExactMode)) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            keywordData[keyword].count++;

                            // Get context around the phrase
                            const contextStart = Math.max(0, i - 5);
                            const contextEnd = Math.min(allWords.length, i + keywordWords.length + 5);
                            const contextWords = allWords.slice(contextStart, contextEnd);

                            const contextText = contextWords.map((w, idx) => {
                                const actualIdx = contextStart + idx;
                                if (actualIdx >= i && actualIdx < i + keywordWords.length) {
                                    return `<span class="match">${w.textContent}</span>`;
                                }
                                return w.textContent;
                            }).join(' ');

                            keywordData[keyword].occurrences.push({
                                speaker: speakerName,
                                text: contextText,
                                time: parseFloat(allWords[i].dataset.start)
                            });
                        }
                    }
                }
            }
        });
    });

    // Build table HTML
    const tableBody = document.getElementById('keywordResultsTableBody');
    tableBody.innerHTML = keywords.map(keyword => {
        const data = keywordData[keyword];
        const found = data.count > 0;

        const statusHTML = found
            ? `<span class="status-found">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                </svg>
                Found
               </span>`
            : `<span class="status-not-found">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                </svg>
                Not Found
               </span>`;

        return `
            <tr class="${found ? 'clickable' : ''}" data-keyword="${keyword}">
                <td><strong>${keyword}</strong></td>
                <td>${statusHTML}</td>
                <td>${data.count}</td>
            </tr>
        `;
    }).join('');

    // Add click handlers for found keywords
    tableBody.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
            const keyword = row.dataset.keyword;
            showKeywordOccurrences(keyword, keywordData[keyword]);
        });
    });

    // Show results section
    document.getElementById('keywordResultsSection').style.display = 'block';
    document.getElementById('keywordOccurrences').style.display = 'none';
}

// Show Keyword Occurrences
function showKeywordOccurrences(keyword, data) {
    const occurrencesTitle = document.getElementById('occurrencesTitle');
    const occurrencesList = document.getElementById('occurrencesList');

    occurrencesTitle.textContent = `Occurrences of "${keyword}" (${data.count})`;

    occurrencesList.innerHTML = data.occurrences.map((occ, index) => `
        <div class="occurrence-item" data-time="${occ.time}">
            <div class="occurrence-speaker">${occ.speaker}</div>
            <div class="occurrence-text">${occ.text}</div>
            <div class="occurrence-time">${formatTime(occ.time)}</div>
        </div>
    `).join('');

    // Add click handlers to seek video
    occurrencesList.querySelectorAll('.occurrence-item').forEach(item => {
        item.addEventListener('click', () => {
            const time = parseFloat(item.dataset.time);
            seekToTime(time);
        });
    });

    document.getElementById('keywordOccurrences').style.display = 'block';
}

// Update Keyword Stats
function updateKeywordStats(keywords) {
    const keywordStats = document.getElementById('keywordStats');

    if (keywords.length === 0) {
        keywordStats.innerHTML = '';
        return;
    }

    const exactMatchToggle = document.getElementById('exactMatchToggle');
    const isExactMode = exactMatchToggle ? exactMatchToggle.checked : true;

    // Get selected speakers
    const selectedSpeakers = getSelectedSpeakers();

    // Count matches per keyword by checking phrases in speaker blocks
    const keywordCounts = {};
    keywords.forEach(keyword => {
        keywordCounts[keyword] = 0;
    });

    const speakerBlocks = document.querySelectorAll('.speaker-block');
    speakerBlocks.forEach(speakerBlock => {
        const speakerName = speakerBlock.querySelector('.speaker-name').textContent.trim();

        // Check speaker filter
        if (selectedSpeakers !== 'all' && !selectedSpeakers.includes(speakerName)) {
            return;
        }

        const speakerTextEl = speakerBlock.querySelector('.speaker-text');
        if (!speakerTextEl) return;

        const fullText = speakerTextEl.textContent.trim();
        const wordElements = speakerTextEl.querySelectorAll('.word');

        keywords.forEach(keyword => {
            if (matchesPhraseInText(keyword, fullText, isExactMode)) {
                const keywordWords = keyword.trim().split(/\s+/); // Don't lowercase here
                const allWords = Array.from(wordElements);

                if (keywordWords.length === 1) {
                    // Single word
                    allWords.forEach(wordEl => {
                        const wordText = wordEl.textContent.trim();
                        if (matchesKeyword(keyword, wordText, isExactMode)) {
                            keywordCounts[keyword]++;
                        }
                    });
                } else {
                    // Multi-word phrase
                    for (let i = 0; i <= allWords.length - keywordWords.length; i++) {
                        let allMatch = true;
                        for (let j = 0; j < keywordWords.length; j++) {
                            const wordText = allWords[i + j].textContent.trim();
                            const keywordWord = keywordWords[j];
                            // Use the matching function to check if words match
                            if (!matchesKeyword(keywordWord, wordText, isExactMode)) {
                                allMatch = false;
                                break;
                            }
                        }
                        if (allMatch) {
                            keywordCounts[keyword]++;
                        }
                    }
                }
            }
        });
    });

    const totalMatches = Object.values(keywordCounts).reduce((sum, count) => sum + count, 0);

    keywordStats.innerHTML = `
        <div class="keyword-stat">
            <span class="keyword-stat-label">Total Matches:</span>
            <span class="keyword-stat-value">${totalMatches}</span>
        </div>
        ${keywords.map(keyword => `
            <div class="keyword-stat">
                <span class="keyword-stat-label">"${keyword}":</span>
                <span class="keyword-stat-value">${keywordCounts[keyword]}</span>
            </div>
        `).join('')}
    `;
}

// Seek to Time in Video
function seekToTime(time) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer && videoPlayer.src) {
        videoPlayer.currentTime = time;
        videoPlayer.play();

        // Scroll video into view
        videoPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Download JSON
downloadBtn.addEventListener('click', () => {
    if (!transcriptionData) return;

    const dataStr = JSON.stringify(transcriptionData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// New Transcription
newBtn.addEventListener('click', () => {
    resetFileSelection();
    transcriptionData = null;
    window.transcriptionData = null; // Clear global reference

    // Hide video player
    const videoPlayerSection = document.getElementById('videoPlayerSection');
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayerSection.style.display = 'none';
    videoPlayer.src = '';

    // Clear keyword input
    const keywordInput = document.getElementById('keywordInput');
    keywordInput.value = '';

    // Clear speaker filter
    const speakerFilterSection = document.getElementById('speakerFilterSection');
    const speakerFilterOptions = document.getElementById('speakerFilterOptions');
    speakerFilterSection.style.display = 'none';
    speakerFilterOptions.innerHTML = '';

    // Hide analytics section
    const analyticsSection = document.getElementById('analyticsSection');
    analyticsSection.style.display = 'none';

    resultsSection.style.display = 'none';
    uploadSection.style.display = 'block';
    progressFill.style.width = '0%';
});

// Retry Button
retryBtn.addEventListener('click', () => {
    errorSection.style.display = 'none';
    uploadSection.style.display = 'block';
});

// Show Error
function showError(message) {
    progressSection.style.display = 'none';
    errorSection.style.display = 'block';
    errorMessage.textContent = message;
}

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

// Word Frequency Analytics
function displayWordFrequencyAnalytics(transcription) {
    if (!transcription.words || transcription.words.length === 0) return;

    // Comprehensive stop words list to exclude
    const stopWords = new Set([
        // Articles & Determiners
        'the', 'a', 'an', 'this', 'that', 'these', 'those',

        // Conjunctions
        'and', 'or', 'but', 'nor', 'so', 'for', 'yet', 'because', 'since', 'unless', 'while', 'although', 'though',

        // Prepositions
        'in', 'on', 'at', 'to', 'from', 'with', 'by', 'about', 'as', 'into', 'through', 'during', 'before', 'after',
        'above', 'below', 'between', 'under', 'over', 'against', 'among', 'behind', 'beyond', 'across', 'along',
        'around', 'beside', 'off', 'onto', 'toward', 'upon', 'within', 'without',

        // Pronouns
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'theirs', 'themselves', 'his', 'her', 'hers',
        'my', 'mine', 'your', 'yours', 'its', 'our', 'ours', 'me', 'him', 'us', 'myself', 'yourself', 'himself',
        'herself', 'itself', 'ourselves', 'yourselves',

        // Question Words
        'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',

        // Quantifiers
        'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'many', 'much', 'several',
        'any', 'anybody', 'anyone', 'anything', 'anywhere', 'either', 'neither', 'nobody', 'none', 'nothing',
        'nowhere', 'one', 'ones', 'somebody', 'someone', 'something', 'somewhere',

        // Auxiliary Verbs & Common Verbs
        'is', 'am', 'are', 'was', 'were', 'been', 'being', 'be', 'have', 'has', 'had', 'having', 'do', 'does', 'did',
        'doing', 'done', 'will', 'would', 'should', 'could', 'might', 'must', 'can', 'may', 'shall',
        'go', 'goes', 'going', 'went', 'gone', 'come', 'comes', 'coming', 'came',
        'get', 'gets', 'getting', 'got', 'gotten', 'make', 'makes', 'making', 'made',
        'take', 'takes', 'taking', 'took', 'taken', 'see', 'sees', 'seeing', 'saw', 'seen',
        'know', 'knows', 'knowing', 'knew', 'known', 'think', 'thinks', 'thinking', 'thought',
        'say', 'says', 'saying', 'said', 'tell', 'tells', 'telling', 'told',
        'give', 'gives', 'giving', 'gave', 'given', 'put', 'puts', 'putting',
        'let', 'lets', 'letting', 'use', 'uses', 'using', 'used',
        'find', 'finds', 'finding', 'found', 'want', 'wants', 'wanting', 'wanted',
        'need', 'needs', 'needing', 'needed', 'try', 'tries', 'trying', 'tried',

        // Negations & Modifiers
        'no', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'even', 'also', 'still', 'quite',
        'rather', 'almost', 'already', 'enough', 'quite',

        // Directional/Positional
        'up', 'down', 'out', 'back', 'away', 'off',

        // Time Words
        'now', 'then', 'once', 'again', 'never', 'always', 'often', 'sometimes', 'usually', 'today', 'tomorrow',
        'yesterday', 'ago', 'later', 'soon', 'yet', 'still',

        // Common Conversational
        'yeah', 'yep', 'nope', 'yes', 'well', 'sure', 'maybe', 'perhaps', 'okay', 'ok', 'alright', 'right',
        'oh', 'um', 'uh', 'er', 'ah', 'hm', 'hmm', 'actually', 'really', 'basically', 'literally',
        'definitely', 'probably', 'possibly', 'certainly',

        // Vague/Generic Words
        'thing', 'things', 'stuff', 'way', 'ways', 'kind', 'sort', 'type', 'bit', 'part', 'lot', 'lots',
        'little', 'big', 'new', 'old', 'good', 'bad', 'great', 'nice',

        // Contractions (without apostrophes)
        'dont', 'doesnt', 'didnt', 'wont', 'wouldnt', 'shouldnt', 'couldnt', 'cant', 'cannot',
        'aint', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt',
        'im', 'ive', 'youre', 'youve', 'hes', 'shes', 'its', 'were', 'theyve', 'theyre',
        'thats', 'whats', 'whos', 'wheres', 'hows', 'theres',
        'gonna', 'wanna', 'gotta', 'gotcha', 'kinda', 'sorta', 'outta', 'lemme', 'gimme',

        // Other Common Words
        'look', 'looks', 'looking', 'looked', 'mean', 'means', 'meaning', 'meant',
        'keep', 'keeps', 'keeping', 'kept', 'seem', 'seems', 'seemed', 'call', 'called', 'calling'
    ]);

    // Count word frequencies
    const wordCounts = {};
    transcription.words.forEach(wordObj => {
        const word = wordObj.text.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Skip if empty, too short (4+ chars), purely numeric, or a stop word
        if (word.length < 4 || stopWords.has(word) || /^\d+$/.test(word)) return;

        wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

    // Filter to only words that appear at least 3 times and sort by frequency
    const sortedWords = Object.entries(wordCounts)
        .filter(([word, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    if (sortedWords.length === 0) return;

    // Show the analytics section
    const analyticsSection = document.getElementById('analyticsSection');
    analyticsSection.style.display = 'block';

    // Create bar chart visualization
    const chartContainer = document.getElementById('wordFrequencyChart');
    const maxCount = sortedWords[0][1];

    chartContainer.innerHTML = sortedWords.map(([word, count]) => {
        const percentage = (count / maxCount) * 100;
        return `
            <div class="word-bar-item">
                <div class="word-label">${word}</div>
                <div class="word-bar-container">
                    <div class="word-bar" style="width: ${percentage}%">
                        <span class="word-count">${count}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Check API health on load
window.addEventListener('load', async () => {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (!data.apiKeyConfigured) {
            console.warn('⚠️ ElevenLabs API key not configured');
        }
    } catch (error) {
        console.error('Failed to check API health:', error);
    }
});
