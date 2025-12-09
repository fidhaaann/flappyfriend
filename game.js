// ---- DEVICE DETECTION ----
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Set proper phone dimensions
const GAME_WIDTH = 360;
const GAME_HEIGHT = 640;

const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 900 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container'
    },
    scene: { preload, create, update }
};

const game = new Phaser.Game(config);

// Game objects
let player, pipes, pipePairs = [], pipeTimer;
let score = 0, scoreText, highScoreText, bestScoreText;
let gameOver = false;
let flapSound, hitSound, scoreSound;
let bgImage, base, ceiling;
let readyText, restartText, gameOverImage;
let gameState = 'READY';
let highScore = 0;

// Proper Flappy Bird physics values
const FLAP_VELOCITY = -300;
const PIPE_SPEED = -180;
const PIPE_GAP = 140;
const PIPE_SPAWN_DELAY = 1500;

// Layout ratios
const BASE_HEIGHT = 80;
const PLAYER_SIZE = 40;

// Google Fonts
const FONT_FAMILY = "'Press Start 2P', 'Courier New', monospace";
const FONT_FAMILY_READABLE = "'Segoe UI', 'Roboto', 'Arial', sans-serif";

// ====== PRELOAD ======
function preload() {
    // Show loading progress
    console.log('Preloading assets...');
    
    // Load fonts
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Load images
    this.load.image('background', 'assets/moon.jpg');
    this.load.image('player', 'assets/friend-head.png');
    this.load.image('pipe', 'assets/pipe.png');
    this.load.image('base', 'assets/base.png');
    this.load.image('gameover', 'assets/gameover.png');

    // Load sounds
    this.load.audio('flap', 'assets/flap.mp3');
    this.load.audio('hit', 'assets/death.mp3');
    this.load.audio('score', 'assets/score.mp3');
}

// ====== CREATE ======
function create() {
    console.log('Game create() function called');
    
    // Hide the loading screen immediately when game starts
    if (typeof window.hideGameLoading === 'function') {
        window.hideGameLoading();
    }
    
    // Reset game state
    score = 0;
    gameOver = false;
    gameState = 'READY';
    pipePairs = [];

    // Clear previous timer
    if (pipeTimer) {
        pipeTimer.remove(false);
        pipeTimer = null;
    }

    // Load high score
    try {
        highScore = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
        if (isNaN(highScore)) highScore = 0;
    } catch (e) {
        highScore = 0;
    }

    // Initialize sounds
    flapSound = this.sound.add('flap', { volume: 0.5 });
    hitSound = this.sound.add('hit', { volume: 0.7 });
    scoreSound = this.sound.add('score', { volume: 0.4 });

    // === BACKGROUND ===
    // Simple solid color background (reliable)
    this.cameras.main.setBackgroundColor(0x87CEEB);
    
    // Add some decorative clouds
    for (let i = 0; i < 4; i++) {
        const cloud = this.add.circle(
            Phaser.Math.Between(0, GAME_WIDTH),
            Phaser.Math.Between(50, GAME_HEIGHT - 200),
            Phaser.Math.Between(20, 35),
            0xFFFFFF,
            0.4
        );
        cloud.setDepth(0);
    }

    // Ground
    base = this.add.tileSprite(
        0,
        GAME_HEIGHT - BASE_HEIGHT / 2,
        GAME_WIDTH * 2,
        BASE_HEIGHT,
        'base'
    );
    base.setOrigin(0, 0.5);
    this.physics.add.existing(base, true);
    base.body.setSize(base.displayWidth, BASE_HEIGHT, true);
    base.setDepth(3);

    // Ceiling (invisible collision)
    ceiling = this.add.rectangle(
        GAME_WIDTH / 2,
        20,
        GAME_WIDTH,
        40,
        0x000000,
        0
    );
    this.physics.add.existing(ceiling, true);
    ceiling.setDepth(1);

    // Pipes group
    pipes = this.physics.add.group();

    // === PLAYER ===
    player = this.physics.add.sprite(
        GAME_WIDTH / 3,
        GAME_HEIGHT / 2,
        'player'
    );

    // Scale player properly
    const playerScale = PLAYER_SIZE / player.width;
    player.setScale(playerScale);
    player.setOrigin(0.5, 0.5);
    player.body.setAllowGravity(false);
    player.setCollideWorldBounds(false);
    player.setDepth(10);
    
    // Set collision box
    player.body.setSize(player.displayWidth * 0.8, player.displayHeight * 0.8, true);

    // === INPUT HANDLING ===
    const handleInput = () => {
        switch (gameState) {
            case 'READY':
                startGame.call(this);
                flap();
                break;
            case 'PLAYING':
                flap();
                break;
            case 'OVER':
                restartScene.call(this);
                break;
        }
    };

    this.input.on('pointerdown', handleInput, this);
    this.input.keyboard.on('keydown-SPACE', handleInput, this);
    this.input.keyboard.on('keydown-UP', handleInput, this);
    this.input.keyboard.on('keydown-W', handleInput, this);

    // === COLLISIONS ===
    this.physics.add.collider(player, pipes, playerHit, null, this);
    this.physics.add.collider(player, base, playerHit, null, this);
    this.physics.add.collider(player, ceiling, playerHit, null, this);

    // === UI ELEMENTS ===

    // Score display
    scoreText = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.1,
        '0',
        {
            fontFamily: FONT_FAMILY,
            fontSize: '42px',
            color: '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 8
        }
    ).setOrigin(0.5, 0.5);
    scoreText.setDepth(1000);

    // Best score
    bestScoreText = this.add.text(
        20,
        20,
        `BEST\n${highScore}`,
        {
            fontFamily: FONT_FAMILY,
            fontSize: '14px',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
            lineSpacing: 6
        }
    ).setOrigin(0, 0);
    bestScoreText.setDepth(1000);

    // Ready screen
    readyText = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.5,
        'TAP TO START',
        {
            fontFamily: FONT_FAMILY,
            fontSize: '24px',
            color: '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 5
        }
    ).setOrigin(0.5);
    readyText.setDepth(1001);

    

    // Pulse animation for ready text
    this.tweens.add({
        targets: readyText,
        scaleX: 1.1,
        scaleY: 1.1,
        alpha: 0.7,
        yoyo: true,
        repeat: -1,
        duration: 800,
        ease: 'Sine.easeInOut'
    });
}

