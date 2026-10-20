const LUDO_STORAGE_LIMIT_BYTES = 9 * 1024 * 1024;
function ludoStorageValueBytes(value) { return (String(value ?? '').length * 2); }
function getLudoStorageBytes() {
    let bytes = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && /^(ludo|ludoplay\.)/i.test(key)) {
                const value = localStorage.getItem(key) || '';
                bytes += ludoStorageValueBytes(key) + ludoStorageValueBytes(value);
            }
        }
    } catch (_) {}
    return bytes;
}
function saveLudoStorage(key, value) {
    const text = String(value);
    try {
        const previous = localStorage.getItem(key);
        const previousEntryBytes = previous === null ? 0 : ludoStorageValueBytes(key) + ludoStorageValueBytes(previous);
        const expectedBytes = getLudoStorageBytes() - previousEntryBytes + ludoStorageValueBytes(key) + ludoStorageValueBytes(text);
        if (expectedBytes > LUDO_STORAGE_LIMIT_BYTES) return false;
        localStorage.setItem(key, text);
        return true;
    } catch (_) {
        return false;
    }
}
function saveLudoJSON(key, value) {
    try { return saveLudoStorage(key, JSON.stringify(value)); }
    catch (_) { return false; }
}

const ADMIN_STORAGE_DB = 'ludoplay-admin-local-v1';
const ADMIN_PLAYER_LIMIT = 50000;
let adminStorageDbPromise = null;
function openAdminStorageDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
    if (!adminStorageDbPromise) adminStorageDbPromise = new Promise((resolve, reject) => {
        let request;
        try { request = indexedDB.open(ADMIN_STORAGE_DB, 1); }
        catch (error) { reject(error); return; }
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records', { keyPath: 'key' });
        };
        request.onsuccess = () => {
            request.result.onversionchange = () => { request.result.close(); adminStorageDbPromise = null; };
            resolve(request.result);
        };
        request.onerror = () => { adminStorageDbPromise = null; reject(request.error || new Error('Admin storage could not open')); };
        request.onblocked = () => { adminStorageDbPromise = null; reject(new Error('Admin storage is busy in another tab')); };
    });
    return adminStorageDbPromise;
}
function readAdminStorageRecord(key) {
    return openAdminStorageDb().then(db => new Promise((resolve, reject) => {
        const request = db.transaction('records', 'readonly').objectStore('records').get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Admin storage read failed'));
    }));
}
async function persistAdminPlayersDatabase() {
    const snapshot = playersDatabase.slice(0, ADMIN_PLAYER_LIMIT).map(player => ({ ...player }));
    const updatedAt = Date.now();
    const localSaved = saveLudoJSON('ludoAdminPlayersDB', snapshot);
    if (localSaved) saveLudoStorage('ludoplay.admin.playersUpdatedAt', String(updatedAt));
    try {
        const db = await openAdminStorageDb();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('records', 'readwrite');
            transaction.objectStore('records').put({ key: 'registeredPlayers', updatedAt, items: snapshot });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Admin storage write failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Admin storage write aborted'));
        });
        if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
        return true;
    } catch (_) {
        return localSaved;
    }
}
async function restoreAdminPlayersDatabase() {
    try {
        const record = await readAdminStorageRecord('registeredPlayers');
        const localUpdatedAt = Number(localStorage.getItem('ludoplay.admin.playersUpdatedAt')) || 0;
        if (record && Array.isArray(record.items) && Number(record.updatedAt) >= localUpdatedAt) {
            playersDatabase = record.items.filter(player => player && typeof player === 'object').slice(0, ADMIN_PLAYER_LIMIT);
            renderRegisteredPlayersForAdmin();
        } else {
            await persistAdminPlayersDatabase();
        }
    } catch (_) {}
}

// ============================================================================
// 3D ADD TO HOME SCREEN POPUP & PWA INSTALL HANDLER
// ============================================================================
let deferredInstallPrompt = null;
function updateInstallButton() {
    const button = document.getElementById('installAppBtn');
    if (!button) return;
    const isInstalled = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    button.style.display = isInstalled ? 'none' : 'flex';
}
window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    closeAddHomeModal();
    showGameToast('🎉 LudoPlay added to your Home Screen!');
});

function installLudoPlay() {
    if (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        showGameToast('✅ LudoPlay is already on your Home Screen!');
        return;
    }
    const hintBox = document.getElementById('addHomeFallbackSteps');
    if (hintBox) hintBox.style.display = 'none';
    const modal = document.getElementById('installHelpModal');
    if (modal) modal.style.display = 'flex';
}

function closeAddHomeModal() {
    const modal = document.getElementById('installHelpModal');
    if (modal) modal.style.display = 'none';
}

async function confirmAddToHomeScreen() {
    if (deferredInstallPrompt) {
        try {
            deferredInstallPrompt.prompt();
            const choiceResult = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            updateInstallButton();
            closeAddHomeModal();
            if (choiceResult?.outcome === 'accepted') {
                showGameToast('🎉 Installing LudoPlay to Home Screen...');
            }
            return;
        } catch (_) {}
    }
    const hintBox = document.getElementById('addHomeFallbackSteps');
    if (hintBox) hintBox.style.display = 'block';
    showGameToast('📲 Tap your browser menu (⋮ or Share) → Add to Home Screen!');
}

updateInstallButton();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}

let currentGlobalTheme = 'default';

function applyThemeVisuals(themeId) {
    document.documentElement.setAttribute('data-theme', themeId);
    const container = document.getElementById('particleContainer');
    if (container) {
        container.replaceChildren();
        const count = themeId === 'winter' ? 30 : (themeId === 'spring' ? 18 : ((themeId === 'default' || themeId === 'royal') ? 16 : 0));
        const petalColors = ['#ffc2dc', '#ff9fc8', '#fff0a6', '#f8d5ff', '#ffffff'];
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.classList.add('particle');
            p.style.left = (Math.random() * 100) + 'vw';

            if (themeId === 'winter') {
                p.classList.add('snowflake');
                const size = 3 + Math.random() * 6;
                p.style.width = `${size}px`;
                p.style.height = `${size}px`;
                p.style.setProperty('--fall-duration', `${10 + Math.random() * 10}s`);
                p.style.setProperty('--fall-delay', `${-Math.random() * 18}s`);
                p.style.setProperty('--fall-drift', `${Math.round(Math.random() * 90 - 45)}px`);
                p.style.setProperty('--flake-depth', (0.55 + Math.random() * 0.75).toFixed(2));
                p.style.setProperty('--flake-opacity', (0.22 + Math.random() * 0.38).toFixed(2));
                p.style.setProperty('--flake-blur', `${(Math.random() * 0.65).toFixed(2)}px`);
            } else if (themeId === 'spring') {
                p.classList.add('petal');
                const size = 12 + Math.random() * 9;
                p.style.width = `${size}px`;
                p.style.height = `${size}px`;
                p.style.setProperty('--petal-color', petalColors[Math.floor(Math.random() * petalColors.length)]);
                p.style.setProperty('--fall-duration', `${12 + Math.random() * 10}s`);
                p.style.setProperty('--fall-delay', `${-Math.random() * 20}s`);
                p.style.setProperty('--fall-drift', `${Math.round(Math.random() * 120 - 60)}px`);
                p.style.setProperty('--flower-depth', (0.65 + Math.random() * 0.65).toFixed(2));
                p.style.setProperty('--flower-opacity', (0.5 + Math.random() * 0.4).toFixed(2));
                p.style.setProperty('--flower-spin', `${Math.round(Math.random() * 240 - 120)}deg`);
            } else {
                p.classList.add('default-orb');
                const size = 14 + Math.random() * 26;
                p.style.width = `${size}px`;
                p.style.height = `${size}px`;
                p.style.top = (Math.random() * 90) + 'vh';
                p.style.animationDuration = `${7 + Math.random() * 8}s`;
                p.style.animationDelay = `${-Math.random() * 8}s`;
            }
            container.appendChild(p);
        }
    }
    ['default', 'winter', 'spring', 'summer'].forEach(t => {
        const btn = document.getElementById('th_' + t);
        if (btn) btn.classList.toggle('active', t === themeId);
    });
}

function setGlobalTheme(themeId) {
    if (!currentUser?.isAdmin) {
        showGameToast('Only the admin profile can change weather themes.');
        return false;
    }
    if (!['default', 'winter', 'spring', 'summer'].includes(themeId)) return false;
    currentGlobalTheme = themeId;
    saveLudoStorage('ludoGlobalTheme', themeId);
    applyThemeVisuals(themeId);
    return true;
}
applyThemeVisuals('default');

function showGameToast(msg) {
    const toast = document.getElementById('gameToast');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2200);
}

let selectedAvatar = 'male';
function readLocalJSON(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value === null ? fallback : value;
    } catch (_) {
        return fallback;
    }
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

let currentUser = readLocalJSON('ludoPlayUser', { phone: '', name: '', avatar: 'male', isAdmin: false, customAvatar: '', userTheme: 'default' });
function applyThemeForCurrentUser() {
    const userPrefTheme = currentUser?.userTheme === 'royal' ? 'royal' : 'default';
    if (currentUser?.isAdmin) {
        const storedAdminTheme = localStorage.getItem('ludoGlobalTheme') || readLocalJSON('ludoGlobalTheme', 'default');
        currentGlobalTheme = ['default', 'winter', 'spring', 'summer'].includes(storedAdminTheme) ? storedAdminTheme : userPrefTheme;
        applyThemeVisuals(currentGlobalTheme);
    } else {
        currentGlobalTheme = userPrefTheme;
        applyThemeVisuals(userPrefTheme);
    }
}
const ADMIN_AUTH_VERSION = 'admin-12.34-v1';
const ADMIN_PASSWORD = '12.34';
if (currentUser.isAdmin && currentUser.adminAuthVersion !== ADMIN_AUTH_VERSION) {
    currentUser.isAdmin = false;
    delete currentUser.adminAuthVersion;
    saveLudoJSON('ludoPlayUser', currentUser);
}
applyThemeForCurrentUser();
let playersDatabase = readLocalJSON('ludoAdminPlayersDB', []);
if (!Array.isArray(playersDatabase)) playersDatabase = [];
playersDatabase = playersDatabase.filter(player => player && typeof player === 'object');
if (playersDatabase.length > ADMIN_PLAYER_LIMIT) {
    playersDatabase = playersDatabase.slice(0, ADMIN_PLAYER_LIMIT);
    persistAdminPlayersDatabase();
}
restoreAdminPlayersDatabase();
const achievementCatalog = [
    { id: 'first_win', icon: '🥇', name: 'First Win', hint: 'Win your first match.' },
    { id: 'consistency', icon: '🔥', name: 'Consistency', hint: 'Win 3 matches in a row.' },
    { id: 'triple_capture', icon: '🎯', name: 'Triple Capture', hint: 'Capture 3 tokens in one move.' },
    { id: 'comeback_master', icon: '↩️', name: 'Comeback Master', hint: 'Win after falling behind.' },
    { id: 'capture_ace', icon: '⚔️', name: 'Capture Ace', hint: 'Capture 10 tokens in total.' },
    { id: 'champion', icon: '🏆', name: 'Champion', hint: 'Win 10 matches.' },
    { id: 'fast_player', icon: '⚡', name: 'Fast Player', hint: 'Keep your recent turns quick.' },
    { id: 'slow_player', icon: '🐢', name: 'Slow Player', hint: 'Your recent turns are taking longer.' },
    { id: 'social_star', icon: '💬', name: 'Social Star', hint: 'Send 30 chat messages.' },
    { id: 'veteran', icon: '🎖️', name: 'Veteran', hint: 'Play 20 matches.' },
    { id: 'spectator_host', icon: '👁️', name: 'Open House', hint: 'Welcome 5 spectators.' }
];
let achievementProfiles = readLocalJSON('ludoAchievementProfiles', {});
if (!achievementProfiles || typeof achievementProfiles !== 'object' || Array.isArray(achievementProfiles)) achievementProfiles = {};
const loadedAchievementIds = Object.keys(achievementProfiles);
if (loadedAchievementIds.length > 300) {
    loadedAchievementIds.sort((a, b) => (achievementProfiles[b]?.updatedAt || 0) - (achievementProfiles[a]?.updatedAt || 0));
    achievementProfiles = Object.fromEntries(loadedAchievementIds.slice(0, 300).map(id => [id, achievementProfiles[id]]));
    saveLudoJSON('ludoAchievementProfiles', achievementProfiles);
}
const onlineProfileCache = Object.create(null);

