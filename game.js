const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 1000 },
      debug: true // see physics bodies
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
let bgTile, base;

const BASE_HEIGHT_RATIO = 0.12;
const PLAYER_SCALE_RATIO = 0.18;
const PIPE_WIDTH_RATIO = 0.10;
const PIPE_GAP_RATIO = 0.25;
const FLAP_VELOCITY = -350;
const PIPE_SPEED = -200;

function preload() {
  this.load.image('background', 'assets/background.png');
  this.load.image('player', 'assets/friend-head.png');
  this.load.image('pipe', 'assets/pipe.png');
  this.load.image('base', 'assets/base.png');

  this.load.audio('flap', 'assets/flap.mp3');
  this.load.audio('death', 'assets/death.mp3');
}

function create() {
  score = 0; gameOver = false; pipePairs = [];
  if (pipeTimer) { pipeTimer.remove(false); pipeTimer = null; }

  flapSound = this.sound.add('flap');
  deathSound = this.sound.add('death');

  // background
  bgTile = this.add.tileSprite(this.scale.width/2, this.scale.height/2, this.scale.width, this.scale.height, 'background');

  // base
  const baseHeight = Math.round(this.scale.height * BASE_HEIGHT_RATIO);
  base = this.add.tileSprite(this.scale.width/2, this.scale.height - baseHeight/2, this.scale.width, baseHeight, 'base');
  this.physics.add.existing(base, true);
  if (base.body) base.body.setSize(this.scale.width, baseHeight);

  // pipes group
  pipes = this.physics.add.group();

  // player
  player = this.physics.add.sprite(this.scale.width/4, this.scale.height/2, 'player');
  const pScale = (this.scale.height * PLAYER_SCALE_RATIO) / player.height;
  player.setScale(pScale);
  player.setCollideWorldBounds(false);
  player.body.setAllowGravity(true);

  // Bird hitbox slightly smaller than sprite for Flappy Bird feel
  const birdWidth = player.displayWidth * 0.6;
  const birdHeight = player.displayHeight * 0.6;
  player.body.setSize(birdWidth, birdHeight);
  player.body.setOffset((player.displayWidth - birdWidth)/2, (player.displayHeight - birdHeight)/2);

  // input
  this.input.on('pointerdown', () => gameOver ? restartScene.call(this) : flap());
  this.input.keyboard.on('keydown-SPACE', () => gameOver ? restartScene.call(this) : flap());

  // collisions
  this.physics.add.collider(player, pipes, playerHit, null, this);
  this.physics.add.collider(player, base, playerHit, null, this);

  // score text
  scoreText = this.add.text(20, 20, 'Score: 0', {
    fontSize: Math.round(this.scale.height * 0.05) + 'px',
    fill: '#fff'
  });

  // pipe spawner
  pipeTimer = this.time.addEvent({
    delay: 1500,
    callback: () => addPipePair.call(this),
    loop: true
  });
}

function update() {
  if (gameOver) return;

  bgTile.tilePositionX += 2;
  base.tilePositionX += 2;

  for (let i = pipePairs.length - 1; i >= 0; i--) {
    const pair = pipePairs[i];
    if (!pair || !pair.top || !pair.top.body) continue;

    const rightEdge = pair.top.body.x + pair.top.body.width;

    if (!pair.passed && rightEdge < player.x) {
      pair.passed = true;
      score++;
      scoreText.setText('Score: ' + score);
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
  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (flapSound) flapSound.play();
}

function addPipePair() {
  if (gameOver) return;

  const w = this.scale.width;
  const h = this.scale.height;
  const gap = Math.round(h * PIPE_GAP_RATIO);
  const baseHeight = Math.round(h * BASE_HEIGHT_RATIO);
  const minCenter = gap/2 + 50;
  const maxCenter = h - baseHeight - gap/2 - 50;
  const centerY = Phaser.Math.Between(minCenter, Math.max(minCenter+1, maxCenter));

  const pipeWidth = Math.round(w * PIPE_WIDTH_RATIO);
  const topHeight = Math.max(24, centerY - gap/2);
  const bottomY = centerY + gap/2;
  const bottomHeight = Math.max(24, h - baseHeight - bottomY);
  const spawnX = Math.round(w + pipeWidth/2 + 30);

  // Top pipe
  const topPipe = pipes.create(spawnX, topHeight, 'pipe');
  topPipe.setOrigin(0.5, 1);
  topPipe.setFlipY(true);
  topPipe.setDisplaySize(pipeWidth, topHeight);
  topPipe.body.setSize(pipeWidth, topHeight); // match sprite exactly
  topPipe.body.setOffset(0, 0);
  topPipe.body.allowGravity = false;
  topPipe.setImmovable(true);
  topPipe.setVelocityX(PIPE_SPEED);

  // Bottom pipe
  const bottomPipe = pipes.create(spawnX, bottomY, 'pipe');
  bottomPipe.setOrigin(0.5, 0);
  bottomPipe.setDisplaySize(pipeWidth, bottomHeight);
  bottomPipe.body.setSize(pipeWidth, bottomHeight); // match sprite exactly
  bottomPipe.body.setOffset(0, 0);
  bottomPipe.body.allowGravity = false;
  bottomPipe.setImmovable(true);
  bottomPipe.setVelocityX(PIPE_SPEED);

  pipePairs.push({ top: topPipe, bottom: bottomPipe, passed: false });
}

function playerHit() {
  if (gameOver) return;
  gameOver = true;

  player.setTint(0xff0000);
  player.setVelocity(0,0);

  pipes.getChildren().forEach(p => {
    if (p && p.body) {
      p.setVelocityX(0);
      p.body.immovable = true;
    }
  });

  if (pipeTimer) pipeTimer.remove(false);
  if (flapSound && flapSound.isPlaying) flapSound.stop();
  if (deathSound) deathSound.play();

  const restartText = this.add.text(this.scale.width/2, this.scale.height/2, 'Tap to Restart', {
    fontSize: Math.round(this.scale.height * 0.05) + 'px',
    fill: '#fff'
  }).setOrigin(0.5);

  this.input.once('pointerdown', () => restartScene.call(this), this);
  this.input.keyboard.once('keydown-SPACE', () => restartScene.call(this), this);
}

function restartScene() {
  if (pipeTimer) { pipeTimer.remove(false); pipeTimer = null; }
  if (pipes) pipes.clear(true, true);
  pipePairs = [];
  this.scene.restart();
}

window.addEventListener('resize', () => {
  config.width = window.innerWidth;
  config.height = window.innerHeight;
  if (game && game.scale) game.scale.resize(config.width, config.height);
  game.scene.scenes.forEach(s => { if (s && s.scene) s.scene.restart(); });
});