// ====== START GAME ======
function startGame() {
    if (gameState !== 'READY') return;

    gameState = 'PLAYING';
    gameOver = false;

    // Enable gravity
    player.body.setAllowGravity(true);
    
    // Remove ready screen elements
    this.children.list.forEach(child => {
        if (child === readyText || child.text === 'FLAPPY FRIEND') {
            child.destroy();
        }
    });

    // Start spawning pipes
    pipeTimer = this.time.addEvent({
        delay: PIPE_SPAWN_DELAY,
        callback: addPipePair,
        callbackScope: this,
        loop: true
    });
}

// ====== UPDATE LOOP ======
function update() {
    // Ready state animation
    if (gameState === 'READY') {
        const bobAmplitude = 8;
        const bobSpeed = 0.003;
        const t = this.time.now;
        player.y = GAME_HEIGHT / 2 + Math.sin(t * bobSpeed) * bobAmplitude;
        player.angle = Math.sin(t * bobSpeed * 1.5) * 10;
        return;
    }

    // Don't update if game over
    if (gameState === 'OVER') return;

    // PLAYING STATE

    // Move ground
    base.tilePositionX += 2;

    // Rotate player based on velocity
    const velocityY = player.body.velocity.y;
    player.angle = Phaser.Math.Clamp(velocityY * 0.15, -30, 90);

    // Check for passed pipes and update score
    for (let i = pipePairs.length - 1; i >= 0; i--) {
        const pair = pipePairs[i];
        if (!pair || !pair.top || !pair.top.body) continue;

        const rightEdge = pair.top.body.x + pair.top.body.width / 2;

        // Score when player passes the pipe
        if (!pair.passed && rightEdge < player.x) {
            pair.passed = true;
            score++;
            scoreText.setText(score.toString());
            
            // Score animation
            scoreText.setScale(1.3);
            this.tweens.add({
                targets: scoreText,
                scaleX: 1,
                scaleY: 1,
                duration: 150,
                ease: 'Back.easeOut'
            });

            // Update high score
            if (score > highScore) {
                highScore = score;
                bestScoreText.setText(`BEST\n${highScore}`);
                bestScoreText.setColor('#00FF00');
                this.time.delayedCall(1000, () => {
                    bestScoreText.setColor('#FFD700');
                });
            }

            // Play score sound
            if (scoreSound) {
                scoreSound.play();
            }
        }

        // Remove off-screen pipes
        if (rightEdge < -100) {
            if (pair.top) pair.top.destroy();
            if (pair.bottom) pair.bottom.destroy();
            pipePairs.splice(i, 1);
        }
    }
}

// ====== FLAP ======
function flap() {
    if (gameState !== 'PLAYING') return;

    // Apply flap force
    player.setVelocityY(FLAP_VELOCITY);
    player.angle = -20;

    // Play flap sound
    if (flapSound) {
        flapSound.play();
    }

    // Mobile vibration
    if (IS_MOBILE && navigator.vibrate) {
        navigator.vibrate(30);
    }
}

