const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1000 },
      debug: false // debugging turned off
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

let player, pipes, pipePairs = [], pipeTimer;
let score = 0, scoreText, gameOver = false;
let flapSound, deathSound;
let bgTile, base, ceiling;

const BASE_HEIGHT_RATIO = 0.12;
const PLAYER_SCALE_RATIO = 0.09;
const PIPE_WIDTH_RATIO = 0.10;
const PIPE_GAP_RATIO   = 0.35;
const FLAP_VELOCITY = -350;
const PIPE_SPEED = -200;

// pipe spacing (horizontal) randomness in ms
const PIPE_DELAY_MIN = 1100;
const PIPE_DELAY_MAX = 1800;

function preload() {
  this.load.image('background', 'assets/background.png');
  this.load.image('player', 'assets/friend-head.png');
  this.load.image('pipe', 'assets/pipe.png');
  this.load.image('base', 'assets/base.png');

  this.load.audio('flap', 'assets/flap.mp3');
  this.load.audio('death', 'assets/death.mp3');
}

function create() {
  score = 0;
  gameOver = false;
  pipePairs = [];

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
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

  const pScale = (this.scale.height * PLAYER_SCALE_RATIO) / player.height;
  player.setScale(pScale);
  player.setOrigin(0.5, 0.5);
  player.setVisible(true);
  player.body.setAllowGravity(true);
  player.setCollideWorldBounds(false);
  player.setDepth(10);

  // === COLLISION BOX EXACTLY SAME SIZE AS IMAGE & CENTERED ===
  const bodyW = player.width;   // width after scaling
  const bodyH = player.height;  // height after scaling
  player.body.setSize(bodyW, bodyH, true); // true = center on origin
  // no manual offset; body is now perfectly centered on sprite

  // Initial rotation
  player.angle = 0;

  // Input (tap / click / space)
  this.input.on('pointerdown', () =>
    gameOver ? restartScene.call(this) : flap()
  );
  this.input.keyboard.on('keydown-SPACE', () =>
    gameOver ? restartScene.call(this) : flap()
  );

  // Collisions
  this.physics.add.collider(player, pipes, playerHit, null, this);
  this.physics.add.collider(player, base, playerHit, null, this);
  this.physics.add.collider(player, ceiling, playerHit, null, this);

  // Score (centered, always above pipes)
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
  scoreText.setDepth(1000); // ensure on top of everything

  // Random pipe spawn scheduling
  scheduleNextPipe.call(this);
}

function scheduleNextPipe() {
  // random delay between min and max
  const delay = Phaser.Math.Between(PIPE_DELAY_MIN, PIPE_DELAY_MAX);
  pipeTimer = this.time.addEvent({
    delay,
    callback: () => {
      addPipePair.call(this);
      if (!gameOver) scheduleNextPipe.call(this);
    },
    loop: false
  });
}

function update() {
  if (gameOver) return;

  bgTile.tilePositionX += 2;
  base.tilePositionX += 2;

  // Tilt logic: slowly fall downwards angle
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
    }

    if (rightEdge < -200) {
      if (pair.top) pair.top.destroy();
      if (pair.bottom) pair.bottom.destroy();
      pipePairs.splice(i, 1);
    }
  }
}

function flap() {
  if (gameOver) return;

  player.setVelocityY(FLAP_VELOCITY);
  player.angle = -25; // tilt up on flap

  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (flapSound) flapSound.play();

  // Mobile haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

function addPipePair() {
  if (gameOver) return;

  const w = this.scale.width;
  const h = this.scale.height;
  const gap = Math.round(h * PIPE_GAP_RATIO);
  const baseHeight = Math.round(h * BASE_HEIGHT_RATIO);

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
  topPipe.setVelocityX(PIPE_SPEED);
  topPipe.setDepth(5);

  // Bottom pipe (normal, facing up)
  const bottomPipe = pipes.create(spawnX, centerY + gap / 2, 'pipe');
  bottomPipe.setOrigin(0.5, 0);
  bottomPipe.setScale(pipeScale);
  bottomPipe.body.allowGravity = false;
  bottomPipe.setImmovable(true);
  bottomPipe.setVelocityX(PIPE_SPEED);
  bottomPipe.setDepth(5);

  pipePairs.push({ top: topPipe, bottom: bottomPipe, passed: false });
}

function playerHit() {
  if (gameOver) return;
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

  if (pipeTimer) pipeTimer.remove(false);

  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (deathSound) deathSound.play();

  // Haptic buzz on death
  if (navigator.vibrate) {
    navigator.vibrate([80, 60, 80]);
  }

  // Camera shake
  this.cameras.main.shake(150, 0.01);

  // Restart text with pulsing animation
  const restartText = this.add.text(
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

  this.input.once('pointerdown', () => restartScene.call(this), this);
  this.input.keyboard.once('keydown-SPACE', () => restartScene.call(this), this);
}

function restartScene() {
  // stop death sound when restarting
  if (deathSound && deathSound.isPlaying) deathSound.stop();

  if (pipeTimer) {
    pipeTimer.remove(false);
    pipeTimer = null;
  }
  if (pipes) pipes.clear(true, true);
  pipePairs = [];
  this.scene.restart();
}

window.addEventListener('resize', () => {
  config.width = window.innerWidth;
  config.height = window.innerHeight;
  if (game && game.scale) game.scale.resize(config.width, config.height);
  game.scene.scenes.forEach(s => {
    if (s && s.scene) s.scene.restart();
  });
});
