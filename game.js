// ---- DEVICE DETECTION ----
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Set proper phone dimensions (standard smartphone aspect ratios)
const GAME_WIDTH  = 360;  // Better for phone vertical orientation
const GAME_HEIGHT = 640;  // Common phone height

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1200 },  // Slightly increased gravity
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

// Game objects
let player, pipes, pipePairs = [], pipeTimer;
let score = 0, scoreText, highScoreText;
let gameOver = false;
let flapSound, deathSound, scoreSound;
let bgImage, base, ceiling;
let readyText, restartText, gameOverImage;
let particles;

// Layout & physics ratios (based on virtual size)
const BASE_HEIGHT_RATIO     = IS_MOBILE ? 0.12 : 0.10;
const PLAYER_SCALE_RATIO    = 0.08;
const PIPE_WIDTH_RATIO      = 0.15;  // Wider pipes for better visibility
const PIPE_GAP_RATIO_BASE   = IS_MOBILE ? 0.38 : 0.35;
const FLAP_VELOCITY         = IS_MOBILE ? -400 : -380;
const PIPE_SPEED_BASE       = IS_MOBILE ? -200 : -220;

// Pipe spacing (horizontal) randomness in ms
const PIPE_DELAY_MIN_BASE = 1400;
const PIPE_DELAY_MAX_BASE = 2000;

// Game states
const STATE_READY   = 'READY';
const STATE_PLAYING = 'PLAYING';
const STATE_OVER    = 'OVER';
let gameState = STATE_READY;

// High score
let highScore = 0;

// Particle effects
let particleEmitter;

// New features
let coins = 0;
let coinText;
let coinSound;
let powerUpActive = false;
let powerUpTimer = null;
let backgroundMusic;
let isMuted = false;

// ====== HELPERS: DIFFICULTY ======
function getDifficulty() {
  const level = Math.min(score, 40); // Increased to 40
  
  // Progressive speed increase
  const pipeSpeed = PIPE_SPEED_BASE - level * 4.5;

  const minGapRatio = IS_MOBILE ? 0.26 : 0.24;
  const gapRatio = Phaser.Math.Clamp(
    PIPE_GAP_RATIO_BASE - level * 0.005,
    minGapRatio,
    PIPE_GAP_RATIO_BASE
  );

  // Faster pipe spawning as score increases
  const minDelay = 800;
  const maxDelayMin = 1100;
  const delayMin = Phaser.Math.Clamp(
    PIPE_DELAY_MIN_BASE - level * 18,
    minDelay,
    PIPE_DELAY_MIN_BASE
  );
  const delayMax = Phaser.Math.Clamp(
    PIPE_DELAY_MAX_BASE - level * 18,
    maxDelayMin,
    PIPE_DELAY_MAX_BASE
  );

  return {
    pipeSpeed,
    gapRatio,
    delayMin,
    delayMax
  };
}

// ====== PRELOAD ======
function preload() {
  this.load.image('background', 'assets/moon.jpg');
  this.load.image('player', 'assets/friend-head.png');
  this.load.image('pipe', 'assets/pipe.png');
  this.load.image('base', 'assets/base.png');
  this.load.image('gameover', 'assets/gameover.png');
  
  // Add this line for gameover image (uncomment when you have the file)

  
  // Add coin image for new feature
  this.load.image('coin', 'assets/coin.png');
  
  // Load particle image
  this.load.image('particle', 'assets/particle.png');

  this.load.audio('flap', 'assets/flap.mp3');
  this.load.audio('death', 'assets/death.mp3');
  this.load.audio('score', 'assets/score.mp3');
  this.load.audio('coin', 'assets/coin.mp3');
  
  // Add background music (optional)
  // this.load.audio('bgmusic', 'assets/background-music.mp3');
}

