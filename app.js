// Load streamers from localStorage or use defaults
let streamers = JSON.parse(localStorage.getItem('customStreamers')) || [
    "AdamRoguezy",
    "ADarkLegacy",
    "aksually",
    "ARCHIT3CT",
    "ashleyroboto",
    "banthony",
    "blizz",
    "BobbyBurm",
    "butteryflaky",
    "bwick",
    "Carla",
    "cheebs",
    "chiblee",
    "chrismelberger",
    "ChrispyGameplay",
    "Crub",
    "detune",
    "dudlik",
    "EthanNestor",
    "hankstergirl",
    "hanner",
    "JessCapricorn",
    "johnchoi",
    "LeoSypniewski",
    "Loganolio",
    "Michael_Lopriore",
    "nandre",
    "PapaHogsPalaceOfPleasure",
    "PointCrow",
    "prezoh",
    "sandy",
    "Shaggedy",
    "Skootish",
    "vaqrgaming",
    "vixella",
    "whisqey"
];

// Load category filter from localStorage or use default
let categoryFilter = localStorage.getItem('categoryFilter') || 'Minecraft';

// Auto-detect domain for Twitch embed parent parameter
const currentDomain = window.location.hostname;

let currentIndex = 0;
let isPlaying = true;
let intervalId = null;
let progressIntervalId = null;
let intervalSeconds = 30;
let streamStatus = {};
let liveOnlyMode = true;
let activeStreamers = [...streamers];
let isMuted = false;
let isInFullscreen = false;

function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById('muteBtn');

    if (isMuted) {
        btn.textContent = '🔇 Muted';
    } else {
        btn.textContent = '🔊 Unmuted';
    }

    // Reload current channel with new mute state
    loadChannel(currentIndex);
}

function toggleManagePanel() {
    const panel = document.getElementById('managePanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        renderStreamerList();
        // Update category input with current value
        document.getElementById('categoryInput').value = categoryFilter;
    }
}

// Close panel when clicking outside
document.addEventListener('click', function(event) {
    const panel = document.getElementById('managePanel');
    const container = document.getElementById('manageBtnContainer');

    if (!panel.classList.contains('hidden') &&
        !container.contains(event.target)) {
        panel.classList.add('hidden');
    }
});

function saveStreamers() {
    localStorage.setItem('customStreamers', JSON.stringify(streamers));
    activeStreamers = liveOnlyMode ?
        streamers.filter(s => streamStatus[s]?.live) :
        [...streamers];

    // Reset to first channel if current index is out of bounds
    if (currentIndex >= activeStreamers.length) {
        currentIndex = 0;
    }

    // Refresh stream status with new list
    fetchStreamStatus();
}

function updateCategory() {
    const input = document.getElementById('categoryInput');
    const newCategory = input.value.trim();

    // Allow empty category to show all streams
    categoryFilter = newCategory;
    localStorage.setItem('categoryFilter', categoryFilter);

    // Show feedback message
    if (categoryFilter) {
        console.log('Category filter set to:', categoryFilter);
    } else {
        console.log('Category filter cleared - showing all games');
    }

    // Refresh stream status with new category
    fetchStreamStatus();
}

function clearCategory() {
    const input = document.getElementById('categoryInput');
    input.value = '';
    categoryFilter = '';
    localStorage.setItem('categoryFilter', '');

    console.log('Category filter cleared - showing all games');

    // Refresh stream status without category filter
    fetchStreamStatus();
}

function addStreamer() {
    const input = document.getElementById('streamerInput');
    const name = input.value.trim();

    if (!name) {
        alert('Please enter a streamer name');
        return;
    }

    if (streamers.includes(name)) {
        alert('Streamer already in list');
        return;
    }

    streamers.push(name);
    saveStreamers();
    renderStreamerList();
    input.value = '';
}

function bulkAddStreamers() {
    const textarea = document.getElementById('bulkPasteArea');
    const names = textarea.value
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (names.length === 0) {
        alert('Please enter at least one streamer name');
        return;
    }

    let added = 0;
    names.forEach(name => {
        if (!streamers.includes(name)) {
            streamers.push(name);
            added++;
        }
    });

    if (added > 0) {
        saveStreamers();
        renderStreamerList();
        textarea.value = '';
        alert(`Added ${added} streamer(s)`);
    } else {
        alert('All streamers are already in the list');
    }
}

function removeStreamer(name) {
    streamers = streamers.filter(s => s !== name);
    saveStreamers();
    renderStreamerList();
}

function loadStreamerByName(name) {
    // Find the streamer in the active list
    const index = activeStreamers.indexOf(name);
    if (index !== -1) {
        currentIndex = index;
        loadChannel(currentIndex);
    } else {
        // If not in active list (maybe filtered by live-only), turn off filter and load
        liveOnlyMode = false;
        document.getElementById('liveOnlyCheckbox').checked = false;
        activeStreamers = [...streamers];
        currentIndex = streamers.indexOf(name);
        if (currentIndex !== -1) {
            loadChannel(currentIndex);
        }
    }
}

