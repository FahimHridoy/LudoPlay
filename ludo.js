let currentTurnIndex = 0;
let activePlayersList = [];
let consecutiveSixCount = {};
let snakeConsecutiveOnes = {};
let isDiceRolling = false;
let currentMatchPlayerCount = 2;
let ludoPendingMove = null;
let ludoMatchWinner = null;
let ludoAiTimer = null;
let isTokenAnimating = false;
let ludoAnimationEpoch = 0;
let ludoQuickMatch = false;
let ludoFirstKillOccurred = false;
let ludoFinishCelebration = null;
let ludoFinishTimer = null;
let ludoAutoMoveTimer = null;
let ludoMatchIsOffline = true;
let ludoMatchStartedAt = null;
let ludoMatchFinishedAt = null;
let currentMatchResultRecorded = false;
let snakeMatchWinner = null;
let snakeVisualMotion = null;
let liveGreatPlayerIndex = -1;
let liveGreatPlayerUntil = 0;
let liveGreatPlayerTimer = null;
let liveGreatPlayerInterval = null;
let activeCaptureNeonCellKey = null;
let activeCaptureNeonRadialPoint = null;
let winnerBannerDismissed = false;
let fireworksRafId = null;

let turnTimerInterval = null;
let turnTimeRemaining = 15000;
const MAX_TURN_TIME = 15000;

let gameAudioContext = null;
let gameAudioCompressor = null;
let gameSoundEnabled = true;
try { gameSoundEnabled = localStorage.getItem('ludoplay.sound.enabled') !== 'false'; } catch (_) {}

function getGameAudioContext() {
    if (!gameSoundEnabled) return null;
    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioConstructor) return null;
    try {
        if (!gameAudioContext || gameAudioContext.state === 'closed') {
            gameAudioContext = new AudioConstructor();
            gameAudioCompressor = gameAudioContext.createDynamicsCompressor();
            gameAudioCompressor.threshold.value = -2;
            gameAudioCompressor.knee.value = 3;
            gameAudioCompressor.ratio.value = 20;
            gameAudioCompressor.attack.value = 0.004;
            gameAudioCompressor.release.value = 0.12;
            gameAudioCompressor.connect(gameAudioContext.destination);
        }
        if (gameAudioContext.state === 'suspended') gameAudioContext.resume().catch(() => {});
        return gameAudioContext;
    } catch (_) {
        return null;
    }
}

function updateGameSoundButton() {
    const button = document.getElementById('gameSoundToggle');
    if (!button) return;
    button.textContent = gameSoundEnabled ? '🔊' : '🔇';
    button.title = gameSoundEnabled ? 'Mute game and reaction sounds' : 'Turn game and reaction sounds on';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(gameSoundEnabled));
}

function toggleGameSound() {
    gameSoundEnabled = !gameSoundEnabled;
    if (typeof saveLudoStorage === 'function') saveLudoStorage('ludoplay.sound.enabled', String(gameSoundEnabled));
    else { try { localStorage.setItem('ludoplay.sound.enabled', String(gameSoundEnabled)); } catch (_) {} }
    if (gameSoundEnabled) getGameAudioContext();
    updateGameSoundButton();
}

function playGameTone(context, frequency, delay, duration, volume, waveform = 'sine', endFrequency = null) {
    const raisedVolume = Math.min(2.8, volume * 23.2);
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + delay;
    const end = start + duration;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, raisedVolume), start + Math.min(0.012, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(gameAudioCompressor || context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.015);
}

function playGameNoise(context, duration, volume, filterType, frequency, delay = 0) {
    const raisedVolume = Math.min(2.8, volume * 23.2);
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / frameCount * 0.7);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const start = context.currentTime + delay;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, raisedVolume), start + Math.min(0.012, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(gameAudioCompressor || context.destination);
    source.start(start);
    source.stop(start + duration + 0.02);
}

function playTokenSlideReturnSound(durationSec = 0.42) {
    const context = getGameAudioContext();
    if (!context) return;
    const dur = Math.max(0.22, Math.min(0.95, durationSec));
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * dur));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        const t = i / frameCount;
        const env = Math.sin(Math.PI * t);
        samples[i] = (Math.random() * 2 - 1) * env;
    }

    const noiseSource = context.createBufferSource();
    const bandpass = context.createBiquadFilter();
    const gainNode = context.createGain();
    const now = context.currentTime;

    noiseSource.buffer = buffer;
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(3.6, now);
    bandpass.frequency.setValueAtTime(2400, now);
    bandpass.frequency.exponentialRampToValueAtTime(620, now + dur);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(1.15, now + dur * 0.18);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noiseSource.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(gameAudioCompressor || context.destination);
    noiseSource.start(now);
    noiseSource.stop(now + dur + 0.02);

    playGameTone(context, 980, 0, dur * 0.92, 0.045, 'sine', 240);
    playGameTone(context, 620, 0.02, dur * 0.85, 0.03, 'triangle', 155);
}

function playGameSound(soundName, variant = '') {
    const context = getGameAudioContext();
    if (!context) return;
    switch (soundName) {
        case 'emoji': {
            const mood = String(variant).toLowerCase();
            const notes = mood.includes('angry') || mood.includes('😡') ? [247, 196]
                : mood.includes('cry') || mood.includes('😢') ? [440, 349]
                : mood.includes('champ') || mood.includes('🏆') ? [784, 988, 1175]
                : mood.includes('funny') || mood.includes('🤣') ? [587, 740, 880]
                : [659, 784, 988];
            notes.forEach((frequency, index) => playGameTone(context, frequency, index * 0.07, 0.095, 0.014, 'sine'));
            break;
        }
        case 'diceRoll': {
            playGameNoise(context, 0.44, 0.032, 'lowpass', 1900);
            const clacks = [
                [0.014, 0.95, 290], [0.052, 0.72, 405], [0.096, 1.08, 255],
                [0.153, 0.78, 365], [0.211, 1.12, 320], [0.274, 0.76, 440],
                [0.329, 1.04, 275], [0.386, 0.86, 385], [0.426, 0.62, 235]
            ];
            clacks.forEach(([delay, strength, pitch], index) => {
                playGameNoise(context, 0.022, 0.012 * strength, 'bandpass', 1250 + (index % 3) * 360, delay);
                playGameTone(context, pitch, delay, 0.042, 0.009 * strength, 'triangle', pitch * 0.58);
            });
            break;
        }
        case 'diceStop':
            playGameNoise(context, 0.05, 0.03, 'lowpass', 900);
            playGameTone(context, 205, 0, 0.12, 0.032, 'triangle', 105);
            playGameNoise(context, 0.018, 0.015, 'bandpass', 1450, 0.018);
            playGameTone(context, 390, 0.022, 0.065, 0.018, 'sine', 245);
            break;
        case 'tokenStep':
            playGameNoise(context, 0.026, 0.025, 'bandpass', 950);
            playGameTone(context, 460, 0, 0.055, 0.026, 'triangle', 335);
            break;
        case 'tokenEnter':
            playGameTone(context, 500, 0, 0.08, 0.047, 'sine', 720);
            playGameTone(context, 760, 0.075, 0.11, 0.052, 'sine', 920);
            break;
        case 'capture':
            playGameNoise(context, 0.075, 0.095, 'bandpass', 1650);
            playGameTone(context, 520, 0, 0.085, 0.085, 'triangle', 160);
            playGameTone(context, 880, 0.045, 0.14, 0.075, 'sine', 1320);
            playGameTone(context, 1180, 0.095, 0.16, 0.065, 'triangle', 340);
            break;
        case 'tokenReturn':
            playGameTone(context, 420, 0, 0.09, 0.045, 'sine', 190);
            break;
        case 'home':
            [523, 659, 784, 988].forEach((frequency, index) =>
                playGameTone(context, frequency, index * 0.085, 0.16, 0.06, 'sine'));
            break;
        case 'victory':
            [523, 659, 784, 1047, 1319].forEach((frequency, index) =>
                playGameTone(context, frequency, index * 0.11, 0.24, 0.075, 'triangle'));
            break;
        case 'ladderClimb':
            [392, 494, 587, 698, 880].forEach((frequency, index) =>
                playGameTone(context, frequency, index * 0.14, 0.13, 0.04, 'sine'));
            break;
        case 'snakeSlide':
            playGameNoise(context, 0.82, 0.045, 'lowpass', 620);
            playGameTone(context, 470, 0, 0.82, 0.045, 'sawtooth', 125);
            break;
    }
}

updateGameSoundButton();

const LUDO_TRACK_PATH = [
    [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],
    [6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],
    [12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],
    [8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]
];
const LUDO_START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };
const LUDO_HOME_LANES = {
    red: [[7,1],[7,2],[7,3],[7,4],[7,5]],
    green: [[1,7],[2,7],[3,7],[4,7],[5,7]],
    yellow: [[7,13],[7,12],[7,11],[7,10],[7,9]],
    blue: [[13,7],[12,7],[11,7],[10,7],[9,7]]
};
const LUDO_SAFE_CELLS = new Set(['2,6','6,12','8,2','12,8','6,1','1,8','8,13','13,6']);
const LUDO_STAR_CELLS = new Set(['2,6','6,12','8,2','12,8']);
const LUDO_TOKEN_STEP_DURATION = 280;
const SNAKE_TOKEN_STEP_DURATION = LUDO_TOKEN_STEP_DURATION;
const SNAKE_LADDER_LINKS = { 4: 23, 13: 46, 33: 52, 42: 63, 50: 69, 62: 81, 74: 92 };
const SNAKE_LINKS = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };

function requestGameFullscreen(element) {
    const request = element?.requestFullscreen || element?.webkitRequestFullscreen || element?.msRequestFullscreen;
    if (!request) return;
    try {
        const result = request.call(element);
        if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) {}
}

const LUDO_COLORS_BY_COUNT = {
    2: ['blue','green'],
    3: ['blue','red','green'],
    4: ['blue','red','green','yellow']
};
const LUDO_RADIAL_COLOR_ORDER = ['red','green','orange','blue','yellow','purple'];
const LUDO_RADIAL_COLOR_HEX = { red:'#dc1824', green:'#008844', orange:'#111827', blue:'#0765a8', yellow:'#e6c200', purple:'#7e22ce' };
const LUDO_RADIAL_VERTICES = Array.from({ length: 6 }, (_, index) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return [250 + 220 * Math.cos(angle), 250 + 220 * Math.sin(angle)];
});
const LUDO_RADIAL_TRACK_PATH = Array.from({ length: 6 }, (_, side) => {
    const from = LUDO_RADIAL_VERTICES[side];
    const to = LUDO_RADIAL_VERTICES[(side + 1) % 6];
    return Array.from({ length: 10 }, (_, step) => {
        const amount = step / 10;
        return [from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount];
    });
}).flat();
const LUDO_RADIAL_HOME_LANES = Array.from({ length: 6 }, (_, playerIndex) => {
    const angle = (-90 + playerIndex * 60) * Math.PI / 180;
    return [192,164,136,108,80].map(radius => [250 + radius * Math.cos(angle), 250 + radius * Math.sin(angle)]);
});
const LUDO_RADIAL_SAFE_CELLS = new Set(Array.from({ length: 6 }, (_, index) => LUDO_RADIAL_TRACK_PATH[index * 10].join(',')));

function resetAndStartTurnTimer() {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
    document.querySelectorAll('.lk-timer-ring').forEach(ring => {
        ring.style.display = 'none';
    });
    document.querySelectorAll('.lk-player-badge').forEach(badge => {
        badge.classList.remove('warning-time');
    });
}

function startLiveGreatPlayerPeriodicScheduler() {
    clearTimeout(liveGreatPlayerTimer);
    clearInterval(liveGreatPlayerInterval);
    liveGreatPlayerIndex = -1;
    liveGreatPlayerUntil = 0;

    liveGreatPlayerInterval = setInterval(() => {
        if (document.getElementById('gameArenaScreen')?.style.display === 'none') return;
        updateLiveGreatPlayer();
    }, 300000);
}

function stopVictoryFireworks3D() {
    if (fireworksRafId) {
        cancelAnimationFrame(fireworksRafId);
        fireworksRafId = null;
    }
    const existingCanvas = document.getElementById('ludoVictoryFireworksCanvas');
    if (existingCanvas) existingCanvas.remove();
}

function startVictoryFireworks3D() {
    const arena = document.getElementById('gameArenaScreen');
    if (!arena || document.getElementById('ludoVictoryFireworksCanvas')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'ludoVictoryFireworksCanvas';
    canvas.className = 'ludo-fireworks-canvas';
    arena.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();

    const colors = ['#00f2fe', '#facc15', '#ff007f', '#22c55e', '#a855f7', '#fb7185', '#ffffff'];
    const rockets = [];
    const sparks = [];

    const spawnBurst = (bx, by) => {
        const count = 48;
        const baseColor = colors[Math.floor(Math.random() * colors.length)];
        const altColor = colors[Math.floor(Math.random() * colors.length)];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.2;
            const speed = 2.2 + Math.random() * 5.8;
            sparks.push({
                x: bx, y: by,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                alpha: 1, decay: 0.012 + Math.random() * 0.014,
                size: 2.5 + Math.random() * 3.2,
                color: i % 2 === 0 ? baseColor : altColor
            });
        }
    };

    const w = canvas.width;
    const h = canvas.height;
    [
        [w * 0.16, h * 0.22], [w * 0.84, h * 0.22],
        [w * 0.18, h * 0.76], [w * 0.82, h * 0.76]
    ].forEach(([bx, by]) => spawnBurst(bx, by));

    let frameTick = 0;
    const renderLoop = () => {
        if (!document.getElementById('ludoVictoryFireworksCanvas')) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        frameTick++;
        if (frameTick % 26 === 0) {
            const side = Math.random() < 0.5 ? (0.08 + Math.random() * 0.22) : (0.70 + Math.random() * 0.22);
            const targetX = canvas.width * side;
            const targetY = canvas.height * (0.14 + Math.random() * 0.62);
            rockets.push({
                x: targetX, y: canvas.height,
                tx: targetX, ty: targetY,
                vy: -9 - Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }

        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            r.y += r.vy;
            ctx.save();
            ctx.beginPath();
            ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 14;
            ctx.shadowColor = r.color;
            ctx.fill();
            ctx.restore();

            if (r.y <= r.ty) {
                spawnBurst(r.x, r.y);
                rockets.splice(i, 1);
            }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i];
            s.x += s.vx; s.y += s.vy;
            s.vy += 0.065; s.vx *= 0.985;
            s.alpha -= s.decay;

            if (s.alpha <= 0) {
                sparks.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, s.alpha);
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.shadowBlur = 12;
            ctx.shadowColor = s.color;
            ctx.fill();
            ctx.restore();
        }

        fireworksRafId = requestAnimationFrame(renderLoop);
    };
    fireworksRafId = requestAnimationFrame(renderLoop);
}

function dismissWinnerPopup() {
    winnerBannerDismissed = true;
    const banner = document.querySelector('#arenaStage .ludo-winner-banner');
    if (banner) banner.remove();
    stopVictoryFireworks3D();
}

function replaySameMatch() {
    stopVictoryFireworks3D();
    winnerBannerDismissed = false;
    launchGameMatch();
}

function createPipDiceHTML(val) {
    const num = Number.isInteger(Number(val)) && Number(val) >= 1 && Number(val) <= 6 ? Number(val) : 6;
    const map = {
        1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
    };
    const makeFace = (faceValue, faceName) => {
        const activePips = map[faceValue];
        const dots = Array.from({ length: 9 }, (_, index) => {
            const isShow = activePips.includes(index);
            const redClass = (faceValue === 1 || faceValue === 6) && isShow ? 'red-pip' : '';
            return `<span class="pip ${isShow ? `show ${redClass}` : ''}"></span>`;
        }).join('');
        return `<div class="cube-face face-${faceName} pips-${faceValue}" aria-hidden="true">${dots}</div>`;
    };
    const sidePairs = [[1, 6], [2, 5], [3, 4]].filter(pair => !pair.includes(num));
    const [top, bottom] = sidePairs[0];
    const [right, left] = sidePairs[1];
    const back = 7 - num;

    return `<div class="pip-dice" role="img" aria-label="Dice showing ${num}">${makeFace(num, 'front')}${makeFace(back, 'back')}${makeFace(top, 'top')}${makeFace(bottom, 'bottom')}${makeFace(right, 'right')}${makeFace(left, 'left')}</div>`;
}

function launchGameMatch() {
    closeFullScreenSetup();
    stopVictoryFireworks3D();
    winnerBannerDismissed = false;
    let count = 2;
    if (selectedSubMode === 'ai' || selectedSubMode.startsWith('pass')) {
        count = (selectedSubMode.startsWith('pass') && passPlaySubType === 'teamup') ? 4 : (parseInt(matchConfigValue) || 2);
    } 
    else if (selectedSubMode.startsWith('online')) { count = selectedOnlineSubMode === 'individual' ? 4 : 2; } 
    else if (selectedSubMode === 'tourney') { count = 4; }
    currentMatchPlayerCount = count;
    startActiveMatchSaveSession();

    if (activeGameType === 'snake') { launchSnakeMatch(count); return; }

    const avatars = ['👦', '👧', '🧔', '👩', '👳‍♂️', '👱‍♀️'];
    const defaultNames = ['You', 'Sophia', 'Richard', 'Mark', 'Ajay', 'Shaikh'];
    const radialLudo = count > 4;
    const ludoColors = LUDO_COLORS_BY_COUNT[count] || LUDO_RADIAL_COLOR_ORDER;
    activePlayersList = []; consecutiveSixCount = {}; isDiceRolling = false; ludoPendingMove = null;
    ludoMatchWinner = null; activeCaptureNeonCellKey = null; activeCaptureNeonRadialPoint = null;
    startLiveGreatPlayerPeriodicScheduler();
    ludoAnimationEpoch++; isTokenAnimating = false; ludoQuickMatch = selectedSubMode === 'pass_quick' || selectedSubMode === 'online_quick';
    ludoFirstKillOccurred = false; ludoFinishCelebration = null; ludoMatchIsOffline = !selectedSubMode.startsWith('online');
    ludoMatchStartedAt = Date.now(); ludoMatchFinishedAt = null; currentMatchResultRecorded = false;
    clearTimeout(ludoFinishTimer); clearTimeout(ludoAutoMoveTimer); clearTimeout(ludoAiTimer); clearTimeout(turnTimerInterval);

    activePlayersList.push({
        name: currentUser.name || 'You', playerId: getCurrentProfileId(), avatar: currentUser.avatar === 'female' ? '👧' : '👦',
        isAI: false, lastRoll: 6, pos: 1, color: ludoColors[0],
        startIndex: radialLudo ? 0 : LUDO_START_INDEX[ludoColors[0]], trackPath: radialLudo ? LUDO_RADIAL_TRACK_PATH : LUDO_TRACK_PATH,
        homeLane: radialLudo ? LUDO_RADIAL_HOME_LANES[0] : LUDO_HOME_LANES[ludoColors[0]],
        trackLength: radialLudo ? 59 : 51, finishProgress: radialLudo ? 64 : 56, safeCells: radialLudo ? LUDO_RADIAL_SAFE_CELLS : LUDO_SAFE_CELLS,
        radialIndex: radialLudo ? 0 : -1, tokens: Array.from({ length: 4 }, () => ({ progress: -1 })),
        kills: 0, maxCaptureBurst: 0, wasBehind: false, turnResponseTimes: [], turnStartedAt: Date.now()
    });

    for (let i = 1; i < count; i++) {
        activePlayersList.push({
            name: selectedSubMode === 'ai' ? defaultNames[i] : `Player ${i + 1}`,
            playerId: selectedSubMode === 'ai' ? `bot:${defaultNames[i].toLowerCase()}` : `local:${i}:${Date.now()}`,
            avatar: avatars[i % avatars.length], isAI: selectedSubMode === 'ai', lastRoll: 5, pos: 1,
            color: ludoColors[i], startIndex: radialLudo ? i * 10 : LUDO_START_INDEX[ludoColors[i]],
            trackPath: radialLudo ? LUDO_RADIAL_TRACK_PATH : LUDO_TRACK_PATH, homeLane: radialLudo ? LUDO_RADIAL_HOME_LANES[i] : LUDO_HOME_LANES[ludoColors[i]],
            trackLength: radialLudo ? 59 : 51, finishProgress: radialLudo ? 64 : 56, safeCells: radialLudo ? LUDO_RADIAL_SAFE_CELLS : LUDO_SAFE_CELLS,
            radialIndex: radialLudo ? i : -1, tokens: Array.from({ length: 4 }, () => ({ progress: -1 })),
            kills: 0, maxCaptureBurst: 0, wasBehind: false, turnResponseTimes: [], turnStartedAt: Date.now()
        });
    }

    if (ludoMatchIsOffline && selectedSubMode.startsWith('pass') && passPlaySubType === 'teamup' && activePlayersList.length === 4) {
        activePlayersList.forEach((p, idx) => {
            p.teamId = idx % 2;
        });
        showGameToast('👥 Team Up Active! Diagonal Partners: Team A (Blue & Green) vs Team B (Red & Yellow)');
    }

    currentTurnIndex = 0;
    const arena = document.getElementById('gameArenaScreen');
    arena.classList.remove('snake-theme');
    arena.classList.add('ludo-mode');
    
    renderFullStage(); arena.style.display = 'flex'; beginOnlineMatchSession(); updateAdminMatchBadgeControl(true);
    refreshAdminMatchBadges(); requestGameFullscreen(arena); autoSaveActiveMatch(); resetAndStartTurnTimer();
}

function quitGameMatch() {
    stopVictoryFireworks3D();
    winnerBannerDismissed = false;
    autoSaveActiveMatch(); clearTimeout(ludoAiTimer); clearTimeout(ludoFinishTimer); clearTimeout(ludoAutoMoveTimer); clearTimeout(turnTimerInterval);
    clearTimeout(liveGreatPlayerTimer); clearInterval(liveGreatPlayerInterval);
    ludoAnimationEpoch++; isTokenAnimating = false; ludoPendingMove = null; document.getElementById('gameArenaScreen').style.display = 'none';
    endOnlineMatchSession(); updateAdminMatchBadgeControl(false); snakeVisualMotion = null;
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exitFullscreen && (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement)) {
        try { const result = exitFullscreen.call(document); if (result && typeof result.catch === 'function') result.catch(() => {}); } catch (_) {}
    }
}