function getCurrentProfileId() {
    const phone = String(currentUser.phone || '').trim().toLowerCase();
    return phone ? `phone:${phone}` : `name:${String(currentUser.name || 'guest').trim().toLowerCase()}`;
}
function createEmptyAchievementProfile(userId, name) {
    return {
        userId, name: name || 'Player', games: 0, wins: 0, winStreak: 0,
        onlineGames: 0, offlineGames: 0, greatPlayerCount: 0,
        totalCaptures: 0, bestCaptureBurst: 0, recentTurnMs: [], chatCount: 0, spectatorsAccepted: 0, badges: []
    };
}
function getAchievementProfile(userId, name) {
    const id = String(userId || getCurrentProfileId());
    if (id === getCurrentProfileId()) return achievementProfiles[id] || onlineProfileCache[id] || createEmptyAchievementProfile(id, name);
    return onlineProfileCache[id] || achievementProfiles[id] || createEmptyAchievementProfile(id, name);
}
function persistAchievementProfiles() {
    const keys = Object.keys(achievementProfiles);
    if (keys.length > 300) {
        keys.sort((a, b) => (achievementProfiles[b].updatedAt || 0) - (achievementProfiles[a].updatedAt || 0));
        achievementProfiles = Object.fromEntries(keys.slice(0, 300).map(key => [key, achievementProfiles[key]]));
    }
    return saveLudoJSON('ludoAchievementProfiles', achievementProfiles);
}
function unlockProfileBadge(profile, badgeId) {
    const unlocked = new Set(profile.badges || []);
    unlocked.add(badgeId);
    profile.badges = [...unlocked];
}
function profileSnapshot(userId, name) {
    const profile = getAchievementProfile(userId, name);
    return {
        userId: profile.userId, name: profile.name, games: profile.games, wins: profile.wins,
        onlineGames: profile.onlineGames || 0, offlineGames: profile.offlineGames || 0,
        greatPlayerCount: profile.greatPlayerCount || 0,
        winStreak: profile.winStreak || 0, totalCaptures: profile.totalCaptures, badges: profile.badges || []
    };
}
function recordCompletedMatch(gameType, players, winnerIndex) {
    if (!Array.isArray(players) || winnerIndex < 0 || winnerIndex >= players.length) return;
    const isOnlineMatch = Boolean(String(selectedSubMode || '').startsWith('online_') || onlineMatchActive);
    const greatIdx = (gameType === 'ludo' && typeof getLudoGreatPlayerIndex === 'function')
        ? getLudoGreatPlayerIndex()
        : winnerIndex;

    players.forEach((player, index) => {
        if (!player || player.isAI) return;
        const userId = String(player.playerId || `local:${String(player.name || `Player ${index + 1}`).toLowerCase()}`);
        const profile = achievementProfiles[userId] || createEmptyAchievementProfile(userId, player.name);
        profile.name = player.name || profile.name;
        profile.games = (profile.games || 0) + 1;
        if (isOnlineMatch) profile.onlineGames = (profile.onlineGames || 0) + 1;
        else profile.offlineGames = (profile.offlineGames || 0) + 1;
        if (index === greatIdx) profile.greatPlayerCount = (profile.greatPlayerCount || 0) + 1;

        profile.gameCounts = profile.gameCounts || {};
        profile.gameCounts[gameType] = (profile.gameCounts[gameType] || 0) + 1;
        const won = index === winnerIndex;
        if (won) {
            profile.wins = (profile.wins || 0) + 1;
            profile.winStreak = (profile.winStreak || 0) + 1;
            unlockProfileBadge(profile, 'first_win');
        } else {
            profile.losses = (profile.losses || 0) + 1;
            profile.winStreak = 0;
        }
        profile.totalCaptures = (profile.totalCaptures || 0) + (player.kills || 0);
        profile.bestCaptureBurst = Math.max(profile.bestCaptureBurst || 0, player.maxCaptureBurst || 0);
        profile.recentTurnMs = [...(profile.recentTurnMs || []), ...(player.turnResponseTimes || [])].slice(-12);
        if (profile.winStreak >= 3) unlockProfileBadge(profile, 'consistency');
        if (profile.bestCaptureBurst >= 3) unlockProfileBadge(profile, 'triple_capture');
        if (won && player.wasBehind) unlockProfileBadge(profile, 'comeback_master');
        if (profile.totalCaptures >= 10) unlockProfileBadge(profile, 'capture_ace');
        if (profile.wins >= 10) unlockProfileBadge(profile, 'champion');
        if (profile.games >= 20) unlockProfileBadge(profile, 'veteran');
        if (profile.recentTurnMs.length >= 5) {
            const average = profile.recentTurnMs.reduce((sum, value) => sum + value, 0) / profile.recentTurnMs.length;
            if (average <= 5000) {
                unlockProfileBadge(profile, 'fast_player');
                profile.badges = profile.badges.filter(id => id !== 'slow_player');
            } else if (average >= 12000) {
                unlockProfileBadge(profile, 'slow_player');
                profile.badges = profile.badges.filter(id => id !== 'fast_player');
            }
        }
        profile.updatedAt = Date.now();
        achievementProfiles[userId] = profile;
        if (userId === getCurrentProfileId()) onlineProfileCache[userId] = profile;
    });
    persistAchievementProfiles();
    const current = profileSnapshot(getCurrentProfileId(), currentUser.name);
    if (onlineMatchActive) {
        sendOnlinePacket('profile_update', { profile: current });
        sendOnlinePacket('match_result', { gameType, winnerId: players[winnerIndex]?.playerId || null, winnerName: players[winnerIndex]?.name || 'Player' });
    }
}

function openMyProfile() {
    if (!currentUser.name) { openLoginModal(); return; }
    openProfileForUserId(getCurrentProfileId(), currentUser.name, true);
}
function editMyProfile() { closeProfileModal(); openLoginModal(); }
function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }
function openPlayerProfile(playerIndex) {
    const player = typeof playerIndex === 'object' ? playerIndex : (typeof activePlayersList !== 'undefined' ? activePlayersList[playerIndex] : null);
    if (!player) return;
    openProfileForUserId(player.playerId || `local:${String(player.name || 'player').toLowerCase()}`, player.name || 'Player', false);
}
function openProfileForUserId(userId, name, isMine) {
    const profile = getAchievementProfile(userId, name);
    const totalGames = profile.games || 0;
    const onlineCount = profile.onlineGames || 0;
    const offlineCount = profile.offlineGames !== undefined ? profile.offlineGames : Math.max(0, totalGames - onlineCount);
    const greatCount = profile.greatPlayerCount || 0;
    const badgeCount = (profile.badges || []).length;

    document.getElementById('profileModalTitle').textContent = `${badgeCount ? '🏅' : '👤'} ${profile.name || name || 'Player'}`;
    const dispName = document.getElementById('profileDisplayName');
    const dispPhone = document.getElementById('profileDisplayPhone');
    if (dispName) dispName.textContent = `${profile.name || name || 'Player'}${isMine && currentUser.isAdmin ? ' 👑 (Admin)' : ''}`;
    if (dispPhone) dispPhone.textContent = isMine ? (currentUser.phone || 'Logged in') : 'Player Stats & Achievements';

    const picDisplay = document.getElementById('profileCustomPicDisplay');
    const textAvatar = document.getElementById('profileAvatarText');
    const removePicBtn = document.getElementById('removePicButton');
    if (picDisplay && textAvatar) {
        if (isMine && currentUser.customAvatar) {
            picDisplay.style.backgroundImage = `url(${currentUser.customAvatar})`;
            picDisplay.style.display = 'block';
            textAvatar.style.display = 'none';
            if (removePicBtn) removePicBtn.style.display = 'block';
        } else {
            picDisplay.style.display = 'none';
            textAvatar.style.display = 'flex';
            textAvatar.textContent = isMine ? (currentUser.avatar === 'female' ? '👧' : '👦') : '👦';
            if (removePicBtn) removePicBtn.style.display = 'none';
        }
    }

    document.getElementById('profileSummary').innerHTML = `
        <span>🎮 ${totalGames} Total Matches</span>
        <span>📴 ${offlineCount} Offline Played</span>
        <span>🌐 ${onlineCount} Online Played</span>
        <span>🏆 ${profile.wins || 0} Wins</span>
        <span>👑 ${greatCount}x Great Player</span>
        <span>🎖️ ${badgeCount}/${achievementCatalog.length} Badges</span>
        <span>⚔️ ${profile.totalCaptures || 0} Captures</span>
        <span>🔥 ${profile.winStreak || 0} Win Streak</span>
    `;
    const unlocked = new Set(profile.badges || []);
    document.getElementById('achievementGrid').innerHTML = achievementCatalog.map(badge => `
        <div class="achievement-card ${unlocked.has(badge.id) ? 'unlocked' : 'locked'}" title="${escapeHTML(badge.hint)}">
            <span class="achievement-icon">${badge.icon}</span><strong>${escapeHTML(badge.name)}</strong><small>${escapeHTML(badge.hint)}</small>
        </div>`).join('');
    const usedMb = (getLudoStorageBytes() / (1024 * 1024)).toFixed(2);
    document.getElementById('profileStorageMeter').textContent = `Local game/profile data: ${usedMb} MB / 9 MB. Admin player history uses separate browser storage.`;
    const ownerActions = document.getElementById('profileOwnerActions');
    if (ownerActions) ownerActions.style.display = isMine ? 'grid' : 'none';
    document.getElementById('profileModal').style.display = 'flex';
}

function getOnlineTransportReady() {
    if (!onlineTransport) return false;
    if (typeof onlineTransport.isConnected === 'function') return Boolean(onlineTransport.isConnected());
    if (typeof onlineTransport.connected === 'boolean') return onlineTransport.connected;
    if (typeof onlineTransport.readyState === 'number') return onlineTransport.readyState === 1;
    return true;
}
let onlineTransport = null;
let onlineMatchActive = false;
let onlineMatchIsSpectator = false;
let onlineRoomId = '';
let onlineMessages = [];
let onlineSpectators = new Map();
let pendingSpectatorRequest = null;
let mySpectatorRequestId = '';
let onlineChatUnread = 0;

