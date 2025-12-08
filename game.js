// ---- DEVICE DETECTION ----
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// initial canvas size = visible browser size
const INITIAL_WIDTH  = window.innerWidth  || 540;
const INITIAL_HEIGHT = window.innerHeight || 960;

const config = {
  type: Phaser.AUTO,
  width: INITIAL_WIDTH,
  height: INITIAL_HEIGHT,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1000 },
      debug: false // set true if you want to see hitboxes
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
let bgImage, base, ceiling;
let readyText, restartText;

// Layout & physics ratios (based on current height)
const BASE_HEIGHT_RATIO     = IS_MOBILE ? 0.14 : 0.12;
const PLAYER_SCALE_RATIO    = 0.09;
const PIPE_WIDTH_RATIO      = 0.10;
const PIPE_GAP_RATIO_BASE   = IS_MOBILE ? 0.42 : 0.35;
const FLAP_VELOCITY         = IS_MOBILE ? -420 : -350;
const PIPE_SPEED_BASE       = IS_MOBILE ? -180 : -200;

// Pipe spacing (horizontal) randomness in ms
const PIPE_DELAY_MIN_BASE = 1300;
const PIPE_DELAY_MAX_BASE = 1900;

// Game states
const STATE_READY   = 'READY';
const STATE_PLAYING = 'PLAYING';
const STATE_OVER    = 'OVER';
let gameState = STATE_READY;

// High score
let highScore = 0;

