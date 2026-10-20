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

// TURN TIMER VARIABLES (DISABLED FOR BOTH ONLINE & OFFLINE)
let turnTimerInterval = null;
let turnTimeRemaining = 15000;
const MAX_TURN_TIME = 15000;

// AUDIO SETUP
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
            playGameNoise(context, 0.12, 0.12, 'lowpass', 680);
            playGameTone(context, 185, 0, 0.24, 0.095, 'triangle', 72);
            playGameTone(context, 310, 0.035, 0.19, 0.055, 'sawtooth', 125);
            break;
        case 'tokenReturn':
            playGameTone(context, 290, 0, 0.12, 0.035, 'triangle', 175);
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
const LUDO_TOKEN_STEP_DURATION = 300;
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

// UNLIMITED TIME: TURN TIMER COMPLETELY DISABLED
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
    let count = 2;
    if (selectedSubMode === 'ai' || selectedSubMode.startsWith('pass')) { count = parseInt(matchConfigValue) || 2; } 
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
    ludoMatchWinner = null; liveGreatPlayerIndex = -1; liveGreatPlayerUntil = 0; clearTimeout(liveGreatPlayerTimer);
    ludoAnimationEpoch++; isTokenAnimating = false; ludoQuickMatch = selectedSubMode === 'pass_quick' || selectedSubMode === 'online_quick';
    ludoFirstKillOccurred = false; ludoFinishCelebration = null; ludoMatchIsOffline = !selectedSubMode.startsWith('online');
    ludoMatchStartedAt = Date.now(); ludoMatchFinishedAt = null; currentMatchResultRecorded = false;
    clearTimeout(ludoFinishTimer); clearTimeout(ludoAutoMoveTimer); clearTimeout(ludoAiTimer); clearTimeout(turnTimerInterval);

    activePlayersList.push({
        name: currentUser.name || 'You', playerId: getCurrentProfileId(), avatar: currentUser.avatar === 'female' ? '👧' : '👦',
        isAI: false, lastRoll: 6, pos: 1, color: ludoColors[0],
        startIndex: radialLudo ? 0 : LUDO_START_INDEX[ludoColors[0]], trackPath: radialLudo ? LUDO_RADIAL_TRACK_PATH : LUDO_TRACK_PATH,
        homeLane: radialLudo ? LUDO_RADIAL_HOME_LANES[0] : LUDO_HOME_LANES[ludoColors[0]],
        trackLength: radialLudo ? 60 : 52, finishProgress: radialLudo ? 65 : 57, safeCells: radialLudo ? LUDO_RADIAL_SAFE_CELLS : LUDO_SAFE_CELLS,
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
            trackLength: radialLudo ? 60 : 52, finishProgress: radialLudo ? 65 : 57, safeCells: radialLudo ? LUDO_RADIAL_SAFE_CELLS : LUDO_SAFE_CELLS,
            radialIndex: radialLudo ? i : -1, tokens: Array.from({ length: 4 }, () => ({ progress: -1 })),
            kills: 0, maxCaptureBurst: 0, wasBehind: false, turnResponseTimes: [], turnStartedAt: Date.now()
        });
    }

    // Assign Team Up partnership IDs if Pass & Play Team Up is active
    if (ludoMatchIsOffline && passPlaySubType === 'teamup' && activePlayersList.length === 4) {
        activePlayersList.forEach((p, idx) => {
            p.teamId = idx % 2; // Team 0 (Player 0 & 2) vs Team 1 (Player 1 & 3)
        });
        showGameToast('👥 Team Up Mode Active (1v1 / 2v2 Partnership)!');
    }

    currentTurnIndex = 0;
    const arena = document.getElementById('gameArenaScreen');
    arena.classList.remove('snake-theme');
    arena.classList.add('ludo-mode');
    
    renderFullStage(); arena.style.display = 'flex'; beginOnlineMatchSession(); updateAdminMatchBadgeControl(true);
    refreshAdminMatchBadges(); requestGameFullscreen(arena); autoSaveActiveMatch(); resetAndStartTurnTimer();
}

function quitGameMatch() {
    autoSaveActiveMatch(); clearTimeout(ludoAiTimer); clearTimeout(ludoFinishTimer); clearTimeout(ludoAutoMoveTimer); clearTimeout(turnTimerInterval);
    ludoAnimationEpoch++; isTokenAnimating = false; ludoPendingMove = null; document.getElementById('gameArenaScreen').style.display = 'none';
    endOnlineMatchSession(); updateAdminMatchBadgeControl(false); snakeVisualMotion = null;
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exitFullscreen && (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement)) {
        try { const result = exitFullscreen.call(document); if (result && typeof result.catch === 'function') result.catch(() => {}); } catch (_) {}
    }
}