function updateOnlineConnectionStatus(text) {
    const status = document.getElementById('onlineConnectionStatus');
    const dot = document.getElementById('onlineConnectionDot');
    if (status) status.textContent = text || (getOnlineTransportReady() ? `Connected${onlineRoomId ? ` · ${onlineRoomId}` : ''}` : 'Connection service not connected');
    if (dot) dot.classList.toggle('connected', getOnlineTransportReady());
}
function beginOnlineMatchSession() {
    onlineMatchActive = Boolean(selectedSubMode && selectedSubMode.startsWith('online_'));
    onlineMatchIsSpectator = false;
    onlineRoomId = onlineTransport?.roomId || '';
    onlineMessages = [];
    onlineSpectators = new Map();
    pendingSpectatorRequest = null;
    onlineChatUnread = 0;
    const tools = document.getElementById('onlineMatchTools');
    if (tools) tools.style.display = onlineMatchActive ? 'flex' : 'none';
    const chat = document.getElementById('onlineChatMessages');
    if (chat) chat.replaceChildren();
    const strip = document.getElementById('onlineSpectatorStrip');
    if (strip) strip.style.display = 'none';
    const panel = document.getElementById('onlineChatPanel');
    if (panel) panel.style.display = 'none';
    updateOnlineConnectionStatus(onlineMatchActive && !getOnlineTransportReady()
        ? 'Admin Testing Mode · local preview' : undefined);
    if (onlineMatchActive) sendOnlinePacket('match_join', { mode: selectedSubMode });
}
function endOnlineMatchSession() {
    if (onlineMatchActive) sendOnlinePacket(onlineMatchIsSpectator ? 'spectator_leave' : 'match_leave', { roomId: onlineRoomId });
    onlineMatchActive = false;
    onlineMatchIsSpectator = false;
    pendingSpectatorRequest = null;
    const tools = document.getElementById('onlineMatchTools');
    if (tools) tools.style.display = 'none';
    const notice = document.getElementById('spectatorRequestNotice');
    if (notice) notice.style.display = 'none';
}
function toggleOnlineChat() {
    const panel = document.getElementById('onlineChatPanel');
    if (!panel) return;
    const opening = panel.style.display === 'none';
    panel.style.display = opening ? 'flex' : 'none';
    if (opening) {
        onlineChatUnread = 0;
        updateOnlineUnreadBadge();
        document.getElementById('onlineChatInput')?.focus();
    }
}
function updateOnlineUnreadBadge() {
    const badge = document.getElementById('onlineChatUnread');
    if (!badge) return;
    badge.textContent = onlineChatUnread > 0 ? String(onlineChatUnread) : '';
    badge.style.display = onlineChatUnread > 0 ? 'inline-flex' : 'none';
}
function appendOnlineChatMessage(message) {
    const panel = document.getElementById('onlineChatPanel');
    const list = document.getElementById('onlineChatMessages');
    if (!list) return;
    onlineMessages.push(message);
    if (onlineMessages.length > 60) onlineMessages.shift();
    const row = document.createElement('div');
    row.className = `online-chat-message${message.isMine ? ' mine' : ''}${message.kind === 'reaction' ? ' reaction' : ''}`;
    const header = document.createElement('div');
    header.className = 'online-chat-message-head';
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'online-chat-sender';
    name.textContent = message.name || 'Player';
    name.addEventListener('click', () => openProfileForUserId(message.userId, message.name, false));
    const time = document.createElement('time');
    time.textContent = new Date(message.sentAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    header.append(name, time);
    const body = document.createElement('div');
    body.className = 'online-chat-message-body';
    body.textContent = message.text || '';
    row.append(header, body);
    if (message.delivery === 'local') {
        const pending = document.createElement('small');
        pending.className = 'online-message-pending';
        pending.textContent = 'Local preview · not sent';
        row.appendChild(pending);
    }
    list.appendChild(row);
    while (list.children.length > 60) list.firstElementChild.remove();
    list.scrollTop = list.scrollHeight;
    if ((!panel || panel.style.display === 'none') && !message.isMine) {
        onlineChatUnread++;
        updateOnlineUnreadBadge();
    }
}
function incrementChatAchievement() {
    const userId = getCurrentProfileId();
    const profile = achievementProfiles[userId] || createEmptyAchievementProfile(userId, currentUser.name);
    profile.chatCount = (profile.chatCount || 0) + 1;
    if (profile.chatCount >= 30) unlockProfileBadge(profile, 'social_star');
    profile.updatedAt = Date.now();
    achievementProfiles[userId] = profile;
    persistAchievementProfiles();
}
function sendOnlinePacket(type, payload = {}) {
    const packet = {
        protocol: 'ludoplay-v1', type, roomId: onlineRoomId || null,
        sender: { userId: getCurrentProfileId(), name: currentUser.name || 'Guest', avatar: currentUser.avatar || 'male', profile: profileSnapshot(getCurrentProfileId(), currentUser.name) },
        payload, sentAt: Date.now()
    };
    if (!getOnlineTransportReady()) return false;
    try {
        if (typeof onlineTransport.emit === 'function') onlineTransport.emit('ludoplay:packet', packet);
        else if (typeof onlineTransport.send === 'function') onlineTransport.send(JSON.stringify(packet));
        else if (typeof onlineTransport.publish === 'function') onlineTransport.publish(packet);
        else return false;
        return true;
    } catch (_) {
        updateOnlineConnectionStatus('Connection interrupted');
        return false;
    }
}
function sendOnlineChat(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('onlineChatInput');
    const text = String(input?.value || '').trim().slice(0, 240);
    if (!text) return;
    const sentAt = Date.now();
    const delivered = sendOnlinePacket('chat_message', { text });
    appendOnlineChatMessage({ userId: getCurrentProfileId(), name: currentUser.name || 'You', text, sentAt, isMine: true, delivery: delivered ? 'sent' : 'local' });
    if (delivered) incrementChatAchievement();
    if (input) input.value = '';
}
function sendOnlineReaction(emoji, label) {
    const sentAt = Date.now();
    const delivered = sendOnlinePacket('quick_reaction', { emoji, label });
    if (typeof playGameSound === 'function') playGameSound('emoji', label || emoji);
    appendOnlineChatMessage({ userId: getCurrentProfileId(), name: currentUser.name || 'You', text: `${emoji} ${label}`, sentAt, kind: 'reaction', isMine: true, delivery: delivered ? 'sent' : 'local' });
}
function showSpectatorRequest(packet) {
    pendingSpectatorRequest = packet;
    const who = packet.sender || {};
    const requestName = packet.payload?.displayName || who.name || 'A player';
    document.getElementById('spectatorRequestName').textContent = `${requestName} wants to watch this match.`;
    document.getElementById('spectatorRequestNotice').style.display = 'flex';
}
function respondToSpectatorRequest(accepted) {
    if (!pendingSpectatorRequest) return;
    const request = pendingSpectatorRequest;
    sendOnlinePacket('spectator_response', {
        requestId: request.payload?.requestId || request.requestId,
        accepted: Boolean(accepted),
        targetUserId: request.sender?.userId || '',
        roomId: onlineRoomId
    });
    document.getElementById('spectatorRequestNotice').style.display = 'none';
    pendingSpectatorRequest = null;
    if (accepted) {
        const profile = achievementProfiles[getCurrentProfileId()] || createEmptyAchievementProfile(getCurrentProfileId(), currentUser.name);
        profile.spectatorsAccepted = (profile.spectatorsAccepted || 0) + 1;
        if (profile.spectatorsAccepted >= 5) unlockProfileBadge(profile, 'spectator_host');
        achievementProfiles[getCurrentProfileId()] = profile;
        persistAchievementProfiles();
        showGameToast('Request accepted. The room service will confirm the spectator join.');
    } else {
        showGameToast('Spectator request declined.');
    }
}
function renderOnlineSpectators() {
    const strip = document.getElementById('onlineSpectatorStrip');
    const names = document.getElementById('onlineSpectatorNames');
    if (!strip || !names) return;
    names.replaceChildren();
    [...onlineSpectators.values()].slice(0, 12).forEach(spectator => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'spectator-name-chip';
        chip.textContent = spectator.name || 'Spectator';
        chip.title = `View ${spectator.name || 'spectator'}'s profile`;
        chip.addEventListener('click', () => openProfileForUserId(spectator.userId, spectator.name, false));
        names.appendChild(chip);
    });
    strip.style.display = onlineSpectators.size ? 'flex' : 'none';
}
function requestSpectatorJoinFromForm() {
    const roomId = String(document.getElementById('spectatorRoomCode').value || '').trim().slice(0, 32);
    const displayName = String(document.getElementById('spectatorDisplayName').value || currentUser.name || '').trim().slice(0, 16);
    const status = document.getElementById('spectatorRequestStatus');
    if (!roomId || displayName.length < 2) {
        status.textContent = 'Enter a room code and a name with at least 2 characters.';
        return;
    }
    onlineRoomId = roomId;
    mySpectatorRequestId = `spectator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sent = sendOnlinePacket('spectator_request', { requestId: mySpectatorRequestId, displayName });
    status.textContent = sent
        ? 'Request sent. A player must accept before you can join.'
        : 'Request prepared, but no room connection is linked yet. It was not sent.';
}
function openSpectatorJoinModal() {
    document.getElementById('spectatorRoomCode').value = '';
    document.getElementById('spectatorDisplayName').value = currentUser.name || '';
    document.getElementById('spectatorRequestStatus').textContent = '';
    closeOnlinePopup();
    document.getElementById('spectatorJoinModal').style.display = 'flex';
}
function closeSpectatorJoinModal() { document.getElementById('spectatorJoinModal').style.display = 'none'; }
function enterSpectatorMode(roomId) {
    onlineMatchIsSpectator = true;
    onlineMatchActive = true;
    onlineRoomId = roomId || onlineRoomId;
    document.getElementById('spectatorJoinModal').style.display = 'none';
    document.getElementById('gameArenaScreen').style.display = 'flex';
    document.getElementById('onlineMatchTools').style.display = 'flex';
    updateAdminMatchBadgeControl(false);
    document.getElementById('arenaStage').innerHTML = `<div class="spectator-board-placeholder"><span>👁️</span><strong>Spectator mode</strong><p>Waiting for live board state from room ${escapeHTML(onlineRoomId || '…')}.</p><small>You can use match chat while watching.</small></div>`;
    updateOnlineConnectionStatus(getOnlineTransportReady() ? `Spectating · ${onlineRoomId}` : 'Spectator joined · waiting for connection service');
    sendOnlinePacket('spectator_ready', { roomId: onlineRoomId });
}
function receiveOnlinePacket(packet) {
    if (typeof packet === 'string') {
        try { packet = JSON.parse(packet); } catch (_) { return; }
    }
    if (!packet) return;
    if (packet.protocol === 'ludoplay-traffic-v1') { receiveSiteTrafficPacket(packet); return; }
    if (packet.protocol && packet.protocol !== 'ludoplay-v1') return;
    const type = packet.type || packet.event;
    const payload = packet.payload || packet.data || {};
    const sender = packet.sender || payload.sender || {};
    if (type === 'site_metrics') { updateSiteTrafficMetrics(payload); return; }
    if (packet.roomId && onlineRoomId && packet.roomId !== onlineRoomId) return;
    if (type === 'chat_message' || type === 'quick_reaction') {
        if (sender.userId && sender.userId === getCurrentProfileId()) return;
        if (sender.profile) onlineProfileCache[sender.userId] = sender.profile;
        if (type === 'quick_reaction' && typeof playGameSound === 'function') playGameSound('emoji', payload.label || payload.emoji);
        appendOnlineChatMessage({ userId: sender.userId, name: sender.name || 'Player', text: type === 'quick_reaction' ? `${payload.emoji || '🙂'} ${payload.label || ''}` : String(payload.text || '').slice(0, 240), sentAt: packet.sentAt, kind: type === 'quick_reaction' ? 'reaction' : 'text', isMine: sender.userId === getCurrentProfileId() });
    } else if (type === 'spectator_request' && onlineMatchActive && !onlineMatchIsSpectator) {
        showSpectatorRequest(packet);
    } else if (type === 'spectator_response' && payload.requestId === mySpectatorRequestId && payload.targetUserId === getCurrentProfileId()) {
        if (payload.accepted) enterSpectatorMode(packet.roomId || payload.roomId);
        else document.getElementById('spectatorRequestStatus').textContent = 'Your spectator request was declined.';
    } else if (type === 'spectator_joined') {
        const spectator = payload.spectator || sender;
        if (spectator.userId) onlineSpectators.set(spectator.userId, spectator);
        renderOnlineSpectators();
        if (payload.targetUserId === getCurrentProfileId() || payload.requestId === mySpectatorRequestId) enterSpectatorMode(packet.roomId || payload.roomId);
    } else if (type === 'spectator_left') {
        onlineSpectators.delete(payload.userId || sender.userId);
        renderOnlineSpectators();
    } else if (type === 'profile_update' && payload.profile?.userId) {
        onlineProfileCache[payload.profile.userId] = payload.profile;
    } else if (type === 'match_snapshot' && onlineMatchIsSpectator) {
        window.dispatchEvent(new CustomEvent('ludoplay:match-snapshot', { detail: payload.snapshot || payload }));
    } else if (type === 'room_joined') {
        onlineRoomId = payload.roomId || packet.roomId || onlineRoomId;
        updateOnlineConnectionStatus();
    }
}
function attachOnlineTransport(transport) {
    if (!transport) throw new Error('A live transport is required.');
    onlineTransport = transport;
    const listener = event => receiveOnlinePacket(event?.data ?? event);
    if (typeof transport.on === 'function') {
        transport.on('ludoplay:packet', listener);
        transport.on('connect', () => updateOnlineConnectionStatus());
        transport.on('disconnect', () => updateOnlineConnectionStatus('Connection lost'));
    } else if (typeof transport.addEventListener === 'function') {
        transport.addEventListener('message', listener);
        transport.addEventListener('open', () => updateOnlineConnectionStatus());
        transport.addEventListener('close', () => updateOnlineConnectionStatus('Connection lost'));
    } else if (typeof transport.subscribe === 'function') {
        transport.subscribe(listener);
    }
    if (typeof attachSiteAnalyticsTransport === 'function') attachSiteAnalyticsTransport(transport);
    updateOnlineConnectionStatus();
    return true;
}
function setOnlineRoom(roomId) {
    onlineRoomId = String(roomId || '').trim().slice(0, 32);
    try { if (onlineTransport) onlineTransport.roomId = onlineRoomId; } catch (_) {}
    updateOnlineConnectionStatus();
}
window.LudoPlayOnline = {
    attachTransport: attachOnlineTransport,
    receive: receiveOnlinePacket,
    setRoom: setOnlineRoom,
    requestSpectatorJoin: (roomId, name) => {
        onlineRoomId = String(roomId || '').trim().slice(0, 32);
        document.getElementById('spectatorRoomCode').value = onlineRoomId;
        document.getElementById('spectatorDisplayName').value = String(name || currentUser.name || 'Spectator').slice(0, 16);
        return requestSpectatorJoinFromForm();
    }
};

let siteTrafficMetrics = { liveUsers: null, totalVisits: null, updatedAt: null };
let siteAnalyticsTransport = null;
let siteAnalyticsHeartbeat = null;
const siteAnalyticsSessionId = window.crypto?.randomUUID?.() || `visit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
function renderSiteTrafficMetrics() {
    const live = document.getElementById('adminLiveUsers');
    const visits = document.getElementById('adminTotalVisits');
    const updated = document.getElementById('adminTrafficUpdated');
    const count = document.getElementById('onlineCount');
    if (live) live.textContent = Number.isFinite(siteTrafficMetrics.liveUsers) ? siteTrafficMetrics.liveUsers.toLocaleString() : '—';
    if (visits) visits.textContent = Number.isFinite(siteTrafficMetrics.totalVisits) ? siteTrafficMetrics.totalVisits.toLocaleString() : '—';
    if (count) count.textContent = Number.isFinite(siteTrafficMetrics.liveUsers) ? `${siteTrafficMetrics.liveUsers.toLocaleString()} Online` : 'Online —';
    if (updated) updated.textContent = siteTrafficMetrics.updatedAt
        ? `Updated ${new Date(siteTrafficMetrics.updatedAt).toLocaleString()}`
        : 'Analytics service is not connected yet.';
}
function updateSiteTrafficMetrics(metrics = {}) {
    const live = metrics.liveUsers === null || metrics.liveUsers === undefined || metrics.liveUsers === '' ? NaN : Number(metrics.liveUsers);
    const visits = metrics.totalVisits === null || metrics.totalVisits === undefined || metrics.totalVisits === '' ? NaN : Number(metrics.totalVisits);
    if (Number.isFinite(live) && live >= 0) siteTrafficMetrics.liveUsers = Math.floor(live);
    if (Number.isFinite(visits) && visits >= 0) siteTrafficMetrics.totalVisits = Math.floor(visits);
    siteTrafficMetrics.updatedAt = Number(metrics.updatedAt) || Date.now();
    renderSiteTrafficMetrics();
}
function receiveSiteTrafficPacket(packet) {
    if (typeof packet === 'string') {
        try { packet = JSON.parse(packet); } catch (_) { return; }
    }
    if (!packet || packet.type !== 'site_metrics') return;
    updateSiteTrafficMetrics(packet.payload || packet.data || {});
}
function sendSiteAnalyticsPacket(type) {
    if (!siteAnalyticsTransport) return false;
    const packet = { protocol: 'ludoplay-traffic-v1', type, payload: { sessionId: siteAnalyticsSessionId, path: location.pathname }, sentAt: Date.now() };
    try {
        if (typeof siteAnalyticsTransport.emit === 'function') siteAnalyticsTransport.emit('ludoplay:traffic', packet);
        else if (typeof siteAnalyticsTransport.send === 'function') siteAnalyticsTransport.send(JSON.stringify(packet));
        else if (typeof siteAnalyticsTransport.publish === 'function') siteAnalyticsTransport.publish(packet);
        else return false;
        return true;
    } catch (_) { return false; }
}
function attachSiteAnalyticsTransport(transport) {
    if (!transport) throw new Error('A site analytics transport is required.');
    siteAnalyticsTransport = transport;
    if (typeof transport.on === 'function') {
        transport.on('site_metrics', receiveSiteTrafficPacket);
        transport.on('ludoplay:site-metrics', receiveSiteTrafficPacket);
    } else if (typeof transport.addEventListener === 'function') {
        transport.addEventListener('message', event => receiveSiteTrafficPacket(event?.data ?? event));
    } else if (typeof transport.subscribe === 'function') {
        transport.subscribe(receiveSiteTrafficPacket);
    }
    sendSiteAnalyticsPacket('page_visit');
    clearInterval(siteAnalyticsHeartbeat);
    siteAnalyticsHeartbeat = setInterval(() => sendSiteAnalyticsPacket('presence_ping'), 30000);
    renderSiteTrafficMetrics();
    return true;
}
window.LudoPlayTraffic = { attachTransport: attachSiteAnalyticsTransport, update: updateSiteTrafficMetrics, receive: receiveSiteTrafficPacket };
window.addEventListener('pagehide', () => sendSiteAnalyticsPacket('presence_leave'));
renderSiteTrafficMetrics();

const DEFAULT_NOTICE_TEXT = 'Welcome to LudoPlay! Official Tournament coming soon.';
let adminNoticeText = localStorage.getItem('ludoAdminNotice');
if (adminNoticeText === null) adminNoticeText = DEFAULT_NOTICE_TEXT;
let adminMatchBadgeEnabled = localStorage.getItem('ludoAdminMatchBadgeEnabled') !== 'false';

function renderNoticeBar() {
    clearTimeout(window.noticeDismissTimer);
    const bar = document.getElementById('noticeBar');
    const text = document.getElementById('noticeText');
    if (!bar || !text) return;
    const visibleNotice = adminNoticeText === '' ? '' : (adminNoticeText || DEFAULT_NOTICE_TEXT);
    if (!visibleNotice) {
        bar.classList.remove('is-dismissing');
        bar.style.transform = '';
        bar.style.opacity = '';
        bar.style.display = 'none';
        return;
    }
    text.textContent = `📢 ${visibleNotice}`;
    const dismissedNotice = localStorage.getItem('ludoNoticeDismissed');
    bar.classList.remove('is-dismissing');
    bar.style.transform = '';
    bar.style.opacity = '';
    bar.style.display = dismissedNotice === visibleNotice ? 'none' : 'flex';
}

function dismissNotice() {
    clearTimeout(window.noticeDismissTimer);
    saveLudoStorage('ludoNoticeDismissed', adminNoticeText === '' ? '' : (adminNoticeText || DEFAULT_NOTICE_TEXT));
    const bar = document.getElementById('noticeBar');
    if (!bar) return;
    bar.classList.add('is-dismissing');
    window.noticeDismissTimer = window.setTimeout(() => {
        bar.style.display = 'none';
        bar.classList.remove('is-dismissing');
        bar.style.transform = '';
        bar.style.opacity = '';
        window.noticeDismissTimer = null;
    }, 210);
}

function enableNoticeSwipeDismiss() {
    const bar = document.getElementById('noticeBar');
    if (!bar) return;
    let startX = 0;
    let startY = 0;
    bar.addEventListener('pointerdown', event => {
        startX = event.clientX;
        startY = event.clientY;
        try { bar.setPointerCapture(event.pointerId); } catch (_) {}
    });
    bar.addEventListener('pointerup', event => {
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) dismissNotice();
    });
    bar.addEventListener('pointercancel', () => { startX = 0; startY = 0; });
}

