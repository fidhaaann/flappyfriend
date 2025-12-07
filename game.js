const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1000 },
      debug: true // debugging turned off (set true if you want to see hitboxes)
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
let flapSound, deathSound;
let bgTile, base, ceiling;
let readyText, restartText;

// Difficulty / layout ratios
const BASE_HEIGHT_RATIO = 0.12;
const PLAYER_SCALE_RATIO = 0.09;
const PIPE_WIDTH_RATIO   = 0.10;
const PIPE_GAP_RATIO     = 0.35;
const FLAP_VELOCITY      = -350;
const PIPE_SPEED         = -200; // base speed

// Pipe spacing (horizontal) randomness in ms
const PIPE_DELAY_MIN = 1300;
const PIPE_DELAY_MAX = 1900;

// Game states
const STATE_READY   = 'READY';
const STATE_PLAYING = 'PLAYING';
const STATE_OVER    = 'OVER';
let gameState = STATE_READY;

// High score
let highScore = 0;

// ====== HELPERS: DIFFICULTY ======
function getDifficulty() {
  // Difficulty based on score. Caps to avoid becoming impossible.
  const level = Math.min(score, 30); // 0..30

  // Pipes get faster (more negative = faster to the left)
  const pipeSpeed = PIPE_SPEED - level * 5; // up to ~ -350

  // Gap shrinks a bit, but not too crazy
  const minGapRatio = 0.22;
  const gapRatio = Phaser.Math.Clamp(
    PIPE_GAP_RATIO - level * 0.005,
    minGapRatio,
    PIPE_GAP_RATIO
  );

  // Delay between pipes gets slightly shorter
  const minDelay = 800;
  const maxDelayMin = 1200;
  const delayMin = Phaser.Math.Clamp(PIPE_DELAY_MIN - level * 20, minDelay, PIPE_DELAY_MIN);
  const delayMax = Phaser.Math.Clamp(PIPE_DELAY_MAX - level * 20, maxDelayMin, PIPE_DELAY_MAX);

  return {
    pipeSpeed,
    gapRatio,
    delayMin,
    delayMax
  };
}

// ====== PRELOAD ======
function preload() {
  this.load.image('background', 'assets/background.png');
  this.load.image('player', 'assets/friend-head.png');
  this.load.image('pipe', 'assets/pipe.png');
  this.load.image('base', 'assets/base.png');

  this.load.audio('flap', 'assets/flap.mp3');
  this.load.audio('death', 'assets/death.mp3');
}

