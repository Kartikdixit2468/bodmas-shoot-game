/** --- AUDIO SYSTEM (Web Audio API) --- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgMusicGainMain = null;
let bgMusicGainSofter = null;
let bgAudioMain = null;
let bgAudioSofter = null;

function playTone(freq, type, duration, vol=0.1) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playAudioFile(filename, volume = 0.3) {
    try {
        const audio = new Audio(filename);
        audio.volume = volume;
        audio.play().catch(err => console.log('Audio play failed:', err));
    } catch(e) {
        console.log('Could not play audio file:', filename);
    }
}

function initBackgroundMusic() {
    try {
        bgAudioMain = new Audio('sounds/bg_main.mp3');
        bgAudioSofter = new Audio('sounds/bg_softer.mp3');
        bgAudioMain.loop = true;
        bgAudioSofter.loop = true;
        bgAudioMain.volume = 0.3;
        bgAudioSofter.volume = 0.12;
    } catch(e) {
        console.log('Could not initialize background music');
    }
}

function startBackgroundMusic() {
    try {
        if(bgAudioMain) bgAudioMain.play().catch(e => console.log('BG music play failed'));
        if(bgAudioSofter) bgAudioSofter.play().catch(e => console.log('BG softer play failed'));
    } catch(e) {
        console.log('Background music error:', e);
    }
}

function stopBackgroundMusic() {
    try {
        if(bgAudioMain) bgAudioMain.pause();
        if(bgAudioSofter) bgAudioSofter.pause();
    } catch(e) {
        console.log('Error stopping background music');
    }
}

function playStretch() { 
    playTone(200, 'triangle', 0.1, 0.05);
    playAudioFile('sounds/streching_sound_main.mp3', 0.4);
}

function playShoot() { 
    playTone(300, 'sine', 0.2, 0.1); 
    setTimeout(() => playTone(150, 'triangle', 0.3, 0.1), 50);
}

function playCorrect() {
    playTone(523.25, 'sine', 0.1, 0.2);
    setTimeout(() => playTone(659.25, 'sine', 0.1, 0.2), 100);
    setTimeout(() => playTone(783.99, 'sine', 0.2, 0.2), 200);
    setTimeout(() => playTone(1046.50, 'sine', 0.4, 0.2), 300);
    playAudioFile('sounds/kids-booing-jam-fx-1-00-03.mp3', 0.5);
}

function playWrong() {
    playTone(250, 'sawtooth', 0.3, 0.2);
    setTimeout(() => playTone(150, 'sawtooth', 0.4, 0.2), 150);
}

function playPop() { playTone(800, 'sine', 0.1, 0.1); }

/** --- LOCAL STORAGE (HIGH SCORE) --- */
function getHighScore() {
    const stored = localStorage.getItem('mathSlingshotHighScore');
    return stored ? parseInt(stored) : 0;
}

function setHighScore(newScore) {
    const currentHigh = getHighScore();
    if (newScore > currentHigh) {
        localStorage.setItem('mathSlingshotHighScore', newScore.toString());
        return true;
    }
    return false;
}

/** --- GAME STATE & VARIABLES --- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = 'menu';
let score = 0;
let lives = 3;
let timeLeft = 30;
let questionTimeLeft = 30;
let timerInterval;

let questions = [];
let currentQ = null;

const GRAVITY = 0.4;
const MAX_PULL = 150;
const POWER_MULTIPLIER = 0.18;  // Optimized: enough force to reach targets, but still controlled

let monkey = { x: 100, y: 0, targetX: 100, progressCircle: 0 };
let banana = { x: 0, y: 0 };
let slingshot = { x: 150, y: 0, isDragging: false };
let projectile = { x: 150, y: 0, vx: 0, vy: 0, radius: 18, active: false, type: '🥥' };

let targets = [];
let particles = [];
let floatingTexts = [];
let mouse = { x: 0, y: 0, downX: 0, downY: 0 };

const PROGRESS_CIRCLES = 12;
let progressBars = [];

/** --- INITIALIZATION --- */
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    slingshot.y = canvas.height - 180;
    monkey.y = canvas.height - 140;
    banana.x = canvas.width - 80;
    banana.y = canvas.height - 160;
    
    // Initialize progress bar
    initProgressBar();
    
    if (!projectile.active && !slingshot.isDragging) {
        resetProjectile();
    }
}
window.addEventListener('resize', resize);
resize();