function renderAdminMatchBadgeMarkup(playerIndex) {
    return currentUser.isAdmin && adminMatchBadgeEnabled && Number(playerIndex) === 0
        ? '<span class="match-admin-badge">ADMIN</span>' : '';
}

function refreshAdminMatchBadges() {
    document.querySelectorAll('[data-admin-name-index]').forEach(nameEl => {
        nameEl.querySelectorAll('.match-admin-badge').forEach(badge => badge.remove());
        if (!currentUser.isAdmin || !adminMatchBadgeEnabled || nameEl.dataset.adminNameIndex !== '0') return;
        const badge = document.createElement('span');
        badge.className = 'match-admin-badge';
        badge.textContent = 'ADMIN';
        nameEl.appendChild(badge);
    });
}

function updateAdminMatchBadgeControl(matchActive) {
    const button = document.getElementById('adminMatchBadgeToggle');
    if (!button) return;
    const visible = Boolean(matchActive && currentUser.isAdmin);
    button.style.display = visible ? 'flex' : 'none';
    button.textContent = `👑 ADMIN ${adminMatchBadgeEnabled ? 'ON' : 'OFF'}`;
    button.setAttribute('aria-pressed', String(adminMatchBadgeEnabled));
    button.title = `Turn admin badge ${adminMatchBadgeEnabled ? 'off' : 'on'}`;
}

function toggleAdminMatchBadge() {
    if (!currentUser.isAdmin) return;
    adminMatchBadgeEnabled = !adminMatchBadgeEnabled;
    saveLudoStorage('ludoAdminMatchBadgeEnabled', String(adminMatchBadgeEnabled));
    updateAdminMatchBadgeControl(true);
    refreshAdminMatchBadges();
}

renderNoticeBar();
enableNoticeSwipeDismiss();

function updateTopBarProfile() {
    applyThemeForCurrentUser();
    const adminButton = document.getElementById('adminPanelBtn');
    if (adminButton) adminButton.style.display = currentUser.isAdmin ? 'flex' : 'none';
    const profileBtn = document.getElementById('profileBtn');
    if (!profileBtn) return;
    if (!currentUser.name) {
        profileBtn.innerHTML = '👦 Login';
        return;
    }
    const icon = currentUser.avatar === 'female' ? '👧' : '👦';
    const badge = currentUser.isAdmin ? '⚡ ' : '';
    if (currentUser.customAvatar) {
        profileBtn.innerHTML = `<span class="top-avatar-thumb" style="background-image:url(${currentUser.customAvatar})"></span><span>${badge}${escapeHTML(currentUser.name)}</span>`;
    } else {
        profileBtn.textContent = `${icon} ${badge}${currentUser.name}`;
    }
}
updateTopBarProfile();

function showError(msg) {
    const errBox = document.getElementById('loginError');
    errBox.innerText = msg; errBox.style.display = 'block';
}

function openLoginModal() {
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('userPhone').value = currentUser.phone || '';
    document.getElementById('userName').value = currentUser.name || '';
    document.getElementById('adminPass').value = '';
    document.getElementById('adminPassGroup').style.display = 'none';
    selectAvatar(currentUser.avatar || 'male');
    document.getElementById('loginModal').style.display = 'flex';
}
function closeLoginModal() { document.getElementById('loginModal').style.display = 'none'; }

function toggleAdminPassField() {
    const passGroup = document.getElementById('adminPassGroup');
    passGroup.style.display = passGroup.style.display === 'none' ? 'block' : 'none';
}

function selectAvatar(gender) {
    selectedAvatar = gender;
    document.getElementById('avMale').classList.toggle('active', gender === 'male');
    document.getElementById('avFemale').classList.toggle('active', gender === 'female');
}

function isValidPhoneNumber(phone) {
    const clean = phone.replace(/[\s-]/g, '');
    const bdRegex = /^01[3-9]\d{8}$/;
    const bdIntlRegex = /^\+8801[3-9]\d{8}$/;
    const foreignIntlRegex = /^\+[1-9]\d{9,13}$/;
    if (clean.startsWith('01')) return bdRegex.test(clean);
    if (clean.startsWith('+880')) return bdIntlRegex.test(clean);
    if (clean.startsWith('+')) return foreignIntlRegex.test(clean);
    return false;
}