// ====== CREATE ======
function create() {
  // Reset base state
  score = 0;
  gameOver = false;
  gameState = STATE_READY;
  pipePairs = [];

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }

  // Load / init high score
  try {
    highScore = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
    if (isNaN(highScore)) highScore = 0;
  } catch (e) {
    highScore = 0;
  }

  flapSound = this.sound.add('flap');
  deathSound = this.sound.add('death');

  // Background
  bgTile = this.add.tileSprite(
    this.scale.width / 2,
    this.scale.height / 2,
    this.scale.width,
    this.scale.height,
    'background'
  );
  bgTile.setDepth(0);

  // Ground
  const baseHeight = Math.round(this.scale.height * BASE_HEIGHT_RATIO);
  base = this.add.tileSprite(
    this.scale.width / 2,
    this.scale.height - baseHeight / 2,
    this.scale.width,
    baseHeight,
    'base'
  );
  this.physics.add.existing(base, true);
  base.body.setSize(base.displayWidth, base.displayHeight, true);
  base.setDepth(2);

  // Ceiling (invisible)
  const ceilingHeight = 10;
  ceiling = this.add.rectangle(
    this.scale.width / 2,
    ceilingHeight / 2,
    this.scale.width,
    ceilingHeight,
    0x000000,
    0
  );
  this.physics.add.existing(ceiling, true);
  ceiling.setDepth(2);

  // Pipes group
  pipes = this.physics.add.group();

  // Player with custom image
  player = this.physics.add.sprite(
    this.scale.width / 4,
    this.scale.height / 2,
    'player'
  );

  // Scale player relative to screen height
  const pScale = (this.scale.height * PLAYER_SCALE_RATIO) / player.height;
  player.setScale(pScale);
  player.setOrigin(0.5, 0.5);
  player.setVisible(true);
  player.body.setAllowGravity(false); // no gravity until game starts
  player.setCollideWorldBounds(false);
  player.setDepth(10);

  // IMPORTANT: use displayWidth / displayHeight (scaled size) for hitbox
  player.body.setSize(player.displayWidth, player.displayHeight, true);

  // Initial rotation
  player.angle = 0;

  // Input handler for both READY / PLAYING / OVER
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

  // Score UI (centered)
  scoreText = this.add.text(
    this.scale.width / 2,
    this.scale.height * 0.08,
    '0',
    {
      fontSize: Math.round(this.scale.height * 0.08) + 'px',
      fontFamily: 'Arial',
      fill: '#fff',
      stroke: '#000',
      strokeThickness: 6
    }
  ).setOrigin(0.5);
  scoreText.setDepth(1000);

  // High score UI (top-right)
  highScoreText = this.add.text(
    this.scale.width * 0.95,
    this.scale.height * 0.03,
    `Best: ${highScore}`,
    {
      fontSize: Math.round(this.scale.height * 0.04) + 'px',
      fontFamily: 'Arial',
      fill: '#ff0',
      stroke: '#000',
      strokeThickness: 4
    }
  ).setOrigin(1, 0);
  highScoreText.setDepth(1000);

  // Ready text
  readyText = this.add.text(
    this.scale.width / 2,
    this.scale.height / 2,
    'Tap to Start',
    {
      fontSize: Math.round(this.scale.height * 0.06) + 'px',
      fill: '#fffb',
      stroke: '#000',
      strokeThickness: 4
    }
  ).setOrigin(0.5);
  readyText.setDepth(1001);

  // Gentle pulse effect for ready text
  this.tweens.add({
    targets: readyText,
    scaleX: 1.05,
    scaleY: 1.05,
    yoyo: true,
    repeat: -1,
    duration: 600,
    ease: 'Sine.easeInOut'
  });

  // NOTE: we do NOT spawn pipes yet; that happens when the player starts the game.
}

// ====== START GAME ======
function startGame() {
  if (gameState !== STATE_READY) return;

  gameState = STATE_PLAYING;
  gameOver = false;

  // Enable gravity and remove ready text
  player.body.setAllowGravity(true);
  if (readyText) {
    readyText.destroy();
    readyText = null;
  }

  // Spawn first pipes
  scheduleNextPipe.call(this);
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
    // Tiny idle bobbing for the player while waiting
    const bobAmplitude = 10;
    const bobSpeed = 0.003; // ms
    const t = this.time.now;
    player.y = this.scale.height / 2 + Math.sin(t * bobSpeed) * bobAmplitude;
    return;
  }

  if (gameState === STATE_OVER) {
    // After death, no more background scrolling or pipe movement changes
    return;
  }

  // PLAYING
  bgTile.tilePositionX += 2;
  base.tilePositionX += 2;

  // Tilt logic: slowly fall downwards angle
  player.angle = Phaser.Math.Clamp(player.angle + 2, -30, 90);
  // We DON'T rotate the physics body; Arcade uses AABB anyway.

  // Score + cleanup
  for (let i = pipePairs.length - 1; i >= 0; i--) {
    const pair = pipePairs[i];
    if (!pair || !pair.top || !pair.top.body) continue;

    const rightEdge = pair.top.body.x + pair.top.body.width;

    if (!pair.passed && rightEdge < player.x) {
      pair.passed = true;
      score++;
      scoreText.setText(score.toString());

      // Update high score live
      if (score > highScore) {
        highScore = score;
        highScoreText.setText(`Best: ${highScore}`);
      }
    }

    if (rightEdge < -200) {
      if (pair.top) pair.top.destroy();
      if (pair.bottom) pair.bottom.destroy();
      pipePairs.splice(i, 1);
    }
  }
}