function restoreLudoMatchFromSave(save) {
    try {
        stopVictoryFireworks3D();
        winnerBannerDismissed = false;
        const radial = save.players.length > 4; currentMatchPlayerCount = save.players.length; activeGameType = 'ludo';
        selectedSubMode = ['ai', 'pass_normal', 'pass_quick', 'tourney'].includes(save.subMode) ? save.subMode : 'ai';
        currentTurnIndex = save.turnIndex;
        const maxTrack = radial ? 59 : 51;
        const maxFinish = radial ? 64 : 56;
        activePlayersList = save.players.map((stored, index) => {
            const colorOrder = radial ? LUDO_RADIAL_COLOR_ORDER : (LUDO_COLORS_BY_COUNT[currentMatchPlayerCount] || LUDO_RADIAL_COLOR_ORDER);
            const color = colorOrder.includes(stored.color) ? stored.color : colorOrder[index];
            const radialIndex = radial ? index : -1;
            return {
                ...stored, color, isAI: Boolean(stored.isAI),
                tokens: stored.tokens.map(token => ({ progress: Math.min(maxFinish, Number(token.progress)) })),
                startIndex: radial ? index * 10 : LUDO_START_INDEX[color], trackPath: radial ? LUDO_RADIAL_TRACK_PATH : LUDO_TRACK_PATH,
                homeLane: radial ? LUDO_RADIAL_HOME_LANES[index] : LUDO_HOME_LANES[color], trackLength: maxTrack, finishProgress: maxFinish,
                safeCells: radial ? LUDO_RADIAL_SAFE_CELLS : LUDO_SAFE_CELLS, radialIndex, turnStartedAt: Date.now()
            };
        });
        consecutiveSixCount = save.consecutiveSixCount && typeof save.consecutiveSixCount === 'object' ? { ...save.consecutiveSixCount } : {};
        snakeConsecutiveOnes = save.snakeConsecutiveOnes && typeof save.snakeConsecutiveOnes === 'object' ? { ...save.snakeConsecutiveOnes } : {};
        ludoPendingMove = null; ludoMatchWinner = null; snakeMatchWinner = null; activeCaptureNeonCellKey = null; activeCaptureNeonRadialPoint = null;
        startLiveGreatPlayerPeriodicScheduler();
        ludoQuickMatch = Boolean(save.quickMatch); ludoFirstKillOccurred = Boolean(save.firstKillOccurred); ludoMatchIsOffline = true;
        ludoMatchStartedAt = Date.now() - Math.max(0, Number(save.elapsedMs) || 0); ludoMatchFinishedAt = null; currentMatchResultRecorded = false;
        isDiceRolling = false; isTokenAnimating = false; ludoAnimationEpoch++; clearTimeout(ludoAiTimer); clearTimeout(ludoFinishTimer); clearTimeout(ludoAutoMoveTimer); clearTimeout(turnTimerInterval);
        activeMatchSaveId = save.id; const arena = document.getElementById('gameArenaScreen'); arena.classList.remove('snake-theme'); arena.classList.add('ludo-mode'); arena.style.display = 'flex';
        beginOnlineMatchSession(); renderFullStage(); updateAdminMatchBadgeControl(true); refreshAdminMatchBadges(); requestGameFullscreen(arena); autoSaveActiveMatch(); resetAndStartTurnTimer();
        return true;
    } catch (_) { return false; }
}

function getLudoGreatPlayerIndex() {
    if (!activePlayersList.length) return -1;
    let bestIndex = 0;
    const getStats = player => ({
        captures: player.kills || 0,
        finished: player.tokens.filter(token => token.progress === player.finishProgress).length,
        progress: player.tokens.reduce((sum, token) => sum + Math.max(0, token.progress), 0),
        won: activePlayersList.indexOf(player) === ludoMatchWinner ? 1 : 0
    });
    for (let i = 1; i < activePlayersList.length; i++) {
        const candidate = getStats(activePlayersList[i]);
        const best = getStats(activePlayersList[bestIndex]);
        if (candidate.captures > best.captures || (candidate.captures === best.captures && candidate.finished > best.finished) || (candidate.captures === best.captures && candidate.finished === best.finished && candidate.progress > best.progress) || (candidate.captures === best.captures && candidate.finished === best.finished && candidate.progress === best.progress && candidate.won > best.won)) {
            bestIndex = i;
        }
    }
    return bestIndex;
}

function getLiveGreatStarMarkup(playerIndex) {
    return playerIndex === liveGreatPlayerIndex && Date.now() < liveGreatPlayerUntil
        ? '<span class="live-great-star" title="Current Great Player · highlights for one minute">★<small>KING</small></span>' : '';
}

function updateLiveGreatPlayer() {
    if (!['ludo', 'snake'].includes(activeGameType) || !activePlayersList.length || ludoMatchWinner !== null || snakeMatchWinner !== null) return;
    
    const hasRealProgress = activeGameType === 'snake'
        ? activePlayersList.some(player => player.pos > 15)
        : activePlayersList.some(player => (player.kills || 0) > 0 || player.tokens.reduce((sum, token) => sum + Math.max(0, token.progress), 0) > 10);
        
    if (!hasRealProgress) return;

    liveGreatPlayerIndex = activeGameType === 'snake'
        ? activePlayersList.reduce((best, player, index, players) => player.pos > players[best].pos ? index : best, 0)
        : getLudoGreatPlayerIndex();
        
    if (liveGreatPlayerIndex < 0) return;
    liveGreatPlayerUntil = Date.now() + 60000;
    if (document.getElementById('gameArenaScreen')?.style.display !== 'none' && !isTokenAnimating && !isDiceRolling) {
        renderFullStage();
    }
    clearTimeout(liveGreatPlayerTimer);
    liveGreatPlayerTimer = setTimeout(() => {
        liveGreatPlayerIndex = -1;
        liveGreatPlayerUntil = 0;
        if (document.getElementById('gameArenaScreen')?.style.display !== 'none' && ['ludo', 'snake'].includes(activeGameType) && !isTokenAnimating && !isDiceRolling) {
            renderFullStage();
        }
    }, 60000);
}

function getLudoLeaderboardMarkup() {
    const ranked = activePlayersList.map((player, index) => ({ player, index, score: (player.tokens.filter(token => token.progress === player.finishProgress).length * 1000) + ((player.kills || 0) * 100) + player.tokens.reduce((sum, token) => sum + Math.max(0, token.progress), 0) })).sort((a, b) => (a.index === ludoMatchWinner ? -1 : b.index === ludoMatchWinner ? 1 : b.score - a.score));
    return `<div class="ludo-leaderboard"><span class="ludo-leaderboard-title">${ludoMatchIsOffline ? 'MATCH STANDINGS' : 'ONLINE LEADERBOARD'}</span>${ranked.map((row, rank) => {
        const color = LUDO_RADIAL_COLOR_HEX[row.player.color] || '#fff'; const name = escapeLudoResultText(row.player.name || `Player ${row.index + 1}`); const title = rank === 0 ? (ludoMatchWinner === row.index ? 'WINNER' : 'LEADING') : `${row.score} pts`;
        return `<div class="ludo-leaderboard-row ${rank === 0 ? 'first' : ''}"><span class="ludo-leaderboard-rank">${rank + 1}${rank === 0 ? 'st' : rank === 1 ? 'nd' : rank === 2 ? 'rd' : 'th'}</span><i class="ludo-leaderboard-color" style="--rank-color:${color}"></i><span class="ludo-leaderboard-name">${name}</span><span class="ludo-leaderboard-score">${title}</span></div>`;
    }).join('')}</div>`;
}

function formatLudoMatchDuration() {
    if (ludoMatchStartedAt === null) return '00:00';
    const endTime = ludoMatchFinishedAt || Date.now();
    const totalSeconds = Math.max(0, Math.floor((endTime - ludoMatchStartedAt) / 1000));
    const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60;
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeLudoResultText(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

function getLudoResultMarkup() {
    const winner = activePlayersList[ludoMatchWinner]; const greatPlayerIndex = getLudoGreatPlayerIndex(); const greatPlayer = activePlayersList[greatPlayerIndex];
    const winnerName = escapeLudoResultText(winner ? winner.name : 'Player'); const greatName = escapeLudoResultText(greatPlayer ? greatPlayer.name : 'Player');
    const color = greatPlayer ? (LUDO_RADIAL_COLOR_HEX[greatPlayer.color] || '#fff') : '#fff'; const captures = greatPlayer ? (greatPlayer.kills || 0) : 0;
    const winnerIsMe = winner && winner.playerId === getCurrentProfileId();
    const trophy = ludoMatchIsOffline || winnerIsMe ? '<span class="winner-medal">🏆</span>' : '';
    const celebration = !ludoMatchIsOffline && winnerIsMe ? '<span class="winner-exclusive">🏆 YOU WON · CHAMPION</span>' : '';
    return `
        <div class="ludo-winner-banner">
            <button type="button" class="winner-popup-close-3d" onclick="dismissWinnerPopup()" title="Close" aria-label="Close popup">×</button>
            ${trophy}
            <strong>FIRST PLACE</strong>
            <span class="winner-name">${winnerName}</span>
            ${celebration}
            <div class="ludo-result-time"><span>MATCH TIME</span><strong>${formatLudoMatchDuration()}</strong></div>
            <div class="ludo-great-player-card">
                <span class="ludo-mvp-color" style="--mvp-color:${color}"></span>
                <div class="ludo-mvp-details">
                    <small>GREAT PLAYER OF THE MATCH</small>
                    <strong>${greatName} · ${escapeLudoResultText(greatPlayer?.color || 'player')} token</strong>
                    <span>(${captures} capture${captures === 1 ? '' : 's'})</span>
                </div>
            </div>
            ${getLudoLeaderboardMarkup()}
            <div class="winner-actions-3d">
                <button type="button" class="winner-btn-3d play-again-3d" onclick="replaySameMatch()">🔄 Play Again</button>
                <button type="button" class="winner-btn-3d back-home-3d" onclick="quitGameMatch()">🏠 Back to Home</button>
            </div>
        </div>
    `;
}

function renderFullStage() {
    const stage = document.getElementById('arenaStage');
    if (activeGameType === 'snake') { renderSnakeStage(stage); } else if (currentMatchPlayerCount <= 4) { render4PlayerLudoStage(stage); } else { render6PlayerRadialLudoStage(stage); }
    if (activeGameType === 'ludo') renderLudoBoardPieces();
    if (activeGameType === 'ludo') scheduleLudoAIAction();
    if (activeGameType === 'snake') scheduleSnakeAIAction();
    if (ludoMatchWinner !== null && activeGameType === 'ludo' && !winnerBannerDismissed) {
        stage.insertAdjacentHTML('beforeend', getLudoResultMarkup());
        startVictoryFireworks3D();
    }
}

function ludoPieceCell(player, piece) {
    const progress = Math.round(Number(piece.progress));
    if (isNaN(progress) || progress < 0 || progress >= player.finishProgress) return null;
    const fullLoopLength = player.trackPath.length;
    if (progress < player.trackLength) {
        return player.trackPath[(player.startIndex + progress) % fullLoopLength];
    }
    return player.homeLane[progress - player.trackLength] || null;
}

function isLegalLudoPiece(playerIndex, pieceIndex) {
    return Boolean(ludoPendingMove && ludoPendingMove.playerIndex === playerIndex && ludoPendingMove.legalPieceIndexes.includes(pieceIndex));
}

function createLudoPieceMarkup(playerIndex, pieceIndex, boardPiece = false) {
    const player = activePlayersList[playerIndex]; const legal = isLegalLudoPiece(playerIndex, pieceIndex);
    const piece = player.tokens[pieceIndex];
    const slidingClass = piece && piece.isReturningSlide ? ' returning-glide-token' : '';
    const classes = `lk-pin-token pin-${player.color}${boardPiece ? ' board-piece-token' : ''}${legal ? ' legal-move' : ''}${slidingClass}`;
    const handler = legal ? `onclick="chooseLudoPiece(${playerIndex},${pieceIndex})"` : '';
    return `<div class="${classes}" ${handler} role="${legal ? 'button' : 'img'}" aria-label="${player.name} token ${pieceIndex + 1}"></div>`;
}

function renderLudoBoardPieces() {
    if (currentMatchPlayerCount > 4) { renderRadialLudoPieces(); return; }
    document.querySelectorAll('#arenaStage .piece-stack').forEach(stack => { stack.innerHTML = ''; });
    activePlayersList.forEach((player, playerIndex) => {
        player.tokens.forEach((piece, pieceIndex) => {
            if (piece.progress < 0) return;
            if (piece.progress === player.finishProgress) {
                const finishStack = document.querySelector('#arenaStage [data-cell-stack="center"]');
                if (finishStack) {
                    const celebrate = ludoFinishCelebration && ludoFinishCelebration.playerIndex === playerIndex && ludoFinishCelebration.pieceIndex === pieceIndex;
                    finishStack.insertAdjacentHTML('beforeend', `<div class="finish-token pin-${player.color}${celebrate ? ' finish-arrival' : ''}" title="${player.name} token home"></div>`);
                }
                return;
            }
            const cell = ludoPieceCell(player, piece);
            if (!cell) return;
            const stack = document.querySelector(`#arenaStage [data-cell-stack="${cell[0]},${cell[1]}"]`);
            if (stack) stack.insertAdjacentHTML('beforeend', createLudoPieceMarkup(playerIndex, pieceIndex, true));
        });
    });
    document.querySelectorAll('#arenaStage .piece-stack').forEach(stack => { if (stack.children.length > 1) stack.classList.add('crowded'); });

    if (activeCaptureNeonCellKey) {
        const capCell = document.querySelector(`#arenaStage [data-cell="${activeCaptureNeonCellKey}"]`);
        if (capCell) capCell.classList.add('capture-neon-burst');
    }
}

function buildPlayerBadgeHTML(pIdx, isRightSide = false, extraClass = '') {
    const p = activePlayersList[pIdx];
    if (!p) { return `<div class="lk-player-badge inactive-slot ${isRightSide ? 'right-side' : ''} ${extraClass}"></div>`; }
    const isTurn = (pIdx === currentTurnIndex);
    const arrowChar = isRightSide ? '➡️' : '⬅️';
    const diceContent = `<div class="lk-dice-slot" id="dice_slot_${pIdx}">${createPipDiceHTML(p.lastRoll)}</div>`;

    return `
        <div id="badge_${pIdx}" class="lk-player-badge ${isRightSide ? 'right-side' : ''} ${isTurn ? 'active-turn' : ''} ${extraClass}" onclick="rollPlayerDice(${pIdx})">
            <div class="lk-avatar-col">
                <div class="lk-timer-ring" id="timer_ring_${pIdx}"></div>
                <div class="lk-avatar-frame">${p.avatar}</div>
                <div class="lk-player-name" data-admin-name-index="${pIdx}"><button type="button" class="lk-player-label" onclick="event.stopPropagation(); openPlayerProfile(${pIdx})">${escapeHTML(p.name)}</button>${renderAdminMatchBadgeMarkup(pIdx)}${getLiveGreatStarMarkup(pIdx)}</div>
            </div>
            <div class="lk-dice-col">
                ${diceContent}
                <div class="lk-status-dots">
                    <span></span><span></span><span></span><span></span>
                </div>
            </div>
            <div class="lk-turn-arrow">${arrowChar}</div>
        </div>
    `;
}

function isSixActiveForPlayer(playerIdx) {
    return Boolean(ludoPendingMove && ludoPendingMove.playerIndex === playerIdx && ludoPendingMove.roll === 6);
}

function render4PlayerLudoStage(stage) {
    window.render4PlayerLudoStage = function(stage) {
    const colorPlayers = Object.fromEntries(activePlayersList.map((player, index) => [player.color, index]));
    
    // Get Player 0's chosen color (e.g. blue, red, green, yellow)
    const myColor = activePlayersList[0]?.color || 'blue';

    // To make Player 0's home base ALWAYS sit at the Bottom-Left corner:
    // Physical board layout corners: BL=blue, TL=red, TR=green, BR=yellow
    // Rotation degrees needed to bring any base to Bottom-Left (BL):
    // blue (already BL) = 0deg, yellow (was BR) = 90deg, green (was TR) = 180deg, red (was TL) = 270deg
    const rotMap = { blue: 0, yellow: 90, green: 180, red: 270 };
    const boardRotDeg = rotMap[myColor] ?? 0;

    // HUD badges mapping so Player 0 is always bottom-left badge, etc.
    const blIdx = colorPlayers[myColor] ?? 0;
    const clockwiseColors = ['blue', 'yellow', 'green', 'red'];
    const myIdxInClockwise = clockwiseColors.indexOf(myColor);
    
    const tlColor = clockwiseColors[(myIdxInClockwise + 1) % 4];
    const trColor = clockwiseColors[(myIdxInClockwise + 2) % 4];
    const brColor = clockwiseColors[(myIdxInClockwise + 3) % 4];

    const tlIdx = colorPlayers[tlColor] ?? -1;
    const trIdx = colorPlayers[trColor] ?? -1;
    const brIdx = colorPlayers[brColor] ?? -1;

    const redSix = isSixActiveForPlayer(colorPlayers.red ?? -1);
    const greenSix = isSixActiveForPlayer(colorPlayers.green ?? -1);
    const yellowSix = isSixActiveForPlayer(colorPlayers.yellow ?? -1);
    const blueSix = isSixActiveForPlayer(colorPlayers.blue ?? -1);

    const isTeamUp = (ludoMatchIsOffline && selectedSubMode.startsWith('pass') && passPlaySubType === 'teamup') || selectedSubMode.includes('teamup');
    const teamStyleBase = 'position:absolute;z-index:6;padding:2px 7px;border-radius:6px;font-size:9px;font-weight:900;letter-spacing:0.08em;color:rgba(255,255,255,0.88);background:linear-gradient(145deg,rgba(15,23,42,0.55),rgba(30,41,59,0.35));border:1px solid rgba(255,255,255,0.35);box-shadow:0 2px 0 rgba(0,0,0,0.45),0 3px 6px rgba(0,0,0,0.3);text-shadow:0 1px 2px rgba(0,0,0,0.8);pointer-events:none;';
    const labelRedTL    = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}top:5px;left:6px;">TEAM B</span>` : '';
    const labelGreenTR  = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}top:5px;right:6px;">TEAM A</span>` : '';
    const labelBlueBL   = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}bottom:5px;left:6px;">TEAM A</span>` : '';
    const labelYellowBR = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}bottom:5px;right:6px;">TEAM B</span>` : '';

    let cells = '';
    for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
        if ((row >= 6 && row <= 8 && col >= 6 && col <= 8) || (row < 6 && col < 6) || (row < 6 && col > 8) || (row > 8 && col < 6) || (row > 8 && col > 8)) continue;
        let cls = 'board-cell';
        if (row === 7 && col >= 1 && col <= 5) cls += ' lane-red';
        if (col === 7 && row >= 1 && row <= 5) cls += ' lane-green';
        if (row === 7 && col >= 9 && col <= 13) cls += ' lane-yellow';
        if (col === 7 && row >= 9 && row <= 13) cls += ' lane-blue';
        if (row === 0 && col === 7) cls += ' arrow-top';
        if (row === 7 && col === 14) cls += ' arrow-right';
        if (row === 14 && col === 7) cls += ' arrow-bottom';
        if (row === 7 && col === 0) cls += ' arrow-left';
        if (row === 6 && col === 1) cls = 'board-cell start-red' + (redSix ? ' dice-six-highlight' : '');
        if (row === 1 && col === 8) cls = 'board-cell start-green' + (greenSix ? ' dice-six-highlight' : '');
        if (row === 8 && col === 13) cls = 'board-cell start-yellow' + (yellowSix ? ' dice-six-highlight' : '');
        if (row === 13 && col === 6) cls = 'board-cell start-blue' + (blueSix ? ' dice-six-highlight' : '');
        if (LUDO_STAR_CELLS.has(`${row},${col}`)) cls += ' safe';
        if (activeCaptureNeonCellKey === `${row},${col}`) cls += ' capture-neon-burst';
        cells += `<div class="${cls}" data-cell="${row},${col}" style="grid-row:${row + 1};grid-column:${col + 1}"><div class="piece-stack" data-cell-stack="${row},${col}"></div></div>`;
    }

    const rIdx = colorPlayers.red ?? -1;
    const gIdx = colorPlayers.green ?? -1;
    const bIdx = colorPlayers.blue ?? -1;
    const yIdx = colorPlayers.yellow ?? -1;

    const makePinSpot = (colorClass, playerIndex, pieceIndex) => `<div class="token-spot ${colorClass}">${playerIndex >= 0 && activePlayersList[playerIndex].tokens[pieceIndex].progress < 0 ? createLudoPieceMarkup(playerIndex, pieceIndex) : ''}</div>`;

    stage.innerHTML = `
        <div class="lk-hud-row">${buildPlayerBadgeHTML(tlIdx, false)} ${buildPlayerBadgeHTML(trIdx, true)}</div>
        <div class="lk-board-box">
            <div class="ludo-board-grid cam-rot-${boardRotDeg}" style="transform: rotate(${boardRotDeg}deg); transform-origin: center center;">
                ${cells}
                <div class="board-home-base base-red ${redSix ? 'base-six-neon' : ''}" style="position:relative;">${labelRedTL}<div class="home-inner-box">${makePinSpot('spot-red',rIdx,0)}${makePinSpot('spot-red',rIdx,1)}${makePinSpot('spot-red',rIdx,2)}${makePinSpot('spot-red',rIdx,3)}</div></div>
                <div class="board-home-base base-green ${greenSix ? 'base-six-neon' : ''}" style="position:relative;">${labelGreenTR}<div class="home-inner-box">${makePinSpot('spot-green',gIdx,0)}${makePinSpot('spot-green',gIdx,1)}${makePinSpot('spot-green',gIdx,2)}${makePinSpot('spot-green',gIdx,3)}</div></div>
                <div class="center-home"><div class="piece-stack finish-stack" data-cell-stack="center"></div></div>
                <div class="board-home-base base-blue ${blueSix ? 'base-six-neon' : ''}" style="position:relative;">${labelBlueBL}<div class="home-inner-box">${makePinSpot('spot-blue',bIdx,0)}${makePinSpot('spot-blue',bIdx,1)}${makePinSpot('spot-blue',bIdx,2)}${makePinSpot('spot-blue',bIdx,3)}</div></div>
                <div class="board-home-base base-yellow ${yellowSix ? 'base-six-neon' : ''}" style="position:relative;">${labelYellowBR}<div class="home-inner-box">${makePinSpot('spot-yellow',yIdx,0)}${makePinSpot('spot-yellow',yIdx,1)}${makePinSpot('spot-yellow',yIdx,2)}${makePinSpot('spot-yellow',yIdx,3)}</div></div>
            </div>
        </div>
        <div class="lk-hud-row">${buildPlayerBadgeHTML(blIdx, false)} ${buildPlayerBadgeHTML(brIdx, true)}</div>
    `;
};

    stage.innerHTML = `
        <div class="lk-hud-row">${buildPlayerBadgeHTML(tlIdx, false)} ${buildPlayerBadgeHTML(trIdx, true)}</div>
        <div class="lk-board-box">
            <div class="ludo-board-grid">
                ${cells}
                <div class="board-home-base base-red ${redSix ? 'base-six-neon' : ''}" style="position:relative;">${labelRedTL}<div class="home-inner-box">${makePinSpot('spot-red',tlIdx,0)}${makePinSpot('spot-red',tlIdx,1)}${makePinSpot('spot-red',tlIdx,2)}${makePinSpot('spot-red',tlIdx,3)}</div></div>
                <div class="board-home-base base-green ${greenSix ? 'base-six-neon' : ''}" style="position:relative;">${labelGreenTR}<div class="home-inner-box">${makePinSpot('spot-green',trIdx,0)}${makePinSpot('spot-green',trIdx,1)}${makePinSpot('spot-green',trIdx,2)}${makePinSpot('spot-green',trIdx,3)}</div></div>
                <div class="center-home"><div class="piece-stack finish-stack" data-cell-stack="center"></div></div>
                <div class="board-home-base base-blue ${blueSix ? 'base-six-neon' : ''}" style="position:relative;">${labelBlueBL}<div class="home-inner-box">${makePinSpot('spot-blue',blIdx,0)}${makePinSpot('spot-blue',blIdx,1)}${makePinSpot('spot-blue',blIdx,2)}${makePinSpot('spot-blue',blIdx,3)}</div></div>
                <div class="board-home-base base-yellow ${yellowSix ? 'base-six-neon' : ''}" style="position:relative;">${labelYellowBR}<div class="home-inner-box">${makePinSpot('spot-yellow',brIdx,0)}${makePinSpot('spot-yellow',brIdx,1)}${makePinSpot('spot-yellow',brIdx,2)}${makePinSpot('spot-yellow',brIdx,3)}</div></div>
            </div>
        </div>
        <div class="lk-hud-row">${buildPlayerBadgeHTML(blIdx, false)} ${buildPlayerBadgeHTML(brIdx, true)}</div>
    `;
}