function saveProfileAndLogin() {
    const phone = document.getElementById('userPhone').value.trim();
    const rawName = document.getElementById('userName').value.trim();
    const pass = document.getElementById('adminPass').value.trim();
    const adminLoginSelected = document.getElementById('adminPassGroup').style.display === 'block';

    if (rawName.length < 2) { showError('⚠️ Please enter your short name (at least 2 letters).'); return; }
    const isAdminIdPair = phone.toLowerCase() === 'admin' && rawName.toLowerCase() === 'admin';
    if (adminLoginSelected && (!isAdminIdPair || pass !== ADMIN_PASSWORD)) {
        showError('⚠️ Admin login requires Phone: admin, Name: admin, and the correct password.'); return;
    }
    if (!adminLoginSelected && !isValidPhoneNumber(phone)) {
        showError('⚠️ Wrong Number! Enter exact 11 digits (01XXXXXXXXX) or valid country code (+...).'); return;
    }

    const isAdminLogin = adminLoginSelected;
    currentUser = {
        ...currentUser,
        phone: phone,
        name: rawName,
        avatar: selectedAvatar,
        isAdmin: isAdminLogin,
        ...(isAdminLogin ? { adminAuthVersion: ADMIN_AUTH_VERSION } : {})
    };
    saveLudoJSON('ludoPlayUser', currentUser);

    const now = new Date();
    const nowStr = now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const normalizedPhone = value => String(value || '').replace(/[\s-]/g, '').toLowerCase();
    const existingIdx = playersDatabase.findIndex(p => normalizedPhone(p.phone) === normalizedPhone(phone));
    const oldRecord = existingIdx >= 0 ? playersDatabase[existingIdx] : null;
    const record = {
        name: rawName,
        phone: phone,
        avatar: selectedAvatar === 'female' ? '👧' : '👦',
        registeredAt: oldRecord?.registeredAt || oldRecord?.time || nowStr,
        lastLoginAt: nowStr,
        time: nowStr
    };
    if (existingIdx >= 0) playersDatabase[existingIdx] = record;
    else playersDatabase.unshift(record);
    if (playersDatabase.length > ADMIN_PLAYER_LIMIT) playersDatabase.length = ADMIN_PLAYER_LIMIT;
    persistAdminPlayersDatabase();

    updateTopBarProfile();
    updateFriendBadgeCounts();
    closeLoginModal();
}

let activeGameType = 'ludo';
let selectedSubMode = 'ai';
let selectedOnlineSubMode = 'individual';
let selectedPassPlaySubMode = 'normal';
let matchConfigValue = 2;