function initProgressBar() {
    progressBars = [];
    const barY = canvas.height - 60;
    const circleRadius = 18;
    const spacing = (canvas.width - 100) / PROGRESS_CIRCLES;
    
    for (let i = 0; i < PROGRESS_CIRCLES; i++) {
        progressBars.push({
            x: 50 + (i * spacing),
            y: barY,
            radius: circleRadius,
            index: i,
            collected: false
        });
    }
}

const fallbackQuestions = [
    { expression: "8 + 3 * 2", correctStep: "3 * 2", options: ["8 + 3", "3 * 2", "8 + 2"] },
    { expression: "15 - 10 / 2", correctStep: "10 / 2", options: ["15 - 10", "10 / 2", "15 / 2"] },
    { expression: "( 4 + 2 ) * 3", correctStep: "( 4 + 2 )", options: ["2 * 3", "( 4 + 2 )", "4 * 3"] },
    { expression: "20 / 4 + 5", correctStep: "20 / 4", options: ["4 + 5", "20 / 4", "20 + 5"] },
    { expression: "12 - 3 * 3 + 1", correctStep: "3 * 3", options: ["12 - 3", "3 * 3", "3 + 1"] }
];

async function loadQuestions() {
    try {
        const response = await fetch('questions.php');
        if (!response.ok) throw new Error("PHP not reachable");
        questions = await response.json();
    } catch (e) {
        console.log("Using fallback questions. Reason: " + e.message);
        questions = [...fallbackQuestions];
    }
    questions.sort(() => Math.random() - 0.5);
}

async function startGame() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    initBackgroundMusic();
    await loadQuestions();
    
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    
    score = 0;
    lives = 3;
    monkey.x = 100;
    monkey.targetX = 100;
    monkey.progressCircle = 0;
    initProgressBar();
    updateUI();
    
    gameState = 'playing';
    startBackgroundMusic();
    loadNextQuestion();
    
    clearInterval(timerInterval);
    gameLoop();
}

async function goToGame() {
    await startGame();
}

function startGameFromMenu() {
    document.getElementById('start-screen').classList.add('hidden');
}

async function resetGame() {
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('congratulations-screen').classList.add('hidden');
    await startGame();
}