// ====== CREATE ======
function create() {
  score = 0;
  coins = 0;
  gameOver = false;
  gameState = STATE_READY;
  pipePairs = [];
  powerUpActive = false;

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }
  if (powerUpTimer) {
    powerUpTimer.remove(false);
    powerUpTimer = null;
  }

  // Load high score
  try {
    highScore = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
    if (isNaN(highScore)) highScore = 0;
    
    // Load coins
    coins = parseInt(localStorage.getItem('flappyFriendCoins') || '0', 10);
    if (isNaN(coins)) coins = 0;
  } catch (e) {
    highScore = 0;
    coins = 0;
  }

  // Initialize sounds
  flapSound = this.sound.add('flap');
  deathSound = this.sound.add('death');
  scoreSound = this.sound.add('score');
  coinSound = this.sound.add('coin');
  
  // Initialize background music (optional)
  // backgroundMusic = this.sound.add('bgmusic', { loop: true, volume: 0.3 });
  // if (!isMuted) backgroundMusic.play();

  // === PARALLAX BACKGROUND ===
  bgImage = this.add.image(
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    'background'
  );
  bgImage.displayWidth  = GAME_WIDTH * 1.2;
  bgImage.displayHeight = GAME_HEIGHT * 1.2;
  bgImage.setDepth(0);

  // Ground with parallax effect
  const baseHeight = Math.round(GAME_HEIGHT * BASE_HEIGHT_RATIO);
  base = this.add.tileSprite(
    GAME_WIDTH / 2,
    GAME_HEIGHT - baseHeight / 2,
    GAME_WIDTH,
    baseHeight,
    'base'
  );
  this.physics.add.existing(base, true);
  base.body.setSize(base.displayWidth, base.displayHeight, true);
  base.setDepth(2);

  // Ceiling (invisible)
  const ceilingHeight = 10;
  ceiling = this.add.rectangle(
    GAME_WIDTH / 2,
    ceilingHeight / 2,
    GAME_WIDTH,
    ceilingHeight,
    0x000000,
    0
  );
  this.physics.add.existing(ceiling, true);
  ceiling.setDepth(2);

  // Pipes group
  pipes = this.physics.add.group();

  // Create particle emitter for visual effects
  particleEmitter = this.add.particles('particle');
  particles = particleEmitter.createEmitter({
    speed: { min: 50, max: 150 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.5, end: 0 },
    blendMode: 'ADD',
    lifespan: 600,
    gravityY: 200,
    frequency: -1
  });
  particles.stop();

  // Player with custom image
  player = this.physics.add.sprite(
    GAME_WIDTH / 3,  // Moved slightly to the left
    GAME_HEIGHT / 2,
    'player'
  );

  const pScale = (GAME_HEIGHT * PLAYER_SCALE_RATIO) / player.height;
  player.setScale(pScale);
  player.setOrigin(0.5, 0.5);
  player.setVisible(true);
  player.body.setAllowGravity(false);
  player.setCollideWorldBounds(false);
  player.setDepth(10);

  // Collision box (slightly larger)
  const displayW = player.displayWidth;
  const displayH = player.displayHeight;
  player.body.setSize(displayW * 1.15, displayH * 1.15, true);

  player.angle = 0;

  // Input handler
  const handleInput = () => {
    if (gameState === STATE_READY) {
      startGame.call(this);
      flap();
    } else if (gameState === STATE_PLAYING) {
      flap();
    } else if (gameState === STATE_OVER) {
      restartScene.call(this);
    }
  };

  this.input.on('pointerdown', handleInput, this);
  this.input.keyboard.on('keydown-SPACE', handleInput, this);

  // Collisions
  this.physics.add.collider(player, pipes, playerHit, null, this);
  this.physics.add.collider(player, base, playerHit, null, this);
  this.physics.add.collider(player, ceiling, playerHit, null, this);

  // === UI TEXT ===

  // Score in top-centre with glow effect
  scoreText = this.add.text(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.08,
    '0',
    {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.055) + 'px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 8,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 4,
        stroke: true,
        fill: true
      }
    }
  ).setOrigin(0.5, 0.5);
  scoreText.setDepth(1000);

  // High score in top-left
  highScoreText = this.add.text(
    GAME_WIDTH * 0.03,
    GAME_HEIGHT * 0.02,
    `BEST: ${highScore}`,
    {
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.028) + 'px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 4
    }
  ).setOrigin(0, 0);
  highScoreText.setDepth(1000);

  // Coin counter in top-right
  coinText = this.add.text(
    GAME_WIDTH * 0.97,
    GAME_HEIGHT * 0.02,
    `🪙 ${coins}`,
    {
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.028) + 'px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 4
    }
  ).setOrigin(1, 0);
  coinText.setDepth(1000);

  // Ready text with better animation
  readyText = this.add.text(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.5,
    'TAP TO FLY!',
    {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.05) + 'px',
      color: '#4dffea',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 3,
        offsetY: 3,
        color: '#000000',
        blur: 5,
        stroke: true,
        fill: true
      }
    }
  ).setOrigin(0.5);
  readyText.setDepth(1001);

  // Pulse animation
  this.tweens.add({
    targets: readyText,
    scaleX: 1.1,
    scaleY: 1.1,
    alpha: 0.8,
    yoyo: true,
    repeat: -1,
    duration: 800,
    ease: 'Sine.easeInOut'
  });

  // Add instructional text
  const instruction = this.add.text(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.65,
    'Avoid pipes and collect coins!',
    {
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.025) + 'px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }
  ).setOrigin(0.5);
  instruction.setDepth(1001);
  
  // Fade out instruction after 5 seconds
  this.time.delayedCall(5000, () => {
    this.tweens.add({
      targets: instruction,
      alpha: 0,
      duration: 1000,
      onComplete: () => instruction.destroy()
    });
  });
}