const SAVED_MATCHES_KEY = 'ludoSavedMatches';
const MAX_SAVED_MATCHES = 8;
let activeMatchSaveId = '';
let storageSaveWarningShown = false;
function makeMatchSaveId() { return `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function getSavedMatches() {
    const saves = readLocalJSON(SAVED_MATCHES_KEY, []);
    return Array.isArray(saves) ? saves.filter(save => save && typeof save === 'object' && save.schemaVersion === 1) : [];
}
function startActiveMatchSaveSession() {
    activeMatchSaveId = makeMatchSaveId();
    storageSaveWarningShown = false;
    return activeMatchSaveId;
}
function serializeMatchPlayer(player) {
    return {
        name: String(player.name || 'Player').slice(0, 32), playerId: String(player.playerId || '').slice(0, 80),
        avatar: String(player.avatar || '👤').slice(0, 8), isAI: Boolean(player.isAI), color: String(player.color || 'blue'),
        pos: Number.isFinite(Number(player.pos)) ? Number(player.pos) : 0,
        startIndex: Number(player.startIndex) || 0, radialIndex: Number.isInteger(player.radialIndex) ? player.radialIndex : -1,
        tokens: Array.isArray(player.tokens) ? player.tokens.slice(0, 4).map(token => ({ progress: Number(token.progress) })) : [],
        kills: Math.max(0, Number(player.kills) || 0), maxCaptureBurst: Math.max(0, Number(player.maxCaptureBurst) || 0),
        wasBehind: Boolean(player.wasBehind), turnResponseTimes: Array.isArray(player.turnResponseTimes) ? player.turnResponseTimes.slice(-24).map(Number).filter(Number.isFinite) : [],
        teamId: player.teamId ?? null
    };
}
function buildActiveMatchSnapshot() {
    if (typeof activePlayersList === 'undefined' || !activeMatchSaveId || !Array.isArray(activePlayersList) || activePlayersList.length < 2 || !['ludo', 'snake'].includes(activeGameType)) return null;
    if (String(selectedSubMode || '').startsWith('online_') || onlineMatchActive || onlineMatchIsSpectator) return null;
    const arena = document.getElementById('gameArenaScreen');
    if (!arena || arena.style.display === 'none' || (typeof isDiceRolling !== 'undefined' && isDiceRolling) || (typeof isTokenAnimating !== 'undefined' && isTokenAnimating)) return null;
    const previous = getSavedMatches().find(save => save.id === activeMatchSaveId);
    return {
        schemaVersion: 1, id: activeMatchSaveId, gameType: activeGameType, subMode: selectedSubMode,
        players: activePlayersList.map(serializeMatchPlayer), turnIndex: currentTurnIndex,
        consecutiveSixCount: typeof consecutiveSixCount !== 'undefined' ? { ...consecutiveSixCount } : {},
        snakeConsecutiveOnes: typeof snakeConsecutiveOnes !== 'undefined' ? { ...snakeConsecutiveOnes } : {},
        quickMatch: typeof ludoQuickMatch !== 'undefined' && ludoQuickMatch,
        firstKillOccurred: typeof ludoFirstKillOccurred !== 'undefined' && ludoFirstKillOccurred,
        startedAt: Number(typeof ludoMatchStartedAt !== 'undefined' ? ludoMatchStartedAt : 0) || Date.now(), elapsedMs: Math.max(0, Date.now() - (Number(typeof ludoMatchStartedAt !== 'undefined' ? ludoMatchStartedAt : 0) || Date.now())),
        createdAt: previous?.createdAt || Date.now(), savedAt: Date.now()
    };
}
function autoSaveActiveMatch() {
    const snapshot = buildActiveMatchSnapshot();
    if (!snapshot) return false;
    let saves = getSavedMatches();
    saves = [snapshot, ...saves.filter(save => save.id !== snapshot.id)].slice(0, MAX_SAVED_MATCHES);
    while (saves.length && !saveLudoJSON(SAVED_MATCHES_KEY, saves)) saves.pop();
    if (!saves.length) {
        if (!storageSaveWarningShown) showGameToast('Autosave is full. Free some browser storage to keep this match.');
        storageSaveWarningShown = true;
        return false;
    }
    refreshSavedGameButton();
    return true;
}
function removeActiveMatchSave() {
    if (!activeMatchSaveId) return;
    const saves = getSavedMatches().filter(save => save.id !== activeMatchSaveId);
    saveLudoJSON(SAVED_MATCHES_KEY, saves);
    activeMatchSaveId = '';
    refreshSavedGameButton();
}
function refreshSavedGameButton() {
    const button = document.getElementById('loadGameHomeBtn');
    if (!button) return;
    const count = getSavedMatches().length;
    button.style.display = count ? 'inline-flex' : 'none';
    button.textContent = `📂 Load Saved Game${count > 1 ? ` (${count})` : ''}`;
}
function openSavedGamesModal() {
    const list = document.getElementById('savedGamesList');
    if (!list) return;
    const saves = getSavedMatches().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    if (!saves.length) list.innerHTML = '<div class="player-list-empty">No saved matches yet.</div>';
    else list.innerHTML = saves.map(save => {
        const date = new Date(save.savedAt || save.createdAt || Date.now()).toLocaleString();
        const player = save.players?.[save.turnIndex];
        const title = save.gameType === 'snake' ? '🐍 Snakes & Ladders' : '🎲 Ludo';
        const detail = `${save.players?.length || 0} players · ${date}${player?.name ? ` · ${escapeHTML(player.name)} to move` : ''}`;
        return `<div class="saved-game-row"><div class="saved-game-info"><strong>${title}</strong><small>${detail}</small></div><button class="saved-game-load" type="button" onclick="loadSavedGame('${escapeHTML(save.id)}')">Load</button><button class="saved-game-delete" type="button" onclick="deleteSavedGame('${escapeHTML(save.id)}')" aria-label="Delete saved match">×</button></div>`;
    }).join('');
    document.getElementById('savedGamesModal').style.display = 'flex';
}
function closeSavedGamesModal() { document.getElementById('savedGamesModal').style.display = 'none'; }
function deleteSavedGame(id) {
    saveLudoJSON(SAVED_MATCHES_KEY, getSavedMatches().filter(save => save.id !== id));
    refreshSavedGameButton();
    openSavedGamesModal();
}
function isValidSavedMatch(save) {
    if (!save || save.schemaVersion !== 1 || !Array.isArray(save.players)) return false;
    const maxPlayers = save.gameType === 'ludo' ? 6 : 4;
    if (!['ludo', 'snake'].includes(save.gameType) || save.players.length < 2 || save.players.length > maxPlayers) return false;
    if (!Number.isInteger(save.turnIndex) || save.turnIndex < 0 || save.turnIndex >= save.players.length) return false;
    const maxLudoProgress = save.players.length > 4 ? 65 : 57;
    return save.players.every(player => player && typeof player.name === 'string' &&
        (save.gameType === 'snake' ? Number.isInteger(player.pos) && player.pos >= 0 && player.pos <= 100 :
            Array.isArray(player.tokens) && player.tokens.length === 4 && player.tokens.every(token => Number.isInteger(token.progress) && token.progress >= -1 && token.progress <= maxLudoProgress)));
}
function loadSavedGame(id) {
    const save = getSavedMatches().find(item => item.id === id);
    if (!isValidSavedMatch(save)) { showGameToast('This saved match cannot be loaded.'); return false; }
    closeSavedGamesModal();
    const restored = save.gameType === 'snake' ? restoreSnakeMatchFromSave(save) : restoreLudoMatchFromSave(save);
    if (!restored) showGameToast('Could not restore this match. The save has been kept.');
    return Boolean(restored);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSaveActiveMatch(); });
window.addEventListener('pagehide', () => autoSaveActiveMatch());
refreshSavedGameButton();

function openFullScreenSetup(mode) {
    if (!currentUser.name) {
        openLoginModal();
        showError('👋 Please login with your Phone & Name first!'); return;
    }

    activeGameType = mode;
    document.getElementById('fsSetupTitle').innerText = mode === 'ludo' ? '🎲 Ludo Game Setup' : '🐍 Snake & Ladders Setup';
    
    const grid = document.getElementById('fsModesGrid');
    const userAvatarEmoji = currentUser.avatar === 'female' ? '👧' : '👦';

    if (mode === 'ludo') {
        grid.innerHTML = `
            <div class="mode-option-card active" id="m_ai" onclick="setSubMode('ai')">
                <span class="m-icon">🤖</span>
                <div class="m-name">Smart AI</div>
                <div class="m-desc">Up to 6 Players Radial/Classic</div>
            </div>
            <div class="mode-option-card" id="m_pass" onclick="setSubMode('pass_' + (selectedPassPlaySubMode || 'normal'))">
                <span class="m-icon">${userAvatarEmoji}👥</span>
                <div class="m-name">Pass & Play</div>
                <div class="m-desc">2–6 Players Local Match</div>
            </div>
            <div class="mode-option-card" id="m_online" onclick="handleOnlineModeClick()">
                <span class="m-icon">🌐</span>
                <div class="m-name">Online Match</div>
                <div class="m-desc">${currentUser.isAdmin ? 'Admin Testing Enabled' : 'Multiplayer & Challenge'}</div>
            </div>
            <div class="mode-option-card" id="m_tourney" onclick="handleTourneyModeClick()">
                <span class="m-icon">🏆</span>
                <div class="m-name">Tournament Mode</div>
                <div class="m-desc">${currentUser.isAdmin ? 'Admin Bracket Controls' : 'Bracket championship'}</div>
            </div>
        `;
    } else {
        grid.innerHTML = `
            <div class="mode-option-card active" id="m_ai" onclick="setSubMode('ai')">
                <span class="m-icon">🤖</span>
                <div class="m-name">Smart AI</div>
                <div class="m-desc">Max 4 Players Bot</div>
            </div>
            <div class="mode-option-card" id="m_pass" onclick="setSubMode('pass_normal')">
                <span class="m-icon">${userAvatarEmoji}👥</span>
                <div class="m-name">Pass & Play</div>
                <div class="m-desc">Max 4 Players Local</div>
            </div>
        `;
    }
    setSubMode('ai');
    document.getElementById('fullScreenSetupView').style.display = 'flex';
}

// RESTRICT ONLINE & TOURNEY TO ADMIN ONLY; SHOW 3D PUBLISHING SOON FOR USERS
function handleOnlineModeClick() {
    if (currentUser && currentUser.isAdmin) {
        openOnlinePopup();
        return;
    }
    openPublishingSoonModal();
}

function handleTourneyModeClick() {
    if (currentUser && currentUser.isAdmin) {
        setSubMode('tourney');
        return;
    }
    openPublishingSoonModal();
}

function openPublishingSoonModal() {
    const modal = document.getElementById('publishingSoonModal');
    if (modal) modal.style.display = 'flex';
}
function closePublishingSoonModal() {
    const modal = document.getElementById('publishingSoonModal');
    if (modal) modal.style.display = 'none';
}

function selectPassPlayRule(rule) {
    selectedPassPlaySubMode = rule === 'quick' ? 'quick' : 'normal';
    document.getElementById('passRuleNormalBtn')?.classList.toggle('active', selectedPassPlaySubMode === 'normal');
    document.getElementById('passRuleQuickBtn')?.classList.toggle('active', selectedPassPlaySubMode === 'quick');
    if (selectedSubMode.startsWith('pass')) {
        selectedSubMode = 'pass_' + selectedPassPlaySubMode;
    }
}

function openOnlinePopup() {
    if (!currentUser?.isAdmin) { openPublishingSoonModal(); return; }
    document.getElementById('onlineMatchPopup').style.display = 'flex';
}
function closeOnlinePopup() { document.getElementById('onlineMatchPopup').style.display = 'none'; }
function selectOnlineSubMode(sub) {
    selectedOnlineSubMode = sub;
    ['individual', 'teamup', 'challenge', 'quick'].forEach(s => {
        const idMap = { individual: 'on_ind', teamup: 'on_team', challenge: 'on_chall', quick: 'on_quick' };
        document.getElementById(idMap[s])?.classList.toggle('active', s === sub);
    });
}
function confirmOnlineMode() {
    closeOnlinePopup();
    setSubMode('online_' + selectedOnlineSubMode);
}

function openPassPlayPopup() {
    setSubMode('pass_' + (selectedPassPlaySubMode || 'normal'));
}
function closePassPlayPopup() {
    const popup = document.getElementById('passPlayPopup');
    if (popup) popup.style.display = 'none';
}
function selectPassPlaySubMode(sub) {
    selectPassPlayRule(sub);
}
function confirmPassPlayMode() {
    closePassPlayPopup();
    setSubMode('pass_' + selectedPassPlaySubMode);
}

function closeFullScreenSetup() { document.getElementById('fullScreenSetupView').style.display = 'none'; }

function setSubMode(sub) {
    if ((sub.startsWith('online') || sub === 'tourney') && !currentUser?.isAdmin) {
        openPublishingSoonModal();
        return;
    }
    selectedSubMode = sub;
    const aiCard = document.getElementById('m_ai');
    const passCard = document.getElementById('m_pass');
    const onlineCard = document.getElementById('m_online');
    const tourneyCard = document.getElementById('m_tourney');
    if (aiCard) aiCard.classList.toggle('active', sub === 'ai');
    if (passCard) passCard.classList.toggle('active', sub.startsWith('pass'));
    if (onlineCard) onlineCard.classList.toggle('active', sub.startsWith('online'));
    if (tourneyCard) tourneyCard.classList.toggle('active', sub === 'tourney');

    const configBox = document.getElementById('dynamicConfigBox');
    const playerBox = document.getElementById('playerOptions');
    const tourneyBox = document.getElementById('tournamentOptions');
    const sectionTitle = document.getElementById('configSectionTitle');
    const adminCustomInput = document.getElementById('adminCustomSlots');
    const passRuleRow = document.getElementById('passRuleRow');

    configBox.style.display = 'block';
    if (passRuleRow) {
        passRuleRow.style.display = (sub.startsWith('pass') && activeGameType === 'ludo') ? 'block' : 'none';
        document.getElementById('passRuleNormalBtn')?.classList.toggle('active', selectedPassPlaySubMode !== 'quick');
        document.getElementById('passRuleQuickBtn')?.classList.toggle('active', selectedPassPlaySubMode === 'quick');
    }

    if (sub === 'ai' || sub.startsWith('pass')) {
        playerBox.style.display = 'flex';
        tourneyBox.style.display = 'none';
        
        const opt5 = document.getElementById('opt5');
        const opt6 = document.getElementById('opt6');
        if (activeGameType === 'snake') {
            opt5.style.display = 'none';
            opt6.style.display = 'none';
            sectionTitle.innerText = sub === 'ai' ? 'Select AI Players (Max 4)' : 'Select Pass & Play Players (Max 4)';
            if (parseInt(matchConfigValue) > 4) setPlayerCount(4);
        } else {
            opt5.style.display = 'block';
            opt6.style.display = 'block';
            sectionTitle.innerText = sub === 'ai' ? 'Select AI Players (Max 6)' : 'Select Pass & Play Players (Max 6)';
        }
        setPlayerCount(parseInt(matchConfigValue) || 2);
    } else if (sub === 'tourney') {
        playerBox.style.display = 'none';
        tourneyBox.style.display = 'block';
        sectionTitle.innerText = currentUser.isAdmin ? '🏆 Host Tournament Controls (Admin)' : '🏆 Tournament Slots';
        adminCustomInput.style.display = currentUser.isAdmin ? 'block' : 'none';
        setTourneySlots(4);
    } else {
        configBox.style.display = 'none';
    }
}

function setPlayerCount(count) {
    if (activeGameType === 'snake' && count > 4) count = 4;
    matchConfigValue = count;
    const btns = document.querySelectorAll('#playerOptions .player-slot-btn');
    btns.forEach(b => {
        if (b.style.display !== 'none') {
            b.classList.toggle('active', b.innerText.includes(count + ' Players'));
        }
    });
}

function setTourneySlots(slots) {
    matchConfigValue = slots;
    document.getElementById('adminCustomSlots').value = '';
    const btns = document.querySelectorAll('#tourneySlotsGrid .player-slot-btn');
    btns.forEach(b => b.classList.toggle('active', b.innerText.includes(slots + ' Slots')));
}

function handleAdminCustomSlots(val) {
    if (!currentUser.isAdmin) return;
    const num = parseInt(val);
    if (!isNaN(num) && num >= 4 && num <= 16) {
        matchConfigValue = num;
        const btns = document.querySelectorAll('#tourneySlotsGrid .player-slot-btn');
        btns.forEach(b => b.classList.remove('active'));
    }
}

function renderRegisteredPlayersForAdmin() {
    const listEl = document.getElementById('registeredPlayersList');
    const countEl = document.getElementById('totalRegCount');
    if (!listEl || !countEl) return;
    countEl.innerText = playersDatabase.length;
    const query = (document.getElementById('adminPlayerSearch')?.value || '').trim().toLocaleLowerCase();
    const matches = query ? playersDatabase.filter(player => `${player.name || ''} ${player.phone || ''}`.toLocaleLowerCase().includes(query)) : playersDatabase;
    const visiblePlayers = matches.slice(0, 300);
    const hint = document.getElementById('adminPlayersHint');
    if (hint) hint.textContent = `Showing ${visiblePlayers.length} of ${matches.length} matching · ${playersDatabase.length} saved`;

    if (matches.length === 0) {
        listEl.innerHTML = `<div class="player-list-empty">${query ? 'No matching players found.' : 'No players registered yet.'}</div>`;
        return;
    }

    listEl.innerHTML = visiblePlayers.map(p => `
        <div class="player-row">
            <div>
                <span class="p-info">${escapeHTML(p.avatar || '👤')} ${escapeHTML(p.name || 'Player')}</span>
                <div class="p-time">Registered ${escapeHTML(p.registeredAt || p.time || 'Date unavailable')}</div>
                <div class="p-time">Last login ${escapeHTML(p.lastLoginAt || p.time || 'Date unavailable')}</div>
            </div>
            <div class="p-phone">${escapeHTML(p.phone || '')}</div>
        </div>
    `).join('');
}

function renderAdminRatingsStats() {
    const ratingsMap = readLocalJSON('ludoGameRatingsMap', {});
    const values = Object.values(ratingsMap).map(Number).filter(v => v >= 1 && v <= 3);
    const total = values.length;
    const avg = total ? (values.reduce((a, b) => a + b, 0) / total).toFixed(2) : '0.0';
    const totalEl = document.getElementById('adminTotalRatingUsers');
    const avgEl = document.getElementById('adminAvgRatingValue');
    if (totalEl) totalEl.textContent = String(total);
    if (avgEl) avgEl.textContent = `${avg} / 3 ⭐`;
}

function openAdminModal() {
    if (!currentUser.isAdmin) return;
    document.getElementById('adminNoticeInput').value = adminNoticeText === DEFAULT_NOTICE_TEXT ? '' : adminNoticeText;
    renderRegisteredPlayersForAdmin();
    renderSiteTrafficMetrics();
    renderAdminRatingsStats();
    document.getElementById('adminModal').style.display = 'flex';
}
function closeAdminModal() { document.getElementById('adminModal').style.display = 'none'; }
function saveAdminSettings() {
    if (!currentUser.isAdmin) return;
    const newNotice = document.getElementById('adminNoticeInput').value.trim();
    adminNoticeText = newNotice;
    saveLudoStorage('ludoAdminNotice', adminNoticeText);
    localStorage.removeItem('ludoNoticeDismissed');
    renderNoticeBar();
    closeAdminModal();
}

let tapCount = 0, adminTapTimer;
function triggerAdminTap() {
    tapCount++;
    clearTimeout(adminTapTimer);
    if (tapCount === 10) {
        tapCount = 0;
        openLoginModal();
        document.getElementById('adminPassGroup').style.display = 'block';
    }
    adminTapTimer = setTimeout(() => { tapCount = 0; }, 1500);
}

// ============================================================================
// CUSTOM PHOTO UPLOAD, LOGOUT & DIRECT GMAIL REPORT (kishore.club.85@gmail.com)
// ============================================================================

function logoutUser() {
    currentUser = { phone: '', name: '', avatar: 'male', isAdmin: false, customAvatar: '', userTheme: 'default' };
    saveLudoJSON('ludoPlayUser', currentUser);
    updateTopBarProfile();
    updateFriendBadgeCounts();
    closeProfileModal();
    showGameToast('🚪 Logged out successfully.');
}

function uploadCustomAvatar(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 128;
            let w = img.width, h = img.height;
            if (w > h && w > MAX_DIM) { h = Math.round(h * (MAX_DIM / w)); w = MAX_DIM; }
            else if (h >= w && h > MAX_DIM) { w = Math.round(w * (MAX_DIM / h)); h = MAX_DIM; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            currentUser.customAvatar = canvas.toDataURL('image/jpeg', 0.82);
            saveLudoJSON('ludoPlayUser', currentUser);
            updateTopBarProfile();
            openMyProfile();
            showGameToast('📷 Custom profile photo updated!');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removeCustomAvatar() {
    delete currentUser.customAvatar;
    saveLudoJSON('ludoPlayUser', currentUser);
    updateTopBarProfile();
    openMyProfile();
    showGameToast('👦 Reverted to default avatar.');
}

function openReportModal() {
    const nameInput = document.getElementById('reportUserName');
    const msgInput = document.getElementById('reportUserMessage');
    if (nameInput) nameInput.value = currentUser.name || '';
    if (msgInput) msgInput.value = '';
    document.getElementById('reportModal').style.display = 'flex';
}
function closeReportModal() {
    document.getElementById('reportModal').style.display = 'none';
}
function submitUserReportToGmail() {
    const name = (document.getElementById('reportUserName')?.value || currentUser.name || 'Anonymous Player').trim();
    const message = (document.getElementById('reportUserMessage')?.value || '').trim();
    if (name.length < 2) {
        showGameToast('⚠️ Please enter your name.');
        return;
    }
    if (message.length < 4) {
        showGameToast('⚠️ Please write your suggestion before submitting.');
        return;
    }
    const targetEmail = 'kishore.club.85@gmail.com';
    const subject = encodeURIComponent(`LudoPlay Suggestion / Report from ${name}`);
    const body = encodeURIComponent(`Player Name: ${name}\nPhone: ${currentUser.phone || 'Not provided'}\nTime: ${new Date().toLocaleString()}\n\nSuggestion / Report:\n${message}`);
    window.location.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
    closeReportModal();
    showGameToast('📨 Opening Gmail to send your suggestion...');
}

// ============================================================================
// 3D INVENTORY (FREE DICE, TOKEN SHAPES & STRICT DIAGONAL 1v1 COLORS, BOARDS)
// ============================================================================
const INVENTORY_CATALOG = {
    dice: [
        { id: 'classic', name: 'Crystal Pearl', icon: '🎲', desc: 'Ultra-HD White' },
        { id: 'royal_gold', name: 'Royal Gold', icon: '👑', desc: '24K Golden Cube' },
        { id: 'neon_cyber', name: 'Cyber Neon', icon: '⚡', desc: 'Electric Blue Glow' },
        { id: 'ruby_flare', name: 'Ruby Flare', icon: '♦️', desc: 'Crimson Crystal' },
        { id: 'emerald_glow', name: 'Emerald Jade', icon: '🟢', desc: 'Imperial Green' },
        { id: 'obsidian', name: 'Obsidian Dark', icon: '🌌', desc: 'Matte Black Cube' }
    ],
    tokenShapes: [
        { id: 'alpin', name: 'Classic Alpin', icon: '📌', desc: '3D Ludo Pin' },
        { id: 'ghost', name: 'Phantom Ghost', icon: '👻', desc: 'Floating Spirit' },
        { id: 'coin', name: 'Royal Coin', icon: '🪙', desc: 'Golden Medallion' },
        { id: 'crown', name: 'King Crown', icon: '👑', desc: 'Monarch Piece' },
        { id: 'diamond', name: 'Crystal Gem', icon: '💎', desc: 'Sharp Diamond' }
    ],
    tokenColors: [
        { id: 'blue', name: 'Ocean Blue', hex: '#0765a8' },
        { id: 'red', name: 'Crimson Red', hex: '#dc1824' },
        { id: 'green', name: 'Emerald Green', hex: '#008844' },
        { id: 'yellow', name: 'Solar Gold', hex: '#e6c200' }
    ],
    boards: [
        { id: 'classic', name: 'Classic Arena', icon: '🗺️', desc: 'Tournament Standard' },
        { id: 'royal_marble', name: 'Royal Marble', icon: '🏛️', desc: 'Luxury Violet Trim' },
        { id: 'wooden', name: 'Vintage Wood', icon: '🪵', desc: 'Warm Oak Finish' },
        { id: 'cyber_grid', name: 'Cyber Grid', icon: '💠', desc: 'Neon Blue Lines' },
        { id: 'emerald_palace', name: 'Emerald Palace', icon: '🌿', desc: 'Jade Court' },
        { id: 'obsidian_gold', name: 'Slate & Gold', icon: '✨', desc: 'High Contrast' }
    ]
};

let userInventoryPrefs = readLocalJSON('ludoInventoryPrefs', {
    dice: 'classic',
    tokenShape: 'alpin',
    tokenColor: 'blue',
    board: 'classic'
});

function applyInventoryCosmetics() {
    document.documentElement.setAttribute('data-dice-skin', userInventoryPrefs.dice || 'classic');
    document.documentElement.setAttribute('data-token-shape', userInventoryPrefs.tokenShape || 'alpin');
    document.documentElement.setAttribute('data-board-skin', userInventoryPrefs.board || 'classic');
    if (typeof LUDO_COLORS_BY_COUNT !== 'undefined' && userInventoryPrefs.tokenColor) {
        const preferred = userInventoryPrefs.tokenColor;
        const oppositeCornerMap = {
            blue: 'green',
            green: 'blue',
            red: 'yellow',
            yellow: 'red'
        };
        const clockwiseOrder = ['blue', 'red', 'green', 'yellow'];
        if (clockwiseOrder.includes(preferred)) {
            const startIdx = clockwiseOrder.indexOf(preferred);
            const ordered = Array.from({ length: 4 }, (_, i) => clockwiseOrder[(startIdx + i) % 4]);
            // 2-Player (1 vs 1) is ALWAYS diagonal opposite corners!
            LUDO_COLORS_BY_COUNT[2] = [preferred, oppositeCornerMap[preferred]];
            LUDO_COLORS_BY_COUNT[3] = [ordered[0], ordered[1], ordered[2]];
            LUDO_COLORS_BY_COUNT[4] = ordered;
        }
    }
}
window.addEventListener('DOMContentLoaded', applyInventoryCosmetics);
setTimeout(applyInventoryCosmetics, 50);

function openInventoryModal() {
    renderInventoryGrids();
    document.getElementById('inventoryModal').style.display = 'flex';
}
function closeInventoryModal() {
    document.getElementById('inventoryModal').style.display = 'none';
}
function switchInventoryTab(tab) {
    ['dice', 'token', 'board'].forEach(t => {
        document.getElementById('invTabBtn_' + t)?.classList.toggle('active', t === tab);
        const panel = document.getElementById('invPanel_' + t);
        if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
}
function renderInventoryGrids() {
    const diceGrid = document.getElementById('invDiceGrid');
    if (diceGrid) {
        diceGrid.innerHTML = INVENTORY_CATALOG.dice.map(item => `
            <div class="inv-card-3d ${userInventoryPrefs.dice === item.id ? 'active' : ''}" onclick="selectInventoryOption('dice','${item.id}')">
                <span class="inv-preview-icon">${item.icon}</span>
                <strong>${escapeHTML(item.name)}</strong>
                <small>${userInventoryPrefs.dice === item.id ? '✓ Equipped' : 'FREE'}</small>
            </div>
        `).join('');
    }
    const shapeGrid = document.getElementById('invTokenShapeGrid');
    if (shapeGrid) {
        shapeGrid.innerHTML = INVENTORY_CATALOG.tokenShapes.map(item => `
            <div class="inv-card-3d ${userInventoryPrefs.tokenShape === item.id ? 'active' : ''}" onclick="selectInventoryOption('tokenShape','${item.id}')">
                <span class="inv-preview-icon">${item.icon}</span>
                <strong>${escapeHTML(item.name)}</strong>
                <small>${userInventoryPrefs.tokenShape === item.id ? '✓ Equipped' : 'FREE'}</small>
            </div>
        `).join('');
    }
    const colorGrid = document.getElementById('invTokenColorGrid');
    if (colorGrid) {
        colorGrid.innerHTML = INVENTORY_CATALOG.tokenColors.map(item => `
            <div class="inv-color-chip ${userInventoryPrefs.tokenColor === item.id ? 'active' : ''}" style="background:${item.hex}" onclick="selectInventoryOption('tokenColor','${item.id}')">
                ${escapeHTML(item.name)}
            </div>
        `).join('');
    }
    const boardGrid = document.getElementById('invBoardGrid');
    if (boardGrid) {
        boardGrid.innerHTML = INVENTORY_CATALOG.boards.map(item => `
            <div class="inv-card-3d ${userInventoryPrefs.board === item.id ? 'active' : ''}" onclick="selectInventoryOption('board','${item.id}')">
                <span class="inv-preview-icon">${item.icon}</span>
                <strong>${escapeHTML(item.name)}</strong>
                <small>${userInventoryPrefs.board === item.id ? '✓ Equipped' : 'FREE'}</small>
            </div>
        `).join('');
    }
}
function selectInventoryOption(key, value) {
    userInventoryPrefs[key] = value;
    saveLudoJSON('ludoInventoryPrefs', userInventoryPrefs);
    applyInventoryCosmetics();
    renderInventoryGrids();
    if (document.getElementById('gameArenaScreen')?.style.display === 'flex' && typeof renderFullStage === 'function') {
        renderFullStage();
    }
    showGameToast('🎒 Inventory equipped for your matches!');
}

// ============================================================================
// FRIENDS SYSTEM (SEARCH BY PHONE, SEND/ACCEPT REQUEST, INVITE, UNFRIEND)
// ============================================================================
function normalizePhoneKey(phone) {
    return String(phone || '').replace(/[\s-]/g, '').toLowerCase();
}
function getSocialGraph() {
    const graph = readLocalJSON('ludoSocialGraph', {});
    return (graph && typeof graph === 'object') ? graph : {};
}
function saveSocialGraph(graph) {
    saveLudoJSON('ludoSocialGraph', graph);
}
function ensureSocialNode(graph, phoneKey, fallbackName = 'Player') {
    if (!graph[phoneKey]) {
        graph[phoneKey] = { friends: [], incoming: [], outgoing: [], name: fallbackName };
    }
    if (!Array.isArray(graph[phoneKey].friends)) graph[phoneKey].friends = [];
    if (!Array.isArray(graph[phoneKey].incoming)) graph[phoneKey].incoming = [];
    if (!Array.isArray(graph[phoneKey].outgoing)) graph[phoneKey].outgoing = [];
    if (fallbackName && fallbackName !== 'Player') graph[phoneKey].name = fallbackName;
    return graph[phoneKey];
}

function findRegisteredPlayerByPhone(phoneKey) {
    return playersDatabase.find(p => normalizePhoneKey(p.phone) === phoneKey) || null;
}

function updateFriendBadgeCounts() {
    const myPhone = normalizePhoneKey(currentUser.phone);
    const dockBadge = document.getElementById('friendReqBadge');
    const tabBadge = document.getElementById('frTabBadge');
    if (!myPhone) {
        if (dockBadge) dockBadge.style.display = 'none';
        if (tabBadge) tabBadge.textContent = '0';
        return;
    }
    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);
    const count = myNode.incoming.length;
    if (dockBadge) {
        dockBadge.textContent = String(count);
        dockBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (tabBadge) tabBadge.textContent = String(count);
}

function openFriendsModal() {
    if (!currentUser.name || !currentUser.phone) {
        openLoginModal();
        showError('👋 Please login with your Phone & Name to use Friends!');
        return;
    }
    updateFriendBadgeCounts();
    switchFriendsTab('list');
    document.getElementById('friendsModal').style.display = 'flex';
}
function closeFriendsModal() {
    document.getElementById('friendsModal').style.display = 'none';
}
function switchFriendsTab(tab) {
    ['list', 'requests', 'search'].forEach(t => {
        document.getElementById('frTabBtn_' + t)?.classList.toggle('active', t === tab);
        const panel = document.getElementById('frPanel_' + t);
        if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'list') renderMyFriendsList();
    if (tab === 'requests') renderIncomingFriendRequests();
}

function renderMyFriendsList() {
    const box = document.getElementById('myFriendsListBox');
    if (!box) return;
    const myPhone = normalizePhoneKey(currentUser.phone);
    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);
    if (!myNode.friends.length) {
        box.innerHTML = '<div class="player-list-empty">No friends added yet. Use "Add by Phone" to find friends!</div>';
        return;
    }
    box.innerHTML = myNode.friends.map(fPhone => {
        const reg = findRegisteredPlayerByPhone(fPhone);
        const fNode = graph[fPhone];
        const fName = reg?.name || fNode?.name || 'Friend';
        const fAvatar = reg?.avatar || '👦';
        return `
            <div class="saved-game-row">
                <div class="saved-game-info">
                    <strong>${escapeHTML(fAvatar)} ${escapeHTML(fName)}</strong>
                    <small>📱 ${escapeHTML(fPhone)}</small>
                </div>
                <button type="button" class="saved-game-load" onclick="inviteFriendToMatch('${escapeHTML(fPhone)}','${escapeHTML(fName)}')">🎮 Invite</button>
                <button type="button" class="saved-game-delete" onclick="unfriendPlayer('${escapeHTML(fPhone)}')" title="Unfriend">Unfriend</button>
            </div>
        `;
    }).join('');
}

function renderIncomingFriendRequests() {
    const box = document.getElementById('incomingRequestsBox');
    if (!box) return;
    const myPhone = normalizePhoneKey(currentUser.phone);
    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);
    if (!myNode.incoming.length) {
        box.innerHTML = '<div class="player-list-empty">No pending friend requests right now.</div>';
        return;
    }
    box.innerHTML = myNode.incoming.map(reqPhone => {
        const reg = findRegisteredPlayerByPhone(reqPhone);
        const rNode = graph[reqPhone];
        const rName = reg?.name || rNode?.name || 'Player';
        const rAvatar = reg?.avatar || '👦';
        return `
            <div class="saved-game-row">
                <div class="saved-game-info">
                    <strong>${escapeHTML(rAvatar)} ${escapeHTML(rName)}</strong>
                    <small>📱 ${escapeHTML(reqPhone)} wants to be friends</small>
                </div>
                <button type="button" class="saved-game-load" onclick="respondToFriendRequest('${escapeHTML(reqPhone)}', true)">Accept</button>
                <button type="button" class="saved-game-delete" onclick="respondToFriendRequest('${escapeHTML(reqPhone)}', false)">Deny</button>
            </div>
        `;
    }).join('');
}

function searchFriendByPhone() {
    const rawQuery = (document.getElementById('friendSearchPhoneInput')?.value || '').trim();
    const queryKey = normalizePhoneKey(rawQuery);
    const box = document.getElementById('friendSearchResultsBox');
    if (!box) return;
    if (queryKey.length < 4) {
        box.innerHTML = '<div class="player-list-empty">Please enter a valid phone number to search.</div>';
        return;
    }
    const myPhone = normalizePhoneKey(currentUser.phone);
    if (queryKey === myPhone) {
        box.innerHTML = '<div class="player-list-empty">That is your own phone number!</div>';
        return;
    }

    const matches = playersDatabase.filter(p => normalizePhoneKey(p.phone).includes(queryKey) && normalizePhoneKey(p.phone) !== myPhone);
    if (!matches.length) {
        box.innerHTML = `
            <div class="saved-game-row">
                <div class="saved-game-info">
                    <strong>📱 ${escapeHTML(rawQuery)}</strong>
                    <small>Not registered on this device yet — you can still send a request</small>
                </div>
                <button type="button" class="saved-game-load" onclick="sendFriendRequestByPhone('${escapeHTML(queryKey)}','Player (${escapeHTML(rawQuery)})')">➕ Send Request</button>
            </div>
        `;
        return;
    }

    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);

    box.innerHTML = matches.map(player => {
        const pKey = normalizePhoneKey(player.phone);
        const isFriend = myNode.friends.includes(pKey);
        const isOutgoing = myNode.outgoing.includes(pKey);
        let actionHtml = `<button type="button" class="saved-game-load" onclick="sendFriendRequestByPhone('${escapeHTML(pKey)}','${escapeHTML(player.name)}')">➕ Add Friend</button>`;
        if (isFriend) actionHtml = `<small style="color:#4ade80;font-weight:800;">✓ Friends</small>`;
        else if (isOutgoing) actionHtml = `<small style="color:#facc15;font-weight:800;">⏳ Requested</small>`;

        return `
            <div class="saved-game-row">
                <div class="saved-game-info">
                    <strong>${escapeHTML(player.avatar || '👦')} ${escapeHTML(player.name)}</strong>
                    <small>📱 ${escapeHTML(player.phone)}</small>
                </div>
                ${actionHtml}
            </div>
        `;
    }).join('');
}

function sendFriendRequestByPhone(targetPhoneKey, targetName = 'Player') {
    const myPhone = normalizePhoneKey(currentUser.phone);
    if (!myPhone || !targetPhoneKey || myPhone === targetPhoneKey) return;
    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);
    const targetNode = ensureSocialNode(graph, targetPhoneKey, targetName);

    if (myNode.friends.includes(targetPhoneKey)) {
        showGameToast('✅ You are already friends!');
        return;
    }
    if (!myNode.outgoing.includes(targetPhoneKey)) myNode.outgoing.push(targetPhoneKey);
    if (!targetNode.incoming.includes(myPhone)) targetNode.incoming.push(myPhone);
    saveSocialGraph(graph);
    sendOnlinePacket('friend_request', { toPhone: targetPhoneKey, fromPhone: myPhone, fromName: currentUser.name });
    searchFriendByPhone();
    showGameToast(`📩 Friend request sent to ${targetName}!`);
}

function respondToFriendRequest(requesterPhoneKey, accept) {
    const myPhone = normalizePhoneKey(currentUser.phone);
    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);
    const reqNode = ensureSocialNode(graph, requesterPhoneKey);

    myNode.incoming = myNode.incoming.filter(p => p !== requesterPhoneKey);
    reqNode.outgoing = reqNode.outgoing.filter(p => p !== myPhone);

    if (accept) {
        if (!myNode.friends.includes(requesterPhoneKey)) myNode.friends.push(requesterPhoneKey);
        if (!reqNode.friends.includes(myPhone)) reqNode.friends.push(myPhone);
        showGameToast('🤝 Friend request accepted!');
    } else {
        showGameToast('Friend request declined.');
    }
    saveSocialGraph(graph);
    updateFriendBadgeCounts();
    renderIncomingFriendRequests();
}

function unfriendPlayer(friendPhoneKey) {
    const myPhone = normalizePhoneKey(currentUser.phone);
    const graph = getSocialGraph();
    const myNode = ensureSocialNode(graph, myPhone, currentUser.name);
    const fNode = ensureSocialNode(graph, friendPhoneKey);

    myNode.friends = myNode.friends.filter(p => p !== friendPhoneKey);
    fNode.friends = fNode.friends.filter(p => p !== myPhone);
    saveSocialGraph(graph);
    renderMyFriendsList();
    showGameToast('👋 Unfriended player.');
}

function inviteFriendToMatch(friendPhoneKey, friendName) {
    closeFriendsModal();
    if (!currentUser?.isAdmin) {
        openPublishingSoonModal();
        return;
    }
    const roomCode = onlineRoomId || `ROOM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    onlineRoomId = roomCode;
    sendOnlinePacket('match_invite', { toPhone: friendPhoneKey, roomId: roomCode, hostName: currentUser.name });
    selectedOnlineSubMode = 'challenge';
    openFullScreenSetup('ludo');
    setSubMode('online_challenge');
    showGameToast(`⚔️ Invite sent to ${friendName}! Room: ${roomCode}`);
}