function renderStreamerList() {
    const container = document.getElementById('streamerList');
    container.innerHTML = '<div style="margin-bottom: 10px; color: #adadb8; font-size: 12px;">Current Streamers (' + streamers.length + '):</div>';

    streamers.forEach((name, index) => {
        const item = document.createElement('div');
        item.className = 'streamer-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'streamer-name';
        nameSpan.textContent = name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.onclick = () => loadStreamerByName(name);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            removeStreamer(name);
        };

        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);
        container.appendChild(item);
    });
}


async function fetchStreamStatus() {
    try {
        // Call our Netlify serverless function without category filter
        // We'll filter client-side so we can show both counts
        const streamersParam = streamers.join(',');
        const url = `/.netlify/functions/streams?streamers=${encodeURIComponent(streamersParam)}`;

        console.log('Fetching stream status from Netlify function...');
        console.log('Category filter:', categoryFilter || '(none - all games)');
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Stream API error:', errorData);

            if (errorData.error && errorData.error.includes('not configured')) {
                console.error('⚠️ Twitch credentials not set in Netlify environment variables');
                console.error('Go to: Site settings > Environment variables');
                console.error('Add: TWITCH_CLIENT_ID and TWITCH_OAUTH_TOKEN');
            }
            return;
        }

        streamStatus = await response.json();

        // Apply category filter client-side
        if (categoryFilter) {
            // Create filtered version for display
            const filteredStatus = {};
            for (const [streamer, status] of Object.entries(streamStatus)) {
                if (status.live && status.game && status.game.toLowerCase() === categoryFilter.toLowerCase()) {
                    filteredStatus[streamer] = status;
                } else {
                    filteredStatus[streamer] = { live: false };
                }
            }
            // Store both the original and filtered
            window.unfilteredStreamStatus = streamStatus;
            streamStatus = filteredStatus;
        } else {
            window.unfilteredStreamStatus = streamStatus;
        }

        console.log('Stream status updated:', Object.values(streamStatus).filter(s => s.live).length, 'channels live in filtered category');

        updateLiveCount();
        updateActiveStreamers();
        updateStreamInfo();
    } catch (error) {
        console.error('Error fetching stream status:', error);
    }
}

function updateActiveStreamers() {
    // Update the active streamers list based on current filters
    if (liveOnlyMode) {
        const liveStreamers = streamers.filter(s => streamStatus[s]?.live);

        if (liveStreamers.length === 0) {
            console.log('No channels match the current filters');
            activeStreamers = [...streamers];
            currentIndex = 0;
        } else {
            activeStreamers = liveStreamers;

            // Adjust current index if needed
            if (currentIndex >= activeStreamers.length) {
                currentIndex = 0;
            }
        }
    } else {
        activeStreamers = [...streamers];
    }

    // Load the current (or reset) channel
    if (activeStreamers.length > 0) {
        loadChannel(currentIndex);
    }
}

function updateLiveCount() {
    // Count from unfiltered data (all live streams)
    const totalLiveStreams = window.unfilteredStreamStatus ?
        Object.values(window.unfilteredStreamStatus).filter(s => s.live).length : 0;

    // Count from filtered data (category-specific)
    const categoryLiveStreams = Object.values(streamStatus).filter(s => s.live).length;

    const liveCountEl = document.getElementById('liveCount');
    const categoryCountEl = document.getElementById('categoryCount');

    // Always show total live count
    if (totalLiveStreams > 0) {
        liveCountEl.textContent = `${totalLiveStreams} LIVE`;
        liveCountEl.style.display = 'block';
    } else {
        liveCountEl.style.display = 'none';
    }

    // Show category-specific count if a category filter is active
    if (categoryFilter && categoryLiveStreams > 0) {
        categoryCountEl.textContent = `${categoryLiveStreams} in "${categoryFilter}"`;
        categoryCountEl.style.display = 'block';
    } else {
        categoryCountEl.style.display = 'none';
    }
}

function updateStreamInfo() {
    const streamer = activeStreamers[currentIndex];
    const status = streamStatus[streamer];
    const streamInfoEl = document.getElementById('streamInfo');

    if (!status) {
        streamInfoEl.textContent = '';
        return;
    }

    if (status.live) {
        const game = status.game ? ` • ${status.game}` : '';
        const viewers = status.viewers ? ` • ${status.viewers.toLocaleString()} viewers` : '';
        streamInfoEl.innerHTML = `<span class="live-indicator"></span>${status.title || 'Live'}${game}${viewers}`;
    } else {
        streamInfoEl.innerHTML = `<span class="offline-indicator"></span>Offline`;
    }
}