// ====== HELPERS: DIFFICULTY ======
function getDifficulty() {
  const level = Math.min(score, 30); // 0..30

  const pipeSpeed = PIPE_SPEED_BASE - level * 5;

  const minGapRatio = IS_MOBILE ? 0.28 : 0.24;
  const gapRatio = Phaser.Math.Clamp(
    PIPE_GAP_RATIO_BASE - level * 0.004,
    minGapRatio,
    PIPE_GAP_RATIO_BASE
  );

  const minDelay = 850;
  const maxDelayMin = 1200;
  const delayMin = Phaser.Math.Clamp(
    PIPE_DELAY_MIN_BASE - level * 15,
    minDelay,
    PIPE_DELAY_MIN_BASE
  );
  const delayMax = Phaser.Math.Clamp(
    PIPE_DELAY_MAX_BASE - level * 15,
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

  this.load.audio('flap', 'assets/flap.mp3');
  this.load.audio('death', 'assets/death.mp3');
}

// ====== CREATE ======
function create() {
  score = 0;
  gameOver = false;
  gameState = STATE_READY;
  pipePairs = [];

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }

  // pull current canvas size (this changes on resize)
  const W = this.scale.width;
  const H = this.scale.height;

  // Load / init high score
  try {
    highScore = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
    if (isNaN(highScore)) highScore = 0;
  } catch (e) {
    highScore = 0;
  }

  flapSound = this.sound.add('flap');
  deathSound = this.sound.add('death');

  // === STATIC BACKGROUND ===
  bgImage = this.add.image(W / 2, H / 2, 'background');
  bgImage.displayWidth  = W;
  bgImage.displayHeight = H;
  bgImage.setDepth(0);

  // Ground
  const baseHeight = Math.round(H * BASE_HEIGHT_RATIO);
  base = this.add.tileSprite(
    W / 2,
    H - baseHeight / 2,
    W,
    baseHeight,
    'base'
  );
  this.physics.add.existing(base, true);
  base.body.setSize(base.displayWidth, base.displayHeight, true);
  base.setDepth(2);

  // Ceiling (invisible)
  const ceilingHeight = 10;
  ceiling = this.add.rectangle(
    W / 2,
    ceilingHeight / 2,
    W,
    ceilingHeight,
    0x000000,
    0
  );
  this.physics.add.existing(ceiling, true);
  ceiling.setDepth(2);

  // Pipes group
  pipes = this.physics.add.group();

  // Player
  player = this.physics.add.sprite(
    W / 4,
    H / 2,
    'player'
  );

  const pScale = (H * PLAYER_SCALE_RATIO) / player.height;
  player.setScale(pScale);
  player.setOrigin(0.5, 0.5);
  player.setVisible(true);
  player.body.setAllowGravity(false); // until start
  player.setCollideWorldBounds(false);
  player.setDepth(10);

  const displayW = player.displayWidth;
  const displayH = player.displayHeight;
  player.body.setSize(displayW * 1.2, displayH * 1.2, true);
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

  // === UI TEXT (aligned for phones) ===

  // Score in top-centre
  scoreText = this.add.text(
    W / 2,
    H * 0.06,
    '0',
    {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: Math.round(H * 0.05) + 'px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6
    }
  ).setOrigin(0.5, 0.5);
  scoreText.setDepth(1000);

  // High score in top-left
  highScoreText = this.add.text(
    W * 0.03,
    H * 0.02,
    `BEST: ${highScore}`,
    {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: Math.round(H * 0.03) + 'px',
      color: '#ffeb3b',
      stroke: '#000000',
      strokeThickness: 5
    }
  ).setOrigin(0, 0);
  highScoreText.setDepth(1000);

  // Ready text
  readyText = this.add.text(
    W / 2,
    H * 0.5,
    'TAP TO START',
    {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: Math.round(H * 0.045) + 'px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6
    }
  ).setOrigin(0.5);
  readyText.setDepth(1001);

  this.tweens.add({
    targets: readyText,
    scaleX: 1.05,
    scaleY: 1.05,
    yoyo: true,
    repeat: -1,
    duration: 600,
    ease: 'Sine.easeInOut'
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
  const H = this.scale.height;

  if (gameState === STATE_READY) {
    const bobAmplitude = 10;
    const bobSpeed = 0.003;
    const t = this.time.now;
    player.y = H / 2 + Math.sin(t * bobSpeed) * bobAmplitude;
    return;
  }

  if (gameState === STATE_OVER) return;

  // PLAYING

  // Static background, moving ground
  base.tilePositionX += 2;

  // Tilt logic
  player.angle = Phaser.Math.Clamp(player.angle + 2, -30, 90);

  // Score + cleanup
  for (let i = pipePairs.length - 1; i >= 0; i--) {
    const pair = pipePairs[i];
    if (!pair || !pair.top || !pair.top.body) continue;

    const rightEdge = pair.top.body.x + pair.top.body.width;

    if (!pair.passed && rightEdge < player.x) {
      pair.passed = true;
      score++;
      scoreText.setText(score.toString());

      if (score > highScore) {
        highScore = score;
        highScoreText.setText(`BEST: ${highScore}`);
      }

      spawnScorePopup.call(this, player.x, player.y - 40);
    }

    if (rightEdge < -200) {
      if (pair.top) pair.top.destroy();
      if (pair.bottom) pair.bottom.destroy();
      pipePairs.splice(i, 1);
    }
  }
}

// ====== SCORE POPUP FEATURE ======
function spawnScorePopup(x, y) {
  const H = game.scale.height;

  const popup = game.scene.scenes[0].add.text(
    x,
    y,
    '+1',
    {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: Math.round(H * 0.03) + 'px',
      color: '#00ff7f',
      stroke: '#000000',
      strokeThickness: 4
    }
  ).setOrigin(0.5);
  popup.setDepth(1002);

  game.scene.scenes[0].tweens.add({
    targets: popup,
    y: y - 40,
    alpha: 0,
    duration: 600,
    ease: 'Sine.easeOut',
    onComplete: () => popup.destroy()
  });
}

// ====== FLAP ======
function flap() {
  if (gameState !== STATE_PLAYING) return;

  player.setVelocityY(FLAP_VELOCITY);
  player.angle = -25;

  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (flapSound) flapSound.play();

  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

// ====== CREATE PIPE PAIR (ALIGNED) ======
function addPipePair() {
  if (gameState !== STATE_PLAYING) return;

  const W = game.scale.width;
  const H = game.scale.height;
  const baseHeight = Math.round(H * BASE_HEIGHT_RATIO);

  const { gapRatio, pipeSpeed } = getDifficulty();
  const gap = Math.round(H * gapRatio);

  const minCenter = gap / 2 + 50;
  const maxCenter = H - baseHeight - gap / 2 - 50;
  const centerY = Phaser.Math.Between(
    minCenter,
    Math.max(minCenter + 1, maxCenter)
  );

  const pipePixelWidth = W * PIPE_WIDTH_RATIO;

  // TOP PIPE
  const topHeight = centerY - gap / 2;
  const topPipe = pipes.create(
    W + pipePixelWidth / 2 + 30,
    topHeight,
    'pipe'
  );
  topPipe.setOrigin(0.5, 1);
  topPipe.setFlipY(true);
  topPipe.displayWidth  = pipePixelWidth;
  topPipe.displayHeight = topHeight;
  topPipe.body.allowGravity = false;
  topPipe.setImmovable(true);
  topPipe.setVelocityX(pipeSpeed);
  topPipe.setDepth(5);
  topPipe.body.setSize(topPipe.displayWidth, topPipe.displayHeight, true);

  // BOTTOM PIPE
  const bottomHeight = (H - baseHeight) - (centerY + gap / 2);
  const bottomPipe = pipes.create(
    W + pipePixelWidth / 2 + 30,
    centerY + gap / 2,
    'pipe'
  );
  bottomPipe.setOrigin(0.5, 0);
  bottomPipe.displayWidth  = pipePixelWidth;
  bottomPipe.displayHeight = bottomHeight;
  bottomPipe.body.allowGravity = false;
  bottomPipe.setImmovable(true);
  bottomPipe.setVelocityX(pipeSpeed);
  bottomPipe.setDepth(5);
  bottomPipe.body.setSize(bottomPipe.displayWidth, bottomPipe.displayHeight, true);

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

  if (navigator.vibrate) {
    navigator.vibrate([80, 60, 80]);
  }

  game.scene.scenes[0].cameras.main.shake(150, 0.01);

  try {
    const stored = parseInt(localStorage.getItem('flappyFriendHighScore') || '0', 10);
    if (isNaN(stored) || score > stored) {
      localStorage.setItem('flappyFriendHighScore', score.toString());
      highScoreText.setText(`BEST: ${score}`);
    }
  } catch (e) {}

  const W = game.scale.width;
  const H = game.scale.height;

  restartText = game.scene.scenes[0].add.text(
    W / 2,
    H * 0.5,
    'TAP TO RESTART',
    {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: Math.round(H * 0.045) + 'px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6
    }
  ).setOrigin(0.5);
  restartText.setDepth(1001);

  game.scene.scenes[0].tweens.add({
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

  game.scene.scenes[0].scene.restart();
}

// ====== HANDLE RESIZE (orientation, browser UI changes) ======
window.addEventListener('resize', () => {
  const newW = window.innerWidth || 540;
  const newH = window.innerHeight || 960;

  game.scale.resize(newW, newH);

  // Restart active scenes so layout re-calculates with new width/height
  game.scene.scenes.forEach(s => {
    if (s && s.scene && s.scene.isActive()) {
      s.scene.restart();
    }
  });
});