updateFriendBadgeCounts();

// ============================================================================
// SETTINGS MODAL (SOUND, BANGLA/ENGLISH, THEME, SHARE LINK, 3-STAR RATING)
// ============================================================================
let currentGameLang = localStorage.getItem('ludoGameLanguage') || 'en';

const LANG_STRINGS = {
    en: {
        subtitle: 'Select Your 3D Arena',
        ludoTitle: 'Classic Ludo',
        ludoDesc: 'Individual, Team Up, Challenge, Smart AI, Online & Tournaments',
        snakeTitle: 'Snake & Ladders',
        snakeDesc: 'Max 4-Player Pass & Play and Smart AI Board',
        inventory: 'Inventory',
        friends: 'Friends',
        settings: 'Settings',
        report: '🐞 Report'
    },
    bn: {
        subtitle: 'আপনার থ্রি-ডি গেম জোন বেছে নিন',
        ludoTitle: 'ক্লাসিক লুডু',
        ludoDesc: 'সিঙ্গেল, টিম আপ, চ্যালেঞ্জ, স্মার্ট এআই, অনলাইন ও টুর্নামেন্ট',
        snakeTitle: 'সাপ ও মই',
        snakeDesc: '৪ জন প্লেয়ার পাস অ্যান্ড প্লে এবং স্মার্ট এআই বোর্ড',
        inventory: 'ইনভেন্টরি',
        friends: 'ফ্রেন্ডস',
        settings: 'সেটিংস',
        report: '🐞 রিপোর্ট'
    }
};

