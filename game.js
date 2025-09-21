const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: window.innerHeight * 1.5 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let player;
let pipes;
let pipePairs = [];
let score = 0;
let scoreText;
let gameOver = false;
let flapSound;
let deathSound;

let bgLayer1;
let bgLayer2;
let base;
let pipeTimer;

// --- Ratios ---
const BASE_HEIGHT_RATIO = 0.12;
const PLAYER_SCALE_RATIO = 0.22;
const PIPE_WIDTH_RATIO = 0.10;
const PIPE_GAP_RATIO = 0.45; // gap ratio relative to screen height
const FLAP_VELOCITY_RATIO = 0.8;

function preload() {
    this.load.image('background1', 'assets/background.png');
    this.load.image('background2', 'assets/background.png');
    this.load.image('player', 'assets/friend-head.png');
    this.load.image('pipe', 'assets/pipe.png');
    this.load.image('base', 'assets/base.png');

    this.load.audio('flap', 'assets/flap.mp3');
    this.load.audio('death', 'assets/death.mp3');
}

function create() {
    this.sound.stopAll();

    // --- Background ---
    bgLayer1 = this.add.tileSprite(config.width / 2, config.height / 2, config.width, config.height, 'background1');
    bgLayer2 = this.add.tileSprite(config.width / 2, config.height / 2, config.width, config.height, 'background2');

    // --- Base ---
    const baseHeight = config.height * BASE_HEIGHT_RATIO;
    const baseY = config.height - baseHeight / 2;
    base = this.add.tileSprite(config.width / 2, baseY, config.width, baseHeight, 'base');
    this.physics.add.existing(base, true);

    // --- Pipes ---
    pipes = this.physics.add.group();

    // --- Player ---
    player = this.physics.add.sprite(config.width / 4, config.height / 2, 'player');
    const playerScale = (config.height * PLAYER_SCALE_RATIO) / player.height;
    player.setScale(playerScale);
    player.setCollideWorldBounds(false);

    // --- Sounds ---
    flapSound = this.sound.add('flap');
    deathSound = this.sound.add('death');

    // --- Input ---
    this.input.on('pointerdown', flap, this);

    // --- Pipe spawner ---
    pipeTimer = this.time.addEvent({
        delay: 1500,
        callback: addPipePair,
        callbackScope: this,
        loop: true
    });

    // --- Collisions ---
    this.physics.add.collider(player, pipes, hitPipe, null, this);
    this.physics.add.collider(player, base, hitBase, null, this);

    // --- Score ---
    scoreText = this.add.text(20, 20, 'Score: 0', { fontSize: Math.round(config.height * 0.05) + 'px', fill: '#fff' });
}

function update() {
    if (gameOver) return;

    // --- Scroll backgrounds ---
    bgLayer1.tilePositionX += 1;
    bgLayer2.tilePositionX += 3;

    // --- Scroll base ---
    base.tilePositionX += 3;

    // --- Update pipes ---
    pipePairs.forEach(pair => {
        pair.top.x += -200 * (1 / 60);
        pair.bottom.x += -200 * (1 / 60);

        // Check score
        if (!pair.passed && pair.top.x + pair.top.displayWidth / 2 < player.x) {
            score += 1;
            scoreText.setText('Score: ' + score);
            pair.passed = true;
        }

        // Destroy offscreen pipes
        if (pair.top.x + pair.top.displayWidth < 0) {
            pair.top.destroy();
            pair.bottom.destroy();
        }
    });

    pipePairs = pipePairs.filter(pair => pair.top.active && pair.bottom.active);
}

function flap() {
    if (!gameOver) {
        player.setVelocityY(-config.height * FLAP_VELOCITY_RATIO);
        if (flapSound.isPlaying) flapSound.stop();
        flapSound.play({ duration: 2000 });
    }
}

function addPipePair() {
    if (gameOver) return;

    const gap = config.height * PIPE_GAP_RATIO;
    const minY = gap / 2 + 50;
    const maxY = config.height - gap / 2 - 50;
    const centerY = Phaser.Math.Between(minY, maxY);

    const pipeWidth = Math.round(config.width * PIPE_WIDTH_RATIO);

    // --- Top pipe ---
    const topPipe = pipes.create(config.width, centerY - gap / 2, 'pipe');
    topPipe.setFlipY(true);
    topPipe.setOrigin(0.5, 1);
    topPipe.body.allowGravity = false;
    topPipe.setVelocityX(-200);
    topPipe.setDisplaySize(pipeWidth, config.height); // full height pipe
    topPipe.body.setSize(topPipe.displayWidth, topPipe.displayHeight, false);

    // --- Bottom pipe ---
    const bottomPipe = pipes.create(config.width, centerY + gap / 2, 'pipe');
    bottomPipe.setOrigin(0.5, 0);
    bottomPipe.body.allowGravity = false;
    bottomPipe.setVelocityX(-200);
    bottomPipe.setDisplaySize(pipeWidth, config.height); // full height pipe
    bottomPipe.body.setSize(bottomPipe.displayWidth, bottomPipe.displayHeight, false);

    pipePairs.push({ top: topPipe, bottom: bottomPipe, passed: false });
}

function hitPipe() {
    if (!gameOver) endGame(this);
}

function hitBase() {
    if (!gameOver) endGame(this);
}

function endGame(scene) {
    gameOver = true;
    player.setTint(0xff0000);
    player.setVelocity(0, 0);

    if (flapSound.isPlaying) flapSound.stop();
    deathSound.play({ duration: 2000 });

    pipes.setVelocityX(0);
    pipeTimer.remove(false);

    scene.input.once('pointerdown', () => {
        scene.scene.restart();
        score = 0;
        gameOver = false;
        pipePairs = [];
    });
}