// ====== START GAME ======
function startGame() {
  if (gameState !== STATE_READY) return;

  gameState = STATE_PLAYING;
  gameOver = false;

  player.body.setAllowGravity(true);
  if (readyText) {
    readyText.destroy();
    readyText = null;
  }

  // Start parallax effect
  this.tweens.add({
    targets: bgImage,
    x: GAME_WIDTH / 2 - 10,
    duration: 10000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });

  scheduleNextPipe.call(this);
  
  // Occasionally spawn coins
  this.time.addEvent({
    delay: 3000,
    callback: spawnCoin,
    callbackScope: this,
    loop: true
  });
}

// ====== PIPE SPAWNING ======
function scheduleNextPipe() {
  if (gameState !== STATE_PLAYING) return;

  const { delayMin, delayMax } = getDifficulty();
  const delay = Phaser.Math.Between(delayMin, delayMax);

  pipeTimer = this.time.addEvent({
    delay,
    callback: () => {
      if (gameState === STATE_PLAYING) {
        addPipePair.call(this);
        scheduleNextPipe.call(this);
      }
    },
    loop: false
  });
}

// ====== UPDATE LOOP ======
function update() {
  if (gameState === STATE_READY) {
    // Gentle floating animation
    const bobAmplitude = 15;
    const bobSpeed = 0.0025;
    const t = this.time.now;
    player.y = GAME_HEIGHT / 2 + Math.sin(t * bobSpeed) * bobAmplitude;
    player.angle = Math.sin(t * bobSpeed * 2) * 5; // Slight rotation
    return;
  }

  if (gameState === STATE_OVER) return;

  // PLAYING STATE
  
  // Parallax scrolling for ground (faster)
  base.tilePositionX += 3;

  // Player tilt based on velocity
  const velocityY = player.body.velocity.y;
  player.angle = Phaser.Math.Clamp(velocityY * 0.1, -30, 90);

  // Score update and cleanup
  for (let i = pipePairs.length - 1; i >= 0; i--) {
    const pair = pipePairs[i];
    if (!pair || !pair.top || !pair.top.body) continue;

    const rightEdge = pair.top.body.x + pair.top.body.width;

    if (!pair.passed && rightEdge < player.x) {
      pair.passed = true;
      score++;
      scoreText.setText(score.toString());
      
      // Score increase effect
      scoreText.setScale(1.2);
      this.tweens.add({
        targets: scoreText,
        scaleX: 1,
        scaleY: 1,
        duration: 200
      });

      if (score > highScore) {
        highScore = score;
        highScoreText.setText(`BEST: ${highScore}`);
        highScoreText.setColor('#00ff00');
        this.time.delayedCall(1000, () => {
          highScoreText.setColor('#ffd700');
        });
      }

      // Play score sound with pitch variation
      if (scoreSound) {
        scoreSound.play({ rate: 1 + (score % 10) * 0.05 });
      }

      // Spawn particles at player position
      particles.setPosition(player.x, player.y);
      particles.explode(5);

      spawnScorePopup.call(this, player.x, player.y - 40);
    }

    // Remove off-screen pipes
    if (rightEdge < -200) {
      if (pair.top) pair.top.destroy();
      if (pair.bottom) pair.bottom.destroy();
      pipePairs.splice(i, 1);
    }
  }
}