function render6PlayerRadialLudoStage(stage) {
    let svgParts = '';
    for (let i = 0; i < 6; i++) {
        const rot = i * 60; const c = LUDO_RADIAL_COLOR_HEX[LUDO_RADIAL_COLOR_ORDER[i]]; const pName = activePlayersList[i] ? activePlayersList[i].name : '';
        const isSix = isSixActiveForPlayer(i);
        const neonFilter = isSix ? 'filter="url(#safeStarGlow)" stroke="#00f2fe" stroke-width="3.5"' : 'stroke="#1e293b" stroke-width="2"';
        svgParts += `<g transform="rotate(${rot} 250 250)">
                <rect x="205" y="6" width="90" height="18" rx="5" fill="${c}" stroke="#111" stroke-width="1.5"/>
                <text x="250" y="19" fill="#fff" font-size="11" font-weight="800" text-anchor="middle">${pName}</text>
                <polygon points="250,195 182,28 318,28" fill="${c}" ${neonFilter}/>
                <polygon points="250,175 198,42 302,42" fill="#ffffff" stroke="${isSix ? '#00f2fe' : '#1e293b'}" stroke-width="${isSix ? '2.5' : '1.5'}"/>
                <g transform="rotate(30 250 250)">
                    <rect x="226" y="28" width="48" height="165" fill="#ffffff" stroke="#1e293b" stroke-width="1.5"/>
                    <rect x="242" y="55" width="16" height="138" fill="${c}" stroke="#475569" stroke-width="0.8"/>
                    <rect x="226" y="55" width="16" height="26" fill="${c}"/>
                </g>
                <polygon points="250,250 220,195 280,195" fill="${c}" stroke="#fff" stroke-width="1"/>
            </g>`;
    }
    const radialTrackSvg = LUDO_RADIAL_TRACK_PATH.map((point) => {
        const x = point[0] - 9, y = point[1] - 9;
        const star = LUDO_RADIAL_SAFE_CELLS.has(point.join(',')) ? `<text class="radial-safe-star" x="${point[0]}" y="${point[1] + 6}" fill="url(#safeStarGradient)" font-size="18" text-anchor="middle" stroke="#fff5c2" stroke-width=".65" paint-order="stroke" filter="url(#safeStarGlow)">★</text>` : '';
        return `<rect x="${x}" y="${y}" width="18" height="18" rx="2" fill="#fff" stroke="#64748b" stroke-width="1.2"/>${star}`;
    }).join('');
    const radialHomeLaneSvg = LUDO_RADIAL_HOME_LANES.map((lane, playerIndex) => lane.map(point => {
        const c = LUDO_RADIAL_COLOR_HEX[LUDO_RADIAL_COLOR_ORDER[playerIndex]];
        return `<rect x="${point[0] - 9}" y="${point[1] - 9}" width="18" height="18" rx="2" fill="${c}" stroke="#fff" stroke-width="1.2"/>`;
    }).join('')).join('');

    let badgesHtml = '';
    for (let i = 0; i < 6; i++) {
        const player = activePlayersList[i];
        if (!player) { badgesHtml += `<div class="lk-player-badge inactive-slot radial-badge pos-${i}"></div>`; continue; }
        const isRight = (i === 1 || i === 2 || i === 3); const isTurn = (i === currentTurnIndex);
        badgesHtml += `<div id="badge_${i}" class="lk-player-badge ${isRight ? 'right-side' : ''} ${isTurn ? 'active-turn' : ''} radial-badge pos-${i}" onclick="rollPlayerDice(${i})">
                <div class="lk-avatar-col">
                    <div class="lk-timer-ring" id="timer_ring_${i}"></div>
                    <div class="lk-avatar-frame">${activePlayersList[i].avatar}</div>
                    <div class="lk-player-name" data-admin-name-index="${i}"><button type="button" class="lk-player-label" onclick="event.stopPropagation(); openPlayerProfile(${i})">${escapeHTML(activePlayersList[i].name)}</button>${renderAdminMatchBadgeMarkup(i)}${getLiveGreatStarMarkup(i)}</div>
                </div>
            </div>`;
    }

    const activeRoll = activePlayersList[currentTurnIndex] ? activePlayersList[currentTurnIndex].lastRoll : 6;
    stage.innerHTML = `<div class="radial-6p-stage">
            ${badgesHtml}
            <div class="radial-svg-wrap">
                <svg viewBox="0 0 500 500" width="100%" height="100%">
                    <defs>
                        <linearGradient id="safeStarGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffef0"/><stop offset=".35" stop-color="#ffe678"/><stop offset=".72" stop-color="#f0a51c"/><stop offset="1" stop-color="#fff2a6"/></linearGradient>
                        <filter id="safeStarGlow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#111827" flood-opacity=".7"/><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#ffd54f" flood-opacity=".8"/></filter>
                    </defs>
                    <circle cx="250" cy="250" r="232" fill="#1e293b" stroke="#ffffff" stroke-width="4"/>
                    ${svgParts} ${radialTrackSvg} ${radialHomeLaneSvg}
                    <circle cx="250" cy="250" r="38" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
                    <g id="radialTokenLayer"></g>
                </svg>
                <div class="radial-center-dice" id="radialCenterDice" onclick="rollPlayerDice(${currentTurnIndex})" title="Tap to Roll">${createPipDiceHTML(activeRoll)}</div>
            </div>
        `;
}

function rotateRadialPoint(point, rotationDegrees) {
    const angle = rotationDegrees * Math.PI / 180; const dx = point[0] - 250, dy = point[1] - 250;
    return [250 + dx * Math.cos(angle) - dy * Math.sin(angle), 250 + dx * Math.sin(angle) + dy * Math.cos(angle)];
}

function createRadialTokenSvg(playerIndex, pieceIndex, x, y, legal, scale = 1, celebrate = false) {
    const player = activePlayersList[playerIndex]; const color = LUDO_RADIAL_COLOR_HEX[player.color] || '#111827';
    const piece = player.tokens[pieceIndex];
    const isSliding = Boolean(piece && piece.isReturningSlide);
    const handler = legal ? `onclick="chooseLudoPiece(${playerIndex},${pieceIndex})"` : '';
    const finalScale = isSliding ? scale * 1.24 : (legal ? scale * 1.28 : scale);
    const filter = isSliding
        ? 'drop-shadow(0 0 5px #ffffff) drop-shadow(0 0 12px #00f2fe) drop-shadow(0 0 18px #ff007f)'
        : (legal ? 'drop-shadow(0 0 4px #ffffff) drop-shadow(0 0 8px #facc15) drop-shadow(0 3px 4px rgba(15,23,42,0.75))' : 'drop-shadow(0 2px 2px rgba(15,23,42,0.55))');
    return `<g class="${celebrate ? 'finish-arrival-svg' : ''}" transform="translate(${x} ${y}) scale(${finalScale})" ${handler} role="${legal ? 'button' : 'img'}" aria-label="${player.name} token ${pieceIndex + 1}" style="cursor:${legal ? 'pointer' : 'default'};filter:${filter}"><path d="M0 13 C-2 8 -10 -1 -10 -8 A10 10 0 1 1 10 -8 C10 -1 2 8 0 13 Z" fill="${color}" stroke="#fff" stroke-width="${legal || isSliding ? '2.8' : '2'}"/><circle cx="0" cy="-8" r="4" fill="#fff" fill-opacity=".95"/></g>`;
}

function renderRadialLudoPieces() {
    const layer = document.querySelector('#arenaStage #radialTokenLayer');
    if (!layer) return;
    const homeSlots = [[232,70],[268,70],[250,98],[250,128]];
    let markup = '';
    if (activeCaptureNeonRadialPoint) {
        const [cx, cy] = activeCaptureNeonRadialPoint;
        markup += `<circle cx="${cx}" cy="${cy}" r="18" fill="rgba(0,242,254,0.35)" stroke="#00f2fe" stroke-width="3" style="filter:drop-shadow(0 0 12px #00f2fe) drop-shadow(0 0 20px #ff007f)"/>`;
    }
    activePlayersList.forEach((player, playerIndex) => {
        player.tokens.forEach((piece, pieceIndex) => {
            if (piece.progress < 0) {
                const spot = rotateRadialPoint(homeSlots[pieceIndex], player.radialIndex * 60);
                const legal = isLegalLudoPiece(playerIndex, pieceIndex);
                markup += `<circle cx="${spot[0]}" cy="${spot[1]}" r="10" fill="${LUDO_RADIAL_COLOR_HEX[player.color]}" fill-opacity=".3" stroke="${legal ? '#facc15' : '#fff'}" stroke-width="${legal ? '3' : '2'}"/>`;
                markup += createRadialTokenSvg(playerIndex, pieceIndex, spot[0], spot[1] - 6, legal, 0.86);
                return;
            }
            if (piece.progress === player.finishProgress) {
                const angle = (-90 + player.radialIndex * 60 + (pieceIndex - 1.5) * 7) * Math.PI / 180; const radius = 50;
                const celebrate = ludoFinishCelebration && ludoFinishCelebration.playerIndex === playerIndex && ludoFinishCelebration.pieceIndex === pieceIndex;
                markup += createRadialTokenSvg(playerIndex, pieceIndex, 250 + radius * Math.cos(angle), 250 + radius * Math.sin(angle), false, 0.62, Boolean(celebrate));
                return;
            }
            const cell = ludoPieceCell(player, piece);
            if (!cell) return;
            const stack = player.tokens.filter(other => other.progress >= 0 && other.progress < player.finishProgress && (() => { const position = ludoPieceCell(player, other); return position && position[0] === cell[0] && position[1] === cell[1]; })()).length;
            const offsets = stack > 1 ? [[-4,-3],[4,-3],[-4,3],[4,3]][pieceIndex] : [0,0];
            markup += createRadialTokenSvg(playerIndex, pieceIndex, cell[0] + offsets[0], cell[1] + offsets[1] - 6, isLegalLudoPiece(playerIndex, pieceIndex), stack > 1 ? 0.72 : 0.9);
        });
    });
    layer.innerHTML = markup;
}

function getLegalLudoPieces(playerIndex, roll) {
    const player = activePlayersList[playerIndex];
    const exactRoll = Math.round(Number(roll));
    if (!player || isNaN(exactRoll) || exactRoll < 1 || exactRoll > 6) return [];

    return player.tokens.reduce((legal, piece, pieceIndex) => {
        const progress = Math.round(Number(piece.progress));
        if (progress < 0) {
            if (exactRoll === 6) legal.push(pieceIndex);
        } else if (progress < player.finishProgress) {
            const nextProg = progress + exactRoll;
            const entersHomeLane = progress < player.trackLength && nextProg >= player.trackLength;
            const quickHomeLocked = ludoQuickMatch && !ludoFirstKillOccurred && entersHomeLane;
            if (!quickHomeLocked && nextProg <= player.finishProgress) {
                legal.push(pieceIndex);
            }
        }
        return legal;
    }, []);
}

function advanceLudoTurn() {
    ludoPendingMove = null;
    currentTurnIndex = (currentTurnIndex + 1) % activePlayersList.length;
    if (activePlayersList[currentTurnIndex]) activePlayersList[currentTurnIndex].turnStartedAt = Date.now();
    resetAndStartTurnTimer();
}

function getLudoTeamKey(playerIndex) {
    const player = activePlayersList[playerIndex];
    if (player && player.teamId !== undefined && player.teamId !== null) return `team:${player.teamId}`;
    if (activePlayersList.length === 4 && (selectedSubMode.includes('teamup') || (selectedSubMode.startsWith('pass') && passPlaySubType === 'teamup'))) {
        return `pair:${playerIndex % 2}`;
    }
    return `player:${playerIndex}`;
}

function markLudoPlayersWhoFellBehind() {
    const scores = activePlayersList.map(player => player.tokens.reduce((total, token) => total + (token.progress >= 0 ? token.progress + 1 : 0), 0));
    const bestScore = Math.max(0, ...scores);
    activePlayersList.forEach((player, index) => { if (bestScore - scores[index] >= 8) player.wasBehind = true; });
}

function getLudoCapturableTokens(attackerIndex, targetCell, projectedMove = null) {
    if (!targetCell) return [];
    const attackerTeam = getLudoTeamKey(attackerIndex);
    const cellKey = `${targetCell[0]},${targetCell[1]}`;
    const cellForPiece = (player, piece, playerIndex, pieceIndex) => {
        if (projectedMove && playerIndex === attackerIndex && pieceIndex === projectedMove.pieceIndex) {
            return ludoPieceCell(player, { progress: projectedMove.progress });
        }
        return ludoPieceCell(player, piece);
    };

    let attackerStackSize = 0;
    const victimGroups = new Map();
    activePlayersList.forEach((player, playerIndex) => {
        player.tokens.forEach((piece, pieceIndex) => {
            const cell = cellForPiece(player, piece, playerIndex, pieceIndex);
            const progress = projectedMove && playerIndex === attackerIndex && pieceIndex === projectedMove.pieceIndex ? projectedMove.progress : piece.progress;
            if (progress < 0 || progress >= player.trackLength || !cell || `${cell[0]},${cell[1]}` !== cellKey) return;
            const teamKey = getLudoTeamKey(playerIndex);
            if (teamKey === attackerTeam) { attackerStackSize++; return; }
            if (!victimGroups.has(teamKey)) victimGroups.set(teamKey, []);
            victimGroups.get(teamKey).push({ playerIndex, piece });
        });
    });

    const capturable = [];
    victimGroups.forEach(group => { if (group.length === 1 || attackerStackSize >= group.length) capturable.push(...group); });
    return capturable;
}

function isLudoDoubleStackProtected(attackerIndex, targetCell) {
    if (!targetCell) return false;
    const cellKey = `${targetCell[0]},${targetCell[1]}`; const attackerTeam = getLudoTeamKey(attackerIndex);
    let attackerStackSize = 0; const enemyStackSizes = new Map();
    activePlayersList.forEach((player, playerIndex) => {
        player.tokens.forEach(piece => {
            const cell = ludoPieceCell(player, piece);
            if (piece.progress < 0 || piece.progress >= player.trackLength || !cell || `${cell[0]},${cell[1]}` !== cellKey) return;
            const team = getLudoTeamKey(playerIndex);
            if (team === attackerTeam) attackerStackSize++; else enemyStackSizes.set(team, (enemyStackSizes.get(team) || 0) + 1);
        });
    });
    return Array.from(enemyStackSizes.values()).some(size => size >= 2 && attackerStackSize < size);
}

function scheduleLudoAIAction() {
    clearTimeout(ludoAiTimer);
    if (ludoMatchWinner !== null || activeGameType !== 'ludo' || isTokenAnimating) return;
    const player = activePlayersList[currentTurnIndex];
    if (!player || !player.isAI) return;
    ludoAiTimer = setTimeout(() => {
        if (ludoMatchWinner !== null || isDiceRolling || isTokenAnimating) return;
        if (ludoPendingMove && ludoPendingMove.playerIndex === currentTurnIndex) {
            const choices = ludoPendingMove.legalPieceIndexes; chooseLudoAIMove(currentTurnIndex, choices, ludoPendingMove.roll);
        } else { rollPlayerDice(currentTurnIndex); }
    }, 650);
}

function scheduleSnakeAIAction() {
    clearTimeout(ludoAiTimer);
    if (snakeMatchWinner !== null || activeGameType !== 'snake' || isTokenAnimating || isDiceRolling) return;
    const player = activePlayersList[currentTurnIndex];
    if (!player || !player.isAI) return;
    ludoAiTimer = setTimeout(() => {
        if (snakeMatchWinner !== null || activeGameType !== 'snake' || isDiceRolling || isTokenAnimating) return;
        rollPlayerDice(currentTurnIndex);
    }, 650);
}

function countEnemyThreatsOnCell(playerIndex, cell, progressAtCell) {
    if (!cell || progressAtCell < 0) return 0;
    const player = activePlayersList[playerIndex];
    if (progressAtCell >= player.trackLength) return 0;
    const cellKey = `${cell[0]},${cell[1]}`;
    if (player.safeCells.has(cellKey)) return 0;

    const myTeam = getLudoTeamKey(playerIndex);
    let threatCount = 0;

    for (let oppIdx = 0; oppIdx < activePlayersList.length; oppIdx++) {
        if (oppIdx === playerIndex || getLudoTeamKey(oppIdx) === myTeam) continue;
        const opponent = activePlayersList[oppIdx];

        for (const enemy of opponent.tokens) {
            if (enemy.progress < 0) {
                const enemyStartCell = ludoPieceCell(opponent, { progress: 0 });
                if (enemyStartCell && `${enemyStartCell[0]},${enemyStartCell[1]}` === cellKey) {
                    threatCount += 1;
                }
                continue;
            }
            if (enemy.progress >= opponent.trackLength) continue;

            for (let r = 1; r <= 6; r++) {
                const enemyNext = enemy.progress + r;
                if (enemyNext >= opponent.trackLength) continue;
                const enemyNextCell = ludoPieceCell(opponent, { progress: enemyNext });
                if (enemyNextCell && enemyNextCell[0] === cell[0] && enemyNextCell[1] === cell[1]) {
                    threatCount += (r <= 3 ? 2.2 : 1.5);
                }
            }
        }
    }
    return threatCount;
}

function countChaseablePreyAhead(playerIndex, fromProgress) {
    const player = activePlayersList[playerIndex];
    if (fromProgress < 0 || fromProgress >= player.trackLength) return 0;
    const myTeam = getLudoTeamKey(playerIndex);
    let preyScore = 0;

    for (let stepAhead = 1; stepAhead <= 6; stepAhead++) {
        const checkProg = fromProgress + stepAhead;
        if (checkProg >= player.trackLength) break;
        const checkCell = ludoPieceCell(player, { progress: checkProg });
        if (!checkCell) continue;
        const cellKey = `${checkCell[0]},${checkCell[1]}`;
        if (player.safeCells.has(cellKey)) continue;

        activePlayersList.forEach((opp, oppIdx) => {
            if (oppIdx === playerIndex || getLudoTeamKey(oppIdx) === myTeam) return;
            opp.tokens.forEach(enemy => {
                if (enemy.progress < 0 || enemy.progress >= opp.trackLength) return;
                const eCell = ludoPieceCell(opp, enemy);
                if (eCell && eCell[0] === checkCell[0] && eCell[1] === checkCell[1]) {
                    preyScore += 25 + (enemy.progress * 0.6);
                }
            });
        });
    }
    return preyScore;
}

function ludoAIMoveScore(playerIndex, pieceIndex, roll) {
    const player = activePlayersList[playerIndex];
    const piece = player.tokens[pieceIndex];
    const oldProgress = Math.round(Number(piece.progress));
    const nextProgress = oldProgress < 0 ? 0 : oldProgress + roll;
    const currentCell = oldProgress >= 0 ? ludoPieceCell(player, { progress: oldProgress }) : null;
    const nextCell = ludoPieceCell(player, { progress: nextProgress });

    let score = 0;
    const activeTokensOnBoard = player.tokens.filter(t => t.progress >= 0 && t.progress < player.finishProgress).length;

    if (oldProgress < 0) {
        if (activeTokensOnBoard === 0) score += 260;
        else if (activeTokensOnBoard === 1) score += 175;
        else if (activeTokensOnBoard === 2) score += 115;
        else score += 75;

        if (nextCell) {
            const spawnCaptures = getLudoCapturableTokens(playerIndex, nextCell, { pieceIndex, progress: 0 }).length;
            score += spawnCaptures * 240;
        }
        return score;
    }

    const currentThreat = countEnemyThreatsOnCell(playerIndex, currentCell, oldProgress);
    const currentCellKey = currentCell ? `${currentCell[0]},${currentCell[1]}` : '';
    const currentlySafe = (oldProgress >= player.trackLength) || (currentCellKey && player.safeCells.has(currentCellKey));

    if (!currentlySafe && currentThreat > 0) {
        score += (currentThreat * 52) + (oldProgress * 1.4);
    }

    if (nextProgress === player.finishProgress) {
        score += 320;
        return score;
    }

    if (nextProgress >= player.trackLength && nextProgress < player.finishProgress) {
        if (oldProgress < player.trackLength) {
            score += 165 + (oldProgress * 0.8);
        } else {
            score += 28 + (nextProgress - player.trackLength) * 6;
        }
        return score;
    }

    if (!nextCell) return score;
    const nextCellKey = `${nextCell[0]},${nextCell[1]}`;
    const nextIsSafe = player.safeCells.has(nextCellKey);

    const capturable = getLudoCapturableTokens(playerIndex, nextCell, { pieceIndex, progress: nextProgress });
    if (!nextIsSafe && capturable.length > 0) {
        const victimProgressBonus = capturable.reduce((sum, v) => sum + Math.max(10, v.piece.progress * 1.5), 0);
        score += (capturable.length * 260) + victimProgressBonus;
    }

    if (nextIsSafe) {
        if (!currentlySafe) score += 95 + (oldProgress * 0.6);
        else score += 40;
    }

    const futureThreat = countEnemyThreatsOnCell(playerIndex, nextCell, nextProgress);
    if (currentlySafe && !nextIsSafe) {
        if (futureThreat > 0) score -= (futureThreat * 75) + (oldProgress * 1.1);
        else score -= 18;
    }

    if (!nextIsSafe && futureThreat > 0) {
        score -= (futureThreat * 62) + (nextProgress * 1.25);
    }

    const friendlyAtTarget = player.tokens.filter((t, idx) => idx !== pieceIndex && t.progress >= 0 && t.progress < player.trackLength && (() => {
        const c = ludoPieceCell(player, t);
        return c && c[0] === nextCell[0] && c[1] === nextCell[1];
    })()).length;
    if (friendlyAtTarget > 0) score += 34;

    score += countChaseablePreyAhead(playerIndex, nextProgress);

    if (futureThreat === 0) {
        score += (nextProgress * 1.15) + (roll * 2);
    } else {
        score += (roll * 1.2);
    }

    if (ludoQuickMatch && !ludoFirstKillOccurred && capturable.length > 0) {
        score += 200;
    }

    return score;
}