// ====== CREATE PIPE PAIR ======
function addPipePair() {
    if (gameState !== 'PLAYING') return;

    const pipeWidth = 65;
    const gapCenterY = Phaser.Math.Between(150, GAME_HEIGHT - BASE_HEIGHT - 150);
    
    // Calculate positions
    const topPipeY = gapCenterY - PIPE_GAP / 2;
    const bottomPipeY = gapCenterY + PIPE_GAP / 2;

    // ---- TOP PIPE ----
    const topPipe = pipes.create(
        GAME_WIDTH + pipeWidth / 2,
        topPipeY,
        'pipe'
    );
    topPipe.setOrigin(0.5, 1);
    topPipe.setFlipY(true);
    topPipe.displayWidth = pipeWidth;
    topPipe.displayHeight = topPipeY;
    topPipe.body.allowGravity = false;
    topPipe.setImmovable(true);
    topPipe.setVelocityX(PIPE_SPEED);
    topPipe.setDepth(5);

    // ---- BOTTOM PIPE ----
    const bottomPipe = pipes.create(
        GAME_WIDTH + pipeWidth / 2,
        bottomPipeY,
        'pipe'
    );
    bottomPipe.setOrigin(0.5, 0);
    bottomPipe.displayWidth = pipeWidth;
    bottomPipe.displayHeight = GAME_HEIGHT - bottomPipeY - BASE_HEIGHT;
    bottomPipe.body.allowGravity = false;
    bottomPipe.setImmovable(true);
    bottomPipe.setVelocityX(PIPE_SPEED);
    bottomPipe.setDepth(5);

    pipePairs.push({
        top: topPipe,
        bottom: bottomPipe,
        passed: false
    });
}

// ====== COLLISION HANDLER ======
function playerHit(playerObj, obstacle) {
    if (gameState === 'OVER') return;

    gameState = 'OVER';
    gameOver = true;

    // Visual feedback
    player.setTint(0xFF5555);
    player.setVelocity(0, 0);
    player.angle = 90;
    
    // Stop all pipe movement
    pipes.getChildren().forEach(p => {
        if (p && p.body) {
            p.setVelocityX(0);
        }
    });

    // Stop pipe timer
    if (pipeTimer) {
        pipeTimer.remove(false);
        pipeTimer = null;
    }

    // Stop sounds
    if (flapSound && flapSound.isPlaying) flapSound.stop();
    if (hitSound) {
        hitSound.play();
    }

    // Vibration on mobile
    if (IS_MOBILE && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }

    // Screen shake
    this.cameras.main.shake(200, 0.01);

    // Save high score
    try {
        const stored = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
        if (score > stored) {
            localStorage.setItem('flappyFriendHighScore', score.toString());
        }
    } catch (e) {
        console.log('Could not save high score:', e);
    }

    // Game over image
    gameOverImage = this.add.image(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.35,
        'gameover'
    );
    
    // Scale image properly
    const maxWidth = GAME_WIDTH * 0.8;
    const maxHeight = GAME_HEIGHT * 0.25;
    const scale = Math.min(maxWidth / gameOverImage.width, maxHeight / gameOverImage.height);
    gameOverImage.setScale(scale);
    gameOverImage.setDepth(1002);

    // Score display
    const scoreDisplay = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.5,
        `SCORE: ${score}`,
        {
            fontFamily: FONT_FAMILY,
            fontSize: '24px',
            color: '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center'
        }
    ).setOrigin(0.5, 0.5);
    scoreDisplay.setDepth(1002);

    // Best score display
    const bestDisplay = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.55,
        `BEST: ${highScore}`,
        {
            fontFamily: FONT_FAMILY,
            fontSize: '20px',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 3,
            align: 'center'
        }
    ).setOrigin(0.5, 0.5);
    bestDisplay.setDepth(1002);

    // Restart text
    restartText = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.65,
        'TAP TO PLAY AGAIN',
        {
            fontFamily: FONT_FAMILY,
            fontSize: '20px',
            color: '#ffffffff',
            stroke: '#ffd900ff',
            strokeThickness: 4,
            align: 'center'
        }
    ).setOrigin(0.5, 0.5);
    restartText.setDepth(1002);

    // Add pulsing animation to restart text
    this.tweens.add({
        targets: restartText,
        scaleX: 1.05,
        scaleY: 1.05,
        alpha: 0.8,
        yoyo: true,
        repeat: -1,
        duration: 700,
        ease: 'Sine.easeInOut',
        delay: 500
    });
}

// ====== RESTART SCENE ======
function restartScene() {
    // Clean up sounds
    if (hitSound && hitSound.isPlaying) hitSound.stop();

    // Clean up timer
    if (pipeTimer) {
        pipeTimer.remove(false);
        pipeTimer = null;
    }

    // Clear pipes
    if (pipes) pipes.clear(true, true);
    
    // Destroy game over elements
    this.children.list.forEach(child => {
        if (child === gameOverImage || 
            child.text === 'TAP TO PLAY AGAIN' ||
            child.text === `SCORE: ${score}` ||
            child.text === `BEST: ${highScore}`) {
            child.destroy();
        }
    });

    pipePairs = [];

    // Restart scene
    this.scene.restart();
}