// ====== SCORE POPUP FEATURE ======
function spawnScorePopup(x, y) {
  const popup = this.add.text(
    x,
    y,
    '+1',
    {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.035) + 'px',
      color: '#00ffaa',
      stroke: '#000000',
      strokeThickness: 5,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 4
      }
    }
  ).setOrigin(0.5);
  popup.setDepth(1002);

  this.tweens.add({
    targets: popup,
    y: y - 60,
    alpha: 0,
    scaleX: 1.5,
    scaleY: 1.5,
    duration: 800,
    ease: 'Back.easeOut',
    onComplete: () => popup.destroy()
  });
}

// ====== FLAP ======
function flap() {
  if (gameState !== STATE_PLAYING) return;

  player.setVelocityY(FLAP_VELOCITY);
  player.angle = -25;

  // Wing flap particles
  particles.setPosition(player.x, player.y);
  particles.explode(3);

  if (flapSound) {
    if (flapSound.isPlaying) flapSound.stop();
    flapSound.play({ rate: 0.9 + Math.random() * 0.2 });
  }

  // Screen shake on strong flap
  if (player.body.velocity.y < -500) {
    this.cameras.main.shake(50, 0.005);
  }

  if (navigator.vibrate) {
    navigator.vibrate(20);
  }
}

// ====== CREATE PIPE PAIR WITH VISUAL VARIETY ======
function addPipePair() {
  if (gameState !== STATE_PLAYING) return;

  const w = GAME_WIDTH;
  const h = GAME_HEIGHT;
  const baseHeight = Math.round(h * BASE_HEIGHT_RATIO);

  const { gapRatio, pipeSpeed } = getDifficulty();
  const gap = Math.round(h * gapRatio);

  const minCenter = gap / 2 + 60;
  const maxCenter = h - baseHeight - gap / 2 - 60;
  const centerY = Phaser.Math.Between(minCenter, maxCenter);

  const pipePixelWidth = w * PIPE_WIDTH_RATIO;

  // Random pipe color tint (subtle variation)
  const tint = Phaser.Math.Between(0x88ff88, 0xaaffaa);

  // ---- TOP PIPE ----
  const topHeight = centerY - gap / 2;
  const topPipe = pipes.create(
    w + pipePixelWidth / 2,
    topHeight,
    'pipe'
  );
  topPipe.setOrigin(0.5, 1);
  topPipe.setFlipY(true);
  topPipe.displayWidth = pipePixelWidth;
  topPipe.displayHeight = topHeight;
  topPipe.setTint(tint);
  topPipe.body.allowGravity = false;
  topPipe.setImmovable(true);
  topPipe.setVelocityX(pipeSpeed);
  topPipe.setDepth(5);
  topPipe.body.setSize(topPipe.displayWidth, topPipe.displayHeight, true);

  // ---- BOTTOM PIPE ----
  const bottomHeight = (h - baseHeight) - (centerY + gap / 2);
  const bottomPipe = pipes.create(
    w + pipePixelWidth / 2,
    centerY + gap / 2,
    'pipe'
  );
  bottomPipe.setOrigin(0.5, 0);
  bottomPipe.displayWidth = pipePixelWidth;
  bottomPipe.displayHeight = bottomHeight;
  bottomPipe.setTint(tint);
  bottomPipe.body.allowGravity = false;
  bottomPipe.setImmovable(true);
  bottomPipe.setVelocityX(pipeSpeed);
  bottomPipe.setDepth(5);
  bottomPipe.body.setSize(bottomPipe.displayWidth, bottomPipe.displayHeight, true);

  pipePairs.push({ top: topPipe, bottom: bottomPipe, passed: false });
  
  // Add occasional moving pipes (every 5th pipe)
  if (pipePairs.length % 5 === 0) {
    const moveSpeed = 100;
    const moveTween = this.tweens.add({
      targets: [topPipe, bottomPipe],
      y: '+=50',
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    
    // Store tween reference for cleanup
    topPipe.moveTween = moveTween;
    bottomPipe.moveTween = moveTween;
  }
}

// ====== SPAWN COIN ======
function spawnCoin() {
  if (gameState !== STATE_PLAYING || Math.random() < 0.7) return;
  
  const coin = this.physics.add.sprite(
    GAME_WIDTH + 50,
    Phaser.Math.Between(100, GAME_HEIGHT - 100),
    'coin'
  );
  
  const coinScale = (GAME_HEIGHT * 0.03) / coin.height;
  coin.setScale(coinScale);
  coin.setDepth(6);
  coin.setVelocityX(-180);
  
  // Rotating animation
  this.tweens.add({
    targets: coin,
    angle: 360,
    duration: 2000,
    repeat: -1,
    ease: 'Linear'
  });
  
  // Floating animation
  this.tweens.add({
    targets: coin,
    y: '+=30',
    duration: 1500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  });
  
  // Collision with player
  this.physics.add.overlap(player, coin, (playerObj, coinObj) => {
    collectCoin.call(this, coinObj);
  }, null, this);
  
  // Auto-remove off-screen coins
  this.time.delayedCall(8000, () => {
    if (coin.active) coin.destroy();
  });
}

// ====== COLLECT COIN ======
function collectCoin(coin) {
  if (!coin.active) return;
  
  coins++;
  coinText.setText(`🪙 ${coins}`);
  
  // Coin collection effect
  coinSound.play();
  
  particles.setPosition(coin.x, coin.y);
  particles.explode(10);
  
  // Coin text animation
  coinText.setScale(1.3);
  this.tweens.add({
    targets: coinText,
    scaleX: 1,
    scaleY: 1,
    duration: 300
  });
  
  // Save coins
  try {
    localStorage.setItem('flappyFriendCoins', coins.toString());
  } catch (e) {
    // Ignore storage errors
  }
  
  coin.destroy();
  
  // Occasionally activate power-up
  if (coins % 5 === 0 && !powerUpActive) {
    activatePowerUp.call(this);
  }
}

// ====== ACTIVATE POWER-UP ======
function activatePowerUp() {
  if (powerUpActive) return;
  
  powerUpActive = true;
  
  // Shield visual effect
  const shield = this.add.circle(player.x, player.y, player.displayWidth * 0.8, 0x00ffff, 0.3);
  shield.setStrokeStyle(3, 0x00ffff);
  shield.setDepth(9);
  
  // Flash player
  player.setTint(0x00ffff);
  
  // Power-up lasts 8 seconds
  powerUpTimer = this.time.delayedCall(8000, () => {
    powerUpActive = false;
    player.clearTint();
    shield.destroy();
  });
  
  // Attach shield to player
  this.tweens.add({
    targets: shield,
    scaleX: 1.2,
    scaleY: 1.2,
    alpha: 0.5,
    yoyo: true,
    repeat: -1,
    duration: 1000,
    ease: 'Sine.easeInOut'
  });
  
  // Update shield position in update loop
  shield.followPlayer = true;
  
  // Add to update tracking
  if (!this.customObjects) this.customObjects = [];
  this.customObjects.push(shield);
}

// ====== COLLISION HANDLER ======
function playerHit(playerObj, obstacle) {
  if (gameState === STATE_OVER || powerUpActive) return;
  
  gameState = STATE_OVER;
  gameOver = true;

  // Visual feedback
  player.setTint(0xff0000);
  player.setVelocity(0, 0);
  player.angle = 90;
  
  // Stop all pipe movement
  pipes.getChildren().forEach(p => {
    if (p && p.body) {
      p.setVelocityX(0);
      p.body.immovable = true;
      if (p.moveTween) p.moveTween.stop();
    }
  });

  // Stop timers
  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }
  if (powerUpTimer) {
    powerUpTimer.remove(false);
    powerUpTimer = null;
  }

  // Sound effects
  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (deathSound) {
    deathSound.play({ rate: 0.8 + Math.random() * 0.4 });
  }
  
  // Stop background music
  // if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();

  // Vibration pattern
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }

  // Camera effects
  this.cameras.main.shake(200, 0.015);
  this.cameras.main.flash(300, 255, 0, 0, 0.3);

  // Death particles
  particles.setPosition(player.x, player.y);
  particles.explode(20);

  // Save high score
  try {
    const stored = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
    if (isNaN(stored) || score > stored) {
      localStorage.setItem('flappyFriendHighScore', score.toString());
      highScoreText.setText(`BEST: ${score}`);
      highScoreText.setColor('#00ff00');
    }
    
    // Save coins
    localStorage.setItem('flappyFriendCoins', coins.toString());
  } catch (e) {
    // ignore if storage not available
  }

  // Add gameover image (uncomment when you have the file)
  /*
  gameOverImage = this.add.image(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.4,
    'gameover'
  );
  const imgScale = Math.min(
    (GAME_WIDTH * 0.8) / gameOverImage.width,
    (GAME_HEIGHT * 0.3) / gameOverImage.height
  );
  gameOverImage.setScale(imgScale);
  gameOverImage.setDepth(1002);
  gameOverImage.setAlpha(0);
  
  this.tweens.add({
    targets: gameOverImage,
    alpha: 1,
    y: GAME_HEIGHT * 0.35,
    duration: 800,
    ease: 'Back.easeOut'
  });
  */

  // Final score display
  const finalScoreText = this.add.text(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.45,
    `Score: ${score}\nCoins: ${coins}`,
    {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.04) + 'px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
      lineSpacing: 10
    }
  ).setOrigin(0.5);
  finalScoreText.setDepth(1002);
  finalScoreText.setAlpha(0);
  
  this.tweens.add({
    targets: finalScoreText,
    alpha: 1,
    y: GAME_HEIGHT * 0.43,
    duration: 800,
    delay: 300,
    ease: 'Back.easeOut'
  });

  // Restart text
  restartText = this.add.text(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.6,
    'TAP TO PLAY AGAIN',
    {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: Math.round(GAME_HEIGHT * 0.04) + 'px',
      color: '#4dffea',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 4
      }
    }
  ).setOrigin(0.5);
  restartText.setDepth(1001);
  restartText.setAlpha(0);
  
  this.tweens.add({
    targets: restartText,
    alpha: 1,
    y: GAME_HEIGHT * 0.58,
    duration: 800,
    delay: 600,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Add pulsing animation
      this.tweens.add({
        targets: restartText,
        scaleX: 1.1,
        scaleY: 1.1,
        alpha: 0.9,
        yoyo: true,
        repeat: -1,
        duration: 700,
        ease: 'Sine.easeInOut'
      });
    }
  });
}

// ====== RESTART SCENE ======
function restartScene() {
  // Clean up sounds
  if (deathSound && deathSound.isPlaying) deathSound.stop();
  // if (backgroundMusic && backgroundMusic.isPlaying) backgroundMusic.stop();

  // Clean up timers
  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }
  if (powerUpTimer) {
    powerUpTimer.remove(false);
    powerUpTimer = null;
  }
  
  // Clean up particles
  particles.stop();
  
  // Clean up custom objects
  if (this.customObjects) {
    this.customObjects.forEach(obj => {
      if (obj && obj.destroy) obj.destroy();
    });
    this.customObjects = [];
  }

  // Clear pipes and coins
  if (pipes) pipes.clear(true, true);
  pipePairs = [];
  
  // Find and destroy all coins
  this.children.list.forEach(child => {
    if (child.texture && child.texture.key === 'coin') {
      child.destroy();
    }
  });

  // Restart scene
  this.scene.restart();
}