function chooseLudoAIMove(playerIndex, legalPieceIndexes, roll) {
    if (!legalPieceIndexes.length) return;
    if (legalPieceIndexes.length === 1) {
        chooseLudoPiece(playerIndex, legalPieceIndexes[0]);
        return;
    }

    const rankedMoves = legalPieceIndexes.map(pieceIndex => ({
        pieceIndex,
        score: ludoAIMoveScore(playerIndex, pieceIndex, roll)
    })).sort((a, b) => b.score - a.score);

    const bestScore = rankedMoves[0].score;
    const bestTies = rankedMoves.filter(move => Math.abs(move.score - bestScore) < 0.01);
    const chosen = bestTies[Math.floor(Math.random() * bestTies.length)];

    chooseLudoPiece(playerIndex, chosen.pieceIndex);
}

const ludoAnimationDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function chooseLudoPiece(playerIndex, pieceIndex) {
    if (!ludoPendingMove || ludoPendingMove.playerIndex !== playerIndex || !ludoPendingMove.legalPieceIndexes.includes(pieceIndex) || isDiceRolling || isTokenAnimating || ludoMatchWinner !== null) return;

    const player = activePlayersList[playerIndex];
    const piece = player.tokens[pieceIndex];
    const lockedRoll = Math.round(Number(ludoPendingMove.roll));
    if (isNaN(lockedRoll) || lockedRoll < 1 || lockedRoll > 6) return;

    player.lastRoll = lockedRoll;

    clearTimeout(ludoAutoMoveTimer);
    clearInterval(turnTimerInterval);

    const epoch = ++ludoAnimationEpoch;
    const originalProgress = Math.round(Number(piece.progress));
    const targetProgress = originalProgress < 0 ? 0 : originalProgress + lockedRoll;
    const stepCount = originalProgress < 0 ? 1 : lockedRoll;
    const stepDelay = LUDO_TOKEN_STEP_DURATION;

    isTokenAnimating = true;
    ludoPendingMove = null;
    ludoFinishCelebration = null;

    for (let step = 1; step <= stepCount; step++) {
        if (epoch !== ludoAnimationEpoch) return;
        player.lastRoll = lockedRoll;
        piece.progress = originalProgress < 0 ? 0 : originalProgress + step;
        renderFullStage();
        playGameSound(originalProgress < 0 ? 'tokenEnter' : 'tokenStep');
        await ludoAnimationDelay(stepDelay);
    }
    if (epoch !== ludoAnimationEpoch) return;
    piece.progress = targetProgress;
    player.lastRoll = lockedRoll;

    let capturedTokens = []; const landedCell = ludoPieceCell(player, piece);
    const canCapture = piece.progress < player.trackLength && landedCell && !player.safeCells.has(`${landedCell[0]},${landedCell[1]}`);
    if (canCapture) capturedTokens = getLudoCapturableTokens(playerIndex, landedCell);
    const capturedCount = capturedTokens.length; const protectedDoubleStack = canCapture && isLudoDoubleStackProtected(playerIndex, landedCell);

    if (capturedCount) {
        ludoFirstKillOccurred = true;

        if (currentMatchPlayerCount <= 4 && landedCell) {
            activeCaptureNeonCellKey = `${landedCell[0]},${landedCell[1]}`;
        } else if (landedCell) {
            activeCaptureNeonRadialPoint = landedCell;
        }

        playGameSound('capture');
        renderFullStage();
        await ludoAnimationDelay(150);

        const FAST_GLIDE_STEP_MS = 16;
        for (const { piece: enemyPiece } of capturedTokens) {
            const totalReturnSteps = Math.max(1, enemyPiece.progress);
            const slideDurationSec = Math.max(0.24, (totalReturnSteps * FAST_GLIDE_STEP_MS) / 1000);
            enemyPiece.isReturningSlide = true;
            playTokenSlideReturnSound(slideDurationSec);

            while (enemyPiece.progress > 0) {
                if (epoch !== ludoAnimationEpoch) return;
                enemyPiece.progress--;
                renderFullStage();
                await ludoAnimationDelay(FAST_GLIDE_STEP_MS);
            }
            if (epoch !== ludoAnimationEpoch) return;
            enemyPiece.isReturningSlide = false;
            enemyPiece.progress = -1;
            playGameSound('tokenReturn');
            renderFullStage();
            await ludoAnimationDelay(70);
        }

        activeCaptureNeonCellKey = null;
        activeCaptureNeonRadialPoint = null;
        player.kills += capturedCount;
        player.maxCaptureBurst = Math.max(player.maxCaptureBurst || 0, capturedCount);
    }

    markLudoPlayersWhoFellBehind();

    const reachedHome = piece.progress === player.finishProgress;
    if (reachedHome) {
        ludoFinishCelebration = { playerIndex, pieceIndex }; clearTimeout(ludoFinishTimer);
        ludoFinishTimer = setTimeout(() => {
            if (epoch !== ludoAnimationEpoch) return;
            ludoFinishCelebration = null; document.querySelectorAll('#arenaStage .finish-arrival, #arenaStage .finish-arrival-svg').forEach(token => { token.classList.remove('finish-arrival', 'finish-arrival-svg'); });
        }, 900);
    }
    const hasWon = player.tokens.every(token => token.progress === player.finishProgress);
    if (reachedHome) playGameSound(hasWon ? 'victory' : 'home');
    isTokenAnimating = false;

    if (hasWon) {
        winnerBannerDismissed = false;
        ludoMatchWinner = playerIndex; ludoMatchFinishedAt = Date.now();
        if (!currentMatchResultRecorded) { currentMatchResultRecorded = true; recordCompletedMatch('ludo', activePlayersList, playerIndex); }
        showGameToast(`🏆 ${player.name} wins the match!`);
    } else if (capturedCount) {
        showGameToast(`💥 ${player.name} captured ${capturedCount} token${capturedCount === 1 ? '' : 's'}! Bonus turn.`);
    } else if (reachedHome) {
        showGameToast(`🏠 ${player.name}'s token reached home! Bonus turn.`);
    } else if (protectedDoubleStack) {
        showGameToast(`🛡️ That double stack needs two tokens to capture.`);
    }

    if (!hasWon && lockedRoll !== 6 && !capturedCount && !reachedHome) { advanceLudoTurn(); } 
    else { if (!hasWon) resetAndStartTurnTimer(); }
    if (!hasWon && currentTurnIndex === playerIndex) player.turnStartedAt = Date.now();
    
    if (hasWon) { clearTimeout(liveGreatPlayerTimer); clearInterval(liveGreatPlayerInterval); liveGreatPlayerIndex = -1; }
    renderFullStage(); if (hasWon) removeActiveMatchSave(); else autoSaveActiveMatch();
}

function processLudoRoll(playerIndex, rolledNum) {
    const player = activePlayersList[playerIndex];
    const finalRoll = Math.round(Number(rolledNum));
    player.lastRoll = finalRoll;
    consecutiveSixCount[playerIndex] = (finalRoll === 6) ? (consecutiveSixCount[playerIndex] || 0) + 1 : 0;

    const legalPieceIndexes = getLegalLudoPieces(playerIndex, finalRoll);
    if (!legalPieceIndexes.length) {
        const homeLaneLocked = ludoQuickMatch && !ludoFirstKillOccurred && player.tokens.some(piece => piece.progress >= 0 && piece.progress < player.trackLength && piece.progress + finalRoll >= player.trackLength);
        if (homeLaneLocked) {
            showGameToast(`🔒 ${player.name}: the home lane opens after the first capture.`);
        }
        consecutiveSixCount[playerIndex] = 0;
        advanceLudoTurn();
        renderFullStage();
        autoSaveActiveMatch();
        return;
    }

    ludoPendingMove = { playerIndex, roll: finalRoll, legalPieceIndexes };
    clearTimeout(ludoAutoMoveTimer);
    resetAndStartTurnTimer();
    renderFullStage();

    if (!player.isAI && legalPieceIndexes.length === 1) {
        const onlyLegalPiece = legalPieceIndexes[0];
        const autoMoveWait = finalRoll === 6 ? 380 : 140;
        ludoAutoMoveTimer = setTimeout(() => {
            if (currentTurnIndex === playerIndex && ludoPendingMove && ludoPendingMove.playerIndex === playerIndex) {
                chooseLudoPiece(playerIndex, onlyLegalPiece);
            }
        }, autoMoveWait);
    }
}

async function animateSnakeTokenTo(playerIndex, targetPos, epoch) {
    const player = activePlayersList[playerIndex]; const direction = targetPos >= player.pos ? 1 : -1; const enteringBoard = player.pos === 0; let stepIndex = 0;
    while (player.pos !== targetPos) {
        if (epoch !== ludoAnimationEpoch) return false; player.pos += direction; renderFullStage();
        playGameSound(enteringBoard && stepIndex === 0 ? 'tokenEnter' : 'tokenStep'); stepIndex++; await ludoAnimationDelay(SNAKE_TOKEN_STEP_DURATION);
    }
    return epoch === ludoAnimationEpoch;
}

async function animateSnakeTokenAlongShape(playerIndex, shape, fromPos, toPos, epoch) {
    const player = activePlayersList[playerIndex]; const stage = document.getElementById('arenaStage');
    if (!player || !stage || typeof requestAnimationFrame !== 'function') { return animateSnakeTokenTo(playerIndex, toPos, epoch); }

    const motion = { playerIndex, fromPos, toPos, shape }; snakeVisualMotion = motion; renderFullStage();
    const selector = shape === 'snake' ? `.sn-snake[data-from="${fromPos}"][data-to="${toPos}"] .sn-snake-body` : `.sn-ladder-motion[data-from="${fromPos}"][data-to="${toPos}"]`;
    const path = stage.querySelector(selector); const marker = stage.querySelector('#snakeMovingPiece');
    if (!path || !marker || typeof path.getTotalLength !== 'function' || typeof path.getPointAtLength !== 'function') {
        if (snakeVisualMotion === motion) snakeVisualMotion = null; renderFullStage(); return animateSnakeTokenTo(playerIndex, toPos, epoch);
    }

    const length = path.getTotalLength(); const duration = shape === 'snake' ? 1450 : 1150; const startedAt = performance.now();
    return new Promise(resolve => {
        const frame = now => {
            if (epoch !== ludoAnimationEpoch) { if (snakeVisualMotion === motion) snakeVisualMotion = null; resolve(false); return; }
            const progress = Math.min(1, (now - startedAt) / duration); const eased = progress * progress * (3 - 2 * progress);
            const point = path.getPointAtLength(length * eased); marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
            if (progress < 1) { requestAnimationFrame(frame); return; }
            player.pos = toPos; if (snakeVisualMotion === motion) snakeVisualMotion = null; renderFullStage(); resolve(true);
        };
        requestAnimationFrame(frame);
    });
}

function rollPlayerDice(idx) {
    if (isDiceRolling || isTokenAnimating || (activeGameType === 'ludo' && ludoMatchWinner !== null) || (activeGameType === 'snake' && snakeMatchWinner !== null)) return;
    if (activeGameType === 'ludo' && ludoPendingMove) { showGameToast('👆 Choose one of the highlighted tokens first.'); return; }
    if (idx !== currentTurnIndex) { showGameToast(`⏳ Wait for ${activePlayersList[currentTurnIndex].name}'s turn!`); return; }

    const decidingPlayer = activePlayersList[idx];
    if (decidingPlayer && !decidingPlayer.isAI) {
        if (decidingPlayer.turnStartedAt) {
            decidingPlayer.turnResponseTimes = decidingPlayer.turnResponseTimes || [];
            decidingPlayer.turnResponseTimes.push(Math.max(0, Date.now() - decidingPlayer.turnStartedAt));
            if (decidingPlayer.turnResponseTimes.length > 24) decidingPlayer.turnResponseTimes.shift();
        }
        decidingPlayer.turnStartedAt = Date.now();
    }

    playGameSound('diceRoll'); isDiceRolling = true; clearInterval(turnTimerInterval); const gameEpoch = ludoAnimationEpoch;
    let rolledNum = Math.floor(Math.random() * 6) + 1;
    if (activeGameType === 'ludo' && (consecutiveSixCount[idx] || 0) >= 2 && rolledNum === 6) {
        rolledNum = Math.floor(Math.random() * 5) + 1;
    }
    if (activeGameType === 'snake' && (snakeConsecutiveOnes[idx] || 0) >= 2 && rolledNum === 1) {
        rolledNum = Math.floor(Math.random() * 5) + 2;
    }

    activePlayersList[idx].lastRoll = rolledNum;
    const slotEl = document.getElementById(`dice_slot_${idx}`);
    if (slotEl) {
        slotEl.innerHTML = createPipDiceHTML(rolledNum);
        const diceInner = slotEl.querySelector('.pip-dice');
        if (diceInner) diceInner.classList.add('physics-tumbling');
    }
    const radialCenter = document.getElementById('radialCenterDice');
    if (radialCenter) {
        radialCenter.innerHTML = createPipDiceHTML(rolledNum);
        const diceInner = radialCenter.querySelector('.pip-dice');
        if (diceInner) diceInner.classList.add('physics-tumbling');
    }

    setTimeout(async () => {
        if (gameEpoch !== ludoAnimationEpoch) return;
        activePlayersList[idx].lastRoll = rolledNum; playGameSound('diceStop'); isDiceRolling = false;

        if (activeGameType === 'snake') {
            const player = activePlayersList[idx]; snakeConsecutiveOnes[idx] = rolledNum === 1 ? (snakeConsecutiveOnes[idx] || 0) + 1 : 0; let landingPos = null;
            if (player.pos === 0) { if (rolledNum === 1) landingPos = 1; } else {
                const exactTarget = player.pos + rolledNum; if (exactTarget <= 100) landingPos = exactTarget;
            }

            const epoch = ++ludoAnimationEpoch;
            if (landingPos !== null) {
                isTokenAnimating = true; const reachedLanding = await animateSnakeTokenTo(idx, landingPos, epoch);
                if (!reachedLanding || epoch !== ludoAnimationEpoch) return;
                if (SNAKE_LADDER_LINKS[player.pos]) {
                    const start = player.pos; const destination = SNAKE_LADDER_LINKS[start]; showGameToast(`🪜 Ladder climb: ${start} → ${destination}`); playGameSound('ladderClimb');
                    const climbed = await animateSnakeTokenAlongShape(idx, 'ladder', start, destination, epoch); if (!climbed || epoch !== ludoAnimationEpoch) return;
                } else if (SNAKE_LINKS[player.pos]) {
                    const start = player.pos; const destination = SNAKE_LINKS[start]; showGameToast(`🐍 Snake slide: ${start} → ${destination}`); playGameSound('snakeSlide');
                    const slid = await animateSnakeTokenAlongShape(idx, 'snake', start, destination, epoch); if (!slid || epoch !== ludoAnimationEpoch) return;
                }
                isTokenAnimating = false;
            }

            if (player.pos === 100) {
                playGameSound('victory'); snakeMatchWinner = idx; clearTimeout(liveGreatPlayerTimer); clearInterval(liveGreatPlayerInterval); liveGreatPlayerIndex = -1; liveGreatPlayerUntil = 0; clearInterval(turnTimerInterval);
                ludoMatchFinishedAt = Date.now(); if (!currentMatchResultRecorded) { currentMatchResultRecorded = true; recordCompletedMatch('snake', activePlayersList, idx); }
                showGameToast(`🏆 ${player.name} reached 100 and finished first!`);
                startVictoryFireworks3D();
            } else if (rolledNum === 1) {
                player.turnStartedAt = Date.now(); resetAndStartTurnTimer();
            } else {
                currentTurnIndex = (currentTurnIndex + 1) % activePlayersList.length; activePlayersList[currentTurnIndex].turnStartedAt = Date.now(); resetAndStartTurnTimer();
            }
            renderFullStage(); if (snakeMatchWinner !== null) removeActiveMatchSave(); else autoSaveActiveMatch(); return;
        }

        processLudoRoll(idx, rolledNum);
    }, 500);
}

let bountyKingPlayerIndex = -1;
let matchBestClutchMoment = null;
let passPlaySubType = 'individual';

function injectPassPlayTeamOptions() {
    const setupBox = document.getElementById('dynamicConfigBox');
    if (!setupBox) return;

    const isPassMode = typeof selectedSubMode === 'string' && selectedSubMode.startsWith('pass');
    let selectorBox = document.getElementById('passPlayModeSelectorBox');

    if (!isPassMode) {
        if (selectorBox) selectorBox.style.display = 'none';
        return;
    }

    if (!selectorBox) {
        const teamHtml = `
            <div id="passPlayModeSelectorBox" style="margin-top: 16px;">
                <div class="section-label">Select Match Sub-Type</div>
                <div class="players-flex-box">
                    <div class="player-slot-btn active" id="ppSubModeIndiv" onclick="setPassPlaySubType('individual')">👤 Individual</div>
                    <div class="player-slot-btn" id="ppSubModeTeam" onclick="setPassPlaySubType('teamup')">👥 Team Up (2v2 Diagonal)</div>
                </div>
            </div>
        `;
        setupBox.insertAdjacentHTML('beforeend', teamHtml);
    } else {
        selectorBox.style.display = 'block';
    }
    setPassPlaySubType(passPlaySubType);
}

function setPassPlaySubType(subType) {
    passPlaySubType = subType;
    document.getElementById('ppSubModeIndiv')?.classList.toggle('active', subType === 'individual');
    document.getElementById('ppSubModeTeam')?.classList.toggle('active', subType === 'teamup');

    const countBox = document.getElementById('playerOptions');
    const customInput = document.getElementById('customPlayerInput');

    if (subType === 'teamup') {
        if (typeof setPlayerCount === 'function') setPlayerCount(4);
        matchConfigValue = 4;
        if (countBox) {
            Array.from(countBox.children).forEach(btn => {
                const txt = (btn.textContent || '').trim();
                if (txt.includes('4')) {
                    btn.style.display = '';
                    btn.classList.add('active');
                } else {
                    btn.style.display = 'none';
                    btn.classList.remove('active');
                }
            });
        }
        if (customInput) customInput.style.display = 'none';
    } else {
        if (countBox) {
            Array.from(countBox.children).forEach(btn => {
                btn.style.display = '';
            });
        }
        if (customInput) customInput.style.display = '';
    }
}

const _origOpenFullScreenSetup = window.openFullScreenSetup;
window.openFullScreenSetup = function(gameType) {
    if (typeof _origOpenFullScreenSetup === 'function') _origOpenFullScreenSetup(gameType);
    if (gameType === 'ludo') {
        passPlaySubType = 'individual';
        setTimeout(injectPassPlayTeamOptions, 50);
    }
};

const _origSelectSubMode = window.selectSubMode;
if (typeof _origSelectSubMode === 'function') {
    window.selectSubMode = function(mode) {
        _origSelectSubMode.apply(this, arguments);
        if (activeGameType === 'ludo') {
            setTimeout(injectPassPlayTeamOptions, 30);
        }
    };
}

function playStickerSoundEffect(stickerType) {
    if (!gameSoundEnabled) return;
    const ctx = getGameAudioContext();
    if (!ctx) return;

    if (stickerType === 'haha') {
        [587, 784, 659, 880, 698, 988].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.075, 0.08, 0.055, 'triangle', freq * 1.12);
        });
    } else if (stickerType === 'cry') {
        [660, 587, 523, 440, 392].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.13, 0.16, 0.055, 'sine', freq * 0.85);
        });
    } else if (stickerType === 'tease') {
        const melody = [659, 523, 784, 659, 523];
        melody.forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.1, 0.11, 0.06, 'square', freq * 1.05);
        });
    } else if (stickerType === 'sad') {
        [440, 392, 349, 293.6].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.16, 0.22, 0.05, 'sine', freq * 0.92);
        });
    } else if (stickerType === 'angry') {
        [180, 155, 130, 110].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.08, 0.16, 0.075, 'sawtooth', freq * 0.78);
        });
        playGameNoise(ctx, 0.25, 0.04, 'lowpass', 480, 0.05);
    }
}

function sendProfileSticker(stickerType, emojiChar) {
    if (ludoMatchIsOffline) return;

    let myIndex = activePlayersList.findIndex(p => p && p.playerId === getCurrentProfileId());
    if (myIndex < 0) myIndex = currentTurnIndex;

    playStickerSoundEffect(stickerType);

    const badge = document.getElementById(`badge_${myIndex}`);
    if (badge) {
        const existing = badge.querySelector('.profile-sticker-pop');
        if (existing) existing.remove();

        const pop = document.createElement('div');
        pop.className = 'profile-sticker-pop';
        pop.textContent = emojiChar;
        badge.appendChild(pop);

        setTimeout(() => {
            if (pop.parentNode) pop.remove();
        }, 1750);
    }

    if (typeof sendOnlineReaction === 'function') {
        try { sendOnlineReaction(emojiChar, ''); } catch (_) {}
    }
}

function syncOnlineOnlyControls() {
    const isOnlineMatch = !ludoMatchIsOffline && selectedSubMode.startsWith('online');

    const oldToggle = document.getElementById('tauntPackToggleBtn');
    if (oldToggle) oldToggle.remove();

    const adminBtn = document.getElementById('adminMatchBadgeToggle');
    if (adminBtn) {
        adminBtn.style.display = isOnlineMatch ? 'flex' : 'none';
    }

    const arena = document.getElementById('gameArenaScreen');
    if (!arena) return;

    let dock = document.getElementById('lkTauntDock');
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'lkTauntDock';
        dock.className = 'lk-taunt-dock';
        arena.appendChild(dock);
    }

    dock.innerHTML = `
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('haha','😂')" aria-label="Haha">😂</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('cry','😭')" aria-label="Cry">😭</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('tease','😜')" aria-label="Tease">😜</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('sad','🥺')" aria-label="Sad">🥺</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('angry','😡')" aria-label="Angry">😡</button>
    `;

    dock.style.display = isOnlineMatch ? 'flex' : 'none';
}