// ====== FLAP ======
function flap() {
  if (gameState !== STATE_PLAYING) return;

  player.setVelocityY(FLAP_VELOCITY);
  player.angle = -25; // tilt up on flap

  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (flapSound) flapSound.play();

  // Mobile haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

// ====== CREATE PIPE PAIR ======
function addPipePair() {
  if (gameState !== STATE_PLAYING) return;

  const w = this.scale.width;
  const h = this.scale.height;
  const baseHeight = Math.round(h * BASE_HEIGHT_RATIO);

  const { gapRatio, pipeSpeed } = getDifficulty();
  const gap = Math.round(h * gapRatio);

  const minCenter = gap / 2 + 50;
  const maxCenter = h - baseHeight - gap / 2 - 50;
  const centerY = Phaser.Math.Between(
    minCenter,
    Math.max(minCenter + 1, maxCenter)
  );

  const pipeTexture = this.textures.get('pipe').getSourceImage();
  const pipeTexWidth = pipeTexture.width;

  const pipeScale = (w * PIPE_WIDTH_RATIO) / pipeTexWidth;
  const pipeWidth = pipeTexWidth * pipeScale;
  const spawnX = Math.round(w + pipeWidth / 2 + 30);

  // Top pipe (flipped, facing down)
  const topPipe = pipes.create(spawnX, centerY - gap / 2, 'pipe');
  topPipe.setOrigin(0.5, 1);
  topPipe.setScale(pipeScale);
  topPipe.setFlipY(true);
  topPipe.body.allowGravity = false;
  topPipe.setImmovable(true);
  topPipe.setVelocityX(pipeSpeed);
  topPipe.setDepth(5);

  // Bottom pipe (normal, facing up)
  const bottomPipe = pipes.create(spawnX, centerY + gap / 2, 'pipe');
  bottomPipe.setOrigin(0.5, 0);
  bottomPipe.setScale(pipeScale);
  bottomPipe.body.allowGravity = false;
  bottomPipe.setImmovable(true);
  bottomPipe.setVelocityX(pipeSpeed);
  bottomPipe.setDepth(5);

  pipePairs.push({ top: topPipe, bottom: bottomPipe, passed: false });
}

// ====== COLLISION HANDLER ======
function playerHit() {
  if (gameState === STATE_OVER) return;

  gameState = STATE_OVER;
  gameOver = true;

  player.setTint(0xff0000);
  player.setVelocity(0, 0);
  player.angle = 90;

  // Stop pipes
  pipes.getChildren().forEach(p => {
    if (p && p.body) {
      p.setVelocityX(0);
      p.body.immovable = true;
    }
  });

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }

  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (deathSound) deathSound.play();

  // Haptic buzz on death
  if (navigator.vibrate) {
    navigator.vibrate([80, 60, 80]);
  }

  // Camera shake
  this.cameras.main.shake(150, 0.01);

  // Save high score
  try {
    const stored = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
    if (isNaN(stored) || score > stored) {
      localStorage.setItem('flappyFriendHighScore', score.toString());
      highScoreText.setText(`Best: ${score}`);
    }
  } catch (e) {
    // ignore if storage not available
  }

  // Restart text with pulsing animation
  restartText = this.add.text(
    this.scale.width / 2,
    this.scale.height / 2,
    'Tap to Restart',
    {
      fontSize: Math.round(this.scale.height * 0.06) + 'px',
      fill: '#fffb',
      stroke: '#000',
      strokeThickness: 4
    }
  ).setOrigin(0.5);
  restartText.setDepth(1001);

  this.tweens.add({
    targets: restartText,
    scaleX: 1.1,
    scaleY: 1.1,
    yoyo: true,
    repeat: -1,
    duration: 500,
    ease: 'Sine.easeInOut'
  });
}

// ====== RESTART SCENE ======
function restartScene() {
  if (deathSound && deathSound.isPlaying) deathSound.stop();

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }
  if (pipes) pipes.clear(true, true);
  pipePairs = [];

  this.scene.restart();
}

// ====== HANDLE RESIZE ======
window.addEventListener('resize', () => {
  config.width = window.innerWidth;
  config.height = window.innerHeight;
  if (game && game.scale) game.scale.resize(config.width, config.height);
  if (game && game.scene && game.scene.scenes) {
    game.scene.scenes.forEach(s => {
      if (s && s.scene) s.scene.restart();
    });
  }
});