function applyLanguageStrings() {
    const pack = LANG_STRINGS[currentGameLang] || LANG_STRINGS.en;
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setTxt('homeSubtitleText', pack.subtitle);
    setTxt('cardTitleLudo', pack.ludoTitle);
    setTxt('cardDescLudo', pack.ludoDesc);
    setTxt('cardTitleSnake', pack.snakeTitle);
    setTxt('cardDescSnake', pack.snakeDesc);
    setTxt('navLabelInventory', pack.inventory);
    setTxt('navLabelFriends', pack.friends);
    setTxt('navLabelSettings', pack.settings);
    setTxt('topReportBtn', pack.report);
    document.getElementById('langBtnEn')?.classList.toggle('active', currentGameLang === 'en');
    document.getElementById('langBtnBn')?.classList.toggle('active', currentGameLang === 'bn');
}
window.addEventListener('DOMContentLoaded', applyLanguageStrings);
setTimeout(applyLanguageStrings, 50);

function setGameLanguage(lang) {
    currentGameLang = lang === 'bn' ? 'bn' : 'en';
    saveLudoStorage('ludoGameLanguage', currentGameLang);
    applyLanguageStrings();
    showGameToast(currentGameLang === 'bn' ? '🌐 ভাষা বাংলা করা হয়েছে!' : '🌐 Language set to English!');
}

function syncSettingsModalState() {
    const soundBtn = document.getElementById('settingsSoundBtn');
    const isSoundOn = typeof gameSoundEnabled !== 'undefined' ? gameSoundEnabled : (localStorage.getItem('ludoplay.sound.enabled') !== 'false');
    if (soundBtn) {
        soundBtn.textContent = isSoundOn ? '🔊 ON' : '🔇 OFF';
        soundBtn.classList.toggle('active', isSoundOn);
    }
    const uTheme = currentUser?.userTheme === 'royal' ? 'royal' : 'default';
    document.getElementById('userThemeDefaultBtn')?.classList.toggle('active', uTheme === 'default');
    document.getElementById('userThemeRoyalBtn')?.classList.toggle('active', uTheme === 'royal');
    renderUserRatingStars();
}

function openSettingsModal() {
    syncSettingsModalState();
    document.getElementById('settingsModal').style.display = 'flex';
}
function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function toggleSoundFromSettings() {
    if (typeof toggleGameSound === 'function') {
        toggleGameSound();
    }
    syncSettingsModalState();
}

function setUserInterfaceTheme(themeKey) {
    currentUser.userTheme = themeKey === 'royal' ? 'royal' : 'default';
    saveLudoJSON('ludoPlayUser', currentUser);
    if (currentUser.isAdmin && themeKey === 'default') {
        saveLudoStorage('ludoGlobalTheme', 'default');
    }
    applyThemeForCurrentUser();
    syncSettingsModalState();
    showGameToast(`🎨 Theme set to ${currentUser.userTheme === 'royal' ? 'Royal Violet' : 'Default'}!`);
}

function shareGameLink() {
    const shareUrl = window.location.href.startsWith('http') ? window.location.href : 'https://ludoplay.vercel.app';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showGameToast('🔗 Game link copied! Share it anywhere.');
        }).catch(() => {
            showGameToast(`🔗 Share link: ${shareUrl}`);
        });
    } else {
        showGameToast(`🔗 Share link: ${shareUrl}`);
    }
}

function renderUserRatingStars() {
    const ratingsMap = readLocalJSON('ludoGameRatingsMap', {});
    const myRating = Number(ratingsMap[getCurrentProfileId()]) || 0;
    document.querySelectorAll('#threeStarBox .star-3d-btn').forEach(btn => {
        const starVal = Number(btn.getAttribute('data-star'));
        btn.classList.toggle('active', starVal <= myRating);
    });
    const statusText = document.getElementById('userRatingStatusText');
    if (statusText) {
        statusText.textContent = myRating > 0
            ? `You rated LudoPlay ${myRating} / 3 ⭐`
            : 'Tap a 3D star below to submit your rating';
    }
}

function submitGameRating(stars) {
    const validStars = Math.max(1, Math.min(3, Number(stars) || 3));
    const ratingsMap = readLocalJSON('ludoGameRatingsMap', {});
    ratingsMap[getCurrentProfileId()] = validStars;
    saveLudoJSON('ludoGameRatingsMap', ratingsMap);
    renderUserRatingStars();
    renderAdminRatingsStats();
    showGameToast(`⭐ Thank you for your ${validStars}-Star rating!`);
}