function evaluateBountyAndClutchState() {
    if (activeGameType !== 'ludo' || !activePlayersList.length) return;

    activePlayersList.forEach((p) => {
        if (typeof p.bountyPoints !== 'number') p.bountyPoints = 0;
        if (typeof p.prevKills !== 'number') p.prevKills = p.kills || 0;
    });

    activePlayersList.forEach((p, idx) => {
        const currentKills = p.kills || 0;
        if (currentKills > p.prevKills) {
            const deltaKills = currentKills - p.prevKills;
            p.prevKills = currentKills;

            if (bountyKingPlayerIndex !== -1 && bountyKingPlayerIndex !== idx) {
                const kingPlayer = activePlayersList[bountyKingPlayerIndex];
                p.bountyPoints += 250;
                showGameToast(`👑🎯 BOUNTY HUNTED! ${p.name} knocked down King ${kingPlayer?.name || ''} (+250 Glory Pts!)`);
                recordClutchMoment(
                    p.name,
                    `Hunted Bounty King ${kingPlayer?.name || 'Opponent'}!`,
                    `${p.name} claimed a +250 Glory Bounty by cutting the Crown Holder's token!`,
                    95
                );
                bountyKingPlayerIndex = idx;
            }

            if (deltaKills >= 2) {
                p.bountyPoints += 150 * deltaKills;
                recordClutchMoment(
                    p.name,
                    `Epic ${deltaKills}x Multi-Kill Strike!`,
                    `${p.name} wiped out ${deltaKills} opponent tokens in a single savage move!`,
                    90 + deltaKills * 5
                );
            } else if (p.wasBehind) {
                p.bountyPoints += 100;
                recordClutchMoment(
                    p.name,
                    `Royal Comeback Strike!`,
                    `${p.name} fought back from behind with a clutch capture and turned the tables!`,
                    82
                );
            }
        }
    });

    let topCandidate = -1;
    let bestThreatScore = 0;
    activePlayersList.forEach((p, idx) => {
        const totalProg = p.tokens.reduce((sum, t) => sum + Math.max(0, t.progress), 0);
        const threat = (p.kills || 0) * 65 + totalProg;
        if (((p.kills || 0) >= 2 || totalProg >= 110) && threat > bestThreatScore) {
            bestThreatScore = threat;
            topCandidate = idx;
        }
    });

    if (topCandidate !== -1 && topCandidate !== bountyKingPlayerIndex) {
        bountyKingPlayerIndex = topCandidate;
        const crowned = activePlayersList[bountyKingPlayerIndex];
        if (crowned) {
            showGameToast(`👑 ${crowned.name} is now the BOUNTY KING! Cut their token for +250 Bonus Points!`);
        }
    }

    activePlayersList.forEach((p, idx) => {
        const badge = document.getElementById(`badge_${idx}`);
        if (!badge) return;
        const oldCrown = badge.querySelector('.bounty-crown-badge');
        if (oldCrown) oldCrown.remove();

        if (idx === bountyKingPlayerIndex && ludoMatchWinner === null) {
            const crown = document.createElement('div');
            crown.className = 'bounty-crown-badge';
            crown.innerHTML = `👑 BOUNTY KING`;
            badge.appendChild(crown);
        }

        const nameContainer = badge.querySelector('.lk-player-name');
        if (nameContainer && p.bountyPoints > 0 && !nameContainer.querySelector('.bounty-points-pill')) {
            nameContainer.insertAdjacentHTML('beforeend', `<span class="bounty-points-pill">⚡${p.bountyPoints}</span>`);
        }
    });
}

function recordClutchMoment(playerName, title, description, priority = 50) {
    if (!matchBestClutchMoment || priority >= matchBestClutchMoment.priority) {
        matchBestClutchMoment = {
            playerName,
            title,
            description,
            priority,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    }
}

function getBestMatchClutchMoment() {
    if (matchBestClutchMoment) return matchBestClutchMoment;
    const winner = activePlayersList[ludoMatchWinner] || activePlayersList[0];
    const name = winner ? winner.name : (currentUser?.name || 'Fahim');
    const kills = winner ? (winner.kills || 0) : 0;
    if (winner?.wasBehind) {
        return {
            playerName: name,
            title: 'Miracle Comeback Victory!',
            description: `${name} overcame a huge deficit and stormed all 4 tokens home to win!`,
            timestamp: 'Match Finale'
        };
    }
    return {
        playerName: name,
        title: kills > 0 ? `Dominant ${kills}-Kill Championship!` : `Flawless Tactical Victory!`,
        description: `${name} ruled the 3D LudoPlay arena and clinched 1st Place in ${formatLudoMatchDuration()}!`,
        timestamp: 'Match Finale'
    };
}

const _origLaunchGameMatch = launchGameMatch;
launchGameMatch = function () {
    bountyKingPlayerIndex = -1;
    matchBestClutchMoment = null;
    _origLaunchGameMatch.apply(this, arguments);
    syncOnlineOnlyControls();
};

const _origRenderFullStage = renderFullStage;
renderFullStage = function () {
    _origRenderFullStage.apply(this, arguments);
    syncOnlineOnlyControls();
    evaluateBountyAndClutchState();

    if (ludoMatchWinner !== null && activeGameType === 'ludo' && !winnerBannerDismissed) {
        const banner = document.querySelector('#arenaStage .ludo-winner-banner');
        if (banner && !banner.querySelector('.ludo-clutch-card')) {
            const clutch = getBestMatchClutchMoment();
            const clutchHtml = `
                <div class="ludo-clutch-card">
                    <small>🎬 EPIC CLUTCH MOMENT OF THE MATCH</small>
                    <strong>⚡ ${escapeLudoResultText(clutch.title)}</strong>
                    <p>${escapeLudoResultText(clutch.description)}</p>
                </div>
            `;
            const actionsRow = banner.querySelector('.winner-actions-3d');
            if (actionsRow) {
                actionsRow.insertAdjacentHTML('beforebegin', clutchHtml);
            } else {
                banner.insertAdjacentHTML('beforeend', clutchHtml);
            }
        }
    }
};

/* =====================================================================
   COMPLETE FIX: PASS & PLAY 2v2 TEAM UP, 3D COMING SOON MODAL,
   MOBILE LAUNCH FIX, 1 CRORE ADMIN COINS, 5000 USER COINS & GLOBAL SYNC
   ===================================================================== */

// 0. Clear old Service Worker caches so mobile phones always load the latest code immediately
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.update().catch(() => {}));
    }).catch(() => {});
}

// 1. Fix Pass & Play "Individual vs Team Up (2v2)" selector hook (`setSubMode` in app.js)
const _origSetSubModeFix = window.setSubMode;
if (typeof _origSetSubModeFix === 'function') {
    window.setSubMode = function(sub) {
        // Strictly block Online & Tournament from launching; always show 3D Coming Soon popup!
        if (typeof sub === 'string' && (sub.startsWith('online') || sub === 'tourney')) {
            openPublishingSoonModal3D();
            return;
        }
        _origSetSubModeFix.apply(this, arguments);
        if (typeof activeGameType !== 'undefined' && activeGameType === 'ludo') {
            setTimeout(injectPassPlayTeamOptions, 20);
        }
    };
}

// 2. Always show 3D Coming Soon Modal when clicking Online Match or Tournament Mode (both User & Admin)
function openPublishingSoonModal3D() {
    let modal = document.getElementById('publishingSoonModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'publishingSoonModal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '130';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
            <div class="modal-box compact-modal neon-3d-modal" style="text-align: center; padding: 30px 22px;">
                <div style="font-size: 62px; margin-bottom: 10px; filter: drop-shadow(0 8px 16px rgba(0,242,254,0.5));">🚀🏆</div>
                <h2 style="font-size: 23px; font-weight: 900; color: #fde047; margin-bottom: 10px;">COMING SOON IN 3D!</h2>
                <p class="profile-help-text" style="font-size: 14px; color: #e2e8f0; line-height: 1.6; margin-bottom: 20px;">
                    🌐 <strong>Online Multiplayer</strong> & 🏆 <strong>Tournament Mode</strong> are coming soon!<br>
                    <span style="color: #00f2fe; font-weight: 800;">Play Smart AI or Pass & Play (Individual & 2v2 Team Up) now!</span>
                </p>
                <button type="button" class="primary-btn" onclick="closePublishingSoonModal()">🎮 Play Offline Modes</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}
window.openPublishingSoonModal = openPublishingSoonModal3D;
window.closePublishingSoonModal = function() {
    const modal = document.getElementById('publishingSoonModal');
    if (modal) modal.style.display = 'none';
};
window.handleOnlineModeClick = function() {
    openPublishingSoonModal3D();
};
window.handleTourneyModeClick = function() {
    openPublishingSoonModal3D();
};

// 3. Mobile-Safe Game Launch Fix (Prevents mobile fullscreen/audio from blocking Start Match)
window.requestGameFullscreen = function(element) {
    // Do not force fullscreen on mobile phones as it causes black screen / layout freeze on many mobile browsers
    if (window.innerWidth <= 820 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    const request = element?.requestFullscreen || element?.webkitRequestFullscreen || element?.msRequestFullscreen;
    if (!request) return;
    try {
        const result = request.call(element);
        if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) {}
};

// Ensure Start Match button always works reliably on mobile & desktop
const _safeBaseLaunchGameMatch = window.launchGameMatch;
window.launchGameMatch = function() {
    try {
        if (typeof selectedSubMode === 'string' && (selectedSubMode.startsWith('online') || selectedSubMode === 'tourney')) {
            openPublishingSoonModal3D();
            return;
        }
        _safeBaseLaunchGameMatch.apply(this, arguments);
        const arena = document.getElementById('gameArenaScreen');
        if (arena) {
            arena.style.display = 'flex';
            arena.style.visibility = 'visible';
            arena.style.opacity = '1';
        }
    } catch (err) {
        console.error('Launch match error:', err);
        if (typeof showGameToast === 'function') showGameToast('⚠️ Starting match...');
    }
};

// 4. Firebase Realtime Database Initialization (Multi-Region Safe)
const firebaseConfig = {
    apiKey: "AIzaSyDPhuDKjXrta1izBBWC_gAkPtpm9jQkg-M",
    authDomain: "ludoplayglobal.firebaseapp.com",
    databaseURL: "https://ludoplayglobal-default-rtdb.firebaseio.com",
    projectId: "ludoplayglobal",
    storageBucket: "ludoplayglobal.firebasestorage.app",
    messagingSenderId: "1082667626449",
    appId: "1:1082667626449:web:87e3d57b73e35d22b5faf0",
    measurementId: "G-BP81CD66F5"
};

let globalFirebaseApp = null;
let globalDb = null;

if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps.length) {
            globalFirebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            globalFirebaseApp = firebase.app();
        }
        globalDb = firebase.database();
    } catch (e) {
        console.error("Firebase init error:", e);
    }
}

// 5. User & Admin Account Detection + 1 Crore Admin Coins & 5,000 User Coins
function getActiveUserObj() {
    try {
        if (typeof currentUser !== 'undefined' && currentUser && typeof currentUser === 'object' && currentUser.name) {
            return currentUser;
        }
    } catch (_) {}
    try {
        const stored = JSON.parse(localStorage.getItem('ludoPlayUser'));
        if (stored && typeof stored === 'object') return stored;
    } catch (_) {}
    return { phone: '', name: '', avatar: 'male', isAdmin: false };
}

function getCleanPhoneKey(phoneStr) {
    const user = getActiveUserObj();
    return String(phoneStr || user.phone || '')
        .replace(/[\s+-]/g, '')
        .trim()
        .toLowerCase();
}

function isUserLoggedIn() {
    const user = getActiveUserObj();
    const phone = String(user.phone || '').trim();
    const name = String(user.name || '').trim();
    return Boolean(phone && name && name.toLowerCase() !== 'guest' && name.toLowerCase() !== 'you');
}

function isCurrentUserAdminAccount() {
    const user = getActiveUserObj();
    const phone = String(user.phone || '').trim().toLowerCase();
    const name = String(user.name || '').trim().toLowerCase();
    return Boolean(user.isAdmin || phone === 'admin' || name === 'admin');
}

function getUserCoinStorageKey(phoneStr) {
    const cleanPhone = getCleanPhoneKey(phoneStr);
    return cleanPhone ? `ludoplay.coins.user.${cleanPhone}` : 'ludoplay.dummy.coins';
}

function getPlayerDummyCoins() {
    if (!isUserLoggedIn()) return 0;
    const storageKey = getUserCoinStorageKey();

    if (isCurrentUserAdminAccount()) {
        try {
            const currentStored = parseInt(localStorage.getItem(storageKey), 10);
            if (isNaN(currentStored) || currentStored < 10000000) {
                localStorage.setItem(storageKey, '10000000');
            }
            return parseInt(localStorage.getItem(storageKey), 10) || 10000000;
        } catch (_) {
            return 10000000;
        }
    }

    try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null && !isNaN(parseInt(stored, 10))) {
            return parseInt(stored, 10);
        }
    } catch (_) {}

    const initialCoins = 5000;
    try { localStorage.setItem(storageKey, String(initialCoins)); } catch (_) {}
    return initialCoins;
}

function checkAndGrantWelcomeCoins() {
    if (!isUserLoggedIn()) return;
    const user = getActiveUserObj();
    const storageKey = getUserCoinStorageKey();
    const cleanPhone = getCleanPhoneKey();

    if (isCurrentUserAdminAccount()) {
        try { localStorage.setItem(storageKey, '10000000'); } catch (_) {}
        return;
    }

    const name = String(user.name || 'Player').trim();
    const welcomeKey = `ludoplay.welcomed.bonus.${cleanPhone}`;

    try {
        if (!localStorage.getItem(welcomeKey)) {
            localStorage.setItem(welcomeKey, 'true');
            if (localStorage.getItem(storageKey) === null) {
                localStorage.setItem(storageKey, '5000');
            }
            if (globalDb && cleanPhone) {
                globalDb.ref(`users/${cleanPhone}/coins`).transaction(curr => (curr === null ? 5000 : curr)).catch(() => {});
            }
            setTimeout(() => {
                if (typeof showGameToast === 'function') {
                    showGameToast(`🎉 Congratulations ${name}! You received 5,000 Free Welcome Coins! 🪙`);
                }
            }, 400);
        }
    } catch (_) {}
}

function modifyActivePlayerCoins(amount) {
    if (!isUserLoggedIn()) return 0;
    try {
        const storageKey = getUserCoinStorageKey();
        const cleanPhone = getCleanPhoneKey();
        let current = getPlayerDummyCoins();
        current = Math.max(0, current + amount);
        localStorage.setItem(storageKey, String(current));
        if (globalDb && cleanPhone && !isCurrentUserAdminAccount()) {
            globalDb.ref(`users/${cleanPhone}/coins`).set(current).catch(() => {});
        }
        injectTopBarCoinIndicator();
        return current;
    } catch (_) {
        return 0;
    }
}

const _origRecordCompletedMatch2 = window.recordCompletedMatch || function(){};
window.recordCompletedMatch = function(gameType, playersList, winnerIndex) {
    if (typeof _origRecordCompletedMatch2 === 'function') {
        _origRecordCompletedMatch2.apply(this, arguments);
    }
    const winner = playersList[winnerIndex];
    const isMeWinner = winner && (winner.playerId === getCurrentProfileId() || (!winner.isAI && winnerIndex === 0));
    if (isMeWinner && selectedSubMode === 'ai' && isUserLoggedIn()) {
        modifyActivePlayerCoins(1000);
        showGameToast('🎉 Victory against AI! You earned +1,000 Coins! 🪙');
    }
};

function injectTopBarCoinIndicator() {
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;

    let coinPill = document.getElementById('topBarCoinIndicator');
    if (!isUserLoggedIn()) {
        if (coinPill) coinPill.remove();
        return;
    }

    checkAndGrantWelcomeCoins();
    const coins = getPlayerDummyCoins();

    if (!coinPill) {
        coinPill = document.createElement('div');
        coinPill.id = 'topBarCoinIndicator';
        coinPill.className = 'top-coin-pill';
        topActions.insertBefore(coinPill, topActions.firstChild);
    }
    const formatted = `🪙 ${coins.toLocaleString()}`;
    if (coinPill.innerHTML !== formatted) {
        coinPill.innerHTML = formatted;
    }
}
setTimeout(injectTopBarCoinIndicator, 80);
setInterval(injectTopBarCoinIndicator, 500);

// 6. Realtime Gift & Player Registration Sync
let activeWatchedGiftPhone = '';
function bindUserRealtimeGiftAndCoinListener() {
    if (!globalDb || !isUserLoggedIn() || isCurrentUserAdminAccount()) return;
    const user = getActiveUserObj();
    const cleanPhone = getCleanPhoneKey();
    if (!cleanPhone || activeWatchedGiftPhone === cleanPhone) return;
    activeWatchedGiftPhone = cleanPhone;

    globalDb.ref(`registeredPlayers/${cleanPhone}`).update({
        name: user.name,
        phone: user.phone,
        avatar: user.avatar === 'female' ? '👧' : '👦',
        lastLoginAt: new Date().toLocaleString()
    }).catch(() => {});

    globalDb.ref(`gifts/${cleanPhone}`).on('value', (snapshot) => {
        const giftData = snapshot.val();
        if (!giftData || !giftData.amount || !giftData.id) return;

        const seenGiftKey = `ludoplay.gift.claimed.${giftData.id}`;
        if (localStorage.getItem(seenGiftKey)) return;
        localStorage.setItem(seenGiftKey, 'true');

        const giftAmount = parseInt(giftData.amount, 10) || 0;
        if (giftAmount > 0) {
            const storageKey = getUserCoinStorageKey(cleanPhone);
            const currentCoins = getPlayerDummyCoins();
            const updatedCoins = currentCoins + giftAmount;
            localStorage.setItem(storageKey, String(updatedCoins));
            globalDb.ref(`users/${cleanPhone}/coins`).set(updatedCoins).catch(() => {});
            injectTopBarCoinIndicator();

            globalDb.ref(`gifts/${cleanPhone}`).remove().catch(() => {});

            if (typeof playGameSound === 'function') playGameSound('victory');
            showAdminGiftCongratsPopup(giftAmount);
        }
    });
}
setInterval(bindUserRealtimeGiftAndCoinListener, 1200);