function toggleLiveOnly() {
    liveOnlyMode = document.getElementById('liveOnlyCheckbox').checked;

    if (liveOnlyMode) {
        // Filter to only live channels
        const liveStreamers = streamers.filter(s => streamStatus[s]?.live);

        if (liveStreamers.length === 0) {
            alert('No channels are currently live in the selected category!');
            document.getElementById('liveOnlyCheckbox').checked = false;
            liveOnlyMode = false;
            return;
        }

        activeStreamers = liveStreamers;
        currentIndex = 0;
    } else {
        // Show all channels
        activeStreamers = [...streamers];
        currentIndex = 0;
    }

    loadChannel(currentIndex);
}

function loadChannel(index) {
    const streamer = activeStreamers[index];
    const iframe = document.getElementById('twitchFrame');
    const iframeContainer = document.getElementById('iframe-container');
    const channelName = document.getElementById('channelName');

    // Use auto-detected domain for Twitch embed
    const muteParam = isMuted ? '&muted=true' : '&muted=false';
    iframe.src = `https://player.twitch.tv/?channel=${streamer}&parent=${currentDomain}${muteParam}&autoplay=true`;
    channelName.textContent = `${index + 1}/${activeStreamers.length}: ${streamer}`;

    // Re-enter fullscreen after iframe loads if we were in fullscreen
    if (isInFullscreen) {
        iframe.onload = function() {
            setTimeout(() => {
                if (iframeContainer.requestFullscreen) {
                    iframeContainer.requestFullscreen();
                } else if (iframeContainer.webkitRequestFullscreen) {
                    iframeContainer.webkitRequestFullscreen();
                } else if (iframeContainer.mozRequestFullScreen) {
                    iframeContainer.mozRequestFullScreen();
                } else if (iframeContainer.msRequestFullscreen) {
                    iframeContainer.msRequestFullscreen();
                }
            }, 100);
            iframe.onload = null;
        };
    }

    updateStreamInfo();
    resetProgress();
}

function nextChannel() {
    currentIndex = (currentIndex + 1) % activeStreamers.length;
    loadChannel(currentIndex);
}

function previousChannel() {
    currentIndex = (currentIndex - 1 + activeStreamers.length) % activeStreamers.length;
    loadChannel(currentIndex);
}

function togglePlayPause() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('playPauseBtn');

    if (isPlaying) {
        btn.textContent = '⏸ Pause';
        startInterval();
    } else {
        btn.textContent = '▶ Play';
        stopInterval();
    }
}

function startInterval() {
    stopInterval();
    intervalId = setInterval(nextChannel, intervalSeconds * 1000);
    startProgress();
}

function stopInterval() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    stopProgress();
}

function updateInterval() {
    const input = document.getElementById('intervalInput');
    intervalSeconds = Math.max(5, Math.min(600, parseInt(input.value) || 30));
    input.value = intervalSeconds;

    if (isPlaying) {
        startInterval();
    }
}

function startProgress() {
    stopProgress();
    const progressBar = document.getElementById('progressBar');
    let elapsed = 0;

    progressBar.style.width = '0%';

    progressIntervalId = setInterval(() => {
        elapsed += 0.5;
        const percentage = (elapsed / intervalSeconds) * 100;
        progressBar.style.width = percentage + '%';

        if (elapsed >= intervalSeconds) {
            stopProgress();
        }
    }, 500);
}

function stopProgress() {
    if (progressIntervalId) {
        clearInterval(progressIntervalId);
        progressIntervalId = null;
    }
}

function resetProgress() {
    stopProgress();
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = '0%';
    if (isPlaying) {
        startProgress();
    }
}

// Initialize
async function initialize() {
    // Fetch stream status first
    await fetchStreamStatus();

    // Apply live-only filter if enabled
    if (liveOnlyMode) {
        const liveStreamers = streamers.filter(s => streamStatus[s]?.live);
        if (liveStreamers.length > 0) {
            activeStreamers = liveStreamers;
            currentIndex = 0;
        } else {
            // If no live channels, disable live-only mode
            liveOnlyMode = false;
            document.getElementById('liveOnlyCheckbox').checked = false;
        }
    }

    loadChannel(currentIndex);
    startInterval();
}

initialize();

// Update stream status every 60 seconds
setInterval(fetchStreamStatus, 60000);

// Handle visibility changes to pause when tab is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlaying) {
        stopInterval();
    } else if (!document.hidden && isPlaying) {
        startInterval();
    }
});

// Track fullscreen state
document.addEventListener('fullscreenchange', () => {
    isInFullscreen = !!document.fullscreenElement;
});
document.addEventListener('webkitfullscreenchange', () => {
    isInFullscreen = !!document.webkitFullscreenElement;
});
document.addEventListener('mozfullscreenchange', () => {
    isInFullscreen = !!document.mozFullScreenElement;
});
document.addEventListener('msfullscreenchange', () => {
    isInFullscreen = !!document.msFullscreenElement;
});