function returnToMenu() {
    stopBackgroundMusic();
    clearInterval(timerInterval);
    document.getElementById('main-menu').classList.remove('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('congratulations-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.add('hidden');
    updateHighScoreDisplay();
}

function updateHighScoreDisplay() {
    const highScore = getHighScore();
    const elem = document.getElementById('main-high-score');
    if (elem) {
        elem.innerText = '🏆 High Score: ' + highScore;
    }
}

function gameOver(reason) {
    gameState = 'gameover';
    stopBackgroundMusic();
    clearInterval(timerInterval);
    
    // Save high score
    const isNewHighScore = setHighScore(score);
    
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-reason').innerText = reason;
    
    // Show high score
    const highScore = getHighScore();
    const highScoreElement = document.getElementById('high-score-display');
    if (highScoreElement) {
        highScoreElement.innerText = 'High Score: ' + highScore;
    }
    
    if (isNewHighScore) {
        createFloatingText('NEW HIGH SCORE! 🏆', canvas.width / 2, 100, '#FFD700');
    }
}

function congratulations() {
    gameState = 'gameover';
    stopBackgroundMusic();
    clearInterval(timerInterval);
    
    // Save high score
    const isNewHighScore = setHighScore(score);
    
    // Show congratulations screen
    document.getElementById('congratulations-screen').classList.remove('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('congrats-score').innerText = score;
    
    // Update high score display
    const highScore = getHighScore();
    document.getElementById('congrats-high-score-val').innerText = highScore;
    
    // Show "NEW HIGH SCORE!" if applicable
    if (isNewHighScore) {
        const elem = document.getElementById('congrats-high-score');
        elem.classList.add('ring-4', 'ring-yellow-500');
        playTone(523.25, 'sine', 0.3, 0.3);
        playTone(659.25, 'sine', 0.3, 0.3);
        playTone(783.99, 'sine', 0.3, 0.3);
    }
    
    // Start party animation
    startPartyAnimation();
}

function startPartyAnimation() {
    const partyCanvas = document.getElementById('party-canvas');
    if (!partyCanvas) return;
    
    const ctx = partyCanvas.getContext('2d');
    partyCanvas.width = window.innerWidth;
    partyCanvas.height = window.innerHeight;
    
    // Create confetti particles
    const particles = [];
    
    class Popper {
        constructor() {
            this.x = Math.random() * window.innerWidth;
            this.y = -20;
            this.vx = (Math.random() - 0.5) * 8;
            this.vy = Math.random() * 4 + 2;
            this.life = 1;
            this.decay = Math.random() * 0.01 + 0.008;
            this.size = Math.random() * 6 + 4;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.2;
            this.color = ['🎉', '🎊', '🎈', '⭐', '✨', '🌟'][Math.floor(Math.random() * 6)];
            this.gravity = 0.15;
        }
        
        update() {
            this.y += this.vy;
            this.x += this.vx;
            this.vy += this.gravity;
            this.life -= this.decay;
            this.rotation += this.rotationSpeed;
        }
        
        draw(ctx) {
            if (this.life <= 0) return;
            
            ctx.save();
            ctx.globalAlpha = this.life;
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.font = `${this.size * 2}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.color, 0, 0);
            ctx.restore();
        }
    }
    
    // Generate continuous poppers
    let popperCount = 0;
    const maxPoppers = 200;
    
    function animateParty() {
        ctx.clearRect(0, 0, partyCanvas.width, partyCanvas.height);
        
        // Add new poppers
        if (popperCount < maxPoppers) {
            for (let i = 0; i < 3; i++) {
                particles.push(new Popper());
                popperCount++;
            }
        }
        
        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw(ctx);
            
            if (particles[i].life <= 0) {
                particles.splice(i, 1);
            }
        }
        
        // Continue animation for 5 seconds
        if (popperCount < maxPoppers || particles.length > 0) {
            requestAnimationFrame(animateParty);
        }
    }
    
    animateParty();
}

function loadNextQuestion() {
    if (questions.length === 0) {
        questions = [...fallbackQuestions].sort(() => Math.random() - 0.5);
    }
    currentQ = questions.pop();
    
    const display = document.getElementById('expression-display');
    display.innerHTML = currentQ.expression.replace(/\*/g, '×').replace(/\//g, '÷');
    display.classList.remove('expr-highlight');
    display.style.color = 'white';

    targets = [];
    const opts = [...currentQ.options].sort(() => Math.random() - 0.5);
    const startY = canvas.height / 2 - (opts.length * 40);
    
    opts.forEach((opt, index) => {
        targets.push({
            x: canvas.width - 250,
            y: startY + (index * 90),
            width: 180,
            height: 60,
            text: opt.replace(/\*/g, '×').replace(/\//g, '÷'),
            rawText: opt,
            baseY: startY + (index * 90),
            offsetY: Math.random() * Math.PI * 2,
            hit: false
        });
    });

    // Reset timer for new question
    questionTimeLeft = 30;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (gameState === 'playing' || gameState === 'resolving') {
            questionTimeLeft--;
            updateUI();
            if (questionTimeLeft <= 0) gameOver("Time's Up!");
        }
    }, 1000);

    resetProjectile();
    gameState = 'playing';
}

function resetProjectile() {
    projectile.active = false;
    projectile.x = slingshot.x;
    projectile.y = slingshot.y;
    projectile.vx = 0;
    projectile.vy = 0;
}

function updateUI() {
    document.getElementById('score').innerText = score;
    document.getElementById('time').innerText = questionTimeLeft;
    document.getElementById('lives').innerText = '❤️'.repeat(lives) + '🖤'.repeat(3 - lives);
}

/** --- INPUT HANDLING --- */
function handleDown(e) {
    if (gameState !== 'playing') return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;

    const dist = Math.hypot(cx - slingshot.x, cy - slingshot.y);
    if (dist < 80 && !projectile.active) {
        slingshot.isDragging = true;
        mouse.downX = cx;
        mouse.downY = cy;
        mouse.x = cx;
        mouse.y = cy;
        playStretch();
    }
}

function handleMove(e) {
    if (!slingshot.isDragging) return;
    mouse.x = e.touches ? e.touches[0].clientX : e.clientX;
    mouse.y = e.touches ? e.touches[0].clientY : e.clientY;
}

function handleUp(e) {
    if (slingshot.isDragging) {
        slingshot.isDragging = false;
        
        let dx = slingshot.x - mouse.x;
        let dy = slingshot.y - mouse.y;
        
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_PULL) {
            dx = (dx / dist) * MAX_PULL;
            dy = (dy / dist) * MAX_PULL;
        }

        if (dist > 20) {
            projectile.active = true;
            projectile.x = slingshot.x - dx;
            projectile.y = slingshot.y - dy;
            projectile.vx = dx * POWER_MULTIPLIER;
            projectile.vy = dy * POWER_MULTIPLIER;
            playShoot();
        } else {
            resetProjectile();
        }
    }
}

window.addEventListener('mousedown', handleDown);
window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleUp);
window.addEventListener('touchstart', handleDown, {passive: false});
window.addEventListener('touchmove', handleMove, {passive: false});
window.addEventListener('touchend', handleUp);

/** --- LOGIC & PHYSICS --- */
function checkCollisions() {
    if (!projectile.active) return;

    if (projectile.y > canvas.height || projectile.x > canvas.width) {
        resetProjectile();
        return;
    }

    for (let t of targets) {
        if (!t.hit) {
            let testX = projectile.x;
            let testY = projectile.y;

            if (projectile.x < t.x) testX = t.x;
            else if (projectile.x > t.x + t.width) testX = t.x + t.width;
            if (projectile.y < t.y) testY = t.y;
            else if (projectile.y > t.y + t.height) testY = t.y + t.height;

            let distX = projectile.x - testX;
            let distY = projectile.y - testY;
            let distance = Math.sqrt((distX*distX) + (distY*distY));

            if (distance <= projectile.radius) {
                handleHit(t);
                break;
            }
        }
    }
}

function handleHit(target) {
    target.hit = true;
    projectile.active = false;

    if (target.rawText === currentQ.correctStep) {
        playCorrect();
        createExplosion(target.x + target.width/2, target.y + target.height/2, ['#fbbf24', '#34d399', '#3b82f6']);
        createFloatingText("+50", target.x, target.y - 20, '#34d399');
        
        score += 50;
        questionTimeLeft += 5;
        
        // Advance progress circle
        if (monkey.progressCircle < PROGRESS_CIRCLES - 1) {
            monkey.progressCircle++;
            progressBars[monkey.progressCircle].collected = true;
        }
        
        monkey.targetX += (canvas.width - 350) / 10;
        
        // Check if reached banana (all circles collected)
        if (monkey.progressCircle >= PROGRESS_CIRCLES - 1) {
            setTimeout(() => congratulations(), 2000);
        } else {
            solveVisual();
        }
    } else {
        playWrong();
        createExplosion(target.x + target.width/2, target.y + target.height/2, ['#ef4444', '#991b1b', '#000000']);
        createFloatingText("Oops!", target.x, target.y - 20, '#ef4444');
        triggerShake();
        
        lives--;
        updateUI();
        
        if (lives <= 0) {
            setTimeout(() => gameOver("No lives left!"), 1000);
        } else {
            resetProjectile();
        }
    }
}

function solveVisual() {
    gameState = 'resolving';
    
    let result = "";
    try {
        let cleanMath = currentQ.correctStep.replace(/[()]/g, '');
        result = eval(cleanMath);
    } catch (e) {
        result = "??";
    }

    const display = document.getElementById('expression-display');
    const displayStep = currentQ.correctStep.replace(/\*/g, '×').replace(/\//g, '÷');
    const regex = new RegExp(displayStep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    let newHtml = currentQ.expression.replace(/\*/g, '×').replace(/\//g, '÷')
        .replace(regex, `<span class="expr-block expr-highlight">${displayStep}</span>`);
    
    display.innerHTML = newHtml;

    setTimeout(() => {
        playPop();
        newHtml = currentQ.expression.replace(/\*/g, '×').replace(/\//g, '÷')
            .replace(regex, `<span class="text-green-400 font-black">${result}</span>`);
        display.innerHTML = newHtml;
        
        setTimeout(() => {
            loadNextQuestion();
        }, 1200);
    }, 1000);
}

function triggerShake() {
    const container = document.getElementById('game-container');
    container.classList.remove('shake');
    void container.offsetWidth;
    container.classList.add('shake');
}

function createExplosion(x, y, colors) {
    for(let i=0; i<30; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            life: 1.0,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4
        });
    }
}

function createFloatingText(txt, x, y, color) {
    floatingTexts.push({
        text: txt, x: x, y: y, life: 1.0, color: color
    });
}

/** --- RENDERING --- */
function drawSlingshot() {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(slingshot.x - 10, slingshot.y, 20, canvas.height - slingshot.y);
    
    ctx.beginPath();
    ctx.moveTo(slingshot.x, slingshot.y);
    ctx.lineTo(slingshot.x - 25, slingshot.y - 40);
    ctx.lineTo(slingshot.x - 15, slingshot.y - 40);
    ctx.lineTo(slingshot.x + 5, slingshot.y);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(slingshot.x, slingshot.y);
    ctx.lineTo(slingshot.x + 25, slingshot.y - 40);
    ctx.lineTo(slingshot.x + 15, slingshot.y - 40);
    ctx.lineTo(slingshot.x - 5, slingshot.y);
    ctx.fill();

    let px = slingshot.x;
    let py = slingshot.y - 20;

    if (slingshot.isDragging) {
        let dx = slingshot.x - mouse.x;
        let dy = slingshot.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_PULL) {
            dx = (dx / dist) * MAX_PULL;
            dy = (dy / dist) * MAX_PULL;
        }
        px = slingshot.x - dx;
        py = slingshot.y - dy;

        ctx.beginPath();
        ctx.setLineDash([10, 10]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        let tx = px;
        let ty = py;
        let tvx = dx * POWER_MULTIPLIER;
        let tvy = dy * POWER_MULTIPLIER;
        ctx.moveTo(tx, ty);
        for(let i=0; i<25; i++) {
            tx += tvx;
            ty += tvy;
            tvy += GRAVITY;
            ctx.lineTo(tx, ty);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.strokeStyle = '#381c00';
    ctx.lineWidth = 6;
    
    ctx.beginPath();
    ctx.moveTo(slingshot.x - 20, slingshot.y - 40);
    ctx.lineTo(px, py);
    ctx.stroke();

    if (!projectile.active) {
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(projectile.type, px, py);
    }

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(slingshot.x + 20, slingshot.y - 40);
    ctx.stroke();
}

function drawProgressBar() {
    // Draw progress circles at bottom
    progressBars.forEach(circle => {
        // Draw circle background
        ctx.fillStyle = circle.collected ? '#34d399' : '#cbd5e1';
        ctx.strokeStyle = circle.collected ? '#059669' : '#64748b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw circle number
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(circle.index + 1, circle.x, circle.y);
    });
    
    // Draw connecting line
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(progressBars[0].x, progressBars[0].y);
    for (let i = 1; i < progressBars.length; i++) {
        ctx.lineTo(progressBars[i].x, progressBars[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 100);
    ctx.quadraticCurveTo(canvas.width/2, canvas.height - 120, canvas.width, canvas.height - 80);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.fill();

    ctx.fillStyle = '#8B4513';
    ctx.fillRect(banana.x - 20, banana.y + 30, 80, canvas.height);
    
    ctx.font = '50px Arial';
    ctx.fillText('🍌', banana.x, banana.y);
    
    monkey.x += (monkey.targetX - monkey.x) * 0.1;
    ctx.fillText('🐵', monkey.x, monkey.y);

    drawSlingshot();

    if (projectile.active) {
        projectile.vy += GRAVITY;
        projectile.x += projectile.vx;
        projectile.y += projectile.vy;
        
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(projectile.x * 0.05);
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(projectile.type, 0, 0);
        ctx.restore();
        
        particles.push({
            x: projectile.x, y: projectile.y,
            vx: 0, vy: 0, life: 0.5, color: '#ffffff', size: 4
        });
    }

    targets.forEach(t => {
        if (t.hit) return;
        
        t.offsetY += 0.05;
        t.y = t.baseY + Math.sin(t.offsetY) * 10;

        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(t.x, t.y, t.width, t.height, 15);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.roundRect(t.x, t.y + t.height - 10, t.width, 10, {bl: 15, br: 15});
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px "Fredoka One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.text, t.x + t.width/2, t.y + t.height/2);
    });

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += GRAVITY * 0.5;
        p.life -= 0.02;
        
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
        
        if (p.life <= 0) particles.splice(i, 1);
    }
    ctx.globalAlpha = 1.0;

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y -= 1;
        ft.life -= 0.015;
        
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 36px "Fredoka One"';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
        
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
    ctx.globalAlpha = 1.0;

    // Draw progress bar
    drawProgressBar();
    
    checkCollisions();
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateHighScoreDisplay();
    // Check if gameState is still 'menu' and show main menu
    if (gameState === 'menu') {
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
    }
});