function showAdminGiftCongratsPopup(amount) {
    showGameToast(`🎉 Congratulations! Admin gifted you ${Number(amount).toLocaleString()} Coins! 🪙`);
    let modal = document.getElementById('adminGiftCongratsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'adminGiftCongratsModal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '125';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="modal-box compact-modal neon-3d-modal" style="text-align:center;">
            <div style="font-size:52px; margin-bottom:8px;">🎁🪙</div>
            <h3 style="font-size:22px; font-weight:900; color:#fde047; margin-bottom:8px;">CONGRATULATIONS!</h3>
            <p style="font-size:15px; color:#ffffff; font-weight:700; line-height:1.5; margin-bottom:18px;">
                Admin has gifted you <strong style="color:#00f2fe; font-size:18px;">${Number(amount).toLocaleString()} Coins</strong>! 🎉
            </p>
            <button type="button" class="primary-btn" onclick="document.getElementById('adminGiftCongratsModal').style.display='none'">
                Awesome! Collect Coins 🚀
            </button>
        </div>
    `;
    modal.style.display = 'flex';
}

const _origSaveProfileAndLogin = window.saveProfileAndLogin;
if (typeof _origSaveProfileAndLogin === 'function') {
    window.saveProfileAndLogin = function() {
        _origSaveProfileAndLogin.apply(this, arguments);
        activeWatchedGiftPhone = '';
        checkAndGrantWelcomeCoins();
        injectTopBarCoinIndicator();
        bindUserRealtimeGiftAndCoinListener();
    };
}

// 7. 3D Inventory Previews (Dice, Tokens & Boards)
if (typeof INVENTORY_CATALOG !== 'undefined') {
    INVENTORY_CATALOG.dice = [
        { id: 'classic', name: 'Crystal Pearl', desc: 'Ultra-HD White & Red' },
        { id: 'royal_gold', name: '24K Imperial Gold', desc: 'Luxury Gold & Onyx' },
        { id: 'neon_cyber', name: 'Cyber Plasma', desc: 'Neon Cyan & Deep Navy' },
        { id: 'ruby_flare', name: 'Crimson Ruby', desc: 'Glowing White Pips' },
        { id: 'emerald_glow', name: 'Jade Emerald', desc: 'Gold & White Pips' },
        { id: 'obsidian', name: 'Phantom Galaxy', desc: 'Dark Void & Neon Pips' }
    ];
    INVENTORY_CATALOG.tokenShapes = [
        { id: 'alpin', name: 'Classic 3D Pin', desc: 'Tournament Pin' },
        { id: 'crown', name: 'Royal Crown', desc: 'Monarch Piece' },
        { id: 'diamond', name: 'Crystal Gem', desc: 'Faceted Diamond' },
        { id: 'coin', name: 'Golden Medallion', desc: '3D Disc Token' },
        { id: 'ghost', name: 'Cyber Shield', desc: 'Esports Emblem' }
    ];
    INVENTORY_CATALOG.boards = [
        { id: 'classic', name: 'Classic Tournament', desc: 'Crisp White Arena' },
        { id: 'royal_marble', name: 'Royal Amethyst', desc: 'Violet & Gold Court' },
        { id: 'wooden', name: 'Imperial Wood', desc: 'Warm Teak & Gold' },
        { id: 'cyber_grid', name: 'Cyber Neon Grid', desc: 'Dark Neon Matrix' },
        { id: 'emerald_palace', name: 'Emerald Palace', desc: 'Rich Jade & Mint' },
        { id: 'obsidian_gold', name: 'Obsidian Gold', desc: 'Dark Slate & 24K Trim' }
    ];
}

function buildMiniInventoryDicePreview(skinId) {
    return `
        <div class="inv-live-dice-wrap" data-preview-dice="${skinId}">
            <div class="inv-mini-dice-face">
                <span class="m-pip show red"></span><span class="m-pip"></span><span class="m-pip show"></span>
                <span class="m-pip"></span><span class="m-pip show red"></span><span class="m-pip"></span>
                <span class="m-pip show"></span><span class="m-pip"></span><span class="m-pip show red"></span>
            </div>
        </div>
    `;
}

function buildMiniInventoryTokenPreview(shapeId, activeColorId) {
    const colorClass = `pin-${activeColorId || 'blue'}`;
    return `
        <div class="inv-live-token-wrap" data-preview-shape="${shapeId}">
            <div class="lk-pin-token ${colorClass} inv-preview-pin"></div>
        </div>
    `;
}

function buildMiniInventoryBoardPreview(boardId) {
    return `
        <div class="inv-live-board-wrap board-preview-${boardId}">
            <span class="b-quad q-red"></span>
            <span class="b-quad q-green"></span>
            <span class="b-quad q-blue"></span>
            <span class="b-quad q-yellow"></span>
            <span class="b-center"></span>
        </div>
    `;
}

window.renderInventoryGrids = function() {
    const prefs = (typeof userInventoryPrefs !== 'undefined' && userInventoryPrefs) ? userInventoryPrefs : { dice: 'classic', tokenShape: 'alpin', tokenColor: 'blue', board: 'classic' };
    
    const diceGrid = document.getElementById('invDiceGrid');
    if (diceGrid && typeof INVENTORY_CATALOG !== 'undefined') {
        diceGrid.innerHTML = INVENTORY_CATALOG.dice.map(item => `
            <div class="inv-card-3d ${prefs.dice === item.id ? 'active' : ''}" onclick="selectInventoryOption('dice','${item.id}')">
                ${buildMiniInventoryDicePreview(item.id)}
                <strong>${escapeHTML(item.name)}</strong>
                <small>${prefs.dice === item.id ? '✓ Equipped' : item.desc}</small>
            </div>
        `).join('');
    }

    const shapeGrid = document.getElementById('invTokenShapeGrid');
    if (shapeGrid && typeof INVENTORY_CATALOG !== 'undefined') {
        shapeGrid.innerHTML = INVENTORY_CATALOG.tokenShapes.map(item => `
            <div class="inv-card-3d ${prefs.tokenShape === item.id ? 'active' : ''}" onclick="selectInventoryOption('tokenShape','${item.id}')">
                ${buildMiniInventoryTokenPreview(item.id, prefs.tokenColor)}
                <strong>${escapeHTML(item.name)}</strong>
                <small>${prefs.tokenShape === item.id ? '✓ Equipped' : item.desc}</small>
            </div>
        `).join('');
    }

    const colorGrid = document.getElementById('invTokenColorGrid');
    if (colorGrid && typeof INVENTORY_CATALOG !== 'undefined') {
        colorGrid.innerHTML = INVENTORY_CATALOG.tokenColors.map(item => `
            <div class="inv-color-chip ${prefs.tokenColor === item.id ? 'active' : ''}" style="background:${item.hex}" onclick="selectInventoryOption('tokenColor','${item.id}')">
                ${prefs.tokenColor === item.id ? '✓ ' : ''}${escapeHTML(item.name)}
            </div>
        `).join('');
    }

    const boardGrid = document.getElementById('invBoardGrid');
    if (boardGrid && typeof INVENTORY_CATALOG !== 'undefined') {
        boardGrid.innerHTML = INVENTORY_CATALOG.boards.map(item => `
            <div class="inv-card-3d ${prefs.board === item.id ? 'active' : ''}" onclick="selectInventoryOption('board','${item.id}')">
                ${buildMiniInventoryBoardPreview(item.id)}
                <strong>${escapeHTML(item.name)}</strong>
                <small>${prefs.board === item.id ? '✓ Equipped' : item.desc}</small>
            </div>
        `).join('');
    }
};

const _origApplyInventoryCosmetics = window.applyInventoryCosmetics;
window.applyInventoryCosmetics = function() {
    if (typeof _origApplyInventoryCosmetics === 'function') {
        _origApplyInventoryCosmetics.apply(this, arguments);
    }
    const prefs = (typeof userInventoryPrefs !== 'undefined' && userInventoryPrefs) ? userInventoryPrefs : {};
    const boardSkin = prefs.board || 'classic';
    document.documentElement.setAttribute('data-board-skin', boardSkin);
    document.body?.setAttribute('data-board-skin', boardSkin);
};
setTimeout(() => { if (typeof applyInventoryCosmetics === 'function') applyInventoryCosmetics(); }, 120);

// 8. Global Notice & Weather Sync + Cloud Fallback
let cachedGlobalTheme = localStorage.getItem('ludoGlobalTheme') || 'default';

function applyGlobalNoticeToUI(cleanText) {
    const finalNotice = cleanText || 'Only offline match available! Please login first and enjoy the game.';
    try {
        localStorage.setItem('ludoAdminNotice', finalNotice);
        localStorage.setItem('ludoplay.live.notice', finalNotice);
        localStorage.removeItem('ludoNoticeDismissed');
    } catch (_) {}
    if (typeof adminNoticeText !== 'undefined') adminNoticeText = finalNotice;
    const noticeTextEl = document.getElementById('noticeText');
    const noticeBarEl = document.getElementById('noticeBar');
    if (noticeTextEl) {
        noticeTextEl.textContent = finalNotice.startsWith('📢') ? finalNotice : `📢 ${finalNotice}`;
    }
    if (noticeBarEl) {
        noticeBarEl.style.display = 'flex';
    }
}

// Set default notice immediately if still on old welcome text
setTimeout(() => {
    const currentStored = localStorage.getItem('ludoAdminNotice');
    if (!currentStored || currentStored.includes('Official Tournament coming soon')) {
        applyGlobalNoticeToUI('Only offline match available! Please login first and enjoy the game.');
    }
}, 150);

if (globalDb) {
    globalDb.ref('settings/globalNotice').on('value', (snapshot) => {
        const remoteNotice = snapshot.val();
        if (remoteNotice !== null && remoteNotice !== undefined) {
            applyGlobalNoticeToUI(String(remoteNotice).trim());
        }
    });

    globalDb.ref('settings/globalTheme').on('value', (snapshot) => {
        const remoteTheme = snapshot.val();
        if (remoteTheme && ['default', 'winter', 'spring', 'summer'].includes(remoteTheme)) {
            cachedGlobalTheme = remoteTheme;
            try { localStorage.setItem('ludoGlobalTheme', remoteTheme); } catch (_) {}
            if (typeof applyThemeVisuals === 'function') {
                applyThemeVisuals(remoteTheme);
            }
        }
    });

    globalDb.ref('registeredPlayers').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && typeof data === 'object') {
            const list = Object.values(data);
            if (typeof playersDatabase !== 'undefined' && Array.isArray(playersDatabase)) {
                playersDatabase = list;
                try { localStorage.setItem('ludoAdminPlayersDB', JSON.stringify(list)); } catch (_) {}
                if (typeof renderRegisteredPlayersForAdmin === 'function') renderRegisteredPlayersForAdmin();
            }
        }
    });
}

window.applyThemeForCurrentUser = function() {
    const storedGlobal = cachedGlobalTheme || localStorage.getItem('ludoGlobalTheme') || 'default';
    if (['winter', 'spring', 'summer'].includes(storedGlobal)) {
        if (typeof applyThemeVisuals === 'function') applyThemeVisuals(storedGlobal);
        return;
    }
    const user = getActiveUserObj();
    const userPrefTheme = (user && user.userTheme === 'royal') ? 'royal' : 'default';
    if (typeof applyThemeVisuals === 'function') applyThemeVisuals(userPrefTheme);
};

const _origSetGlobalTheme = window.setGlobalTheme || function(){};
window.setGlobalTheme = function(themeId) {
    cachedGlobalTheme = themeId;
    try { localStorage.setItem('ludoGlobalTheme', themeId); } catch (_) {}
    if (typeof applyThemeVisuals === 'function') applyThemeVisuals(themeId);

    if (globalDb) {
        globalDb.ref('settings/globalTheme').set(themeId).then(() => {
            showGameToast('🌦️ Weather theme broadcasted globally to all users!');
        }).catch(() => {
            showGameToast('⚠️ Enable Firebase Realtime Database (Test Mode) for global sync.');
        });
    } else {
        showGameToast('🌦️ Weather theme updated!');
    }
    return true;
};

const _origSaveAdminSettings = window.saveAdminSettings || function(){};
window.saveAdminSettings = function() {
    const newNotice = document.getElementById('adminNoticeInput')?.value.trim() || 'Only offline match available! Please login first and enjoy the game.';
    applyGlobalNoticeToUI(newNotice);
    if (globalDb) {
        globalDb.ref('settings/globalNotice').set(newNotice).catch(() => {});
    }
    _origSaveAdminSettings.apply(this, arguments);
};

// 9. Admin Modals: Gift Coins, Players List & Notice
function openAdminGiftModal() {
    closeAdminModal();
    let modal = document.getElementById('neonAdminGiftModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'neonAdminGiftModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
            <div class="modal-box compact-modal neon-3d-modal">
                <div class="modal-header">
                    <span class="modal-title">🎁 Admin Coin Gifting</span>
                    <button class="notice-close" onclick="document.getElementById('neonAdminGiftModal').style.display='none'">×</button>
                </div>
                <p class="profile-help-text">Enter recipient's phone number and coin amount. The user will receive a Congratulations popup from Admin!</p>
                <div class="input-group">
                    <label>Recipient Phone Number</label>
                    <input type="tel" id="neonGiftPhone" class="input-field" placeholder="017XXXXXXXX">
                </div>
                <div class="input-group">
                    <label>Coin Amount</label>
                    <input type="number" id="neonGiftAmount" class="input-field" placeholder="e.g. 10000" min="1">
                </div>
                <button type="button" class="primary-btn" onclick="executeNeonAdminGift()">🚀 Send Gift Now</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function executeNeonAdminGift() {
    const rawPhone = document.getElementById('neonGiftPhone')?.value.trim();
    const cleanPhone = getCleanPhoneKey(rawPhone);
    const amount = parseInt(document.getElementById('neonGiftAmount')?.value, 10);

    if (!cleanPhone || isNaN(amount) || amount <= 0) {
        showGameToast('⚠️ Please enter a valid phone number and coin amount.');
        return;
    }

    try {
        const targetKey = getUserCoinStorageKey(cleanPhone);
        const existingCoins = parseInt(localStorage.getItem(targetKey), 10);
        const baseCoins = isNaN(existingCoins) ? 5000 : existingCoins;
        localStorage.setItem(targetKey, String(baseCoins + amount));
    } catch (_) {}

    if (globalDb) {
        const giftPayload = {
            id: 'gift_' + Date.now(),
            amount: amount,
            sentAt: Date.now()
        };
        globalDb.ref(`gifts/${cleanPhone}`).set(giftPayload).catch(() => {});
    }

    injectTopBarCoinIndicator();
    showGameToast(`🎁 Successfully gifted ${amount.toLocaleString()} Coins to ${rawPhone}!`);
    document.getElementById('neonGiftPhone').value = '';
    document.getElementById('neonGiftAmount').value = '';
    document.getElementById('neonAdminGiftModal').style.display = 'none';
}

function openAdminPlayersModal() {
    closeAdminModal();
    let modal = document.getElementById('neonAdminPlayersModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'neonAdminPlayersModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
            <div class="modal-box compact-modal neon-3d-modal">
                <div class="modal-header">
                    <span class="modal-title">📋 Registered Players Database</span>
                    <button class="notice-close" onclick="document.getElementById('neonAdminPlayersModal').style.display='none'">×</button>
                </div>
                <div class="input-group" style="margin-bottom:0;">
                    <input type="search" id="neonPlayerSearchInput" class="input-field" placeholder="Search by name or phone..." oninput="renderNeonPlayersModalList()">
                    <div class="player-list-box" id="neonModalPlayerList" style="margin-top:10px; max-height: 260px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    renderNeonPlayersModalList();
    modal.style.display = 'flex';
}

function renderNeonPlayersModalList() {
    const listEl = document.getElementById('neonModalPlayerList');
    const query = document.getElementById('neonPlayerSearchInput')?.value.toLowerCase().trim() || '';
    if (!listEl) return;
    const sourceList = (typeof playersDatabase !== 'undefined' && Array.isArray(playersDatabase)) ? playersDatabase : [];
    const filtered = sourceList.filter(p => (p.name || '').toLowerCase().includes(query) || (p.phone || '').includes(query));
    if (!filtered.length) {
        listEl.innerHTML = `<div class="player-list-empty">No registered players found.</div>`;
        return;
    }
    listEl.innerHTML = filtered.map(p => `
        <div class="player-row">
            <span class="p-info">${escapeHTML(p.avatar || '👦')} ${escapeHTML(p.name || 'Player')}</span>
            <span class="p-phone">${escapeHTML(p.phone || '')}</span>
        </div>
    `).join('');
}

function openAdminNoticeModal() {
    closeAdminModal();
    let modal = document.getElementById('neonAdminNoticeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'neonAdminNoticeModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        modal.innerHTML = `
            <div class="modal-box compact-modal neon-3d-modal">
                <div class="modal-header">
                    <span class="modal-title">📢 Update Live Notice Bar</span>
                    <button class="notice-close" onclick="document.getElementById('neonAdminNoticeModal').style.display='none'">×</button>
                </div>
                <p class="profile-help-text">Type your announcement below. It will scroll live on all users' home screens.</p>
                <div class="input-group">
                    <input type="text" id="neonNoticeInputBox" class="input-field" placeholder="Write announcement">
                </div>
                <button type="button" class="primary-btn" onclick="executeNeonNoticeUpdate()">🚀 Broadcast Notice</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    const currentNotice = document.getElementById('adminNoticeInput')?.value || '';
    const box = document.getElementById('neonNoticeInputBox');
    if (box) box.value = currentNotice;
    modal.style.display = 'flex';
}

window.executeNeonNoticeUpdate = function() {
    const val = document.getElementById('neonNoticeInputBox')?.value.trim() || '';
    const finalVal = val || 'Only offline match available! Please login first and enjoy the game.';
    
    const mainInput = document.getElementById('adminNoticeInput');
    if (mainInput) mainInput.value = finalVal;

    applyGlobalNoticeToUI(finalVal);
    if (globalDb) {
        globalDb.ref('settings/globalNotice').set(finalVal).then(() => {
            showGameToast('📢 Notice broadcasted globally to all users!');
        }).catch(() => {});
    }
    if (typeof saveAdminSettings === 'function') saveAdminSettings();
    document.getElementById('neonAdminNoticeModal').style.display = 'none';
};

// 10. Dual-Engine Realtime Traffic & Online Count Tracker (Firebase + Instant Fallback)
function updateAllTrafficUI(liveCount, totalVisits) {
    const validLive = Math.max(1, parseInt(liveCount, 10) || 1);
    const validTotal = Math.max(1, parseInt(totalVisits, 10) || 1);

    ['activeUsersVal', 'adminLiveUsers'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = validLive.toLocaleString();
    });
    ['totalVisitsVal', 'adminTotalVisits'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = validTotal.toLocaleString();
    });
    const topOnlineEl = document.getElementById('onlineCount');
    if (topOnlineEl) topOnlineEl.textContent = `${validLive.toLocaleString()} Online`;
    const updatedEl = document.getElementById('adminTrafficUpdated');
    if (updatedEl) updatedEl.textContent = `Live Active · ${new Date().toLocaleTimeString()}`;
}

function initRealtimeTrafficTracker() {
    // Immediate local + session counter so it NEVER shows "Online —" even before Firebase responds
    let localVisits = parseInt(localStorage.getItem('ludoplay.local.totalVisits'), 10) || 0;
    if (!sessionStorage.getItem('ludoplay.session.counted')) {
        sessionStorage.setItem('ludoplay.session.counted', 'true');
        localVisits++;
        try { localStorage.setItem('ludoplay.local.totalVisits', String(localVisits)); } catch (_) {}
    }
    updateAllTrafficUI(1, localVisits);

    if (!globalDb) return;

    const visitorRef = globalDb.ref('analytics/totalVisits');
    if (!sessionStorage.getItem('ludoplay.fb.session.counted')) {
        sessionStorage.setItem('ludoplay.fb.session.counted', 'true');
        visitorRef.transaction((currentVal) => (currentVal || localVisits) + 1).catch(() => {});
    }

    const activeRef = globalDb.ref('analytics/activeUsers');
    const myConnectionRef = globalDb.ref('analytics/activeUsers/' + Math.random().toString(36).substr(2, 9));
    myConnectionRef.set(true).catch(() => {});
    myConnectionRef.onDisconnect().remove().catch(() => {});

    let latestLive = 1;
    let latestTotal = localVisits;

    visitorRef.on('value', (snapshot) => {
        const val = snapshot.val();
        if (val) {
            latestTotal = Math.max(localVisits, Number(val));
            try { localStorage.setItem('ludoplay.local.totalVisits', String(latestTotal)); } catch (_) {}
            updateAllTrafficUI(latestLive, latestTotal);
        }
    });

    activeRef.on('value', (snapshot) => {
        const activeObj = snapshot.val() || {};
        latestLive = Math.max(1, Object.keys(activeObj).length);
        updateAllTrafficUI(latestLive, latestTotal);
    });
}
setTimeout(initRealtimeTrafficTracker, 150);

window.injectCleanAdminHubUI = function() {
    const adminModalBox = document.querySelector('#adminModal .modal-box');
    if (!adminModalBox) return;

    const regPlayersGroup = document.getElementById('registeredPlayersList')?.closest('.input-group');
    if (regPlayersGroup) regPlayersGroup.style.display = 'none';
    const noticeGroup = document.getElementById('adminNoticeInput')?.closest('.input-group');
    if (noticeGroup) noticeGroup.style.display = 'none';

    if (document.getElementById('adminHubHubMenu')) return;

    adminModalBox.insertAdjacentHTML('beforeend', `
        <div id="adminHubHubMenu" class="admin-hub-grid" style="margin-top: 14px; margin-bottom: 12px;">
            <div class="admin-hub-card" onclick="openAdminGiftModal()">
                <span>🎁</span>
                <div>
                    <strong>Gift Coins Panel</strong>
                    <small>Send coins to any player's phone number</small>
                </div>
            </div>
            <div class="admin-hub-card" onclick="openAdminPlayersModal()">
                <span>📋</span>
                <div>
                    <strong>Registered Players Database</strong>
                    <small>View and search all user accounts globally</small>
                </div>
            </div>
            <div class="admin-hub-card" onclick="openAdminNoticeModal()">
                <span>📢</span>
                <div>
                    <strong>Update Live Notice Bar</strong>
                    <small>Broadcast running announcements to all users</small>
                </div>
            </div>
        </div>
    `);
};

const _origOpenAdminModal2 = window.openAdminModal || function(){};
window.openAdminModal = function() {
    _origOpenAdminModal2.apply(this, arguments);
    setTimeout(injectCleanAdminHubUI, 50);
};

/* =====================================================================
   INSTANT 3D COMING SOON POPUP, AI TOKEN COLOR PICKER POPUP,
   AND INTERVAL-ONLY 3D AVATAR CROWN (NO KING TEXT, NO START KING)
   ===================================================================== */

// 1. INSTANT 3D ANIMATED COMING SOON POPUP ON ONLINE / TOURNAMENT CLICK
function triggerInstant3DComingSoonPopup() {
    // Close online sub-popup if it tried to open
    const onlinePopup = document.getElementById('onlineMatchPopup');
    if (onlinePopup) onlinePopup.style.display = 'none';

    let modal = document.getElementById('publishingSoonModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'publishingSoonModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) closePublishingSoonModal(); };
        modal.innerHTML = `
            <div class="modal-box compact-modal neon-3d-modal" style="text-align: center; padding: 30px 22px;">
                <div style="font-size: 62px; margin-bottom: 10px; filter: drop-shadow(0 8px 16px rgba(0,242,254,0.5)); animation: floatIcon 2.5s ease-in-out infinite;">🚀🏆</div>
                <h2 style="font-size: 24px; font-weight: 900; background: linear-gradient(90deg, #fde047, #00f2fe); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; letter-spacing: 1px;">COMING SOON IN 3D!</h2>
                <p class="profile-help-text" style="font-size: 14px; color: #e2e8f0; line-height: 1.6; margin-bottom: 20px;">
                    🌐 <strong>Online Multiplayer</strong> & 🏆 <strong>Global Tournament Mode</strong> are currently under final development!<br>
                    <span style="color: #fde047; font-weight: 800;">Enjoy Smart AI & Pass & Play (Individual & 2v2 Team Up) matches right now!</span>
                </p>
                <button type="button" class="primary-btn" onclick="closePublishingSoonModal()">🎮 Got It! Play Offline Now</button>
            </div>
        `;
    }
    // Always move to the end of document.body so it sits above #fullScreenSetupView
    if (modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    } else {
        document.body.appendChild(modal);
    }

    modal.style.zIndex = '9999';
    modal.classList.remove('show-3d-popup');
    void modal.offsetWidth; // Force reflow for fresh 3D animation every click
    modal.classList.add('show-3d-popup');
    modal.style.display = 'flex';
}

window.openPublishingSoonModal = triggerInstant3DComingSoonPopup;
window.openPublishingSoonModal3D = triggerInstant3DComingSoonPopup;
window.closePublishingSoonModal = function() {
    const modal = document.getElementById('publishingSoonModal');
    if (modal) {
        modal.classList.remove('show-3d-popup');
        modal.style.display = 'none';
    }
};
window.handleOnlineModeClick = function() {
    triggerInstant3DComingSoonPopup();
};
window.handleTourneyModeClick = function() {
    triggerInstant3DComingSoonPopup();
};

// 2. SMART AI TOKEN COLOR SELECTION POPUP BEFORE MATCH STARTS
let chosenAITokenColor = 'blue';
let bypassAIColorPopupOnce = false;