function restoreLudoMatchFromSave(save) {
    try {
        const radial = save.players.length > 4; currentMatchPlayerCount = save.players.length; activeGameType = 'ludo';
        selectedSubMode = ['ai', 'pass_normal', 'pass_quick', 'tourney'].includes(save.subMode) ? save.subMode : 'ai';
        currentTurnIndex = save.turnIndex;
        activePlayersList = save.players.map((stored, index) => {
            const colorOrder = radial ? LUDO_RADIAL_COLOR_ORDER : (LUDO_COLORS_BY_COUNT[currentMatchPlayerCount] || LUDO_RADIAL_COLOR_ORDER);
            const color = colorOrder.includes(stored.color) ? stored.color : colorOrder[index];
            const radialIndex = radial ? index : -1;
            return {
                ...stored, color, isAI: Boolean(stored.isAI), tokens: stored.tokens.map(token => ({ progress: token.progress })),
                startIndex: radial ? index * 10 : LUDO_START_INDEX[color], trackPath: radial ? LUDO_RADIAL_TRACK_PATH : LUDO_TRACK_PATH,
                homeLane: radial ? LUDO_RADIAL_HOME_LANES[index] : LUDO_HOME_LANES[color], trackLength: radial ? 60 : 52, finishProgress: radial ? 65 : 57,
                safeCells: radial ? LUDO_RADIAL_SAFE_CELLS : LUDO_SAFE_CELLS, radialIndex, turnStartedAt: Date.now()
            };
        });
        consecutiveSixCount = save.consecutiveSixCount && typeof save.consecutiveSixCount === 'object' ? { ...save.consecutiveSixCount } : {};
        snakeConsecutiveOnes = save.snakeConsecutiveOnes && typeof save.snakeConsecutiveOnes === 'object' ? { ...save.snakeConsecutiveOnes } : {};
        ludoPendingMove = null; ludoMatchWinner = null; snakeMatchWinner = null; liveGreatPlayerIndex = -1; liveGreatPlayerUntil = 0; clearTimeout(liveGreatPlayerTimer);
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
    clearTimeout(liveGreatPlayerTimer);
    liveGreatPlayerTimer = setTimeout(() => {
        liveGreatPlayerIndex = -1;
        if (document.getElementById('gameArenaScreen')?.style.display !== 'none' && ['ludo', 'snake'].includes(activeGameType)) renderFullStage();
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
    return `<div class="ludo-winner-banner">${trophy}<strong>FIRST PLACE</strong><span class="winner-name">${winnerName}</span>${celebration}<div class="ludo-result-time"><span>MATCH TIME</span><strong>${formatLudoMatchDuration()}</strong></div><div class="ludo-great-player-card"><span class="ludo-mvp-color" style="--mvp-color:${color}"></span><div class="ludo-mvp-details"><small>GREAT PLAYER OF THE MATCH</small><strong>${greatName} · ${escapeLudoResultText(greatPlayer?.color || 'player')} token</strong><span>(${captures} capture${captures === 1 ? '' : 's'})</span></div></div>${getLudoLeaderboardMarkup()}</div>`;
}

function renderFullStage() {
    const stage = document.getElementById('arenaStage');
    if (activeGameType === 'snake') { renderSnakeStage(stage); } else if (currentMatchPlayerCount <= 4) { render4PlayerLudoStage(stage); } else { render6PlayerRadialLudoStage(stage); }
    if (activeGameType === 'ludo') renderLudoBoardPieces();
    if (activeGameType === 'ludo') scheduleLudoAIAction();
    if (activeGameType === 'snake') scheduleSnakeAIAction();
    if (ludoMatchWinner !== null && activeGameType === 'ludo') { stage.insertAdjacentHTML('beforeend', getLudoResultMarkup()); }
}

function ludoPieceCell(player, piece) {
    const progress = piece.progress;
    if (progress < 0 || progress >= player.finishProgress) return null;
    if (progress < player.trackLength) return player.trackPath[(player.startIndex + progress) % player.trackLength];
    return player.homeLane[progress - player.trackLength] || null;
}

function isLegalLudoPiece(playerIndex, pieceIndex) {
    return Boolean(ludoPendingMove && ludoPendingMove.playerIndex === playerIndex && ludoPendingMove.legalPieceIndexes.includes(pieceIndex));
}

function createLudoPieceMarkup(playerIndex, pieceIndex, boardPiece = false) {
    const player = activePlayersList[playerIndex]; const legal = isLegalLudoPiece(playerIndex, pieceIndex);
    const classes = `lk-pin-token pin-${player.color}${boardPiece ? ' board-piece-token' : ''}${legal ? ' legal-move' : ''}`;
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
    const colorPlayers = Object.fromEntries(activePlayersList.map((player, index) => [player.color, index]));
    const blIdx = colorPlayers.blue ?? -1; const tlIdx = colorPlayers.red ?? -1; const trIdx = colorPlayers.green ?? -1; const brIdx = colorPlayers.yellow ?? -1;

    const redSix = isSixActiveForPlayer(tlIdx);
    const greenSix = isSixActiveForPlayer(trIdx);
    const yellowSix = isSixActiveForPlayer(brIdx);
    const blueSix = isSixActiveForPlayer(blIdx);

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
        cells += `<div class="${cls}" data-cell="${row},${col}" style="grid-row:${row + 1};grid-column:${col + 1}"><div class="piece-stack" data-cell-stack="${row},${col}"></div></div>`;
    }

    const makePinSpot = (colorClass, playerIndex, pieceIndex) => `<div class="token-spot ${colorClass}">${playerIndex >= 0 && activePlayersList[playerIndex].tokens[pieceIndex].progress < 0 ? createLudoPieceMarkup(playerIndex, pieceIndex) : ''}</div>`;

    stage.innerHTML = `
        <div class="lk-hud-row">${buildPlayerBadgeHTML(tlIdx, false)} ${buildPlayerBadgeHTML(trIdx, true)}</div>
        <div class="lk-board-box">
            <div class="ludo-board-grid">
                ${cells}
                <div class="board-home-base base-red ${redSix ? 'base-six-neon' : ''}"><div class="home-inner-box">${makePinSpot('spot-red',tlIdx,0)}${makePinSpot('spot-red',tlIdx,1)}${makePinSpot('spot-red',tlIdx,2)}${makePinSpot('spot-red',tlIdx,3)}</div></div>
                <div class="board-home-base base-green ${greenSix ? 'base-six-neon' : ''}"><div class="home-inner-box">${makePinSpot('spot-green',trIdx,0)}${makePinSpot('spot-green',trIdx,1)}${makePinSpot('spot-green',trIdx,2)}${makePinSpot('spot-green',trIdx,3)}</div></div>
                <div class="center-home"><div class="piece-stack finish-stack" data-cell-stack="center"></div></div>
                <div class="board-home-base base-blue ${blueSix ? 'base-six-neon' : ''}"><div class="home-inner-box">${makePinSpot('spot-blue',blIdx,0)}${makePinSpot('spot-blue',blIdx,1)}${makePinSpot('spot-blue',blIdx,2)}${makePinSpot('spot-blue',blIdx,3)}</div></div>
                <div class="board-home-base base-yellow ${yellowSix ? 'base-six-neon' : ''}"><div class="home-inner-box">${makePinSpot('spot-yellow',brIdx,0)}${makePinSpot('spot-yellow',brIdx,1)}${makePinSpot('spot-yellow',brIdx,2)}${makePinSpot('spot-yellow',brIdx,3)}</div></div>
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
    const handler = legal ? `onclick="chooseLudoPiece(${playerIndex},${pieceIndex})"` : '';
    const finalScale = legal ? scale * 1.28 : scale;
    const filter = legal ? 'drop-shadow(0 0 4px #ffffff) drop-shadow(0 0 8px #facc15) drop-shadow(0 3px 4px rgba(15,23,42,0.75))' : 'drop-shadow(0 2px 2px rgba(15,23,42,0.55))';
    return `<g class="${celebrate ? 'finish-arrival-svg' : ''}" transform="translate(${x} ${y}) scale(${finalScale})" ${handler} role="${legal ? 'button' : 'img'}" aria-label="${player.name} token ${pieceIndex + 1}" style="cursor:${legal ? 'pointer' : 'default'};filter:${filter}"><path d="M0 13 C-2 8 -10 -1 -10 -8 A10 10 0 1 1 10 -8 C10 -1 2 8 0 13 Z" fill="${color}" stroke="#fff" stroke-width="${legal ? '2.8' : '2'}"/><circle cx="0" cy="-8" r="4" fill="#fff" fill-opacity=".95"/></g>`;
}

function renderRadialLudoPieces() {
    const layer = document.querySelector('#arenaStage #radialTokenLayer');
    if (!layer) return;
    const homeSlots = [[232,70],[268,70],[250,98],[250,128]];
    let markup = '';
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
    return player.tokens.reduce((legal, piece, pieceIndex) => {
        const entersHomeLane = piece.progress >= 0 && piece.progress < player.trackLength && piece.progress + roll >= player.trackLength;
        const quickHomeLocked = ludoQuickMatch && !ludoFirstKillOccurred && entersHomeLane;
        if (!quickHomeLocked && (piece.progress < 0 ? roll === 6 : piece.progress < player.finishProgress && piece.progress + roll <= player.finishProgress)) legal.push(pieceIndex);
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
    if (activePlayersList.length === 4 && selectedSubMode.includes('teamup')) return `pair:${playerIndex % 2}`;
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
            const progress = projectedMove.progress;
            if (progress < 0 || progress >= player.finishProgress) return null;
            if (progress < player.trackLength) return player.trackPath[(player.startIndex + progress) % player.trackLength];
            return player.homeLane[progress - player.trackLength] || null;
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
    if (ludoMatchWinner || activeGameType !== 'ludo' || isTokenAnimating) return;
    const player = activePlayersList[currentTurnIndex];
    if (!player || !player.isAI) return;
    ludoAiTimer = setTimeout(() => {
        if (ludoMatchWinner || isDiceRolling || isTokenAnimating) return;
        if (ludoPendingMove && ludoPendingMove.playerIndex === currentTurnIndex) {
            const choices = ludoPendingMove.legalPieceIndexes; chooseLudoAIMove(currentTurnIndex, choices, ludoPendingMove.roll);
        } else { rollPlayerDice(currentTurnIndex); }
    }, 750);
}

function scheduleSnakeAIAction() {
    clearTimeout(ludoAiTimer);
    if (snakeMatchWinner !== null || activeGameType !== 'snake' || isTokenAnimating || isDiceRolling) return;
    const player = activePlayersList[currentTurnIndex];
    if (!player || !player.isAI) return;
    ludoAiTimer = setTimeout(() => {
        if (snakeMatchWinner !== null || activeGameType !== 'snake' || isDiceRolling || isTokenAnimating) return;
        rollPlayerDice(currentTurnIndex);
    }, 750);
}

// 3. ADVANCED HARD AI LOGIC (HIGH STRATEGY & ACCURACY)
const LUDO_AI_HARD_TURN_CHANCE = 0.85;

function ludoAIMoveScore(playerIndex, pieceIndex, roll, difficulty) {
    const player = activePlayersList[playerIndex]; 
    const piece = player.tokens[pieceIndex];
    const oldProgress = piece.progress; 
    const nextProgress = oldProgress < 0 ? 0 : oldProgress + roll;
    const nextCell = ludoPieceCell(player, { progress: nextProgress }); 
    const isHard = difficulty === 'hard';
    let score = roll * (isHard ? 2.2 : 1.5);

    if (oldProgress < 0) score += isHard ? 35 : 20;
    if (nextProgress === player.finishProgress) score += isHard ? 140 : 90;
    if (nextProgress >= player.trackLength && nextProgress < player.finishProgress) { 
        score += (isHard ? 22 : 14) + (nextProgress - player.trackLength) * 4; 
    }

    if (!nextCell || nextProgress >= player.trackLength) return score;

    const cellKey = `${nextCell[0]},${nextCell[1]}`; 
    const safe = player.safeCells.has(cellKey);

    if (safe) score += isHard ? 28 : 15;

    const captures = getLudoCapturableTokens(playerIndex, nextCell, { pieceIndex, progress: nextProgress }).length;
    if (!safe) score += captures * (isHard ? 85 : 50);

    if (!safe) {
        let threatened = false;
        for (let opponentIndex = 0; opponentIndex < activePlayersList.length && !threatened; opponentIndex++) {
            if (opponentIndex === playerIndex) continue;
            if (selectedSubMode.includes('teamup') && getLudoTeamKey(opponentIndex) === getLudoTeamKey(playerIndex)) continue;

            const opponent = activePlayersList[opponentIndex];
            for (const enemy of opponent.tokens) {
                if (enemy.progress < 0 || enemy.progress >= opponent.trackLength) continue;
                for (let enemyRoll = 1; enemyRoll <= 6; enemyRoll++) {
                    const enemyNext = enemy.progress + enemyRoll; 
                    if (enemyNext >= opponent.trackLength) continue;
                    const enemyNextCell = ludoPieceCell(opponent, { progress: enemyNext });
                    if (enemyNextCell && enemyNextCell[0] === nextCell[0] && enemyNextCell[1] === nextCell[1]) { 
                        threatened = true; 
                        break; 
                    }
                }
                if (threatened) break;
            }
        }
        if (threatened) score -= isHard ? 65 : 30;
    }
    return score;
}

function chooseLudoAIMove(playerIndex, legalPieceIndexes, roll) {
    if (!legalPieceIndexes.length) return;
    const difficulty = Math.random() < LUDO_AI_HARD_TURN_CHANCE ? 'hard' : 'medium';
    const rankedMoves = legalPieceIndexes.map(pieceIndex => ({ 
        pieceIndex, 
        score: ludoAIMoveScore(playerIndex, pieceIndex, roll, difficulty) 
    })).sort((a, b) => b.score - a.score);

    let chosen = rankedMoves[0];
    const bestTies = rankedMoves.filter(move => move.score === rankedMoves[0].score);
    chosen = bestTies[Math.floor(Math.random() * bestTies.length)];
    
    chooseLudoPiece(playerIndex, chosen.pieceIndex);
}

const ludoAnimationDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function chooseLudoPiece(playerIndex, pieceIndex) {
    if (!ludoPendingMove || ludoPendingMove.playerIndex !== playerIndex || !ludoPendingMove.legalPieceIndexes.includes(pieceIndex) || isDiceRolling || isTokenAnimating || ludoMatchWinner) return;

    const player = activePlayersList[playerIndex]; const piece = player.tokens[pieceIndex]; const rolled = ludoPendingMove.roll;
    clearTimeout(ludoAutoMoveTimer); clearInterval(turnTimerInterval);
    const epoch = ++ludoAnimationEpoch; const originalProgress = piece.progress; const targetProgress = originalProgress < 0 ? 0 : originalProgress + rolled;
    const stepCount = originalProgress < 0 ? 1 : targetProgress - originalProgress; const stepDelay = LUDO_TOKEN_STEP_DURATION;
    isTokenAnimating = true; ludoPendingMove = null; ludoFinishCelebration = null; liveGreatPlayerIndex = -1; liveGreatPlayerUntil = 0; clearTimeout(liveGreatPlayerTimer);

    for (let step = 0; step < stepCount; step++) {
        if (epoch !== ludoAnimationEpoch) return;
        piece.progress = originalProgress < 0 ? 0 : originalProgress + step + 1;
        renderFullStage(); playGameSound(originalProgress < 0 ? 'tokenEnter' : 'tokenStep'); await ludoAnimationDelay(stepDelay);
    }
    if (epoch !== ludoAnimationEpoch) return;

    let capturedTokens = []; const landedCell = ludoPieceCell(player, piece);
    const canCapture = piece.progress < player.trackLength && landedCell && !player.safeCells.has(`${landedCell[0]},${landedCell[1]}`);
    if (canCapture) capturedTokens = getLudoCapturableTokens(playerIndex, landedCell);
    const capturedCount = capturedTokens.length; const protectedDoubleStack = canCapture && isLudoDoubleStackProtected(playerIndex, landedCell);

    if (capturedCount) {
        playGameSound('capture'); ludoFirstKillOccurred = true;
        for (const { piece: enemyPiece } of capturedTokens) {
            while (enemyPiece.progress > 0) {
                if (epoch !== ludoAnimationEpoch) return;
                enemyPiece.progress--; renderFullStage(); await ludoAnimationDelay(LUDO_TOKEN_STEP_DURATION);
            }
            if (epoch !== ludoAnimationEpoch) return;
            enemyPiece.progress = -1; renderFullStage(); playGameSound('tokenReturn'); await ludoAnimationDelay(LUDO_TOKEN_STEP_DURATION);
        }
        player.kills += capturedCount; player.maxCaptureBurst = Math.max(player.maxCaptureBurst || 0, capturedCount);
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
        ludoMatchWinner = playerIndex; ludoMatchFinishedAt = Date.now();
        if (!currentMatchResultRecorded) { currentMatchResultRecorded = true; recordCompletedMatch('ludo', activePlayersList, playerIndex); }
        showGameToast(`🏆 ${player.name} wins the match!`);
    } else if (capturedCount) {
        showGameToast(`💥 ${player.name} captured ${capturedCount} token${capturedCount === 1 ? '' : 's'}! Bonus turn.`);
    } else if (reachedHome) {
        showGameToast(`🏠 ${player.name}'s token reached home! Bonus turn.`);
    } else if (rolled === 6) {
        showGameToast(`🎉 ${player.name} rolled 6! Bonus turn.`);
    } else if (protectedDoubleStack) {
        showGameToast(`🛡️ That double stack needs two tokens to capture.`);
    }

    if (!hasWon && rolled !== 6 && !capturedCount && !reachedHome) { advanceLudoTurn(); } 
    else { if (!hasWon) resetAndStartTurnTimer(); }
    if (!hasWon && currentTurnIndex === playerIndex) player.turnStartedAt = Date.now();
    
    updateLiveGreatPlayer();
    if (hasWon) { clearTimeout(liveGreatPlayerTimer); liveGreatPlayerIndex = -1; }
    renderFullStage(); if (hasWon) removeActiveMatchSave(); else autoSaveActiveMatch();
}

function processLudoRoll(playerIndex, rolledNum) {
    const player = activePlayersList[playerIndex];
    if (rolledNum === 6 && (consecutiveSixCount[playerIndex] || 0) >= 2) {
        rolledNum = Math.floor(Math.random() * 5) + 1; player.lastRoll = rolledNum; renderFullStage();
    }
    consecutiveSixCount[playerIndex] = (rolledNum === 6) ? (consecutiveSixCount[playerIndex] || 0) + 1 : 0;

    const legalPieceIndexes = getLegalLudoPieces(playerIndex, rolledNum);
    if (!legalPieceIndexes.length) {
        const homeLaneLocked = ludoQuickMatch && !ludoFirstKillOccurred && player.tokens.some(piece => piece.progress >= 0 && piece.progress < player.trackLength && piece.progress + rolledNum >= player.trackLength);
        if (homeLaneLocked) {
            showGameToast(`🔒 ${player.name}: the home lane opens after the first capture.`);
        }
        if (rolledNum === 6) {
            showGameToast(`🎲 ${player.name} rolled 6, but has no legal move. Roll again.`);
            player.turnStartedAt = Date.now(); resetAndStartTurnTimer();
        } else {
            showGameToast(`🎲 ${player.name} has no legal move. Next player's turn.`);
            advanceLudoTurn();
        }
        renderFullStage(); autoSaveActiveMatch(); return;
    }

    ludoPendingMove = { playerIndex, roll: rolledNum, legalPieceIndexes };
    clearTimeout(ludoAutoMoveTimer);
    resetAndStartTurnTimer();

    renderFullStage();

    if (!player.isAI && legalPieceIndexes.length === 1) {
        showGameToast(rolledNum === 6 ? `🎉 ${player.name} rolled 6 — token moving.` : `🎲 ${player.name} rolled ${rolledNum} — token moving.`);
        const onlyLegalPiece = legalPieceIndexes[0];
        const autoMoveWait = rolledNum === 6 ? 450 : 80;
        ludoAutoMoveTimer = setTimeout(() => {
            if (currentTurnIndex === playerIndex && ludoPendingMove && ludoPendingMove.playerIndex === playerIndex) {
                chooseLudoPiece(playerIndex, onlyLegalPiece);
            }
        }, autoMoveWait);
    } else {
        showGameToast(rolledNum === 6 ? `🎉 ${player.name} rolled 6 — choose a highlighted token!` : `🎲 ${player.name} rolled ${rolledNum} — choose a highlighted token.`);
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
    if (activeGameType === 'ludo' && (consecutiveSixCount[idx] || 0) >= 2 && rolledNum === 6) { rolledNum = Math.floor(Math.random() * 5) + 1; }
    if (activeGameType === 'snake' && (snakeConsecutiveOnes[idx] || 0) >= 2 && rolledNum === 1) { rolledNum = Math.floor(Math.random() * 5) + 2; showGameToast(`🎲 No three 1s in a row — rolled ${rolledNum}.`); }

    const slotEl = document.getElementById(`dice_slot_${idx}`);
    if (slotEl) { const diceInner = slotEl.querySelector('.pip-dice'); if (diceInner) diceInner.classList.add('physics-tumbling'); }
    const radialCenter = document.getElementById('radialCenterDice');
    if (radialCenter) { const diceInner = radialCenter.querySelector('.pip-dice'); if (diceInner) diceInner.classList.add('physics-tumbling'); }

    setTimeout(async () => {
        if (gameEpoch !== ludoAnimationEpoch) return;
        activePlayersList[idx].lastRoll = rolledNum; playGameSound('diceStop'); isDiceRolling = false;

        if (activeGameType === 'snake') {
            const player = activePlayersList[idx]; snakeConsecutiveOnes[idx] = rolledNum === 1 ? (snakeConsecutiveOnes[idx] || 0) + 1 : 0; let landingPos = null;
            if (player.pos === 0) { if (rolledNum === 1) landingPos = 1; else showGameToast(`${player.name}: roll a 1 to enter the board.`); } else {
                const exactTarget = player.pos + rolledNum; if (exactTarget <= 100) landingPos = exactTarget; else showGameToast(`${player.name}: roll the exact number to reach 100.`);
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
                playGameSound('victory'); snakeMatchWinner = idx; clearTimeout(liveGreatPlayerTimer); liveGreatPlayerIndex = -1; liveGreatPlayerUntil = 0; clearInterval(turnTimerInterval);
                ludoMatchFinishedAt = Date.now(); if (!currentMatchResultRecorded) { currentMatchResultRecorded = true; recordCompletedMatch('snake', activePlayersList, idx); }
                showGameToast(`🏆 ${player.name} reached 100 and finished first!`);
            } else if (rolledNum === 1) {
                player.turnStartedAt = Date.now(); showGameToast(`🎉 ${player.name} rolled 1 — take another turn!`); resetAndStartTurnTimer();
            } else {
                currentTurnIndex = (currentTurnIndex + 1) % activePlayersList.length; activePlayersList[currentTurnIndex].turnStartedAt = Date.now(); resetAndStartTurnTimer();
            }
            if (snakeMatchWinner === null) updateLiveGreatPlayer();
            renderFullStage(); if (snakeMatchWinner !== null) removeActiveMatchSave(); else autoSaveActiveMatch(); return;
        }

        processLudoRoll(idx, rolledNum);
    }, 500);
}

/* =====================================================================
   PASS & PLAY TEAM UP (1v1, 2v2) & ONLINE 5-STICKER EXPANSION PACK
   ===================================================================== */

let bountyKingPlayerIndex = -1;
let matchBestClutchMoment = null;
let passPlaySubType = 'individual'; // 'individual' or 'teamup'

// Inject Team Up options into Pass & Play setup interface dynamically
function injectPassPlayTeamOptions() {
    const setupBox = document.getElementById('dynamicConfigBox');
    if (!setupBox || document.getElementById('passPlayModeSelectorBox')) return;

    const teamHtml = `
        <div id="passPlayModeSelectorBox" style="margin-top: 16px;">
            <div class="section-label">Select Match Sub-Type</div>
            <div class="players-flex-box">
                <div class="player-slot-btn active" id="ppSubModeIndiv" onclick="setPassPlaySubType('individual')">👤 Individual</div>
                <div class="player-slot-btn" id="ppSubModeTeam" onclick="setPassPlaySubType('teamup')">👥 Team Up (1v1 / 2v2)</div>
            </div>
        </div>
    `;
    setupBox.insertAdjacentHTML('beforeend', teamHtml);
}

function setPassPlaySubType(subType) {
    passPlaySubType = subType;
    document.getElementById('ppSubModeIndiv')?.classList.toggle('active', subType === 'individual');
    document.getElementById('ppSubModeTeam')?.classList.toggle('active', subType === 'teamup');

    const countBox = document.getElementById('playerOptions');
    if (subType === 'teamup' && countBox) {
        setPlayerCount(4); // Default to 4 players for 2v2 partnership
    }
}

const _origOpenFullScreenSetup = window.openFullScreenSetup;
window.openFullScreenSetup = function(gameType) {
    if (typeof _origOpenFullScreenSetup === 'function') _origOpenFullScreenSetup(gameType);
    if (gameType === 'ludo') {
        setTimeout(injectPassPlayTeamOptions, 50);
    }
};

// 1. DISTINCT SYNTH SOUND EFFECTS FOR EACH OF THE 5 ONLINE STICKERS
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

// 2. SHOW BIG STICKER BESIDE SENDER'S PROFILE BADGE WITH SOUND
function sendProfileSticker(stickerType, emojiChar) {
    if (ludoMatchIsOffline) return; // Strictly for Online Match

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

// 3. ONLINE-ONLY VISIBILITY FOR STICKERS & ADMIN TOGGLE BUTTON
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

    // 5 Stickers ONLY (Icon only, no text)
    dock.innerHTML = `
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('haha','😂')" aria-label="Haha">😂</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('cry','😭')" aria-label="Cry">😭</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('tease','😜')" aria-label="Tease">😜</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('sad','🥺')" aria-label="Sad">🥺</button>
        <button type="button" class="lk-taunt-btn" onclick="sendProfileSticker('angry','😡')" aria-label="Angry">😡</button>
    `;

    dock.style.display = isOnlineMatch ? 'flex' : 'none';
}

// 4. KING OF THE HILL / BOUNTY HUNT EVALUATOR
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

// 5. CLUTCH MOMENT RECORDER & 1-CLICK HD POSTER GENERATOR
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

function downloadClutchMomentCard() {
    const clutch = getBestMatchClutchMoment();
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 620);
    bgGrad.addColorStop(0, '#0f0c29');
    bgGrad.addColorStop(0.5, '#302b63');
    bgGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 620);

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 8;
    ctx.strokeRect(24, 24, 1032, 572);

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, 1004, 544);

    ctx.fillStyle = '#00f2fe';
    ctx.font = '900 28px "Segoe UI", sans-serif';
    ctx.fillText('🎬 LUDOPLAY · EPIC CLUTCH HIGHLIGHT', 70, 105);

    ctx.fillStyle = '#fde047';
    ctx.font = '900 54px "Segoe UI", sans-serif';
    ctx.fillText(`👑 Epic Clutch by ${clutch.playerName}`, 70, 195);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(70, 235, 940, 185);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(70, 235, 940, 185);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 38px "Segoe UI", sans-serif';
    ctx.fillText(`⚡ ${clutch.title}`, 100, 305);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 26px "Segoe UI", sans-serif';
    ctx.fillText(clutch.description.slice(0, 68), 100, 365);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 24px "Segoe UI", sans-serif';
    ctx.fillText(`⏱️ Match Time: ${formatLudoMatchDuration()}   |   🌐 ludoplay-three.vercel.app`, 70, 505);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '800 22px "Segoe UI", sans-serif';
    ctx.fillText('© Developed by Fahim Hridoy', 70, 548);

    try {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `LudoPlay-Clutch-${clutch.playerName.replace(/\s+/g, '-')}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showGameToast('📸 Epic Clutch Card downloaded! Share it with friends!');
    } catch (_) {
        showGameToast('⚠️ Could not save image on this browser.');
    }
}

// 6. HOOK INTO EXISTING GAME LIFECYCLE
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

    if (ludoMatchWinner !== null && activeGameType === 'ludo') {
        const banner = document.querySelector('#arenaStage .ludo-winner-banner');
        if (banner && !banner.querySelector('.ludo-clutch-card')) {
            const clutch = getBestMatchClutchMoment();
            const clutchHtml = `
                <div class="ludo-clutch-card">
                    <small>🎬 EPIC CLUTCH MOMENT OF THE MATCH</small>
                    <strong>⚡ ${escapeLudoResultText(clutch.title)}</strong>
                    <p>${escapeLudoResultText(clutch.description)}</p>
                    <button type="button" class="clutch-download-btn" onclick="downloadClutchMomentCard()">
                        📸 Download Epic Clutch Card (PNG)
                    </button>
                </div>
            `;
            banner.insertAdjacentHTML('beforeend', clutchHtml);
        }
    }
};

/* =====================================================================
   DUMMY COIN SYSTEM, AI REWARDS & ADMIN PHONE GIFTING EXPANSION
   ===================================================================== */

function getPlayerDummyCoins() {
    try {
        const stored = localStorage.getItem('ludoplay.dummy.coins');
        if (stored !== null) return parseInt(stored, 10) || 0;
    } catch (_) {}

    const phone = currentUser && currentUser.phone ? String(currentUser.phone).trim() : '';
    const initialCoins = 5000;
    try { localStorage.setItem('ludoplay.dummy.coins', String(initialCoins)); } catch (_) {}
    return initialCoins;
}

function updateAdminProfileCoinsOnLoad() {
    const phone = currentUser && currentUser.phone ? String(currentUser.phone).trim() : '';
    if (phone === '01712345678' || (currentUser && currentUser.name && currentUser.name.toLowerCase().includes('fahim'))) {
        try { localStorage.setItem('ludoplay.dummy.coins', '10000000'); } catch (_) {}
    }
}
updateAdminProfileCoinsOnLoad();

function modifyActivePlayerCoins(amount) {
    try {
        let current = getPlayerDummyCoins();
        current = Math.max(0, current + amount);
        localStorage.setItem('ludoplay.dummy.coins', String(current));
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
    const isMeWinner = winner && (winner.playerId === getCurrentProfileId() || !winner.isAI && winnerIndex === 0);
    if (isMeWinner && selectedSubMode === 'ai') {
        modifyActivePlayerCoins(1000);
        showGameToast('🎉 Victory against AI! You earned +1000 Dummy Coins! 🪙');
    }
};

function injectTopBarCoinIndicator() {
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;
    let coinPill = document.getElementById('topBarCoinIndicator');
    const coins = getPlayerDummyCoins();
    if (!coinPill) {
        coinPill = document.createElement('div');
        coinPill.id = 'topBarCoinIndicator';
        coinPill.className = 'top-coin-pill';
        topActions.insertBefore(coinPill, topActions.firstChild);
    }
    coinPill.innerHTML = `🪙 ${coins.toLocaleString()}`;
}
setInterval(injectTopBarCoinIndicator, 800);

// CLEAN ADMIN HUB WITH 3D NEON POPUPS (GIFT, PLAYERS, NOTICE)
function injectCleanAdminHubUI() {
    const adminModalBox = document.querySelector('#adminModal .modal-box');
    if (!adminModalBox) return;

    const regPlayersGroup = document.getElementById('registeredPlayersList')?.closest('.input-group');
    if (regPlayersGroup) regPlayersGroup.style.display = 'none';
    const noticeGroup = document.getElementById('adminNoticeInput')?.closest('.input-group');
    if (noticeGroup) noticeGroup.style.display = 'none';
    const oldGiftSec = document.getElementById('adminCoinGiftSection');
    if (oldGiftSec) oldGiftSec.style.display = 'none';

    if (document.getElementById('adminHubHubMenu')) return;

    adminModalBox.insertAdjacentHTML('beforeend', `
        <div id="adminHubHubMenu" class="admin-hub-grid" style="margin-top: 14px; margin-bottom: 12px;">
            <div class="admin-hub-card" onclick="openAdminGiftModal()">
                <span>🎁</span>
                <div>
                    <strong>Gift Coins Panel</strong>
                    <small>Send dummy coins to registered players by phone</small>
                </div>
            </div>
            <div class="admin-hub-card" onclick="openAdminPlayersModal()">
                <span>📋</span>
                <div>
                    <strong>Registered Players Database</strong>
                    <small>View and search all user accounts</small>
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
}

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
                <p class="profile-help-text">Enter recipient's registered phone number and amount of dummy coins.</p>
                <div class="input-group">
                    <label>Recipient Phone Number</label>
                    <input type="tel" id="neonGiftPhone" class="input-field" placeholder="017XXXXXXXX">
                </div>
                <div class="input-group">
                    <label>Coin Amount</label>
                    <input type="number" id="neonGiftAmount" class="input-field" placeholder="e.g. 50000" min="1">
                </div>
                <button type="button" class="primary-btn" onclick="executeNeonAdminGift()">🚀 Send Gift Now</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function executeNeonAdminGift() {
    const phone = document.getElementById('neonGiftPhone')?.value.trim();
    const amount = parseInt(document.getElementById('neonGiftAmount')?.value, 10);
    if (!phone || isNaN(amount) || amount <= 0) {
        showGameToast('⚠️ Please enter a valid phone and coin amount.');
        return;
    }
    try {
        const regRaw = localStorage.getItem('ludoplay.registered.players');
        const players = regRaw ? JSON.parse(regRaw) : [];
        const found = players.find(p => String(p.phone).trim() === phone);
        if (!found) {
            showGameToast('❌ Player with this phone number is not found.');
            return;
        }
        showGameToast(`🎁 Successfully gifted ${amount.toLocaleString()} coins to ${phone}!`);
        document.getElementById('neonGiftPhone').value = '';
        document.getElementById('neonGiftAmount').value = '';
        document.getElementById('neonAdminGiftModal').style.display = 'none';
    } catch (_) {
        showGameToast('⚠️ Error gifting coins.');
    }
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
    try {
        const regRaw = localStorage.getItem('ludoplay.registered.players');
        const players = regRaw ? JSON.parse(regRaw) : [];
        const filtered = players.filter(p => (p.name || '').toLowerCase().includes(query) || (p.phone || '').includes(query));
        if (!filtered.length) {
            listEl.innerHTML = `<div class="player-list-empty">No registered players found.</div>`;
            return;
        }
        listEl.innerHTML = filtered.map(p => `
            <div class="player-row">
                <span class="p-info">${escapeHTML(p.name || 'Player')} (${p.gender === 'female' ? '👧' : '👦'})</span>
                <span class="p-phone">${escapeHTML(p.phone)}</span>
            </div>
        `).join('');
    } catch (_) {
        listEl.innerHTML = `<div class="player-list-empty">Database empty.</div>`;
    }
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
                    <input type="text" id="neonNoticeInputBox" class="input-field" placeholder="Write announcement (leave empty to clear)">
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

function executeNeonNoticeUpdate() {
    const val = document.getElementById('neonNoticeInputBox')?.value.trim() || '';
    const mainInput = document.getElementById('adminNoticeInput');
    if (mainInput) mainInput.value = val;
    if (typeof saveAdminSettings === 'function') {
        saveAdminSettings();
    } else {
        const noticeTextEl = document.getElementById('noticeText');
        const noticeBarEl = document.getElementById('noticeBar');
        if (noticeTextEl) noticeTextEl.textContent = val || '📢 Welcome to LudoPlay! Official Tournament coming soon.';
        if (noticeBarEl) noticeBarEl.style.display = val ? 'flex' : 'none';
        try { localStorage.setItem('ludoplay.live.notice', val); } catch (_) {}
    }
    showGameToast('📢 Live notice updated successfully!');
    document.getElementById('neonAdminNoticeModal').style.display = 'none';
}

const _origOpenAdminModal2 = window.openAdminModal || function(){};
window.openAdminModal = function() {
    _origOpenAdminModal2.apply(this, arguments);
    setTimeout(injectCleanAdminHubUI, 50);
};