const SNAKE_PLAYER_COLORS = ['#0877e8', '#e32636', '#07a45a', '#f2c400'];

function escapeSnakeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

function createSnakeLadderSvg() {
    const ladders = [
        { from: 4, to: 23, a: [35, 95], b: [25, 75], c: [38, 95], d: [28, 75] },
        { from: 13, to: 46, a: [75, 85], b: [55, 55], c: [78, 85], d: [58, 55] },
        { from: 33, to: 52, a: [75, 65], b: [85, 45], c: [78, 65], d: [88, 45] },
        { from: 42, to: 63, a: [15, 55], b: [25, 35], c: [18, 55], d: [28, 35] },
        { from: 50, to: 69, a: [95, 55], b: [85, 35], c: [98, 55], d: [88, 35] },
        { from: 62, to: 81, a: [15, 35], b: [5, 15], c: [18, 35], d: [8, 15] },
        { from: 74, to: 92, a: [65, 25], b: [85, 5], c: [68, 25], d: [88, 5] }
    ];
    const line = (p1, p2) => `M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]}`;
    const movingPinPath = 'M0 4.2 L.384 2.52 .96 1.008 1.68-.336 2.208-1.428 2.4-2.352 2.256-3.108 1.92-3.696 1.44-4.032 .816-4.2 0-4.2 -.816-4.2 -1.44-4.032 -1.92-3.696 -2.256-3.108 -2.4-2.352 -2.208-1.428 -1.68-.336 -.96 1.008 -.384 2.52Z';
    const parseSnakeCurve = d => {
        const values = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
        const [x0, y0, x1, y1, x2, y2, x3, y3] = values;
        const pointAt = t => {
            const u = 1 - t;
            return [
                u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3,
                u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3
            ];
        };
        const tangentAt = t => {
            const u = 1 - t;
            return [
                3 * u ** 2 * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t ** 2 * (x3 - x2),
                3 * u ** 2 * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t ** 2 * (y3 - y2)
            ];
        };
        let curveLength = 0;
        let previous = pointAt(0);
        for (let i = 1; i <= 48; i++) {
            const next = pointAt(i / 48);
            curveLength += Math.hypot(next[0] - previous[0], next[1] - previous[1]);
            previous = next;
        }
        return { pointAt, tangentAt, curveLength };
    };
    const makeSnakeBellyPath = d => {
        const { pointAt, tangentAt } = parseSnakeCurve(d);
        const pathPoints = [];
        for (let i = 0; i <= 64; i++) {
            const t = i / 64;
            const [x, y] = pointAt(t);
            const [dx, dy] = tangentAt(t);
            const magnitude = Math.hypot(dx, dy) || 1;
            const offset = 0.43;
            pathPoints.push(
                `${i ? 'L' : 'M'}${(x - dy / magnitude * offset).toFixed(2)} ${(y + dx / magnitude * offset).toFixed(2)}`
            );
        }
        return pathPoints.join(' ');
    };
    const makeSnakeSpotMarkup = d => {
        const { pointAt, tangentAt, curveLength } = parseSnakeCurve(d);
        const count = Math.max(4, Math.min(11, Math.floor(curveLength / 2.8)));
        return Array.from({ length: count }, (_, index) => {
            const t = 0.13 + 0.74 * index / (count - 1);
            const [x, y] = pointAt(t);
            const [dx, dy] = tangentAt(t);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            return `<ellipse class="sn-snake-spot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx=".22" ry=".15" transform="rotate(${angle.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
        }).join('');
    };
    const laddersSvg = ladders.map(({ from, to, a, b, c, d }) => {
        const rungs = [0.12, 0.31, 0.5, 0.69, 0.88].map(t => {
            const from = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const to = [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t];
            return line(from, to);
        }).join(' ');
        const rails = `${line(a, b)} ${line(c, d)}`;
        const centerStart = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        const centerEnd = [(b[0] + d[0]) / 2, (b[1] + d[1]) / 2];
        return `<g class="sn-ladder" data-from="${from}" data-to="${to}">
            <path class="sn-ladder-shadow" d="${rails} ${rungs}"/>
            <path class="sn-ladder-rails" d="${rails}"/>
            <path class="sn-ladder-rungs" d="${rungs}"/>
            <path class="sn-ladder-glint" d="${line([a[0] - 0.25, a[1]], [b[0] - 0.25, b[1]])} ${line([c[0] - 0.25, c[1]], [d[0] - 0.25, d[1]])}"/>
            <path class="sn-ladder-motion" data-from="${from}" data-to="${to}" d="${line(centerStart, centerEnd)}"/>
        </g>`;
    }).join('');

    const snakes = [
        { from: 27, to: 5, d: 'M65 75 C58 82, 52 90, 45 95', x: 65, y: 75, angle: 135, color: 'green' },
        { from: 40, to: 3, d: 'M5 65 C18 70, 10 87, 25 95', x: 5, y: 65, angle: 21, color: 'red' },
        { from: 43, to: 18, d: 'M25 55 C14 62, 35 68, 25 85', x: 25, y: 55, angle: 148, color: 'blue' },
        { from: 54, to: 31, d: 'M65 45 C80 50, 90 55, 95 65', x: 65, y: 45, angle: 18, color: 'gold' },
        { from: 66, to: 45, d: 'M55 35 C45 43, 60 47, 45 55', x: 55, y: 35, angle: 141, color: 'red' },
        { from: 76, to: 58, d: 'M45 25 C30 29, 42 35, 25 45', x: 45, y: 25, angle: 165, color: 'blue' },
        { from: 89, to: 53, d: 'M85 15 C95 24, 70 34, 75 45', x: 85, y: 15, angle: 42, color: 'green' },
        { from: 99, to: 41, d: 'M15 5 C28 14, 5 31, 5 55', x: 15, y: 5, angle: 35, color: 'gold' }
    ];
    const snakesSvg = snakes.map(({ from, to, d, x, y, angle, color }) => `<g class="sn-snake sn-snake-${color}" data-from="${from}" data-to="${to}">
        <path class="sn-snake-outline" d="${d}"/>
        <path class="sn-snake-body" d="${d}"/>
        <path class="sn-snake-belly" d="${makeSnakeBellyPath(d)}"/>
        <g class="sn-snake-spots">${makeSnakeSpotMarkup(d)}</g>
        <path class="sn-snake-highlight" d="${d}"/>
        <g class="sn-snake-head-group" transform="translate(${x} ${y}) rotate(${angle})">
            <path class="sn-snake-head-shell" d="M-1.42 0 C-1.32-.83-.62-1.08 .08-.77 L1.05-.38 C1.42-.2 1.42 .2 1.05 .38 L.08 .77 C-.62 1.08-1.32 .83-1.42 0Z"/>
            <path class="sn-snake-head-glint" d="M-1.12-.36 C-.68-.78-.12-.78 .36-.57"/>
            <ellipse class="sn-snake-eye-white" cx="-.14" cy="-.43" rx=".23" ry=".19"/>
            <ellipse class="sn-snake-eye-white" cx="-.14" cy=".43" rx=".23" ry=".19"/>
            <circle class="sn-snake-eye" cx="-.06" cy="-.43" r=".105"/>
            <circle class="sn-snake-eye" cx="-.06" cy=".43" r=".105"/>
            <circle class="sn-snake-eye-glint" cx="-.09" cy="-.47" r=".035"/>
            <circle class="sn-snake-eye-glint" cx="-.09" cy=".39" r=".035"/>
            <circle class="sn-snake-nostril" cx=".98" cy="-.12" r=".055"/>
            <circle class="sn-snake-nostril" cx=".98" cy=".12" r=".055"/>
            <path class="sn-snake-tongue" d="M1.31 0 C1.65 0 1.88 .02 2.12 0 M2.12 0 L2.48-.19 M2.12 0 L2.48 .19"/>
        </g>
    </g>`).join('');    return `<svg class="snake-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
            <linearGradient id="snakeWoodRail" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#e7e3d7"/><stop offset=".24" stop-color="#fff4d2"/>
                <stop offset=".58" stop-color="#9da9b5"/><stop offset=".82" stop-color="#f1d9a7"/><stop offset="1" stop-color="#6a7481"/>
            </linearGradient>
            <linearGradient id="snakeWoodRung" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#394653"/><stop offset=".48" stop-color="#fff0c3"/><stop offset="1" stop-color="#64717c"/>
            </linearGradient>
            <linearGradient id="snakeBodyGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d5ef78"/><stop offset=".35" stop-color="#82c846"/><stop offset=".72" stop-color="#29954d"/><stop offset="1" stop-color="#176743"/></linearGradient>
            <linearGradient id="snakeHeadGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eaffaa"/><stop offset=".48" stop-color="#8dcf4a"/><stop offset="1" stop-color="#258344"/></linearGradient>
            <linearGradient id="snakeBodyRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe39a"/><stop offset=".35" stop-color="#f06a58"/><stop offset=".72" stop-color="#c72f4d"/><stop offset="1" stop-color="#8b2047"/></linearGradient>
            <linearGradient id="snakeHeadRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0bb"/><stop offset=".48" stop-color="#ed6658"/><stop offset="1" stop-color="#a6294b"/></linearGradient>
            <linearGradient id="snakeBodyBlue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0f9ff"/><stop offset=".32" stop-color="#56c5e8"/><stop offset=".72" stop-color="#237fc0"/><stop offset="1" stop-color="#20578e"/></linearGradient>
            <linearGradient id="snakeHeadBlue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1fdff"/><stop offset=".48" stop-color="#67c8e8"/><stop offset="1" stop-color="#246ca7"/></linearGradient>
            <linearGradient id="snakeBodyGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2a2"/><stop offset=".35" stop-color="#f4c641"/><stop offset=".72" stop-color="#e88c28"/><stop offset="1" stop-color="#a95329"/></linearGradient>
            <linearGradient id="snakeHeadGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8c4"/><stop offset=".48" stop-color="#f1c845"/><stop offset="1" stop-color="#bf6929"/></linearGradient>
            <radialGradient id="movingTokenFill" cx="28%" cy="20%" r="85%">
                <stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#eaf8ff"/><stop offset=".42" stop-color="var(--moving-token-color)"/><stop offset="1" stop-color="#071a32"/>
            </radialGradient>
        </defs>
        ${laddersSvg}${snakesSvg}
        ${snakeVisualMotion ? `<g id="snakeMovingPiece" class="sn-moving-piece" style="--moving-token-color:${activePlayersList[snakeVisualMotion.playerIndex]?.color || '#0877e8'}" transform="translate(0 0)">
            <path class="sn-moving-piece-shadow" d="${movingPinPath}" transform="translate(0 .18)"/>
            <path class="sn-moving-piece-fill" d="${movingPinPath}"/>
            <ellipse class="sn-moving-piece-glint" cx="0" cy="-3.12" rx="1.02" ry="1.02"/>
        </g>` : ''}
    </svg>`;
}

function launchSnakeMatch(count) {
    const playerCount = Math.max(2, Math.min(4, parseInt(count, 10) || 2));
    const aiMode = selectedSubMode === 'ai';
    const names = ['You', 'Sophia', 'Richard', 'Mark'];
    const avatars = ['👦', '🤖', '🧔', '👩'];

    currentMatchPlayerCount = playerCount;
    activePlayersList = [];
    consecutiveSixCount = {};
    snakeConsecutiveOnes = {};
    currentTurnIndex = 0;
    isDiceRolling = false;
    isTokenAnimating = false;
    ludoPendingMove = null;
    ludoMatchWinner = null;
    snakeMatchWinner = null;
    liveGreatPlayerIndex = -1;
    liveGreatPlayerUntil = 0;
    clearTimeout(liveGreatPlayerTimer);
    currentMatchResultRecorded = false;
    ludoMatchIsOffline = !selectedSubMode.startsWith('online');
    ludoMatchStartedAt = Date.now();
    ludoMatchFinishedAt = null;
    ludoAnimationEpoch++;
    clearTimeout(ludoAiTimer);
    clearTimeout(ludoFinishTimer);
    clearTimeout(ludoAutoMoveTimer);
    ludoFinishCelebration = null;
    snakeVisualMotion = null;

    for (let i = 0; i < playerCount; i++) {
        const isAI = aiMode && i > 0;
        activePlayersList.push({
            name: i === 0 ? (currentUser.name || 'You') : (isAI ? names[i] : `Player ${i + 1}`),
            playerId: i === 0 ? getCurrentProfileId() : (isAI ? `bot:${names[i].toLowerCase()}` : `local:snake:${i}:${Date.now()}`),
            avatar: i === 0 ? (currentUser.avatar === 'female' ? '👧' : '👦') : (isAI ? avatars[i] : '👤'),
            isAI,
            lastRoll: i === 0 ? 6 : 5,
            pos: 0,
            color: SNAKE_PLAYER_COLORS[i],
            kills: 0,
            maxCaptureBurst: 0,
            wasBehind: false,
            turnResponseTimes: [],
            turnStartedAt: Date.now()
        });
    }

    const arena = document.getElementById('gameArenaScreen');
    arena.classList.remove('ludo-mode');
    arena.classList.add('snake-theme');
    renderFullStage();
    arena.style.display = 'flex';
    beginOnlineMatchSession();
    updateAdminMatchBadgeControl(true);
    refreshAdminMatchBadges();
    requestGameFullscreen(arena);
    autoSaveActiveMatch();
}

function restoreSnakeMatchFromSave(save) {
    try {
        currentMatchPlayerCount = save.players.length;
        activeGameType = 'snake';
        selectedSubMode = ['ai', 'pass_normal', 'pass_quick'].includes(save.subMode) ? save.subMode : 'ai';
        currentTurnIndex = save.turnIndex;
        activePlayersList = save.players.map((stored, index) => ({
            ...stored, color: SNAKE_PLAYER_COLORS[index % SNAKE_PLAYER_COLORS.length], pos: Math.max(0, Math.min(100, Number(stored.pos) || 0)), isAI: Boolean(stored.isAI),
            tokens: [], turnStartedAt: Date.now(), turnResponseTimes: Array.isArray(stored.turnResponseTimes) ? stored.turnResponseTimes.slice(-24) : []
        }));
        snakeConsecutiveOnes = save.snakeConsecutiveOnes && typeof save.snakeConsecutiveOnes === 'object' ? { ...save.snakeConsecutiveOnes } : {};
        consecutiveSixCount = {}; ludoPendingMove = null; ludoMatchWinner = null; snakeMatchWinner = null;
        liveGreatPlayerIndex = -1; liveGreatPlayerUntil = 0; clearTimeout(liveGreatPlayerTimer);
        ludoMatchIsOffline = !selectedSubMode.startsWith('online');
        ludoQuickMatch = false; ludoFirstKillOccurred = false; currentMatchResultRecorded = false;
        ludoMatchStartedAt = Date.now() - Math.max(0, Number(save.elapsedMs) || 0); ludoMatchFinishedAt = null;
        isDiceRolling = false; isTokenAnimating = false; ludoAnimationEpoch++;
        clearTimeout(ludoAiTimer); clearTimeout(ludoFinishTimer); clearTimeout(ludoAutoMoveTimer);
        snakeVisualMotion = null; activeMatchSaveId = save.id;
        const arena = document.getElementById('gameArenaScreen');
        arena.classList.remove('ludo-mode'); arena.classList.add('snake-theme'); arena.style.display = 'flex';
        beginOnlineMatchSession(); renderFullStage(); updateAdminMatchBadgeControl(true); refreshAdminMatchBadges();
        requestGameFullscreen(arena); autoSaveActiveMatch();
        return true;
    } catch (_) { return false; }
}

function renderSnakeWinnerMarkup() {
    if (snakeMatchWinner === null) return '';
    const winner = activePlayersList[snakeMatchWinner];
    const greatPlayer = winner || activePlayersList[0];
    const winnerIsMe = winner && winner.playerId === getCurrentProfileId();
    const trophy = ludoMatchIsOffline || winnerIsMe ? '<span class="winner-medal">🏆</span>' : '';
    const celebration = !ludoMatchIsOffline && winnerIsMe ? '<span class="winner-exclusive">🏆 YOU WON · CHAMPION</span>' : '';
    const color = greatPlayer?.color || '#fff';
    const ranked = activePlayersList.map((player, index) => ({ player, index }))
        .sort((a, b) => (a.index === snakeMatchWinner ? -1 : b.index === snakeMatchWinner ? 1 : b.player.pos - a.player.pos));
    const leaderboard = `<div class="ludo-leaderboard"><span class="ludo-leaderboard-title">${ludoMatchIsOffline ? 'MATCH STANDINGS' : 'ONLINE LEADERBOARD'}</span>${ranked.map((row, rank) => `<div class="ludo-leaderboard-row ${rank === 0 ? 'first' : ''}"><span class="ludo-leaderboard-rank">${rank + 1}${rank === 0 ? 'st' : rank === 1 ? 'nd' : rank === 2 ? 'rd' : 'th'}</span><i class="ludo-leaderboard-color" style="--rank-color:${row.player.color}"></i><span class="ludo-leaderboard-name">${escapeSnakeText(row.player.name || `Player ${row.index + 1}`)}</span><span class="ludo-leaderboard-score">${rank === 0 ? 'WINNER' : `${row.player.pos}/100`}</span></div>`).join('')}</div>`;
    return `<div class="ludo-winner-banner snake-winner-banner">
        ${trophy}<strong>FIRST PLACE</strong>
        <span class="winner-name">${escapeSnakeText(winner?.name || 'Player')}</span>
        ${celebration}<small>Reached square 100</small>
        <div class="ludo-result-time"><span>MATCH TIME</span><strong>${formatLudoMatchDuration()}</strong></div>
        <div class="ludo-great-player-card"><span class="ludo-mvp-color" style="--mvp-color:${color}"></span><div class="ludo-mvp-details"><small>GREAT PLAYER OF THE MATCH</small><strong>${escapeSnakeText(greatPlayer?.name || 'Player')} · ${escapeSnakeText(greatPlayer?.color || 'player')}</strong><span>(${greatPlayer?.pos || 0}/100)</span></div></div>
        ${leaderboard}
    </div>`;
}

function renderSnakeStage(stage) {
    let cellsHtml = '';
    for (let row = 0; row < 10; row++) {
        const isEvenFromTop = row % 2 === 0;
        for (let col = 0; col < 10; col++) {
            const num = isEvenFromTop
                ? (100 - row * 10 - col)
                : (100 - row * 10 - (9 - col));
            const tileClass = (row + col) % 2 === 0 ? 'pink-tile' : 'white-tile';
            const tokensHere = activePlayersList.map((player, index) => player.pos === num &&
                !(snakeVisualMotion && snakeVisualMotion.playerIndex === index && snakeVisualMotion.fromPos === num)
                ? `<span class="sn-token-dot" style="--token-color:${player.color}" title="${escapeSnakeText(player.name)}"></span>`
                : '').join('');
            const flagIcon = num === 100 ? '<span class="sn-finish-flag">🏁</span>' : '';
            cellsHtml += `<div class="snake-cell ${tileClass}"><span>${num}</span>${flagIcon}<div class="snake-tokens-layer">${tokensHere}</div></div>`;
        }
    }

    const curPlayer = activePlayersList[currentTurnIndex];
    const splitIndex = Math.ceil(activePlayersList.length / 2);
    const makePlayerDock = playerIndexes => playerIndexes.map(index => {
        const player = activePlayersList[index];
        return `<div class="sn-side-player ${index === currentTurnIndex ? 'active' : ''}" title="${escapeSnakeText(player.name)}">
            <span class="sn-player-chip-dot" style="--token-color:${player.color}"></span>
            <span class="sn-player-name" data-admin-name-index="${index}"><button type="button" class="sn-player-label" onclick="event.stopPropagation(); openPlayerProfile(${index})">${escapeSnakeText(player.name)}</button>${renderAdminMatchBadgeMarkup(index)}${getLiveGreatStarMarkup(index)}</span>
        </div>`;
    }).join('');

    stage.innerHTML = `<div class="snake-stage">
        <div class="snake-board-wrap">
            <div class="snake-board-grid">${cellsHtml}</div>
            ${createSnakeLadderSvg()}
        </div>
        <div class="snake-bottom-bar">
            <div class="sn-player-group">${makePlayerDock(Array.from({ length: splitIndex }, (_, i) => i))}</div>
            <div class="sn-center-dice-housing ${curPlayer?.isAI ? 'ai-turn' : ''}" id="dice_slot_${currentTurnIndex}" onclick="rollPlayerDice(${currentTurnIndex})" aria-label="Roll the dice">
                <div class="sn-center-arrow">⬇️</div>${createPipDiceHTML(curPlayer?.lastRoll || 6)}
            </div>
            <div class="sn-player-group sn-player-group-right">${makePlayerDock(Array.from({ length: activePlayersList.length - splitIndex }, (_, i) => i + splitIndex))}</div>
        </div>
        ${renderSnakeWinnerMarkup()}
    </div>`;
}