function openAITokenColorPickerModal() {
    const count = parseInt(matchConfigValue, 10) || 2;
    const isRadial = count > 4;

    const colorOptions = isRadial
        ? [
            { id: 'red', name: 'Crimson Red', hex: '#dc1824' },
            { id: 'green', name: 'Emerald Green', hex: '#008844' },
            { id: 'orange', name: 'Obsidian Black', hex: '#111827' },
            { id: 'blue', name: 'Ocean Blue', hex: '#0765a8' },
            { id: 'yellow', name: 'Solar Gold', hex: '#e6c200' },
            { id: 'purple', name: 'Royal Purple', hex: '#7e22ce' }
        ]
        : [
            { id: 'blue', name: 'Ocean Blue', hex: '#0765a8' },
            { id: 'red', name: 'Crimson Red', hex: '#dc1824' },
            { id: 'green', name: 'Emerald Green', hex: '#008844' },
            { id: 'yellow', name: 'Solar Gold', hex: '#e6c200' }
        ];

    if (!colorOptions.some(c => c.id === chosenAITokenColor)) {
        chosenAITokenColor = colorOptions[0].id;
    }

    let modal = document.getElementById('aiColorSelectModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'aiColorSelectModal';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) closeAITokenColorPickerModal(); };
        document.body.appendChild(modal);
    } else {
        document.body.appendChild(modal);
    }

    const cardsHtml = colorOptions.map(c => {
        const isSelected = c.id === chosenAITokenColor;
        const pinStyle = isRadial ? `background: radial-gradient(circle at 35% 25%, #fff, ${c.hex} 60%);` : '';
        return `
            <div class="ai-color-option-card ${isSelected ? 'selected' : ''}" data-color-id="${c.id}" onclick="selectAITokenColorChoice('${c.id}')">
                <div class="lk-pin-token pin-${c.id} ai-color-pin-preview" style="${pinStyle}"></div>
                <strong>${c.name}</strong>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-box compact-modal neon-3d-modal" style="text-align: center; max-width: 420px;">
            <div class="modal-header" style="margin-bottom: 8px;">
                <span class="modal-title">🎨 Choose Your Token Color</span>
                <button class="notice-close" onclick="closeAITokenColorPickerModal()">×</button>
            </div>
            <p class="profile-help-text" style="margin-bottom: 6px;">Select the token color you want to play with against Smart AI:</p>
            <div class="ai-color-picker-grid">
                ${cardsHtml}
            </div>
            <button type="button" class="primary-btn" onclick="confirmAITokenColorAndLaunch()">🚀 Start AI Match Now</button>
        </div>
    `;

    modal.classList.remove('show-3d-popup');
    void modal.offsetWidth;
    modal.classList.add('show-3d-popup');
    modal.style.display = 'flex';
}

window.selectAITokenColorChoice = function(colorId) {
    chosenAITokenColor = colorId;
    document.querySelectorAll('#aiColorSelectModal .ai-color-option-card').forEach(card => {
        card.classList.toggle('selected', card.getAttribute('data-color-id') === colorId);
    });
};

window.closeAITokenColorPickerModal = function() {
    const modal = document.getElementById('aiColorSelectModal');
    if (modal) {
        modal.classList.remove('show-3d-popup');
        modal.style.display = 'none';
    }
};

window.confirmAITokenColorAndLaunch = function() {
    closeAITokenColorPickerModal();

    // Apply chosen color to LUDO_COLORS_BY_COUNT so player (index 0) gets their exact chosen color!
    const oppositeCornerMap = { blue: 'green', green: 'blue', red: 'yellow', yellow: 'red' };
    const clockwise4 = ['blue', 'red', 'green', 'yellow'];
    if (clockwise4.includes(chosenAITokenColor) && typeof LUDO_COLORS_BY_COUNT !== 'undefined') {
        const startIdx = clockwise4.indexOf(chosenAITokenColor);
        const ordered = Array.from({ length: 4 }, (_, i) => clockwise4[(startIdx + i) % 4]);
        LUDO_COLORS_BY_COUNT[2] = [chosenAITokenColor, oppositeCornerMap[chosenAITokenColor]];
        LUDO_COLORS_BY_COUNT[3] = [ordered[0], ordered[1], ordered[2]];
        LUDO_COLORS_BY_COUNT[4] = ordered;
        if (typeof userInventoryPrefs !== 'undefined' && userInventoryPrefs) {
            userInventoryPrefs.tokenColor = chosenAITokenColor;
        }
    }

    bypassAIColorPopupOnce = true;
    launchGameMatch();

    // If 5 or 6 players radial mode, rotate color assignment so player 0 gets chosenAITokenColor
    const count = parseInt(matchConfigValue, 10) || 2;
    if (count > 4 && typeof LUDO_RADIAL_COLOR_ORDER !== 'undefined' && Array.isArray(activePlayersList) && activePlayersList.length === count) {
        const rIdx = LUDO_RADIAL_COLOR_ORDER.indexOf(chosenAITokenColor);
        if (rIdx >= 0) {
            activePlayersList.forEach((p, idx) => {
                const cIndex = (rIdx + idx) % 6;
                p.color = LUDO_RADIAL_COLOR_ORDER[cIndex];
                p.radialIndex = cIndex;
                p.startIndex = cIndex * 10;
                p.homeLane = LUDO_RADIAL_HOME_LANES[cIndex];
            });
            renderFullStage();
        }
    }
};

// Intercept launchGameMatch to show Token Color Picker when playing Ludo vs Smart AI
const _prevLaunchGameMatchForColor = window.launchGameMatch;
window.launchGameMatch = function() {
    if (typeof selectedSubMode === 'string' && (selectedSubMode.startsWith('online') || selectedSubMode === 'tourney')) {
        triggerInstant3DComingSoonPopup();
        return;
    }
    if (activeGameType === 'ludo' && selectedSubMode === 'ai' && !bypassAIColorPopupOnce) {
        openAITokenColorPickerModal();
        return;
    }
    bypassAIColorPopupOnce = false;

    // Reset King state at the start of every match so NO ONE is King from the beginning!
    liveGreatPlayerIndex = -1;
    liveGreatPlayerUntil = 0;
    bountyKingPlayerIndex = -1;

    _prevLaunchGameMatchForColor.apply(this, arguments);
};

// 3. FIX INTERVAL-ONLY 3D CROWN ON AVATAR (NO KING AT START, NO "KING" TEXT)
window.getLiveGreatStarMarkup = function() {
    // Never show "★ KING" text beside player name
    return '';
};

function renderAvatar3DCrowns() {
    // Remove any existing crowns first
    document.querySelectorAll('.avatar-3d-king-crown, .bounty-crown-badge').forEach(el => el.remove());

    // Only show crown during the 1-minute active interval window
    if (liveGreatPlayerIndex < 0 || Date.now() >= liveGreatPlayerUntil) return;
    if (ludoMatchWinner !== null || snakeMatchWinner !== null) return;

    const targetBadge = document.getElementById(`badge_${liveGreatPlayerIndex}`);
    const avatarFrame = targetBadge?.querySelector('.lk-avatar-frame');
    if (avatarFrame && !avatarFrame.querySelector('.avatar-3d-king-crown')) {
        const crown = document.createElement('div');
        crown.className = 'avatar-3d-king-crown';
        crown.textContent = '👑';
        crown.title = 'Leading Player!';
        avatarFrame.appendChild(crown);
    }
}

// Disable continuous bounty king crown from appearing on every turn; keep clutch recorder intact
const _origEvaluateBountyAndClutch = window.evaluateBountyAndClutchState;
window.evaluateBountyAndClutchState = function() {
    if (typeof _origEvaluateBountyAndClutch === 'function') {
        _origEvaluateBountyAndClutch.apply(this, arguments);
    }
    bountyKingPlayerIndex = -1;
    document.querySelectorAll('.bounty-crown-badge').forEach(el => el.remove());
    renderAvatar3DCrowns();
};

// Trigger the 1-minute 3D Crown ONLY on periodic intervals (every 2.5 minutes) once match has real progress
window.startLiveGreatPlayerPeriodicScheduler = function() {
    clearTimeout(liveGreatPlayerTimer);
    clearInterval(liveGreatPlayerInterval);
    liveGreatPlayerIndex = -1;
    liveGreatPlayerUntil = 0;
    bountyKingPlayerIndex = -1;

    // Check every 150 seconds (2.5 minutes) and crown the leader for 60 seconds (1 minute)
    liveGreatPlayerInterval = setInterval(() => {
        if (document.getElementById('gameArenaScreen')?.style.display === 'none') return;
        updateLiveGreatPlayer();
    }, 150000);
};

const _origUpdateLiveGreatPlayer = window.updateLiveGreatPlayer;
window.updateLiveGreatPlayer = function() {
    if (typeof _origUpdateLiveGreatPlayer === 'function') {
        _origUpdateLiveGreatPlayer.apply(this, arguments);
    }
    renderAvatar3DCrowns();
};

/* =====================================================================
   1. ALWAYS BOTTOM-LEFT HOME BASE FOR PLAYER 0 (ALL MODES & COLORS)
   2. CALM AMBIENT LOBBY MUSIC (STOPS AUTOMATICALLY IN GAMEPLAY)
   3. 3D AI EMOJI REACTIONS & FUNNY SOUNDS BESIDE AI AVATAR
   ===================================================================== */

// ---------------------------------------------------------------------
// PART 1: ALWAYS KEEP PLAYER 1 (YOU) AT THE BOTTOM-LEFT CORNER
// ---------------------------------------------------------------------
window.render4PlayerLudoStage = function(stage) {
    const colorPlayers = Object.fromEntries(activePlayersList.map((player, index) => [player.color, index]));
    
    // Determine Player 0's color so we rotate the board & HUD to put Player 0 ALWAYS at Bottom-Left!
    const myColor = activePlayersList[0]?.color || 'blue';
    const clockwiseColors = ['blue', 'red', 'green', 'yellow'];
    const myColorPos = Math.max(0, clockwiseColors.indexOf(myColor));

    // Rotate clockwise order so myColor is first (Bottom-Left), then Top-Left, Top-Right, Bottom-Right
    const rotatedColors = Array.from({ length: 4 }, (_, i) => clockwiseColors[(myColorPos + i) % 4]);
    const blColor = rotatedColors[0]; // Always Player 0 (Bottom-Left)
    const tlColor = rotatedColors[1]; // Top-Left
    const trColor = rotatedColors[2]; // Top-Right
    const brColor = rotatedColors[3]; // Bottom-Right

    const blIdx = colorPlayers[blColor] ?? -1;
    const tlIdx = colorPlayers[tlColor] ?? -1;
    const trIdx = colorPlayers[trColor] ?? -1;
    const brIdx = colorPlayers[brColor] ?? -1;

    // Board CSS rotation angle so Player 0's physical home base sits at Bottom-Left
    const rotMap = { blue: 0, red: 270, green: 180, yellow: 90 };
    const boardRotDeg = rotMap[myColor] ?? 0;

    const redSix = isSixActiveForPlayer(colorPlayers.red ?? -1);
    const greenSix = isSixActiveForPlayer(colorPlayers.green ?? -1);
    const yellowSix = isSixActiveForPlayer(colorPlayers.yellow ?? -1);
    const blueSix = isSixActiveForPlayer(colorPlayers.blue ?? -1);

    const isTeamUp = (ludoMatchIsOffline && selectedSubMode.startsWith('pass') && passPlaySubType === 'teamup') || selectedSubMode.includes('teamup');
    const teamStyleBase = 'position:absolute;z-index:6;padding:2px 7px;border-radius:6px;font-size:9px;font-weight:900;letter-spacing:0.08em;color:rgba(255,255,255,0.88);background:linear-gradient(145deg,rgba(15,23,42,0.55),rgba(30,41,59,0.35));border:1px solid rgba(255,255,255,0.35);box-shadow:0 2px 0 rgba(0,0,0,0.45),0 3px 6px rgba(0,0,0,0.3);text-shadow:0 1px 2px rgba(0,0,0,0.8);pointer-events:none;';
    const labelRedTL    = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}top:5px;left:6px;">TEAM B</span>` : '';
    const labelGreenTR  = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}top:5px;right:6px;">TEAM A</span>` : '';
    const labelBlueBL   = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}bottom:5px;left:6px;">TEAM A</span>` : '';
    const labelYellowBR = isTeamUp ? `<span class="team-base-tag" style="${teamStyleBase}bottom:5px;right:6px;">TEAM B</span>` : '';

    let cells = '';
    for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
        if ((row >= 6 && row <= 8 && col >= 6 && col <= 8) || (row < 6 && col < 6) || (row < 6 && col > 8) || (row > 8 && col < 6) || (row > 8 && col > 8)) continue;
        let cls = 'board-cell';
        if (row === 7 && col >= 1 && col <= 5) cls += ' lane-red';
        if (col === 7 && row >= 1 && row <= 5) cls += ' lane-green';
        if (row === 7 && col >= 9 && col <= 13) cls += ' lane-yellow';
        if (col === 7 && row >= 9 && row <= 13) cls += ' lane-blue';
        if (row === 0 && col === 7) cls += ' arrow-top';
        if (row === 7 && col === 14) cls += ' arrow-right';
        if (row === 14 && col === 7) cls += ' arrow-bottom';
        if (row === 7 && col === 0) cls += ' arrow-left';
        if (row === 6 && col === 1) cls = 'board-cell start-red' + (redSix ? ' dice-six-highlight' : '');
        if (row === 1 && col === 8) cls = 'board-cell start-green' + (greenSix ? ' dice-six-highlight' : '');
        if (row === 8 && col === 13) cls = 'board-cell start-yellow' + (yellowSix ? ' dice-six-highlight' : '');
        if (row === 13 && col === 6) cls = 'board-cell start-blue' + (blueSix ? ' dice-six-highlight' : '');
        if (LUDO_STAR_CELLS.has(`${row},${col}`)) cls += ' safe';
        if (activeCaptureNeonCellKey === `${row},${col}`) cls += ' capture-neon-burst';
        cells += `<div class="${cls}" data-cell="${row},${col}" style="grid-row:${row + 1};grid-column:${col + 1}"><div class="piece-stack" data-cell-stack="${row},${col}"></div></div>`;
    }

    const rIdx = colorPlayers.red ?? -1;
    const gIdx = colorPlayers.green ?? -1;
    const bIdx = colorPlayers.blue ?? -1;
    const yIdx = colorPlayers.yellow ?? -1;

    const makePinSpot = (colorClass, playerIndex, pieceIndex) => `<div class="token-spot ${colorClass}">${playerIndex >= 0 && activePlayersList[playerIndex].tokens[pieceIndex].progress < 0 ? createLudoPieceMarkup(playerIndex, pieceIndex) : ''}</div>`;

    stage.innerHTML = `
        <div class="lk-hud-row">${buildPlayerBadgeHTML(tlIdx, false)} ${buildPlayerBadgeHTML(trIdx, true)}</div>
        <div class="lk-board-box">
            <div class="ludo-board-grid cam-rot-${boardRotDeg}">
                ${cells}
                <div class="board-home-base base-red ${redSix ? 'base-six-neon' : ''}" style="position:relative;">${labelRedTL}<div class="home-inner-box">${makePinSpot('spot-red',rIdx,0)}${makePinSpot('spot-red',rIdx,1)}${makePinSpot('spot-red',rIdx,2)}${makePinSpot('spot-red',rIdx,3)}</div></div>
                <div class="board-home-base base-green ${greenSix ? 'base-six-neon' : ''}" style="position:relative;">${labelGreenTR}<div class="home-inner-box">${makePinSpot('spot-green',gIdx,0)}${makePinSpot('spot-green',gIdx,1)}${makePinSpot('spot-green',gIdx,2)}${makePinSpot('spot-green',gIdx,3)}</div></div>
                <div class="center-home"><div class="piece-stack finish-stack" data-cell-stack="center"></div></div>
                <div class="board-home-base base-blue ${blueSix ? 'base-six-neon' : ''}" style="position:relative;">${labelBlueBL}<div class="home-inner-box">${makePinSpot('spot-blue',bIdx,0)}${makePinSpot('spot-blue',bIdx,1)}${makePinSpot('spot-blue',bIdx,2)}${makePinSpot('spot-blue',bIdx,3)}</div></div>
                <div class="board-home-base base-yellow ${yellowSix ? 'base-six-neon' : ''}" style="position:relative;">${labelYellowBR}<div class="home-inner-box">${makePinSpot('spot-yellow',yIdx,0)}${makePinSpot('spot-yellow',yIdx,1)}${makePinSpot('spot-yellow',yIdx,2)}${makePinSpot('spot-yellow',yIdx,3)}</div></div>
            </div>
        </div>
        <div class="lk-hud-row">${buildPlayerBadgeHTML(blIdx, false)} ${buildPlayerBadgeHTML(brIdx, true)}</div>
    `;
};

// Also ensure in 5/6-Player Radial Ludo that Player 0's badge & slice are positioned at Bottom-Left (pos-4 = 240 deg)
const _origRender6PlayerRadialLudoStage = window.render6PlayerRadialLudoStage;
window.render6PlayerRadialLudoStage = function(stage) {
    _origRender6PlayerRadialLudoStage.apply(this, arguments);
    // Rotate SVG board so Player 0's home base sits at bottom-left (210 deg) and swap badge_0 to pos-4 (bottom-left)
    const badge0 = document.getElementById('badge_0');
    const badge4 = document.getElementById('badge_4');
    if (badge0 && badge0.classList.contains('pos-0')) {
        badge0.classList.remove('pos-0');
        badge0.classList.add('pos-4');
        if (badge4) {
            badge4.classList.remove('pos-4');
            badge4.classList.add('pos-0');
        }
    }
    const svgEl = stage.querySelector('.radial-svg-wrap svg');
    if (svgEl && activePlayersList[0]) {
        const myRadialIdx = activePlayersList[0].radialIndex || 0;
        const targetDeg = 210 - (myRadialIdx * 60);
        svgEl.style.transform = `rotate(${targetDeg}deg)`;
    }
};

// ---------------------------------------------------------------------
// PART 2: CALM AMBIENT LOBBY MUSIC (PLAYS IN MENUS, STOPS IN GAMEPLAY)
// ---------------------------------------------------------------------
let lobbyMusicTimer = null;
let lobbyNoteStep = 0;
let lobbyAudioUnlocked = false;

// Gentle pentatonic ambient chord notes (C major / A minor warm pad & chimes)
const CALM_LOBBY_MELODY = [
    { root: 261.63,fifth: 392.00, chime: 523.25 }, // C4 + G4 + C5
    { root: 220.00, fifth: 329.63, chime: 659.25 }, // A3 + E4 + E5
    { root: 174.61, fifth: 261.63, chime: 587.33 }, // F3 + C4 + D5
    { root: 196.00, fifth: 293.66, chime: 493.88 }, // G3 + D4 + B4
    { root: 261.63, fifth: 329.63, chime: 783.99 }, // C4 + E4 + G5
    { root: 220.00, fifth: 329.63, chime: 523.25 }  // A3 + E4 + C5
];

function isInLobbyOrSetupScreen() {
    const arena = document.getElementById('gameArenaScreen');
    return !arena || window.getComputedStyle(arena).display === 'none';
}

function playSoftAmbientPadTone(ctx, freq, delay, duration, vol) {
    try {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, ctx.currentTime + delay);

        const start = ctx.currentTime + delay;
        const end = start + duration;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(vol, start + duration * 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(end + 0.05);
    } catch (_) {}
}

function triggerLobbyMusicPhrase() {
    if (!gameSoundEnabled || !isInLobbyOrSetupScreen()) return;
    const ctx = getGameAudioContext();
    if (!ctx || ctx.state !== 'running') return;

    const chord = CALM_LOBBY_MELODY[lobbyNoteStep % CALM_LOBBY_MELODY.length];
    lobbyNoteStep++;

    // Soft warm bass pad + gentle fifth harmony + delicate bell chime
    playSoftAmbientPadTone(ctx, chord.root, 0, 2.8, 0.032);
    playSoftAmbientPadTone(ctx, chord.fifth, 0.35, 2.4, 0.022);
    playSoftAmbientPadTone(ctx, chord.chime, 0.9, 1.8, 0.018);
    playSoftAmbientPadTone(ctx, chord.chime * 0.75, 1.75, 1.5, 0.014);
}

function startCalmLobbyMusic() {
    if (lobbyMusicTimer) return;
    triggerLobbyMusicPhrase();
    lobbyMusicTimer = setInterval(() => {
        if (!isInLobbyOrSetupScreen() || !gameSoundEnabled) {
            stopCalmLobbyMusic();
            return;
        }
        triggerLobbyMusicPhrase();
    }, 3000);
}

function stopCalmLobbyMusic() {
    if (lobbyMusicTimer) {
        clearInterval(lobbyMusicTimer);
        lobbyMusicTimer = null;
    }
}

// Unlock & start calm lobby tune on first user tap/click anywhere on the home/setup screen
function handleFirstLobbyInteraction() {
    if (!lobbyAudioUnlocked) {
        lobbyAudioUnlocked = true;
    }
    if (isInLobbyOrSetupScreen() && gameSoundEnabled) {
        const ctx = getGameAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().then(() => startCalmLobbyMusic()).catch(() => {});
        } else {
            startCalmLobbyMusic();
        }
    }
}
['pointerdown', 'click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, handleFirstLobbyInteraction, { passive: true });
});

// Hook into game launch, quit & sound toggle so lobby music strictly stops during gameplay
const _origLaunchBeforeMusic = window.launchGameMatch;
window.launchGameMatch = function() {
    stopCalmLobbyMusic();
    _origLaunchBeforeMusic.apply(this, arguments);
    if (!isInLobbyOrSetupScreen()) {
        stopCalmLobbyMusic();
    }
};

const _origQuitBeforeMusic = window.quitGameMatch;
window.quitGameMatch = function() {
    _origQuitBeforeMusic.apply(this, arguments);
    setTimeout(() => {
        if (isInLobbyOrSetupScreen() && gameSoundEnabled) {
            startCalmLobbyMusic();
        }
    }, 300);
};

const _origToggleSoundMusic = window.toggleGameSound;
window.toggleGameSound = function() {
    _origToggleSoundMusic.apply(this, arguments);
    if (!gameSoundEnabled) {
        stopCalmLobbyMusic();
    } else if (isInLobbyOrSetupScreen()) {
        startCalmLobbyMusic();
    }
};

// ---------------------------------------------------------------------
// PART 3: 3D AI EMOJI REACTIONS & FUNNY SOUNDS BESIDE AI AVATAR
// ---------------------------------------------------------------------
let lastAiReactionTimestamp = 0;

function playAiReactionSound(mood) {
    if (!gameSoundEnabled) return;
    const ctx = getGameAudioContext();
    if (!ctx) return;

    if (mood === 'afraid') {
        // Nervous shivering / trembling sound ("Brrrrr!")
        [520, 480, 535, 470, 545, 460, 530, 450].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.045, 0.05, 0.045, 'triangle', freq * 0.92);
        });
    } else if (mood === 'haha') {
        // Bouncy cheerful AI laugh ("Ha-ha-ha-ha!")
        [587, 784, 659, 880, 740, 988].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.075, 0.085, 0.055, 'triangle', freq * 1.15);
        });
    } else if (mood === 'cry') {
        // Sad descending wail ("Wahhhh!")
        [680, 610, 540, 460, 380, 310].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.11, 0.15, 0.052, 'sine', freq * 0.84);
        });
    }
}

function showAiAvatarReaction(aiPlayerIndex, mood, emojiChar) {
    const player = activePlayersList[aiPlayerIndex];
    if (!player || !player.isAI) return;

    const badge = document.getElementById(`badge_${aiPlayerIndex}`);
    if (!badge) return;

    // Remove any existing emoji bubble on this AI badge
    const oldPop = badge.querySelector('.ai-avatar-emoji-pop');
    if (oldPop) oldPop.remove();

    const pop = document.createElement('div');
    pop.className = `ai-avatar-emoji-pop mood-${mood}`;
    pop.textContent = emojiChar;
    badge.appendChild(pop);

    playAiReactionSound(mood);

    setTimeout(() => {
        if (pop.parentNode) pop.remove();
    }, 2150);
}

// Check if any AI token is in immediate danger (1 to 6 steps ahead of a human/enemy token)
function checkAndTriggerAiAfraidReaction(moverPlayerIndex) {
    if (activeGameType !== 'ludo' || !activePlayersList.length) return;
    const now = Date.now();
    if (now - lastAiReactionTimestamp < 1600) return;

    const mover = activePlayersList[moverPlayerIndex];
    if (!mover) return;

    // Look for an AI player whose token is now 1–5 steps ahead of the mover's token on an unsafe cell
    for (let aiIdx = 0; aiIdx < activePlayersList.length; aiIdx++) {
        const aiPlayer = activePlayersList[aiIdx];
        if (!aiPlayer || !aiPlayer.isAI || aiIdx === moverPlayerIndex) continue;

        let isThreatened = false;
        for (const aiToken of aiPlayer.tokens) {
            if (aiToken.progress < 0 || aiToken.progress >= aiPlayer.trackLength) continue;
            const aiCell = ludoPieceCell(aiPlayer, aiToken);
            if (!aiCell) continue;
            const aiCellKey = `${aiCell[0]},${aiCell[1]}`;
            if (aiPlayer.safeCells.has(aiCellKey)) continue;

            for (const mToken of mover.tokens) {
                if (mToken.progress < 0 || mToken.progress >= mover.trackLength) continue;
                for (let step = 1; step <= 6; step++) {
                    if (mToken.progress + step >= mover.trackLength) continue;
                    const threatCell = ludoPieceCell(mover, { progress: mToken.progress + step });
                    if (threatCell && threatCell[0] === aiCell[0] && threatCell[1] === aiCell[1]) {
                        isThreatened = true;
                        break;
                    }
                }
                if (isThreatened) break;
            }
            if (isThreatened) break;
        }

        if (isThreatened) {
            lastAiReactionTimestamp = now;
            const afraidEmojis = ['😱', '😰', '🥶'];
            const pick = afraidEmojis[Math.floor(Math.random() * afraidEmojis.length)];
            setTimeout(() => showAiAvatarReaction(aiIdx, 'afraid', pick), 220);
            break;
        }
    }
}

// Hook into chooseLudoPiece to detect captures, AI kills, and close-call threats
const _origChooseLudoPieceForAiEmoji = window.chooseLudoPiece;
window.chooseLudoPiece = async function(playerIndex, pieceIndex) {
    const attacker = activePlayersList[playerIndex];
    const isAttackerAI = Boolean(attacker && attacker.isAI);

    // Snapshot token positions before the move to see whose token gets captured
    const beforeProgress = activePlayersList.map(p => p.tokens.map(t => t.progress));

    await _origChooseLudoPieceForAiEmoji.apply(this, arguments);

    if (activeGameType !== 'ludo' || !activePlayersList.length) return;

    // Check if any token was captured (progress reset to -1)
    let capturedVictimIndex = -1;
    for (let pIdx = 0; pIdx < activePlayersList.length; pIdx++) {
        if (pIdx === playerIndex) continue;
        for (let tIdx = 0; tIdx < 4; tIdx++) {
            if (beforeProgress[pIdx] && beforeProgress[pIdx][tIdx] >= 0 && activePlayersList[pIdx].tokens[tIdx].progress === -1) {
                capturedVictimIndex = pIdx;
                break;
            }
        }
        if (capturedVictimIndex !== -1) break;
    }

    if (capturedVictimIndex !== -1) {
        lastAiReactionTimestamp = Date.now();
        const victim = activePlayersList[capturedVictimIndex];

        // Case A: Human (or another player) cut an AI's token -> AI cries!
        if (victim && victim.isAI) {
            const cryEmojis = ['😭', '😢', '💔'];
            showAiAvatarReaction(capturedVictimIndex, 'cry', cryEmojis[Math.floor(Math.random() * cryEmojis.length)]);
        }

        // Case B: AI cut your token -> AI laughs happily!
        if (isAttackerAI) {
            const hahaEmojis = ['😂', '🤣', '😈'];
            setTimeout(() => {
                showAiAvatarReaction(playerIndex, 'haha', hahaEmojis[Math.floor(Math.random() * hahaEmojis.length)]);
            }, victim && victim.isAI ? 450 : 120);
        }
        return;
    }

    // Case C: No capture occurred, check if human moved right behind an AI token -> AI shivers in fear!
    if (!isAttackerAI) {
        checkAndTriggerAiAfraidReaction(playerIndex);
    }
};

/* =====================================================================
   1. REMOVE DUPLICATE FOOTER ("©Developed by Fahim Hridoy")
   2. +500 AI WIN COINS + 3D FLYING GOLD COINS TO TOP BAR WITH SOUND
   3. CUSTOM MATCH POINTS SYSTEM (6=5pt, 6+6+5=5pt, Kill=10pt, Home=10pt)
      & SHOW POINTS FOR BOTH WINNER AND ALL PLAYERS
   ===================================================================== */

// 1. Automatically remove any duplicate footers or duplicate dev signatures
function removeDuplicateDevFooters() {
    const footers = document.querySelectorAll('footer.home-footer, #devFooter');
    const footerElements = document.querySelectorAll('footer.home-footer');
    if (footerElements.length > 1) {
        for (let i = 1; i < footerElements.length; i++) {
            footerElements[i].remove();
        }
    }
    const devSpans = document.querySelectorAll('.dev-signature');
    if (devSpans.length > 1) {
        for (let i = 1; i < devSpans.length; i++) {
            const parentFooter = devSpans[i].closest('footer');
            if (parentFooter && parentFooter !== footerElements[0]) parentFooter.remove();
            else devSpans[i].remove();
        }
    }
}
removeDuplicateDevFooters();
window.addEventListener('DOMContentLoaded', removeDuplicateDevFooters);
setTimeout(removeDuplicateDevFooters, 200);

// 2. Realistic Metallic 3D Coin Clink Sound Generator
function playRealistic3DCoinSound(delaySec = 0, pitchShift = 1) {
    if (typeof gameSoundEnabled !== 'undefined' && !gameSoundEnabled) return;
    const ctx = typeof getGameAudioContext === 'function' ? getGameAudioContext() : null;
    if (!ctx) return;
    try {
        // High metallic bell ring + bright harmonic overtone
        playGameTone(ctx, 1760 * pitchShift, delaySec, 0.14, 0.045, 'sine', 2640 * pitchShift);
        playGameTone(ctx, 3520 * pitchShift, delaySec + 0.015, 0.18, 0.035, 'triangle', 4180 * pitchShift);
    } catch (_) {}
}

// 3. 3D Flying Golden Coins Animation from Center Winner Popup to Top Coin Bar
function trigger3DFlyingCoinsToTopBar(rewardAmount = 500) {
    // Ensure top bar coin pill exists even inside fullscreen arena
    if (typeof injectTopBarCoinIndicator === 'function') injectTopBarCoinIndicator();

    const coinPill = document.getElementById('topBarCoinIndicator');
    const targetRect = coinPill
        ? coinPill.getBoundingClientRect()
        : { left: window.innerWidth - 140, top: 22, width: 90, height: 32 };

    const targetX = (targetRect.left + targetRect.width / 2) || (window.innerWidth - 95);
    const targetY = (targetRect.top + targetRect.height / 2) || 28;

    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;

    const totalCoins = 18;
    for (let i = 0; i < totalCoins; i++) {
        const coin = document.createElement('div');
        coin.className = 'flying-3d-gold-coin';
        document.body.appendChild(coin);

        // Random burst spread around the center winner popup first
        const burstAngle = (Math.PI * 2 * i) / totalCoins + (Math.random() - 0.5) * 0.35;
        const burstRadius = 35 + Math.random() * 65;
        const midX = startX + Math.cos(burstAngle) * burstRadius;
        const midY = startY + Math.sin(burstAngle) * burstRadius;

        const delayMs = i * 55;
        const flightDurationMs = 780 + Math.random() * 180;

        coin.style.left = `${startX - 17}px`;
        coin.style.top = `${startY - 17}px`;
        coin.style.opacity = '0';

        // Play initial burst clink sound
        if (i % 2 === 0) {
            playRealistic3DCoinSound(delayMs / 1000, 0.95 + (i * 0.025));
        }

        const anim = coin.animate([
            {
                transform: 'translate3d(0px, 0px, 0px) scale(0.3) rotateY(0deg) rotateZ(0deg)',
                opacity: 0,
                offset: 0
            },
            {
                transform: `translate3d(${midX - startX}px, ${midY - startY}px, 60px) scale(1.25) rotateY(180deg) rotateZ(45deg)`,
                opacity: 1,
                offset: 0.28
            },
            {
                transform: `translate3d(${targetX - startX}px, ${targetY - startY}px, 0px) scale(0.55) rotateY(720deg) rotateZ(180deg)`,
                opacity: 0.95,
                offset: 1
            }
        ], {
            duration: flightDurationMs,
            delay: delayMs,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'forwards'
        });

        anim.onfinish = () => {
            coin.remove();
            // Play arrival clink sound & pulse top coin bar
            playRealistic3DCoinSound(0, 1.25 + (i * 0.02));
            if (coinPill) {
                coinPill.classList.remove('coin-pill-receiving');
                void coinPill.offsetWidth;
                coinPill.classList.add('coin-pill-receiving');
            }
        };
    }
}

// 4. Override AI Match Win Coin Reward to +500 Coins (instead of 1000) + Trigger 3D Flying Coins
let lastMatchCoinRewardedMe = false;

window.recordCompletedMatch = function(gameType, playersList, winnerIndex) {
    lastMatchCoinRewardedMe = false;
    if (typeof _origRecordCompletedMatch2 === 'function') {
        // Call base achievement recorder (from app.js) without triggering the old 1000 coin reward
        try {
            // Temporarily block modifyActivePlayerCoins(1000) inside old wrapper if chained
            window._blockOld1000Coins = true;
            _origRecordCompletedMatch2.apply(this, arguments);
            window._blockOld1000Coins = false;
        } catch (_) {
            window._blockOld1000Coins = false;
        }
    }

    const winner = Array.isArray(playersList) ? playersList[winnerIndex] : null;
    const isMeWinner = Boolean(winner && (winner.playerId === getCurrentProfileId() || (!winner.isAI && winnerIndex === 0)));

    if (isMeWinner && selectedSubMode === 'ai' && isUserLoggedIn()) {
        lastMatchCoinRewardedMe = true;
        modifyActivePlayerCoins(500);
        showGameToast('🎉 Victory against AI! +500 Golden Coins added! 🪙');
        setTimeout(() => {
            trigger3DFlyingCoinsToTopBar(500);
        }, 260);
    }
};

// Block any legacy 1000-coin call so only +500 is added on AI victory
const _baseModifyCoins500Fix = window.modifyActivePlayerCoins;
window.modifyActivePlayerCoins = function(amount) {
    if (window._blockOld1000Coins && amount === 1000) return getPlayerDummyCoins();
    return _baseModifyCoins500Fix.apply(this, arguments);
};

// 5. CUSTOM MATCH POINT SCORING ENGINE:
// - Roll a 6           => +5 points
// - Roll 6 + 6 + 5     => +5 bonus points (max triple-roll combo: two 6s followed by 5)
// - Capture a token    => +10 points per token captured
// - Token reaches Home => +10 points per token finished
function ensurePlayerMatchPointsInitialized() {
    if (!Array.isArray(activePlayersList)) return;
    activePlayersList.forEach(p => {
        if (typeof p.matchRollPoints !== 'number') p.matchRollPoints = 0;
        if (typeof p.sixStreakTracker !== 'number') p.sixStreakTracker = 0;
    });
}

function calculatePlayerTotalMatchPoints(player) {
    if (!player) return 0;
    const rollPts = Number(player.matchRollPoints) || 0;
    const capturePts = (Number(player.kills) || 0) * 10;
    const homeCount = Array.isArray(player.tokens)
        ? player.tokens.filter(t => Number(t.progress) === Number(player.finishProgress)).length
        : 0;
    const homePts = homeCount * 10;
    return rollPts + capturePts + homePts;
}

// Hook into processLudoRoll to award +5 pts for rolling 6, and +5 bonus pts for rolling 6 -> 6 -> 5
const _origProcessLudoRollPoints = window.processLudoRoll;
window.processLudoRoll = function(playerIndex, rolledNum) {
    ensurePlayerMatchPointsInitialized();
    const player = activePlayersList[playerIndex];
    const rollVal = Math.round(Number(rolledNum));

    if (player) {
        if (rollVal === 6) {
            player.matchRollPoints += 5;
            player.sixStreakTracker = (player.sixStreakTracker || 0) + 1;
        } else {
            if (player.sixStreakTracker === 2 && rollVal === 5) {
                // Rolled two 6s in a row and then a 5 (highest 3-roll combo)!
                player.matchRollPoints += 5;
                if (typeof showGameToast === 'function') {
                    showGameToast(`🔥 High Roll Combo (6 + 6 + 5)! ${player.name} earned +5 Bonus Points!`);
                }
            }
            player.sixStreakTracker = 0;
        }
    }

    return _origProcessLudoRollPoints.apply(this, arguments);
};

// Reset matchRollPoints when a new match starts
const _origLaunchForPointsReset = window.launchGameMatch;
window.launchGameMatch = function() {
    lastMatchCoinRewardedMe = false;
    _origLaunchForPointsReset.apply(this, arguments);
    if (Array.isArray(activePlayersList)) {
        activePlayersList.forEach(p => {
            p.matchRollPoints = 0;
            p.sixStreakTracker = 0;
        });
    }
};

// 6. OVERRIDE LEADERBOARD & WINNER POPUP TO SHOW POINTS FOR WINNER AND ALL PLAYERS
window.getLudoLeaderboardMarkup = function() {
    ensurePlayerMatchPointsInitialized();
    const ranked = activePlayersList.map((player, index) => ({
        player,
        index,
        score: calculatePlayerTotalMatchPoints(player)
    })).sort((a, b) => (a.index === ludoMatchWinner ? -1 : b.index === ludoMatchWinner ? 1 : b.score - a.score));

    return `
        <div class="ludo-leaderboard">
            <span class="ludo-leaderboard-title">${ludoMatchIsOffline ? 'MATCH STANDINGS & POINTS (6=5pt · Kill=10pt · Home=10pt)' : 'ONLINE LEADERBOARD'}</span>
            ${ranked.map((row, rank) => {
                const color = LUDO_RADIAL_COLOR_HEX[row.player.color] || '#fff';
                const name = escapeLudoResultText(row.player.name || `Player ${row.index + 1}`);
                const isWinnerRow = (ludoMatchWinner === row.index);
                // Always show exact points for BOTH the winner and every other player!
                const scoreLabel = isWinnerRow ? `🏆 WINNER · ${row.score} pts` : `${row.score} pts`;
                return `
                    <div class="ludo-leaderboard-row ${rank === 0 ? 'first' : ''}">
                        <span class="ludo-leaderboard-rank">${rank + 1}${rank === 0 ? 'st' : rank === 1 ? 'nd' : rank === 2 ? 'rd' : 'th'}</span>
                        <i class="ludo-leaderboard-color" style="--rank-color:${color}"></i>
                        <span class="ludo-leaderboard-name">${name}</span>
                        <span class="ludo-leaderboard-score" style="font-weight:900; color:${isWinnerRow ? '#fde047' : '#e2e8f0'};">${scoreLabel}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

const _origGetLudoResultMarkup = window.getLudoResultMarkup;
window.getLudoResultMarkup = function() {
    let html = _origGetLudoResultMarkup.apply(this, arguments);
    const winner = activePlayersList[ludoMatchWinner];
    const isMeWinner = Boolean(winner && (winner.playerId === getCurrentProfileId() || (!winner.isAI && ludoMatchWinner === 0)));

    // If human won against Smart AI, display the 3D +500 Coins reward pill right inside the Winner Popup!
    if (isMeWinner && selectedSubMode === 'ai' && isUserLoggedIn()) {
        const coinBadgeHtml = `<div class="winner-coin-reward-pill">🪙 +500 AI VICTORY COINS ADDED!</div>`;
        html = html.replace('<div class="ludo-result-time">', `${coinBadgeHtml}<div class="ludo-result-time">`);
    }
    return html;
};
/* =====================================================================
   MULTI-AI FUNNY EMOJI STICKER REACTIONS & AUDIO ENGINE
   ==================================================================== */

let lastMultiAiReactionTime = 0;

function playAiReactionSoundEffect(mood) {
    if (typeof gameSoundEnabled !== 'undefined' && !gameSoundEnabled) return;
    const ctx = typeof getGameAudioContext === 'function' ? getGameAudioContext() : null;
    if (!ctx) return;
    try {
        if (mood === 'afraid') {
            [520, 480, 535, 470, 545, 460, 530, 450].forEach((freq, idx) => {
                playGameTone(ctx, freq, idx * 0.045, 0.05, 0.045, 'triangle', freq * 0.92);
            });
        } else if (mood === 'haha') {
            [587, 784, 659, 880, 740, 988].forEach((freq, idx) => {
                playGameTone(ctx, freq, idx * 0.075, 0.085, 0.055, 'triangle', freq * 1.15);
            });
        } else if (mood === 'cry') {
            [680, 610, 540, 460, 380, 310].forEach((freq, idx) => {
                playGameTone(ctx, freq, idx * 0.11, 0.15, 0.052, 'sine', freq * 0.84);
            });
        } else if (mood === 'angry') {
            [220, 190, 240, 175, 210].forEach((freq, idx) => {
                playGameTone(ctx, freq, idx * 0.06, 0.12, 0.065, 'sawtooth', freq * 0.7);
            });
        }
    } catch (_) {}
}

function showAiBadgeEmojiReaction(aiPlayerIndex, mood, emojiChar) {
    const player = activePlayersList[aiPlayerIndex];
    if (!player || !player.isAI) return;

    const badge = document.getElementById(`badge_${aiPlayerIndex}`);
    if (!badge) return;

    const oldPop = badge.querySelector('.ai-avatar-emoji-pop');
    if (oldPop) oldPop.remove();

    const pop = document.createElement('div');
    pop.className = `ai-avatar-emoji-pop mood-${mood}`;
    pop.textContent = emojiChar;
    badge.appendChild(pop);

    playAiReactionSoundEffect(mood);

    setTimeout(() => {
        if (pop.parentNode) pop.remove();
    }, 2150);
}

// Evaluate AI fear state: when any AI's token is within 1-6 steps of ANY other player's token on track
function evaluateAllAiThreatReactions(activeMoverIndex) {
    if (!Array.isArray(activePlayersList) || activePlayersList.length < 2) return;
    const now = Date.now();
    if (now - lastMultiAiReactionTime < 1800) return;

    for (let aiIdx = 0; aiIdx < activePlayersList.length; aiIdx++) {
        const aiPlayer = activePlayersList[aiIdx];
        if (!aiPlayer || !aiPlayer.isAI) continue;

        let isThreatened = false;
        for (const aiToken of aiPlayer.tokens) {
            if (aiToken.progress < 0 || aiToken.progress >= aiPlayer.trackLength) continue;
            const aiCell = ludoPieceCell(aiPlayer, aiToken);
            if (!aiCell) continue;
            const aiCellKey = `${aiCell[0]},${aiCell[1]}`;
            if (aiPlayer.safeCells.has(aiCellKey)) continue;

            // Check if any opponent/player is 1 to 6 steps behind this AI token
            for (let oppIdx = 0; oppIdx < activePlayersList.length; oppIdx++) {
                if (oppIdx === aiIdx) continue;
                const opp = activePlayersList[oppIdx];
                for (const oppToken of opp.tokens) {
                    if (oppToken.progress < 0 || oppToken.progress >= opp.trackLength) continue;
                    for (let step = 1; step <= 6; step++) {
                        const checkProg = oppToken.progress + step;
                        if (checkProg >= opp.trackLength) continue;
                        const threatCell = ludoPieceCell(opp, { progress: checkProg });
                        if (threatCell && threatCell[0] === aiCell[0] && threatCell[1] === aiCell[1]) {
                            isThreatened = true;
                            break;
                        }
                    }
                    if (isThreatened) break;
                }
                if (isThreatened) break;
            }
            if (isThreatened) break;
        }

        if (isThreatened) {
            lastMultiAiReactionTime = now;
            const afraidList = ['😱', '😰', '🥶', '😬'];
            const chosenEmoji = afraidList[Math.floor(Math.random() * afraidList.length)];
            setTimeout(() => showAiBadgeEmojiReaction(aiIdx, 'afraid', chosenEmoji), 250);
            break;
        }
    }
}

// Hook into chooseLudoPiece to trigger accurate AI reactions on kills, captures, and close calls
const _origChooseLudoPieceForMultiAi = window.chooseLudoPiece;
window.chooseLudoPiece = async function(playerIndex, pieceIndex) {
    const actor = activePlayersList[playerIndex];
    const isActorAI = Boolean(actor && actor.isAI);

    const beforeProgress = activePlayersList.map(p => p.tokens.map(t => t.progress));

    await _origChooseLudoPieceForMultiAi.apply(this, arguments);

    if (activeGameType !== 'ludo' || !Array.isArray(activePlayersList)) return;

    // Detect who got captured
    let victimPlayerIndex = -1;
    for (let pIdx = 0; pIdx < activePlayersList.length; pIdx++) {
        if (pIdx === playerIndex) continue;
        for (let tIdx = 0; tIdx < 4; tIdx++) {
            if (beforeProgress[pIdx] && beforeProgress[pIdx][tIdx] >= 0 && activePlayersList[pIdx].tokens[tIdx].progress === -1) {
                victimPlayerIndex = pIdx;
                break;
            }
        }
        if (victimPlayerIndex !== -1) break;
    }

    if (victimPlayerIndex !== -1) {
        lastMultiAiReactionTime = Date.now();
        const victim = activePlayersList[victimPlayerIndex];

        // 1. If an AI's token was captured (by you or another AI), that AI cries!
        if (victim && victim.isAI) {
            const cryEmojis = ['😭', '😢', '💔', '🥺'];
            const pickCry = cryEmojis[Math.floor(Math.random() * cryEmojis.length)];
            setTimeout(() => showAiBadgeEmojiReaction(victimPlayerIndex, 'cry', pickCry), 180);
        }

        // 2. If an AI successfully captured someone's token, that AI laughs (Haha)!
        if (isActorAI) {
            const hahaEmojis = ['😂', '🤣', '😈', '😜'];
            const pickHaha = hahaEmojis[Math.floor(Math.random() * hahaEmojis.length)];
            setTimeout(() => showAiBadgeEmojiReaction(playerIndex, 'haha', pickHaha), victim && victim.isAI ? 500 : 120);
        }
        return;
    }

    // 3. If no capture happened, check if any AI is feeling threatened right now
    if (!isActorAI) {
        evaluateAllAiThreatReactions(playerIndex);
    }
};
/* =====================================================================
   RAGE ENGINE: TRIGGER ANGRY REACTIONS WHEN 6 IS ROLLED FREQUENTLY
   ==================================================================== */

function playAiAngryRageSoundEffect() {
    if (typeof gameSoundEnabled !== 'undefined' && !gameSoundEnabled) return;
    const ctx = typeof getGameAudioContext === 'function' ? getGameAudioContext() : null;
    if (!ctx) return;
    try {
        // Deep angry rumble & sharp high pitch frustration tone
        [150, 130, 180, 120, 160].forEach((freq, idx) => {
            playGameTone(ctx, freq, idx * 0.05, 0.14, 0.075, 'sawtooth', freq * 0.65);
        });
    } catch (_) {}
}

function showAiRageBadgeReaction(aiPlayerIndex, emojiChar = '😡') {
    const player = activePlayersList[aiPlayerIndex];
    if (!player || !player.isAI) return;

    const badge = document.getElementById(`badge_${aiPlayerIndex}`);
    if (!badge) return;

    const oldPop = badge.querySelector('.ai-avatar-emoji-pop');
    if (oldPop) oldPop.remove();

    const pop = document.createElement('div');
    pop.className = 'ai-avatar-emoji-pop mood-rage';
    pop.textContent = emojiChar;
    badge.appendChild(pop);

    if (typeof playAiReactionSoundEffect === 'function') {
        playAiReactionSoundEffect('angry');
    }

    setTimeout(() => {
        if (pop.parentNode) pop.remove();
    }, 2200);
}

// Hook into processLudoRoll to detect when an AI (or player) rolls 6 and make other AIs furious!
const _origProcessLudoRollForRage = window.processLudoRoll;
window.processLudoRoll = function(playerIndex, rolledNum) {
    const rollVal = Math.round(Number(rolledNum));
    const roller = activePlayersList[playerIndex];

    // If someone rolls a 6, trigger angry reactions from other AI players on the board
    if (rollVal === 6 && Array.isArray(activePlayersList)) {
        const now = Date.now();
        // Pick a random AI to show rage about the 6
        const aiCandidates = activePlayersList
            .map((p, idx) => ({ p, idx }))
            .filter(item => item.p.isAI && item.idx !== playerIndex);

        if (aiCandidates.length > 0) {
            const chosen = aiCandidates[Math.floor(Math.random() * aiCandidates.length)];
            const rageEmojis = ['😡', '🤬', '🔥', '👿'];
            const pickRage = rageEmojis[Math.floor(Math.random() * rageEmojis.length)];
            setTimeout(() => {
                showAiRageBadgeReaction(chosen.idx, pickRage);
            }, 300);
        }
    }

    return _origProcessLudoRollForRage.apply(this, arguments);
};

