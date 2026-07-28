class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    init(data) {
        this.stageData = data.stageData;
        this.elapsedTime = 0;
        this.isDead = false;

        let up = USER_GLOBAL_DATA.upgrades;
        function getStatLv(k) {
            return Number(up[k.toLowerCase()] !== undefined ? up[k.toLowerCase()] : up[k.toUpperCase()]) || 0;
        }

        let baseHp = 100 + (getStatLv('MAX_HP_LV') * 15);
        let baseAtk = 5 + (getStatLv('ATTACK_POWER_LV') * 1);
        let baseSpd = 160 + (getStatLv('MOVE_SPEED_LV') * 10);
        let baseMagnet = 150 + (getStatLv('MAGNET_RANGE_LV') * 30);
        let baseDelay = Math.max(400, 1100 * (1 - (getStatLv('ATTACK_SPEED_LV') * 0.05)));

        this.playerStats = {
            hp: baseHp, maxHp: baseHp, speed: baseSpd, damage: baseAtk, attackDelay: baseDelay,
            defense: getStatLv('DEFENSE_LV') * 1, expBonus: 1 + (getStatLv('EXP_BONUS_LV') * 0.1),
            level: 1, exp: 0, maxExp: 6, gold: 0, magnetRange: baseMagnet,
            fire: 0, water: 0, wind: 0, bomb: 0, earth: 0, bolt: 0, posionLv: 0,
            pierce: 0, clone: getStatLv('CLONE_LV'), magnet: 0, maxHpLv: 0, speedLv: 0, healLv: 0,
            heroSkillLv: 0,
            hasEquippedBossSkill: false
        };

        this.skillDmgStats = {
            '기본 수리검': 0,
            '화둔': 0,
            '수둔': 0,
            '뇌둔': 0,
            '풍둔': 0,
            '기폭찰': 0,
            '수리검 난무': 0
        };

        this.lastAttackTime = 0;
        this.lastFootstepTime = 0;
        this.lastSkillTimes = { fire: 0, water: 0, wind: 0, bomb: 0, earth: 0, bolt: 0 };
        this.isInvincible = false;
        this.joystickVector = { x: 0, y: 0 };
        this.isLevelUpOpen = false;

        this.boss = null;
        this.bossProjectiles = this.physics.add.group();
        this.isBossSpawned = false;
        this.stopNormalSpawns = false;
        this.killedEnemiesCount = 0;

        this.bossDamageDealt = 0;
        this.bossRemainingHp = 0;

        this.bossDamageWindow = [];
        this.isBossRaging = false;

        this.heroSkillCooldown = 0;
        this.bossEquippedSkillCooldown = 0;

        this.pendingLevelUps = isTestMode ? 15 : 0;
        this.isGameLoaded = false;
        this.lastNamedSpawnTime = 0;
        this.lastBossPos = { x: 0, y: 0 };
        
        // 보스 장애물 2초 끼임 감지 타이머 변수 (중복 제거)
        this.bossStuckStartTime = 0;
        this.bossStuckObstacles = new Set();
    }

    create() {
        if (globalBGM) { globalBGM.stop(); globalBGM.destroy(); globalBGM = null; }

        this.physics.world.setBounds(0, 0, 16000, 16000);
        this.physics.pause();

        if (isMobile) {
            this.cameras.main.setZoom(1.35);
        }

        this.bgTile = this.add.tileSprite(8000, 8000, 16000, 16000, 'grass1').setDepth(-10);
        this.bgTile.setTileScale(0.25, 0.25);

        for (let gx = 500; gx < 15500; gx += 400) {
            for (let gy = 500; gy < 15500; gy += 400) {
                if (Phaser.Math.Between(1, 100) <= 25) {
                    this.add.image(gx + Phaser.Math.Between(-50, 50), gy + Phaser.Math.Between(-50, 50), 'grass4')
                        .setDepth(-9)
                        .setScale(0.25)
                        .setAlpha(0.7);
                }
            }
        }

        for (let ry = 0; ry <= 16000; ry += 64) {
            this.add.image(8000, ry, 'grass5').setDepth(-8).setScale(0.25);
        }
        for (let rx = 0; rx <= 16000; rx += 64) {
            this.add.image(rx, 8000, 'grass5').setDepth(-8).setScale(0.25).setRotation(Math.PI / 2);
        }

        for (let b = 0; b < 250; b++) {
            let bx = Phaser.Math.Between(500, 15500);
            let by = Phaser.Math.Between(500, 15500);
            this.add.image(bx, by, 'branch').setDepth(-7).setScale(0.3).setRotation(Math.random() * Math.PI * 2);
        }

        this.obstacles = this.physics.add.staticGroup();

        for (let i = 0; i < 200; i++) {
            let cx = Phaser.Math.Between(1000, 15000);
            let cy = Phaser.Math.Between(1000, 15000);
            if (Phaser.Math.Distance.Between(cx, cy, 8000, 8000) < 500) continue;

            let type = Phaser.Math.RND.pick(['tree1', 'tree2', 'tree1', 'tree2', 'rock1', 'rock2', 'rock3']);
            let obs = this.obstacles.create(cx, cy, type).setScale(1.0);
            
            if (type.startsWith('tree')) {
                obs.body.setSize(obs.width * 0.35, obs.height * 0.25);
                obs.body.setOffset(obs.width * 0.325, obs.height * 0.72);
            } else {
                obs.body.setSize(obs.width * 0.6, obs.height * 0.5);
                obs.body.setOffset(obs.width * 0.2, obs.height * 0.3);
            }
        }

        for (let c = 0; c < 12; c++) {
            let clusterX = Phaser.Math.Between(1500, 14500);
            let clusterY = Phaser.Math.Between(1500, 14500);
            if (Phaser.Math.Distance.Between(clusterX, clusterY, 8000, 8000) < 1000) continue;

            for (let t = 0; t < 8; t++) {
                let tx = clusterX + Phaser.Math.Between(-160, 160);
                let ty = clusterY + Phaser.Math.Between(-160, 160);
                let tree = this.obstacles.create(tx, ty, Phaser.Math.RND.pick(['tree1', 'tree2'])).setScale(1.05);
                tree.body.setSize(tree.width * 0.35, tree.height * 0.25);
                tree.body.setOffset(tree.width * 0.325, tree.height * 0.72);
            }
        }

        this.player = this.physics.add.sprite(8000, 8000, 'hero_1').setScale(0.4);
        this.player.setCollideWorldBounds(true);
        
        this.player.body.setSize(this.player.width * 0.35, this.player.height * 0.35);
        this.player.body.setOffset(this.player.width * 0.325, this.player.height * 0.55);

        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

        this.enemies = this.physics.add.group();
        this.projectiles = this.physics.add.group();
        this.expItems = this.physics.add.group();
        this.goldItems = this.physics.add.group();
        this.meatItems = this.physics.add.group();
        this.rareBoxItems = this.physics.add.group();
        this.fieldMagnetItems = this.physics.add.group();

        this.physics.add.collider(this.player, this.obstacles);
        this.physics.add.collider(this.enemies, this.obstacles);
        this.physics.add.overlap(this.player, this.enemies, this.handlePlayerHit, null, this);
        this.physics.add.overlap(this.projectiles, this.enemies, this.handleProjectileHit, null, this);
        this.physics.add.overlap(this.player, this.bossProjectiles, this.handleBossProjectileHit, null, this);
        
        this.physics.add.overlap(this.player, this.expItems, this.collectExp, null, this);
        this.physics.add.overlap(this.player, this.goldItems, this.collectGold, null, this);
        this.physics.add.overlap(this.player, this.meatItems, this.collectMeat, null, this);
        this.physics.add.overlap(this.player, this.rareBoxItems, this.collectRareBox, null, this);
        this.physics.add.overlap(this.player, this.fieldMagnetItems, this.collectFieldMagnet, null, this);

        this.physics.add.overlap(this.bossProjectiles, this.obstacles, (fish, obs) => {
            fish.destroy(); // 투사체 소멸
            this.hitAndCheckObstacleBreak(obs); // 장애물 피격 카운트 가산
        }, null, this);

        this.setupUI();

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.numOneKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        this.numpadOneKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE);
        this.numTwoKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        this.numpadTwoKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO);

        this.setupVirtualJoystick();

        this.gameTimerEvent = this.time.addEvent({
            delay: 1000,
            callback: this.updateGameLogic,
            callbackScope: this,
            loop: true
        });

        this.spawnTimerEvent = this.time.addEvent({
            delay: 1200,
            callback: this.spawnEnemies,
            callbackScope: this,
            loop: true
        });

        this.showStageLoadingOverlay();
    } // <-- create() 함수 완전 종료

    // 별도의 클래스 메서드로 정상 분리
    hitAndCheckObstacleBreak(obs) {
        if (!obs || !obs.active || obs.isDestroying) return;

        obs.bossHitCount = (obs.bossHitCount || 0) + 1;
        
        this.tweens.add({ targets: obs, x: obs.x + 4, duration: 40, yoyo: true });
        //2회 이상 충돌/피격 시 부서지도록 조건 수정 (기존 3회 -> 2회)
        if (obs.bossHitCount >= 2) {
            obs.isDestroying = true;
            playRandomSFX(this, 'hit_impact', 0.6);

            let startX = obs.x;
            this.tweens.add({
                targets: obs,
                x: startX + 10,
                duration: 75,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    this.tweens.add({
                        targets: obs,
                        alpha: 0,
                        scaleX: 0.5,
                        scaleY: 0.5,
                        duration: 180,
                        onComplete: () => { obs.destroy(); }
                    });
                }
            });
        }
    }

    showStageLoadingOverlay() {
        let cx = this.scale.width / 2;
        let cy = this.scale.height / 2;

        let loadOverlay = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.95).setScrollFactor(0).setDepth(30000);
        let loadTitle = this.add.text(cx, cy - 50, `STAGE ${this.stageData.id} 로딩 중...`, { 
            fontSize: '32px', fill: '#ffcc00', fontStyle: 'bold', padding: { top: 10, bottom: 10 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30001);

        let progressBg = this.add.rectangle(cx, cy + 20, 300, 24, 0x222222).setScrollFactor(0).setDepth(30001);
        let progressBar = this.add.rectangle(cx - 150, cy + 20, 0, 24, 0x00ffcc).setOrigin(0, 0.5).setScrollFactor(0).setDepth(30002);
        let percentTxt = this.add.text(cx, cy + 60, '0%', { 
            fontSize: '20px', fill: '#ffffff', padding: { top: 6, bottom: 6 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30001);

        let progress = 0;
        let timer = this.time.addEvent({
            delay: 25,
            repeat: 50,
            callback: () => {
                progress += 2;
                progressBar.setSize(300 * (progress / 100), 24);
                percentTxt.setText(`${progress}%`);

                if (progress >= 100) {
                    timer.destroy();
                    this.tweens.add({
                        targets: [loadOverlay, loadTitle, progressBg, progressBar, percentTxt],
                        alpha: 0,
                        duration: 300,
                        onComplete: () => {
                            loadOverlay.destroy(); loadTitle.destroy();
                            progressBg.destroy(); progressBar.destroy(); percentTxt.destroy();
                            
                            this.isGameLoaded = true;
                            this.physics.resume();

                            playBGM(this, `stage${this.stageData.id}`);

                            if (this.pendingLevelUps > 0) {
                                this.showLevelUpUI(false);
                            }
                        }
                    });
                }
            }
        });
    }

    setupUI() {
        createMuteButton(this, 'GAME');

        let exitX = isMobile ? 130 : 40;
        let exitY = isMobile ? 210 : 40;

        let exitBtn = this.add.text(exitX, exitY, '🏠', { 
            fontSize: '28px',
            padding: { top: 4, bottom: 4, left: 4, right: 4 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10000).setInteractive();

        exitBtn.on('pointerdown', () => {
            playRandomSFX(this, 'button');
            this.showExitConfirmModal();
        });

        let targetTime = isTestMode ? 60 : this.stageData.time;
        let initialRemain = Math.max(0, targetTime - this.elapsedTime);
        let mins = Math.floor(initialRemain / 60);
        let secs = initialRemain % 60;
        let timeStr = `⏳ 보스까지 ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        let timerY = isMobile ? 210 : 80;
        this.timerText = this.add.text(this.scale.width / 2, timerY, timeStr, { 
            fontSize: isMobile ? '20px' : '28px', fill: isTestMode ? '#ff0055' : '#ffcc00', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10000);

        this.bossHpBg = this.add.rectangle(this.scale.width / 2, 210, isMobile ? 320 : 450, 22, 0x222222, 0.9).setScrollFactor(0).setDepth(10000).setVisible(false);
        this.bossHpBar = this.add.rectangle((this.scale.width / 2) - (isMobile ? 160 : 225), 210, isMobile ? 320 : 450, 22, 0xff0055).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001).setVisible(false);
        this.bossHpTxt = this.add.text(this.scale.width / 2, 210, '', {
            fontSize: isMobile ? '13px' : '15px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10002).setVisible(false);

        let hudX = isMobile ? 130 : 30;
        let lvlY = isMobile ? 250 : 48;
        let expY = isMobile ? 280 : 88;
        let hpTxtY = isMobile ? 305 : 115;
        let hpBarY = isMobile ? 330 : 150;

        this.levelText = this.add.text(hudX, lvlY, 'LV.1', { 
            fontSize: isMobile ? '18px' : '24px', fill: '#ffcc00', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setScrollFactor(0).setDepth(10000);

        this.expBarBg = this.add.rectangle(hudX + (isMobile ? 60 : 100), expY, isMobile ? 120 : 200, 14, 0x333333).setScrollFactor(0).setDepth(10000);
        this.expBar = this.add.rectangle(hudX, expY, 0, 14, 0x00ffcc).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);

        this.hpText = this.add.text(hudX, hpTxtY, `HP: ${this.playerStats.hp} / ${this.playerStats.maxHp}`, { 
            fontSize: isMobile ? '14px' : '18px', fill: '#ffffff', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setScrollFactor(0).setDepth(10000);

        this.playerHpBg = this.add.rectangle(hudX + (isMobile ? 60 : 100), hpBarY, isMobile ? 120 : 200, 16, 0x330000).setScrollFactor(0).setDepth(10000);
        this.playerHpBar = this.add.rectangle(hudX, hpBarY, isMobile ? 120 : 200, 16, 0xff2222).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);

        let skill1X = isMobile ? this.scale.width - 140 : 55;
        let skill1Y = isMobile ? 1030 : 265;
        
        let skill2X = isMobile ? this.scale.width - 140 : 55;
        let skill2Y = isMobile ? 950 : 195;
        let boxSize = 56;
        let imgSize = 48;

        this.add.rectangle(skill1X, skill1Y, boxSize, boxSize, 0x111122, 0.9).setStrokeStyle(3, 0xffcc00).setScrollFactor(0).setDepth(10000);
        this.heroSkillBtn = this.add.image(skill1X, skill1Y, 'hero_main').setDisplaySize(imgSize, imgSize).setScrollFactor(0).setDepth(10001).setInteractive();
        this.heroSkillOverlay = this.add.rectangle(skill1X, skill1Y, boxSize - 6, boxSize - 6, 0x000000, 0.65).setScrollFactor(0).setDepth(10002).setVisible(false);
        this.heroSkillText = this.add.text(skill1X, skill1Y, '', { 
            fontSize: '18px', fill: '#ffffff', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10003);

        this.heroSkillBtn.on('pointerdown', () => this.useHeroActiveSkill());

        this.bossSkillBox = this.add.rectangle(skill2X, skill2Y, boxSize, boxSize, 0x111122, 0.9).setStrokeStyle(3, 0x00ffcc).setScrollFactor(0).setDepth(10000).setVisible(false);
        this.bossSkillBtn = this.add.image(skill2X, skill2Y, 'boss_duck').setDisplaySize(imgSize, imgSize).setScrollFactor(0).setDepth(10001).setInteractive().setVisible(false);
        this.bossSkillOverlay = this.add.rectangle(skill2X, skill2Y, boxSize - 6, boxSize - 6, 0x000000, 0.65).setScrollFactor(0).setDepth(10002).setVisible(false);
        this.bossSkillText = this.add.text(skill2X, skill2Y, '', { 
            fontSize: '18px', fill: '#ffffff', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10003);

        this.bossSkillBtn.on('pointerdown', () => this.useBossEquippedSkill());

        let goldIconX = isMobile ? this.scale.width - 220 : this.scale.width - 210;
        let goldTxtX = isMobile ? this.scale.width - 195 : this.scale.width - 170;
        let goldY = isMobile ? 210 : 80;

        if (this.textures.exists('goldpocket')) {
            this.goldIcon = this.add.image(goldIconX, goldY, 'goldpocket').setDisplaySize(28, 28).setScrollFactor(0).setDepth(10000).setInteractive();
        } else {
            this.goldIcon = this.add.text(goldIconX, goldY, '💰', { fontSize: '20px' }).setOrigin(0.5).setScrollFactor(0).setDepth(10000).setInteractive();
        }

        this.goldText = this.add.text(goldTxtX, goldY, '0', { 
            fontSize: isMobile ? '18px' : '22px', fill: '#ffd700', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000).setInteractive();

        const openShop = () => { if(!this.isLevelUpOpen && this.isGameLoaded) this.showShopUI(); };
        this.goldIcon.on('pointerdown', openShop);
        this.goldText.on('pointerdown', openShop);
    }

    showExitConfirmModal() {
        if (this.isLevelUpOpen) return;
        
        this.isLevelUpOpen = true;
        this.physics.pause();

        let cx = this.scale.width / 2;
        let cy = this.scale.height / 2;

        let modalElements = [];

        let overlay = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.8)
            .setScrollFactor(0).setDepth(20000).setInteractive();

        let box = this.add.rectangle(cx, cy, 500, 240, 0x222233, 0.95)
            .setStrokeStyle(3, 0xffcc00).setScrollFactor(0).setDepth(20001);

        let text = this.add.text(cx, cy - 40, '메인 메뉴로 돌아가시겠습니까?\n(진행 중인 판은 저장되지 않습니다)', {
            fontSize: '20px', fill: '#ffffff', align: 'center', lineSpacing: 8, padding: { top: 6, bottom: 6 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);

        let confirmBtn = this.add.text(cx - 90, cy + 50, '확인', {
            fontSize: '20px', fill: '#ffffff', backgroundColor: '#aa2222', padding: { x: 25, y: 10 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002).setInteractive({ useHandCursor: true });

        let cancelBtn = this.add.text(cx + 90, cy + 50, '취소', {
            fontSize: '20px', fill: '#ffffff', backgroundColor: '#555555', padding: { x: 25, y: 10 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002).setInteractive({ useHandCursor: true });

        modalElements.push(overlay, box, text, confirmBtn, cancelBtn);

        confirmBtn.on('pointerdown', () => {
            playRandomSFX(this, 'button');
            isTestMode = false;
            this.scene.start('TitleScene');
        });

        cancelBtn.on('pointerdown', () => {
            playRandomSFX(this, 'button');
            modalElements.forEach(el => el.destroy());
            this.isLevelUpOpen = false;
            this.physics.resume();
        });
    }

    useHeroActiveSkill() {
        if (this.isDead || this.heroSkillCooldown > 0 || this.isLevelUpOpen || !this.isGameLoaded) return;

        let cdMult = 1.0 - (this.playerStats.heroSkillLv * 0.10);
        let finalCd = Math.max(20, Math.floor(50 * cdMult));

        this.heroSkillCooldown = finalCd; 
        this.heroSkillOverlay.setVisible(true);
        this.heroSkillText.setText(`${finalCd}`);

        let cutIn = this.add.image(this.scale.width / 2, this.scale.height / 2 - 50, 'hero_main')
            .setDisplaySize(240, 240).setScrollFactor(0).setDepth(20000).setAlpha(0);

        this.tweens.add({
            targets: cutIn, alpha: 1, scaleX: 1.15, scaleY: 1.15, duration: 250, yoyo: true, hold: 450,
            onComplete: () => cutIn.destroy()
        });

        for(let s=0; s<6; s++) {
            this.time.delayedCall(s * 50, () => {
                let sfxNum = (s % 3) + 1;
                if (!isSfxMuted && this.cache.audio.exists(`hero_skill${sfxNum}`)) {
                    this.sound.play(`hero_skill${sfxNum}`, { volume: 0.6 });
                }
            });
        }

        let isBossTarget = (this.boss && this.boss.active);
        let totalBullets = 100 + (this.playerStats.heroSkillLv * 10);
        let halfBullets = Math.floor(totalBullets / 2);

        for (let wave = 0; wave < 2; wave++) {
            this.time.delayedCall(wave * 100, () => {
                if (this.isDead) return;
                for (let i = 0; i < halfBullets; i++) {
                    let angle;
                    if (isBossTarget) {
                        let baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
                        angle = baseAngle + Phaser.Math.FloatBetween(-0.4, 0.4);
                    } else {
                        angle = (Math.PI * 2 / halfBullets) * i + (wave * 0.08);
                    }

                    let suri = this.projectiles.create(this.player.x, this.player.y, 'suri').setScale(0.2).setDepth(9999);
                    suri.rotation = angle + Math.PI / 2;
                    
                    let baseDmg = (this.playerStats.damage * 2 * 1.5) * (1 + (this.playerStats.posionLv * 0.10));
                    suri.damage = isBossTarget ? baseDmg * 0.20 : baseDmg;
                    suri.isHeroUltimate = true;
                    suri.pierce = 3 + this.playerStats.pierce;
                    suri.isBomb = false;
                    suri.knockback = 18;
                    this.physics.velocityFromRotation(angle, 600, suri.body.velocity);
                }
            });
        }
    }

    useBossEquippedSkill() {
        if (this.isDead || !this.playerStats.hasEquippedBossSkill || this.bossEquippedSkillCooldown > 0 || this.isLevelUpOpen || !this.isGameLoaded) return;

        this.bossEquippedSkillCooldown = 60;
        this.bossSkillOverlay.setVisible(true);
        this.bossSkillText.setText('60');

        let cutIn = this.add.image(this.scale.width / 2, this.scale.height / 2 - 50, 'duck_skill')
            .setDisplaySize(240, 240).setScrollFactor(0).setDepth(20000).setAlpha(0);

        this.tweens.add({
            targets: cutIn, alpha: 1, scaleX: 1.15, scaleY: 1.15, duration: 250, yoyo: true, hold: 450,
            onComplete: () => cutIn.destroy()
        });

        let px = this.player.x;
        let py = this.player.y;

        for(let f=0; f<60; f++) {
            this.time.delayedCall(f * 40, () => {
                if (this.isDead) return;
                let gunNum = Phaser.Math.Between(1, 4);
                if(!isSfxMuted && this.cache.audio.exists(`stage1_skill${gunNum}`)) this.sound.play(`stage1_skill${gunNum}`, { volume: 0.4 });

                let fx = px + Phaser.Math.Between(-300, 300);
                let fy = py + Phaser.Math.Between(-300, 300);

                let fish = this.projectiles.create(this.player.x, this.player.y, 'golden_fish').setDisplaySize(31, 23).setDepth(9999);
                let angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, fx, fy);
                fish.rotation = angle + Math.PI;
                fish.damage = this.playerStats.damage * (1 + (this.playerStats.posionLv * 0.10));
                fish.pierce = 1;
                fish.knockback = 12;
                this.physics.velocityFromRotation(angle, 450, fish.body.velocity);
            });
        }
    }

    updateHpUI() {
        this.hpText.setText(`HP: ${this.playerStats.hp} / ${this.playerStats.maxHp}`);
        let hpPct = Math.max(0, this.playerStats.hp / this.playerStats.maxHp);
        this.playerHpBar.setSize((isMobile ? 120 : 200) * hpPct, 16);
    }

    updateBossHpUI() {
        if (!this.boss || !this.boss.active) return;
        
        let maxHp = this.boss.maxHp || 20000;
        let curHp = Math.max(0, this.boss.hp);
        let pct = (curHp / maxHp) * 100;
        
        let fullWidth = isMobile ? 320 : 450;
        this.bossHpBar.setSize(fullWidth * (curHp / maxHp), 22);
        this.bossHpTxt.setText(`👑 [STAGE BOSS] 오리너구리: ${pct.toFixed(1)}% (${Math.floor(curHp).toLocaleString()} / ${maxHp.toLocaleString()})`);
    }

    setupVirtualJoystick() {
        this.joyBase = this.add.circle(0, 0, 60, 0xffffff, 0.2).setScrollFactor(0).setDepth(20000).setVisible(false);
        this.joyThumb = this.add.circle(0, 0, 30, 0xffffff, 0.5).setScrollFactor(0).setDepth(20001).setVisible(false);

        this.input.on('pointerdown', (pointer) => {
            if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
            if (pointer.x > this.scale.width - 80 && pointer.y < 80) return;
            this.joyBase.setPosition(pointer.x, pointer.y).setVisible(true);
            this.joyThumb.setPosition(pointer.x, pointer.y).setVisible(true);
        });

        this.input.on('pointermove', (pointer) => {
            if (this.isDead || !this.joyBase.visible || this.isLevelUpOpen || !this.isGameLoaded) return;
            let dist = Phaser.Math.Distance.Between(this.joyBase.x, this.joyBase.y, pointer.x, pointer.y);
            let angle = Phaser.Math.Angle.Between(this.joyBase.x, this.joyBase.y, pointer.x, pointer.y);

            let moveDist = Math.min(dist, 60);
            this.joyThumb.x = this.joyBase.x + Math.cos(angle) * moveDist;
            this.joyThumb.y = this.joyBase.y + Math.sin(angle) * moveDist;

            this.joystickVector.x = Math.cos(angle) * (moveDist / 60);
            this.joystickVector.y = Math.sin(angle) * (moveDist / 60);
        });

        this.input.on('pointerup', () => {
            this.joyBase.setVisible(false);
            this.joyThumb.setVisible(false);
            this.joystickVector = { x: 0, y: 0 };
        });
    }

    applyKnockback(enemy, angle, force) {
        if (!enemy || !enemy.active) return;

        if ((enemy.isBoss || enemy.isNamed) && (enemy.isDashing || enemy.isRaging)) return;

        enemy.knockbackTimer = this.time.now + 250;
        
        let factor = 1.0;
        if (enemy.isBoss) factor = 0.25; 
        else if (enemy.isNamed) factor = 0.70; 

        let finalForce = force * factor * 7;
        let kx = Math.cos(angle) * finalForce;
        let ky = Math.sin(angle) * finalForce;
        enemy.body.setVelocity(kx, ky);
    }

    update(time) {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) {
            this.player.body.setVelocity(0, 0);
            return;
        }

        if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || 
            Phaser.Input.Keyboard.JustDown(this.numOneKey) || 
            Phaser.Input.Keyboard.JustDown(this.numpadOneKey)) {
            this.useHeroActiveSkill();
        }

        if (Phaser.Input.Keyboard.JustDown(this.numTwoKey) || 
            Phaser.Input.Keyboard.JustDown(this.numpadTwoKey)) {
            this.useBossEquippedSkill();
        }

        let vx = 0, vy = 0;

        if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
        else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;

        if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
        else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

        if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
            vx = this.joystickVector.x;
            vy = this.joystickVector.y;
        } else if (vx !== 0 && vy !== 0) {
            vx *= Math.SQRT1_2; vy *= Math.SQRT1_2;
        }

        this.player.body.setVelocity(vx * this.playerStats.speed, vy * this.playerStats.speed);

        if ((vx !== 0 || vy !== 0) && time > this.lastFootstepTime + 350) {
            playRandomSFX(this, 'footstep', 0.2);
            this.lastFootstepTime = time;
        }

        if (Math.abs(vx) > Math.abs(vy)) {
            if (vx < 0) this.player.setTexture('hero_3');
            else if (vx > 0) this.player.setTexture('hero_4');
        } else if (Math.abs(vy) > 0) {
            if (vy > 0) this.player.setTexture('hero_1');
            else if (vy < 0) this.player.setTexture('hero_2');
        }

        this.player.setDepth(this.player.y);

        if (time > this.lastAttackTime + this.playerStats.attackDelay) {
            this.fireBasicSuri();
            this.lastAttackTime = time;
        }

        this.updateActiveSkills(time);
        if (this.isBossSpawned && this.boss && this.boss.active) {
            this.updateBossAI(time);
            this.updateBossHpUI();
        }

        this.enemies.getChildren().forEach(enemy => {
            if (enemy.hpBar && enemy.active) {
                enemy.hpBar.clear();
                if (enemy.hp < enemy.maxHp) {
                    let barW = enemy.isBoss ? 80 : (enemy.isNamed ? 50 : 30);
                    enemy.hpBar.fillStyle(0x000000, 0.5);
                    enemy.hpBar.fillRect(enemy.x - barW/2, enemy.y - (enemy.isBoss ? 50 : 25), barW, 6);
                    enemy.hpBar.fillStyle(0xff0000, 1);
                    enemy.hpBar.fillRect(enemy.x - barW/2, enemy.y - (enemy.isBoss ? 50 : 25), Math.max(0, barW * (enemy.hp / enemy.maxHp)), 6);
                }
            }
            if (enemy.updateLogic) enemy.updateLogic();
        });

        const pullGroup = (group) => {
            group.getChildren().forEach(item => {
                let dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
                if (item.isMagnetPulled || dist < this.playerStats.magnetRange) {
                    this.physics.moveToObject(item, this.player, 400);
                } else {
                    item.body.setVelocity(0, 0);
                }
            });
        };

        pullGroup(this.expItems);
        pullGroup(this.goldItems);
        pullGroup(this.meatItems);
        pullGroup(this.rareBoxItems);
        pullGroup(this.fieldMagnetItems);
    }

    getClosestEnemy() {
        if (this.boss && this.boss.active) return this.boss;
        let closest = null;
        let minDist = Infinity;
        this.enemies.getChildren().forEach(enemy => {
            let dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            if (dist < minDist) { minDist = dist; closest = enemy; }
        });
        return closest;
    }

    fireBasicSuri() {
        if (this.isDead) return;
        let target = this.getClosestEnemy();
        if (!target) return;

        playRandomSFX(this, 'suri_throw', 0.4);
        let angleBase = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);

        if(this.textures.exists('suri_vfx')) {
            let vfx = this.add.image(this.player.x, this.player.y, 'suri_vfx').setScale(0.18).setRotation(angleBase + Math.PI / 2).setDepth(9998);
            this.tweens.add({ targets: vfx, scale: 0.28, alpha: 0, duration: 120, onComplete: () => vfx.destroy() });
        }

        let count = 1 + this.playerStats.clone;
        let isBossTarget = (this.boss && this.boss.active && target === this.boss);

        for (let i = 0; i < count; i++) {
            let delay = isBossTarget ? i * 15 : 0;
            
            this.time.delayedCall(delay, () => {
                if (this.isDead) return;
                let suri = this.projectiles.create(this.player.x, this.player.y, 'suri').setScale(0.18).setDepth(9999);
                let angle = isBossTarget ? angleBase + Phaser.Math.FloatBetween(-0.08, 0.08) : angleBase + ((i - (count - 1) / 2) * 0.2);

                suri.rotation = angle + Math.PI / 2;
                suri.damage = this.playerStats.damage * (1 + (this.playerStats.posionLv * 0.10));
                suri.pierce = this.playerStats.pierce;
                suri.isBomb = false;
                suri.knockback = 15;
                suri.skillCategory = '기본 수리검';

                this.physics.velocityFromRotation(angle, 500, suri.body.velocity);
            });
        }
    }

    calcSkillDamage(baseDmg, pierceBonus) {
        let posionBonus = this.playerStats.posionLv * 0.10;
        let finalMult = 1.0 + pierceBonus + posionBonus;
        return baseDmg * finalMult;
    }

    getSkillBaseDamage(type, lv) {
        if (type === 'fire') {
            if (lv <= 2) return 9.0 + (lv * 6.75);
            if (lv <= 5) return 13.5 + (lv - 2) * 7.75;
            return 36.75 + (lv - 5) * (7.75 * 3);
        }
        if (type === 'water') {
            if (lv <= 2) return 13.5 + (lv * 5.6);
            if (lv <= 5) return 11.2 + (lv - 2) * 6.45;
            return 30.55 + (lv - 5) * (6.45 * 3);
        }
        if (type === 'bomb') {
            if (lv <= 2) return 9.0 + (lv * 4.5);
            if (lv <= 5) return 9.0 + (lv - 2) * 5.17;
            return 24.51 + (lv - 5) * (5.17 * 3);
        }
        return 10.0;
    }

    updateActiveSkills(time) {
        if (this.isDead) return;

        let target = this.getClosestEnemy();
        let pierceLv = this.playerStats.pierce;

        let fireWindPierceBonus = pierceLv > 0 ? (0.20 + (pierceLv - 1) * 0.05) : 0.0;
        let waterBombPierceBonus = pierceLv > 0 ? (0.50 + (pierceLv - 1) * 0.05) : 0.0;

        if (this.playerStats.fire > 0 && time > this.lastSkillTimes.fire + 1750) {
            playRandomSFX(this, 'skill_fire', 0.6);
            let angle = target ? Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y) : (this.player.texture.key === 'hero_3' ? Math.PI : 0);
            
            const createFireStream = (fireAngle) => {
                let spawnDist = 55;
                let posX = this.player.x + Math.cos(fireAngle) * spawnDist;
                let posY = this.player.y + Math.sin(fireAngle) * spawnDist;

                let fireLv = this.playerStats.fire;
                let sizeMult = 1.68 + ((fireLv - 1) * 0.12);
                let w = 140 * sizeMult;
                let h = 85 * sizeMult;

                let fire = this.physics.add.sprite(posX, posY, 'fire_stream')
                    .setDisplaySize(w, h)
                    .setRotation(fireAngle + Math.PI)
                    .setDepth(9999);

                if (fire.body) {
                    fire.body.setSize(w * 0.85, h * 0.75);
                }

                let baseDmg = this.getSkillBaseDamage('fire', fireLv);
                fire.damage = this.calcSkillDamage(baseDmg, fireWindPierceBonus);
                fire.isFireSkill = true;
                fire.skillCategory = '화둔';
                fire.hitEnemies = [];

                this.physics.add.overlap(fire, this.enemies, (f, enemy) => {
                    if (!f.hitEnemies.includes(enemy.id)) {
                        f.hitEnemies.push(enemy.id);
                        let finalDmg = f.damage;
                        if (enemy.isBoss || enemy.isNamed) finalDmg *= 1.30;
                        this.skillDmgStats['화둔'] += finalDmg;
                        this.damageEnemy(enemy, finalDmg);
                        this.applyKnockback(enemy, fireAngle, 12);
                    }
                });
                this.tweens.add({ targets: fire, alpha: 0, duration: 450, onComplete: () => fire.destroy() });
            };

            createFireStream(angle);
            if (this.playerStats.fire >= 3) {
                createFireStream(angle + Math.PI);
            }

            this.lastSkillTimes.fire = time;
        }

        if (this.playerStats.water > 0 && time > this.lastSkillTimes.water + (1600 - (this.playerStats.water * 100)) && target) {
            playRandomSFX(this, 'skill_water', 0.6);
            let baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
            let waterKey = this.textures.exists('water_dragon') ? 'water_dragon' : 'suri';
            
            let count = 2 + this.playerStats.water;
            let waterLv = this.playerStats.water;
            let baseDmg = this.getSkillBaseDamage('water', waterLv);

            for (let i = 0; i < count; i++) {
                let angle = baseAngle + ((i - (count - 1) / 2) * 0.25);
                let water = this.projectiles.create(this.player.x, this.player.y, waterKey).setDisplaySize(80, 80).setDepth(9999);
                
                let dx = target.x - this.player.x;
                if (dx < 0) {
                    water.setFlipY(true);
                    water.rotation = angle + Math.PI / 2;
                } else {
                    water.setFlipY(false);
                    water.rotation = angle + Math.PI / 2;
                }

                water.damage = this.calcSkillDamage(baseDmg, waterBombPierceBonus);
                water.isWaterSkill = true;
                water.skillCategory = '수둔';
                water.pierce = 0;
                water.isBomb = false;
                water.knockback = 10;
                this.physics.velocityFromRotation(angle, 420, water.body.velocity);
            }
            this.lastSkillTimes.water = time;
        }

        if (this.playerStats.bolt > 0) {
            let boltCd = Math.max(2000, 4000 - (this.playerStats.bolt * 400));
            if (time > this.lastSkillTimes.bolt + boltCd) {
                let sNum = Phaser.Math.Between(1, 3);
                if(!isSfxMuted && this.cache.audio.exists(`skill_bolt${sNum}`)) this.sound.play(`skill_bolt${sNum}`, { volume: 0.6 });

                let boltCount = 6 + (this.playerStats.bolt - 1) * 6;
                let boltDmg = 27 + (this.playerStats.bolt * 13.5);
                if (this.playerStats.bolt >= 6) boltDmg += (this.playerStats.bolt - 5) * (13.5 * 3);

                let calculatedBoltDmg = this.calcSkillDamage(boltDmg, 0);
                this.skillDmgStats['뇌둔'] += calculatedBoltDmg * boltCount;

                for(let b=0; b<boltCount; b++) {
                    let rx = this.player.x + Phaser.Math.Between(-400, 400);
                    let ry = this.player.y + Phaser.Math.Between(-400, 400);

                    let boltSprite = this.physics.add.sprite(rx, ry, 'bolt').setDisplaySize(117, 103).setDepth(9999);
                    boltSprite.damage = calculatedBoltDmg;
                    
                    this.enemies.getChildren().forEach(e => {
                        if(e.active && Phaser.Math.Distance.Between(rx, ry, e.x, e.y) <= 60) {
                            this.damageEnemy(e, boltSprite.damage);
                        }
                    });

                    this.tweens.add({ targets: boltSprite, alpha: 0, duration: 300, onComplete: () => boltSprite.destroy() });
                }
                this.lastSkillTimes.bolt = time;
            }
        }

        if (this.playerStats.wind > 0 && time > this.lastSkillTimes.wind + 4500) {
            playRandomSFX(this, 'skill_wind', 0.6);
            let baseAngle = target ? Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y) : Math.random() * Math.PI * 2;
            let windKey = this.textures.exists('rasenshuriken') ? 'rasenshuriken' : 'suri';

            let count = 1 + (this.playerStats.clone);
            let windLv = this.playerStats.wind;
            let baseDmg = 10.5 + (windLv <= 2 ? windLv * 3.75 : 7.5 + (windLv - 2) * 4.3);

            for (let i = 0; i < count; i++) {
                let angle = baseAngle + ((i - (count - 1) / 2) * 0.3);
                let wind = this.projectiles.create(this.player.x, this.player.y, windKey).setDisplaySize(120, 120).setDepth(9999);
                wind.damage = this.calcSkillDamage(baseDmg, fireWindPierceBonus);
                wind.skillCategory = '풍둔';
                wind.pierce = 999;
                wind.isBomb = false;
                wind.knockback = 17;
                wind.hitEnemies = [];

                this.tweens.add({ targets: wind, rotation: wind.rotation + Math.PI * 10, duration: 2500 });
                this.physics.velocityFromRotation(angle, 250, wind.body.velocity);
                this.time.delayedCall(3000, () => { if(wind.active) wind.destroy(); });
            }
            this.lastSkillTimes.wind = time;
        }

        if (this.playerStats.bomb > 0 && time > this.lastSkillTimes.bomb + 3200 && target) {
            playRandomSFX(this, 'skill_bomb', 0.6);
            let baseAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
            let bombKey = this.textures.exists('explosive_shuriken') ? 'explosive_shuriken' : 'suri';

            let count = 1 + (this.playerStats.clone);
            let bombLv = this.playerStats.bomb;
            let baseDmg = this.getSkillBaseDamage('bomb', bombLv);

            for (let i = 0; i < count; i++) {
                let angle = baseAngle + ((i - (count - 1) / 2) * 0.2);
                let bombSuri = this.projectiles.create(this.player.x, this.player.y, bombKey).setDisplaySize(40, 40).setDepth(9999);
                
                this.tweens.add({ targets: bombSuri, rotation: '+=12.56', duration: 1000, repeat: -1 });

                bombSuri.damage = this.calcSkillDamage(baseDmg, waterBombPierceBonus);
                bombSuri.skillCategory = '기폭찰';
                bombSuri.pierce = 0;
                bombSuri.isBomb = true;
                bombSuri.knockback = 10;
                
                this.physics.velocityFromRotation(angle, 450, bombSuri.body.velocity);
            }
            this.lastSkillTimes.bomb = time;
        }

        let earthLv = this.playerStats.earth;
        if (earthLv > 0) {
            let earthCooldown = Math.max(4000, 7000 - (earthLv * 600));
            let earthDuration = 1200 + ((earthLv - 1) * 300);

            if (time > this.lastSkillTimes.earth + earthCooldown) {
                playRandomSFX(this, 'skill_bomb', 0.5);
                
                let wallKey = this.textures.exists('earth_wall') ? 'earth_wall' : 'suri_vfx';
                let wall = this.physics.add.sprite(this.player.x, this.player.y, wallKey).setDisplaySize(280, 160).setDepth(9998);
                
                wall.clearTint();
                if(wall.preFX) wall.preFX.addGlow(0x8B4513, 3, 0, false);

                wall.damage = 0;
                wall.hitEnemies = [];

                let wallOverlap = this.time.addEvent({
                    delay: 100,
                    repeat: Math.floor(earthDuration / 100),
                    callback: () => {
                        if (!wall || !wall.active) return;

                        this.bossProjectiles.getChildren().forEach(fish => {
                            if (fish.active && Phaser.Math.Distance.Between(wall.x, wall.y, fish.x, fish.y) <= 140) {
                                fish.destroy();
                            }
                        });

                        this.enemies.getChildren().forEach(e => {
                            if (!e.active) return;
                            let dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
                            if (dist <= 140) {
                                let pushAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
                                this.applyKnockback(e, pushAngle, 42);
                            }
                        });
                    }
                });

                this.tweens.add({ 
                    targets: wall, 
                    alpha: { from: 1, to: 0 }, 
                    delay: earthDuration - 300, 
                    duration: 300, 
                    onComplete: () => {
                        if(wallOverlap) wallOverlap.destroy();
                        wall.destroy(); 
                    } 
                });

                this.lastSkillTimes.earth = time;
            }
        }
    }

    spawnBoss() {
        this.isBossSpawned = true;
        this.stopNormalSpawns = true;

        playBGM(this, 'final_boss');

        if (this.timerText) this.timerText.setVisible(false);
        if (this.bossHpBg) this.bossHpBg.setVisible(true);
        if (this.bossHpBar) this.bossHpBar.setVisible(true);
        if (this.bossHpTxt) this.bossHpTxt.setVisible(true);

        let ex = this.player.x + 500;
        let ey = this.player.y - 500;

        this.boss = this.enemies.create(ex, ey, 'duck1').setDisplaySize(120, 120);
        this.boss.id = 'STAGE_BOSS';
        this.boss.isBoss = true;
        this.boss.isNamed = true;
        this.boss.isDashing = false;
        this.boss.isRaging = false;
        this.boss.hasBeenHit = false;

        this.boss.hp = 20000;
        this.boss.maxHp = 20000;
        this.bossRemainingHp = 20000;
        this.bossDamageDealt = 0;
        this.boss.hpBar = this.add.graphics().setDepth(100);

        let warnY = isMobile ? 235 : 160;
        let warn = this.add.text(this.scale.width / 2, warnY, '⚠ STAGE BOSS 등장! ⚠\n오리너구리 레오파드', {
            fontSize: '36px', fill: '#ff0055', fontStyle: 'bold', align: 'center', padding: { top: 8, bottom: 8 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
        this.time.delayedCall(3000, () => warn.destroy());

        this.lastBossDashTime = this.time.now;
        this.lastBossMinionTime = this.time.now;

        this.lastBossPos = { x: this.boss.x, y: this.boss.y };
        this.bossStuckStartTime = this.time.now;
    }

    updateBossAI(time) {
        if (!this.boss || !this.boss.active) return;

        let spd = this.boss.isRaging ? 220 : (this.boss.isDashing ? 198 : 66); 

        if (!this.boss.isDashing && !this.boss.isRaging && this.boss.knockbackTimer && time < this.boss.knockbackTimer) return;

        this.physics.moveToObject(this.boss, this.player, spd);

        let vx = this.boss.body.velocity.x;
        let vy = this.boss.body.velocity.y;

        if (Math.abs(vx) > Math.abs(vy)) {
            this.boss.setTexture('duck3');
            this.boss.setFlipX(vx > 0);
        } else if (vy > 0) {
            this.boss.setTexture('duck1');
            this.boss.setFlipX(false);
        } else {
            this.boss.setTexture('duck2');
            this.boss.setFlipX(false);
        }

        // 보스 2초 이동 정지(끼임) 시 주변 장애물 즉시 3회 피격 적용 파괴
        let movedDist = Phaser.Math.Distance.Between(this.boss.x, this.boss.y, this.lastBossPos.x, this.lastBossPos.y);

        if (movedDist < 12) {
            if (!this.bossStuckStartTime) this.bossStuckStartTime = time;
            else if (time - this.bossStuckStartTime >= 2000) {
                this.bossStuckStartTime = time;

                this.obstacles.getChildren().forEach(obs => {
                    if (obs.active && Phaser.Math.Distance.Between(this.boss.x, this.boss.y, obs.x, obs.y) <= 110) {
                        this.hitAndCheckObstacleBreak(obs); // 1회 피격 즉시 파괴
                    }
                });
            }
        } else {
            this.lastBossPos = { x: this.boss.x, y: this.boss.y };
            this.bossStuckStartTime = time;
        }

        if (this.boss.hasBeenHit && !this.boss.isRaging && (!this.lastBossUltimateTime || time > this.lastBossUltimateTime + 30000)) {
            this.triggerBossUltimateSkill(time);
            this.lastBossUltimateTime = time;
        }

        if (!this.boss.isRaging && (!this.lastBossDashTime || time > this.lastBossDashTime + 14000)) {
            this.boss.isDashing = true;
            let dashGlow = null;
            if(this.boss.preFX) dashGlow = this.boss.preFX.addGlow(0xff0000, 6, 0, false);

            this.time.delayedCall(2000, () => {
                if(this.boss && this.boss.active) {
                    this.boss.isDashing = false;
                    if(dashGlow) dashGlow.destroy();
                }
            });
            this.lastBossDashTime = time;
        }

        if (!this.lastBossMinionTime || time > this.lastBossMinionTime + 12000) {
            this.spawnBossMinions();
            this.lastBossMinionTime = time;
        }

        if (!this.lastBossAtkTime || time > this.lastBossAtkTime + 3000) {
            this.fireBossGoldenFish(this.player.x, this.player.y, 20, 250, 45, 33);
            this.lastBossAtkTime = time;
        }
    }

    triggerBossRagePattern() {
        if (!this.boss || !this.boss.active || this.boss.isRaging) return;

        this.boss.isRaging = true;
        
        let warnY = isMobile ? 235 : 140;
        let rageWarn = this.add.text(this.scale.width / 2, warnY, '💥 보스의 분노! [바둥거리기] 발동! 💥', {
            fontSize: '28px', fill: '#ffaa00', fontStyle: 'bold', padding: { top: 6, bottom: 6 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
        this.time.delayedCall(2500, () => rageWarn.destroy());

        let rageGlow = null;
        if (this.boss.preFX) rageGlow = this.boss.preFX.addGlow(0xff3300, 8, 0, false);

        this.time.delayedCall(10000, () => {
            if (this.boss && this.boss.active) {
                if (rageGlow) rageGlow.destroy();
                
                this.triggerBossUltimateSkill(this.time.now);
                this.time.delayedCall(1600, () => {
                    if (this.boss && this.boss.active) {
                        this.triggerBossUltimateSkill(this.time.now);
                        this.boss.isRaging = false;
                    }
                });
            }
        });
    }

    spawnBossMinions() {
        if (!this.boss || !this.boss.active) return;
        
        playRandomSFX(this, 'boss_warning', 0.6);
        for (let i = 0; i < 60; i++) {
            let angle = (Math.PI * 2 / 60) * i;
            let sx = this.boss.x + Math.cos(angle) * 140;
            let sy = this.boss.y + Math.sin(angle) * 140;

            let minion = this.enemies.create(sx, sy, 'sli1').setScale(0.26);
            minion.id = Phaser.Utils.String.UUID();
            minion.setTint(0x4488FF); 
            minion.hp = 50; 
            minion.maxHp = 50;
            minion.hpBar = this.add.graphics().setDepth(100);

            minion.update = () => {
                if (minion.knockbackTimer && this.time.now < minion.knockbackTimer) return;
                this.physics.moveToObject(minion, this.player, 136); 
            };
        }
    }

    triggerBossUltimateSkill(time) {
        let bSkillNum = Phaser.Math.Between(1, 2);
        if(!isSfxMuted && this.cache.audio.exists(`boss_skill_used${bSkillNum}`)) this.sound.play(`boss_skill_used${bSkillNum}`, { volume: 0.8 });

        let cutInSize = isMobile ? 380 : 380;
        let cutInX = isMobile ? this.scale.width / 2 : 190;
        let cutInY = isMobile ? this.scale.height / 2 : this.scale.height - 190;

        let skillCutIn = this.add.image(cutInX, cutInY, 'duck_skill').setDisplaySize(cutInSize, cutInSize).setScrollFactor(0).setDepth(20000);
        this.time.delayedCall(1500, () => skillCutIn.destroy());

        this.cameras.main.shake(300, 0.02);

        let px = this.player.x;
        let py = this.player.y;

        for(let f=0; f<90; f++) {
            this.time.delayedCall(f * 40, () => {
                let gunNum = Phaser.Math.Between(1, 4);
                if(!isSfxMuted && this.cache.audio.exists(`stage1_skill${gunNum}`)) this.sound.play(`stage1_skill${gunNum}`, { volume: 0.35 });

                let fx = px + Phaser.Math.Between(-350, 350);
                let fy = py + Phaser.Math.Between(-350, 350);
                this.fireBossGoldenFish(fx, fy, 10, 420, 31, 23);
            });
        }
    }

    fireBossGoldenFish(tx, ty, dmg, spd, w = 45, h = 33) {
        if(!this.boss || !this.boss.active) return;
        let fish = this.bossProjectiles.create(this.boss.x, this.boss.y, 'golden_fish').setDisplaySize(w, h).setDepth(9999);
        
        let dx = tx - this.boss.x;
        let angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, tx, ty);
        
        if (dx >= 0) {
            fish.setFlipY(true);
            fish.rotation = angle + Math.PI;
        } else {
            fish.setFlipY(false);
            fish.rotation = angle + Math.PI;
        }

        fish.damage = dmg;
        this.physics.velocityFromRotation(angle, spd, fish.body.velocity);
    }

    handleBossProjectileHit(player, fish) {
        fish.destroy();
        let realDmg = Math.max(1, fish.damage - this.playerStats.defense);
        this.playerStats.hp -= realDmg;
        this.updateHpUI();

        this.cameras.main.shake(120, 0.01);
        player.setTintFill(0xff0000);
        this.time.delayedCall(100, () => { if(player.active) player.clearTint(); });

        if (this.playerStats.hp <= 0) {
            this.triggerPlayerDeath();
        }
    }

    spawnNamedMonster() {
        if (this.isDead || this.stopNormalSpawns || !this.isGameLoaded) return;

        playRandomSFX(this, 'boss_warning', 0.8);

        let warnY = isMobile ? 235 : 140;
        let namedWarn = this.add.text(this.scale.width / 2, warnY, '⚠ 네임드 슬라임 출현! ⚠', {
            fontSize: '28px', fill: '#DDA0DD', fontStyle: 'bold', padding: { top: 6, bottom: 6 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);
        this.time.delayedCall(2500, () => namedWarn.destroy());

        let angle = Math.random() * Math.PI * 2;
        let ex = this.player.x + Math.cos(angle) * 750;
        let ey = this.player.y + Math.sin(angle) * 750;

        let named = this.enemies.create(ex, ey, 'ssli1').setScale(0.55);
        named.id = Phaser.Utils.String.UUID();
        named.isNamed = true;
        named.isDashing = false;
        named.setTint(0xDDA0DD);

        if (named.preFX) {
            named.preFX.addGlow(0xDDA0DD, 6, 0, false);
        }

        named.hp = 4500;
        named.maxHp = 4500;
        named.hpBar = this.add.graphics().setDepth(100);

        named.lastDashTime = this.time.now;

        named.updateLogic = () => {
            if (!named.active) return;
            let now = this.time.now;

            if (now > named.lastDashTime + 20000) {
                named.isDashing = true;
                let nGlow = null;
                if(named.preFX) nGlow = named.preFX.addGlow(0xff0000, 6, 0, false);

                this.time.delayedCall(2000, () => {
                    if(named && named.active) {
                        named.isDashing = false;
                        if(nGlow) nGlow.destroy();
                    }
                });
                named.lastDashTime = now;
            }

            if (!named.isDashing && named.knockbackTimer && now < named.knockbackTimer) return;
            let speed = named.isDashing ? 120 : 60;
            this.physics.moveToObject(named, this.player, speed);
        };
    }

    spawnEnemies() {
        if (this.isDead || this.isLevelUpOpen || this.stopNormalSpawns || !this.isGameLoaded) return;
        
        let baseCount = (this.elapsedTime <= 90) ? 6 : 4;
        let count = baseCount + Math.floor(this.elapsedTime / 30);

        for (let i = 0; i < count; i++) {
            let angle = Math.random() * Math.PI * 2;
            let ex = this.player.x + Math.cos(angle) * 800;
            let ey = this.player.y + Math.sin(angle) * 800;

            let isType1 = Math.random() < 0.5;
            let key = isType1 ? 'sli1' : 'ssli1';
            let enemy = this.enemies.create(ex, ey, key).setScale(0.26);
            enemy.id = Phaser.Utils.String.UUID();
            enemy.isType1 = isType1;
            enemy.isNamed = false;

            let baseHp = 10;
            if (this.elapsedTime > 60) {
                baseHp += Math.floor((this.elapsedTime - 60) / 20) * 4;
            }

            let targetTime = isTestMode ? 60 : this.stageData.time;
            let halfTime = Math.floor(targetTime / 2);
            if (this.elapsedTime >= halfTime) {
                enemy.setTint(0x4488FF); 
            }

            enemy.hp = baseHp;
            enemy.maxHp = baseHp;
            enemy.hpBar = this.add.graphics().setDepth(100);

            enemy.update = () => {
                if (enemy.knockbackTimer && this.time.now < enemy.knockbackTimer) return;
                this.physics.moveToObject(enemy, this.player, 68);
            };
        }
    }

    handleProjectileHit(projectile, enemy) {
        if (projectile.hitEnemies) {
            if (projectile.hitEnemies.includes(enemy.id)) return;
            projectile.hitEnemies.push(enemy.id);
        }

        let realDmg = projectile.damage;

        if ((projectile.isWaterSkill || projectile.isFireSkill) && (enemy.isBoss || enemy.isNamed)) {
            realDmg *= 1.30;
        }

        let cat = projectile.skillCategory || (projectile.isHeroUltimate ? '수리검 난무' : '기본 수리검');
        this.skillDmgStats[cat] = (this.skillDmgStats[cat] || 0) + realDmg;
        
        if (enemy.isBoss) {
            // 광폭화 [바둥거리기] 발동 중일 때는 받는 피해 90% 감소 (10%만 반영)
            if (enemy.isRaging) {
                realDmg *= 0.10;
            }

            if (!enemy.hasBeenHit) {
                enemy.hasBeenHit = true;
                this.triggerBossUltimateSkill(this.time.now);
                this.lastBossUltimateTime = this.time.now;
            }

            if (projectile.texture.key !== 'suri' && !projectile.isHeroUltimate) {
                realDmg *= 0.80;
            }

            let now = this.time.now;
            this.bossDamageWindow.push({ time: now, dmg: realDmg });
            this.bossDamageWindow = this.bossDamageWindow.filter(d => now - d.time <= 3000);
            let sumDmg = this.bossDamageWindow.reduce((acc, cur) => acc + cur.dmg, 0);

            if (sumDmg >= 3000 && !enemy.isRaging) {
                this.triggerBossRagePattern();
            }
        }

        this.damageEnemy(enemy, realDmg);

        let hitAngle = Phaser.Math.Angle.Between(projectile.x, projectile.y, enemy.x, enemy.y);
        this.applyKnockback(enemy, hitAngle, projectile.knockback || 15);

        if (projectile.isBomb) {
            playRandomSFX(this, 'skill_bomb', 0.5);
            let explosionX = projectile.x;
            let explosionY = projectile.y;
            
            let explosionKey = this.textures.exists('explosion_vfx') ? 'explosion_vfx' : 'suri_vfx';
            let explosion = this.physics.add.sprite(explosionX, explosionY, explosionKey).setDisplaySize(90, 90).setDepth(9999);
            
            let areaRadius = 35;
            this.enemies.getChildren().forEach(e => {
                if (e.active && e !== enemy) {
                    let dist = Phaser.Math.Distance.Between(explosionX, explosionY, e.x, e.y);
                    if (dist <= areaRadius) {
                        let expDmg = projectile.damage * 0.8;
                        this.skillDmgStats['기폭찰'] += expDmg;
                        if(e.isBoss) {
                            expDmg *= 0.80;
                        }
                        this.damageEnemy(e, expDmg);
                        this.applyKnockback(e, Phaser.Math.Angle.Between(explosionX, explosionY, e.x, e.y), 10);
                    }
                }
            });

            this.tweens.add({ targets: explosion, scaleX: 1.3, scaleY: 1.3, alpha: 0, duration: 250, onComplete: () => explosion.destroy() });
        }

        if (projectile.pierce <= 0) {
            projectile.destroy();
        } else {
            projectile.pierce--;
        }
    }

    damageEnemy(enemy, dmg) {
        playRandomSFX(this, 'hit_impact', 0.3);
        enemy.hp -= dmg;

        if (enemy.isBoss) {
            this.bossDamageDealt += dmg;
            this.bossRemainingHp = Math.max(0, enemy.hp);
        }

        if (enemy.setTint) {
            enemy.setTint(0xffffff);
            this.time.delayedCall(100, () => {
                if(enemy.active) {
                    let targetTime = isTestMode ? 60 : this.stageData.time;
                    let halfTime = Math.floor(targetTime / 2);
                    if(enemy.isNamed) enemy.setTint(0xDDA0DD);
                    else if(this.elapsedTime >= halfTime) enemy.setTint(0x4488FF);
                    else enemy.clearTint();
                }
            });
        }

        if (enemy.hp <= 0) {
            if (enemy.hpBar) enemy.hpBar.destroy();
            this.killedEnemiesCount++;

            if (enemy.isBoss) {
                this.playerStats.gold += 300;

                enemy.destroy();
                this.physics.pause();

                if (!isTestMode) {
                    this.saveGameResult(true);
                }

                this.showClearReportUI();
                return;
            }

            if (enemy.isNamed) {
                let rBox = this.rareBoxItems.create(enemy.x - 20, enemy.y, 'rare_box').setDisplaySize(45, 45);
                let bigExp = this.expItems.create(enemy.x + 20, enemy.y, 'sli_drop1').setDisplaySize(50, 50);
                bigExp.expAmount = 40;

                for (let g = 0; g < 3; g++) {
                    let gx = enemy.x + Phaser.Math.Between(-25, 25);
                    let gy = enemy.y + Phaser.Math.Between(-25, 25);
                    this.goldItems.create(gx, gy, 'sli_drop3').setScale(0.3);
                }
            } else {
                this.expItems.create(enemy.x, enemy.y, 'sli_drop1').setScale(0.3);
                if (Math.random() < 0.015) this.goldItems.create(enemy.x, enemy.y, 'sli_drop3').setScale(0.3);
                if (Math.random() < 0.0025) this.meatItems.create(enemy.x, enemy.y, 'meat').setDisplaySize(35, 35);
                if (Math.random() < 0.004) this.fieldMagnetItems.create(enemy.x, enemy.y, 'field_magnet').setDisplaySize(35, 35);
            }

            enemy.destroy();
        }
    }

    showClearReportUI() {
        let cx = this.scale.width / 2;
        let cy = this.scale.height / 2;

        this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.88).setScrollFactor(0).setDepth(20000);

        this.add.image(cx, cy - 240, 'clear_box').setDisplaySize(90, 90).setScrollFactor(0).setDepth(20001);
        
        this.add.text(cx, cy - 170, '🎉 STAGE CLEAR! 🎉', { 
            fontSize: '34px', fill: '#00ffcc', fontStyle: 'bold' 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001);

        this.add.text(cx, cy - 110, '🎁 보스 스킬 해금!: [붕어빵 융단폭격] (+300G 보상)', { 
            fontSize: '18px', fill: '#ffdd00', fontStyle: 'bold' 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001);

        let mins = Math.floor(this.elapsedTime / 60);
        let secs = this.elapsedTime % 60;
        let reportStr = `처치한 적: ${this.killedEnemiesCount}마리 | 생존 시간: ${mins}분 ${secs}초\n획득한 총 골드: ${this.playerStats.gold} G\n\n[스킬별 가한 데미지]`;

        Object.keys(this.skillDmgStats).forEach(sk => {
            if (this.skillDmgStats[sk] > 0) {
                reportStr += `\n- ${sk}: ${Math.floor(this.skillDmgStats[sk]).toLocaleString()} dmg`;
            }
        });

        this.add.text(cx, cy + 20, reportStr, { 
            fontSize: '15px', fill: '#ffffff', align: 'center', lineSpacing: 6 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001);

        let okBtn = this.add.text(cx, cy + 220, '확인 (메인으로)', {
            fontSize: '22px', fill: '#fff', backgroundColor: '#00aa66', padding: { x: 25, y: 10 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001).setInteractive();

        okBtn.on('pointerover', () => okBtn.setBackgroundColor('#aa7722').setFill('#fff'));
        okBtn.on('pointerout', () => okBtn.setBackgroundColor('#00aa66').setFill('#fff'));

        okBtn.on('pointerdown', () => {
            playRandomSFX(this, 'button');
            isTestMode = false; 
            this.scene.start('TitleScene');
        });
    }

    handlePlayerHit(player, enemy) {
        if (this.isDead || this.isInvincible || this.isLevelUpOpen || !this.isGameLoaded) return;

        let rawDmg = enemy.isBoss ? 30 : (enemy.isNamed ? 20 : 10);
        let realDmg = Math.max(1, rawDmg - this.playerStats.defense);

        this.playerStats.hp -= realDmg;
        this.updateHpUI();
        this.isInvincible = true;

        this.cameras.main.shake(150, 0.015);
        player.setTintFill(0xff0000);
        
        let flash = this.add.rectangle(this.player.x, this.player.y, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0xff0000, 0.3).setDepth(10000);
        this.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });
        
        this.tweens.add({ 
            targets: player, 
            alpha: 0.3, 
            duration: 100, 
            yoyo: true, 
            repeat: 2, 
            onComplete: () => { 
                player.clearTint(); 
                player.alpha = 1; 
                this.isInvincible = false; 
            } 
        });

        if (this.playerStats.hp <= 0) {
            this.triggerPlayerDeath();
        }
    }

    triggerPlayerDeath() {
        this.isDead = true; 
        this.physics.pause();
        playRandomSFX(this, 'game_over');

        this.player.setTint(0x222222);

        let px = this.player.x;
        let py = this.player.y;
        this.player.setVisible(false);

        this.add.image(px, py, 'hero_dead').setDisplaySize(132, 141).setDepth(this.player.depth);

        this.time.delayedCall(2000, () => {
            if (!isTestMode) this.saveGameResult(false);
            this.showGameOverReportUI();
        });
    }

    showGameOverReportUI() {
        let cx = this.scale.width / 2;
        let cy = this.scale.height / 2;

        this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.88).setScrollFactor(0).setDepth(20000);

        this.add.image(cx, cy - 240, 'hero_dead').setDisplaySize(90, 96).setScrollFactor(0).setDepth(20001);
        
        this.add.text(cx, cy - 170, '💀 GAME OVER 💀', { 
            fontSize: '34px', fill: '#ff3333', fontStyle: 'bold' 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001);

        let mins = Math.floor(this.elapsedTime / 60);
        let secs = this.elapsedTime % 60;
        
        let reportStr = `처치한 적: ${this.killedEnemiesCount}마리 | 생존 시간: ${mins}분 ${secs}초\n획득한 골드: ${this.playerStats.gold} G`;
        
        if (this.isBossSpawned) {
            reportStr += `\n[⚔️ 보스 전투] 피해량: ${Math.floor(this.bossDamageDealt)} (남은 HP: ${Math.floor(this.bossRemainingHp)} / 20000)`;
        }

        reportStr += "\n\n[스킬별 가한 데미지]";
        Object.keys(this.skillDmgStats).forEach(sk => {
            if (this.skillDmgStats[sk] > 0) {
                reportStr += `\n- ${sk}: ${Math.floor(this.skillDmgStats[sk]).toLocaleString()} dmg`;
            }
        });

        this.add.text(cx, cy + 15, reportStr, { 
            fontSize: '15px', fill: '#ffffff', align: 'center', lineSpacing: 6 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001);

        let okBtn = this.add.text(cx, cy + 220, '확인 (스테이지 선택)', {
            fontSize: '20px', fill: '#fff', backgroundColor: '#aa2222', padding: { x: 20, y: 8 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20001).setInteractive();

        okBtn.on('pointerover', () => okBtn.setBackgroundColor('#ff4444').setFill('#fff'));
        okBtn.on('pointerout', () => okBtn.setBackgroundColor('#aa2222').setFill('#fff'));

        okBtn.on('pointerdown', () => {
            playRandomSFX(this, 'button');
            isTestMode = false; 
            this.scene.start('StageSelectScene');
        });
    }

    collectExp(player, exp) {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
        let amount = (exp.expAmount || 1) * this.playerStats.expBonus;
        exp.destroy();
        playRandomSFX(this, 'pickup', 0.4);
        this.playerStats.exp += amount;

        if (this.playerStats.exp >= this.playerStats.maxExp) {
            this.playerStats.level++;
            this.playerStats.exp = 0;
            
            if (this.playerStats.level === 2) this.playerStats.maxExp = 10;
            else if (this.playerStats.level === 3) this.playerStats.maxExp = 14;
            else if (this.playerStats.level < 10) this.playerStats.maxExp = Math.floor(this.playerStats.maxExp * 1.25) + 6;
            else if (this.playerStats.level < 18) this.playerStats.maxExp = Math.floor(this.playerStats.maxExp * 1.18) + 4;
            else this.playerStats.maxExp = Math.floor(this.playerStats.maxExp * 1.10) + 2;

            this.levelText.setText(`LV.${this.playerStats.level}`);
            this.showLevelUpUI(false);
        }
        this.expBar.setSize((this.playerStats.exp / this.playerStats.maxExp) * (isMobile ? 120 : 200), 14);
    }

    collectGold(player, gold) {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
        gold.destroy();
        playRandomSFX(this, 'pickup', 0.5);
        this.playerStats.gold += 10;
        this.goldText.setText(`${this.playerStats.gold}`);
    }

    collectMeat(player, meat) {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
        meat.destroy();
        playRandomSFX(this, 'pickup', 0.6);
        this.playerStats.hp = Math.min(this.playerStats.hp + 30, this.playerStats.maxHp);
        this.updateHpUI();
    }

    collectRareBox(player, rBox) {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
        rBox.destroy();
        playRandomSFX(this, 'level_up', 0.7);
        this.showLevelUpUI(true);
    }

    collectFieldMagnet(player, mag) {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
        mag.destroy();
        playRandomSFX(this, 'pickup', 0.8);

        const markPulled = (group) => {
            group.getChildren().forEach(item => { item.isMagnetPulled = true; });
        };

        markPulled(this.expItems);
        markPulled(this.goldItems);
        markPulled(this.meatItems);
        markPulled(this.rareBoxItems);
        markPulled(this.fieldMagnetItems);
    }

    updateGameLogic() {
        if (this.isDead || this.isLevelUpOpen || !this.isGameLoaded) return;
        this.elapsedTime++;

        if (this.heroSkillCooldown > 0) {
            this.heroSkillCooldown--;
            if (this.heroSkillCooldown <= 0) {
                this.heroSkillOverlay.setVisible(false);
                this.heroSkillText.setText('');
            } else {
                this.heroSkillText.setText(`${this.heroSkillCooldown}`);
            }
        }

        if (this.bossEquippedSkillCooldown > 0) {
            this.bossEquippedSkillCooldown--;
            if (this.bossEquippedSkillCooldown <= 0) {
                this.bossSkillOverlay.setVisible(false);
                this.bossSkillText.setText('');
            } else {
                this.bossSkillText.setText(`${this.bossEquippedSkillCooldown}`);
            }
        }

        let targetTime = isTestMode ? 60 : this.stageData.time;
        let remainTime = Math.max(0, targetTime - this.elapsedTime);
        let mins = Math.floor(remainTime / 60);
        let secs = remainTime % 60;
        
        if (!this.isBossSpawned) {
            this.timerText.setText(`⏳ 보스까지 ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        }

        if (!this.stopNormalSpawns && (this.elapsedTime > 0 && this.elapsedTime % 120 === 0) && this.elapsedTime !== this.lastNamedSpawnTime) {
            this.spawnNamedMonster();
            this.lastNamedSpawnTime = this.elapsedTime;
        }

        this.enemies.getChildren().forEach(e => { if (e.update) e.update(); });

        if (this.elapsedTime >= targetTime && !this.isBossSpawned) {
            this.spawnBoss();
        }
    }

    saveGameResult(isClear) {
        fetch('/api/survive/save_result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stage_id: this.stageData.id,
                clear_time: this.elapsedTime,
                earned_gold: this.playerStats.gold,
                player_level: this.playerStats.level,
                is_clear: isClear
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.success) {
                USER_GLOBAL_DATA.survive_gold = data.total_gold;
                if (data.unlocked_skill) {
                    USER_GLOBAL_DATA.unlocked_boss_skills.push({ skill_key: data.unlocked_skill, stage_id: this.stageData.id });
                }
            }
        })
        .catch(err => console.error("결과 저장 중 오류:", err));
    }

    showLevelUpUI(isRareOnly = false) {
        this.isLevelUpOpen = true;
        this.physics.pause();
        playRandomSFX(this, 'level_up');

        this.levelUpElements = [];

        let overlay = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.85)
            .setScrollFactor(0)
            .setDepth(20000)
            .setInteractive();

        let titleTxt = isRareOnly ? '★ 레어 보상 획득! ★' : (this.pendingLevelUps > 0 ? `LEVEL UP! (남은 보상: ${this.pendingLevelUps}개)` : 'LEVEL UP!');
        let titleColor = isRareOnly ? '#ffdd00' : '#ffcc00';

        let titleY = isMobile ? 180 : 80;
        let title = this.add.text(this.scale.width / 2, titleY, titleTxt, { 
            fontSize: isMobile ? '32px' : '42px', fill: titleColor, fontStyle: 'bold', padding: { top: 10, bottom: 10 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);

        this.levelUpElements.push(overlay, title);

        let pLv = this.playerStats.pierce || 0;
        let hLv = this.playerStats.heroSkillLv || 0;

        const rewardPool = [
            { id: 'fire', type: 'normal', name: '화둔: 호화구의 술', desc: `전방 화염 분사 (네임드/보스 +30% 피해, Lv.6부터 데미지 3배 폭등)`, statKey: 'fire', icon: 'scroll_fire_stream', maxLv: 7 },
            { id: 'water', type: 'normal', name: '수둔: 수룡탄의 술', desc: `적을 향해 수룡탄 발사 (네임드/보스 +30% 피해, Lv.6부터 데미지 3배 폭등)`, statKey: 'water', icon: 'scroll_water_dragon', maxLv: 7 },
            { id: 'bomb', type: 'normal', name: '기폭찰 수리검', desc: '명중 위치 범위 폭발 (Lv.6부터 데미지 3배 폭등)', statKey: 'bomb', icon: 'scroll_explosive_shuriken', maxLv: 7 },
            { id: 'bolt', type: 'normal', name: '뇌둔: 번개 소환', desc: '랜덤 위치 번개 폭격 (다음 레벨: 번개 +6개 & 데미지 상향)', statKey: 'bolt', icon: 'scroll_bolt', maxLv: 7 },
            { id: 'heroSkill', type: 'normal', name: '수리검 난무 강화', desc: `[궁극기] 발사 수 +10발 증량 & 쿨타임 -10% 감소 (현재: Lv.${hLv})`, statKey: 'heroSkillLv', icon: 'suri_vfx', maxLv: 5 },
            { id: 'magnet', type: 'normal', name: '노획 (자력)', desc: '경험치 및 골드 획득 범위 +40 넓힙니다.', statKey: 'magnet', icon: 'scroll_magnet', maxLv: 5 },
            { id: 'posion', type: 'normal', name: '닌자 비전: 병량환', desc: '공격속도 상승 및 모든 스킬 데미지 +10% 대폭 증가', statKey: 'posionLv', icon: 'ninja_posion', maxLv: 3 },
            { id: 'hp', type: 'normal', name: '체력 한계 돌파', desc: '최대 체력을 +20 늘리고 체력을 회복합니다.', statKey: 'maxHpLv', icon: 'ninja_hp_posion', maxLv: 10 },
            { id: 'speed', type: 'normal', name: '족경술: 이속 증가', desc: '플레이어의 이동속도를 +12 증가시킵니다.', statKey: 'speedLv', icon: 'ninja_speed', maxLv: 5 },
            
            { id: 'earth', type: 'rare', name: '[레어] 토둔: 토류벽', desc: `적 투사체 즉시 파괴 및 밀쳐내기 (지속시간 +0.3초 / 쿨타임 -0.6초)`, statKey: 'earth', icon: 'scroll_earth_wall', maxLv: 5 },
            { id: 'wind', type: 'rare', name: '[레어] 풍둔: 나선 수리검', desc: '상대를 갈아버리는 나선수리검 (관통 무제한)', statKey: 'wind', icon: 'scroll_rasenshuriken', maxLv: 5 },
            { id: 'pierce', type: 'rare', name: '[레어] 관통의 인', desc: pLv === 0 ? '수둔/기폭찰 데미지 +50%, 화둔/나선 데미지 +20% 상승 (수리검 난무 관통+1)' : '모든 스킬 데미지 추가 +5% 상승', statKey: 'pierce', icon: 'scroll_pierce', maxLv: 3 },
            { id: 'clone', type: 'rare', name: '[레어] 분신술', desc: '기본공격, 기폭찰, 나선수리검 발사 수 증가', statKey: 'clone', icon: 'scroll_clone', maxLv: 3 }
        ];

        let available = rewardPool.filter(r => {
            if (isRareOnly && r.type !== 'rare') return false;
            return (this.playerStats[r.statKey] || 0) < r.maxLv;
        });

        if (available.length < 3) {
            while(available.length < 3) {
                available.push({ id: 'heal', type: 'normal', name: '체력 회복', desc: '체력을 즉시 20 회복합니다.', statKey: 'healLv', icon: 'ninja_hp_posion', maxLv: 999 });
            }
        }

        let shuffled = [];
        let rareCandidates = available.filter(a => a.type === 'rare');
        let normalCandidates = available.filter(a => a.type !== 'rare');

        for (let k = 0; k < 3; k++) {
            let pickRare = (Math.random() < 0.09) && rareCandidates.length > 0;
            if (pickRare) {
                let picked = Phaser.Utils.Array.RemoveRandomElement(rareCandidates);
                if (picked) shuffled.push(picked);
            } else if (normalCandidates.length > 0) {
                let picked = Phaser.Utils.Array.RemoveRandomElement(normalCandidates);
                if (picked) shuffled.push(picked);
            } else if (rareCandidates.length > 0) {
                let picked = Phaser.Utils.Array.RemoveRandomElement(rareCandidates);
                if (picked) shuffled.push(picked);
            }
        }

        let selected = shuffled.slice(0, 3);

        let cardWidth = isMobile ? 440 : 680;
        let cardHeight = isMobile ? 150 : 110;
        let cardSpacing = isMobile ? 180 : 125;
        let startY = isMobile ? 320 : 190;
        let cardX = this.scale.width / 2;

        selected.forEach((reward, idx) => {
            let posY = startY + (idx * cardSpacing);
            let isRare = reward.type === 'rare';

            let strokeColor = isRare ? 0xffcc00 : 0x00aaff;
            let cardBg = this.add.rectangle(cardX, posY, cardWidth, cardHeight, isRare ? 0x3d2b00 : 0x112233, 0.95)
                .setStrokeStyle(3, strokeColor)
                .setScrollFactor(0)
                .setDepth(20001)
                .setInteractive({ useHandCursor: true });

            let iconKey = reward.icon || 'box';
            if (!this.textures.exists(iconKey)) iconKey = (isRare ? 'rare_box' : 'box');

            let icon = this.add.image(cardX - (cardWidth / 2) + 45, posY, iconKey)
                .setScrollFactor(0)
                .setDepth(20002);

            if (iconKey === 'ninja_hp_posion') {
                icon.setDisplaySize(38, 55);
            } else if (iconKey === 'ninja_speed') {
                icon.setDisplaySize(48, 48);
            } else if (iconKey === 'ninja_posion') {
                icon.setDisplaySize(38, 40);
            } else {
                icon.setDisplaySize(55, 55);
            }

            let curLv = this.playerStats[reward.statKey] || 0;
            let textStartX = cardX - (cardWidth / 2) + 85;

            let nameTxt = this.add.text(textStartX, posY - (isMobile ? 42 : 28), reward.name, { 
                fontSize: isMobile ? '18px' : '20px', fill: isRare ? '#ffdd00' : '#ffffff', fontStyle: 'bold', padding: { top: 2, bottom: 2 } 
            }).setScrollFactor(0).setDepth(20002);

            let descTxt = this.add.text(textStartX, posY - (isMobile ? 12 : 2), reward.desc, { 
                fontSize: isMobile ? '12px' : '13px', fill: '#cccccc', wordWrap: { width: cardWidth - 100 }, padding: { top: 2, bottom: 2 } 
            }).setScrollFactor(0).setDepth(20002);
            
            let lvTxt = null;
            if(reward.id !== 'heal') {
                lvTxt = this.add.text(textStartX, posY + (isMobile ? 32 : 22), `Lv.${curLv} ➔ Lv.${curLv + 1} (Max: Lv.${reward.maxLv})`, { 
                    fontSize: '12px', fill: '#00ffcc', padding: { top: 2, bottom: 2 } 
                }).setScrollFactor(0).setDepth(20002);
            }

            this.levelUpElements.push(cardBg, icon, nameTxt, descTxt);
            if(lvTxt) this.levelUpElements.push(lvTxt);

            let glowTween = null;

            cardBg.on('pointerover', (pointer, localX, localY, event) => {
                if(event) event.stopPropagation();
                cardBg.setFillStyle(isRare ? 0x664400 : 0x224466);
                
                glowTween = this.tweens.add({
                    targets: cardBg,
                    scaleX: 1.02,
                    scaleY: 1.02,
                    duration: 150,
                    yoyo: true,
                    repeat: -1
                });
            });

            cardBg.on('pointerout', (pointer, localX, localY, event) => {
                if(event) event.stopPropagation();
                cardBg.setFillStyle(isRare ? 0x3d2b00 : 0x112233);
                if(glowTween) {
                    glowTween.stop();
                    cardBg.setScale(1);
                }
            });

            cardBg.on('pointerdown', (pointer, localX, localY, event) => {
                if(event) event.stopPropagation();
                playRandomSFX(this, 'button');
                this.applyReward(reward);
                this.closeLevelUpUI();
            });
        });
    }

    closeLevelUpUI() {
        if (this.levelUpElements) {
            this.levelUpElements.forEach(el => el.destroy());
            this.levelUpElements = [];
        }

        if (this.pendingLevelUps > 0) {
            this.pendingLevelUps--;
            if (this.pendingLevelUps > 0) {
                this.time.delayedCall(100, () => this.showLevelUpUI(false));
                return;
            }
        }

        this.isLevelUpOpen = false;
        this.physics.resume();
    }

    showShopUI() {
        this.isLevelUpOpen = true;
        this.physics.pause();
        
        this.shopElements = [];

        let cx = this.scale.width / 2;
        let cy = this.scale.height / 2;

        let overlay = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.85)
            .setScrollFactor(0)
            .setDepth(20000)
            .setInteractive();

        let modalBg = this.add.rectangle(cx, cy, isMobile ? 620 : 600, isMobile ? 420 : 360, 0x111122, 0.95)
            .setStrokeStyle(3, 0x00ffcc)
            .setScrollFactor(0)
            .setDepth(20001);

        let titleY = cy - (isMobile ? 160 : 130);
        let goldY = cy - (isMobile ? 110 : 85);
        let cardY = cy + (isMobile ? 10 : 10);

        let title = this.add.text(cx, titleY, '인게임 골드 상점', { 
            fontSize: isMobile ? '30px' : '38px', fill: '#ffcc00', fontStyle: 'bold', padding: { top: 6, bottom: 6 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);

        let goldInfo = this.add.text(cx, goldY, `획득한 골드: ${this.playerStats.gold} G`, { 
            fontSize: isMobile ? '18px' : '22px', fill: '#ffd700', padding: { top: 6, bottom: 6 } 
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002);

        let closeBtn = this.add.text(cx + (isMobile ? 220 : 230), titleY, '✖ 닫기', {
            fontSize: isMobile ? '16px' : '20px', fill: '#fff', backgroundColor: '#aa2222', padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20002).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#ff4444').setFill('#fff'));
        closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#aa2222').setFill('#fff'));

        closeBtn.on('pointerdown', (pointer, localX, localY, event) => {
            if(event) event.stopPropagation();
            playRandomSFX(this, 'button');
            if (this.shopElements) {
                this.shopElements.forEach(el => el.destroy());
                this.shopElements = [];
            }
            this.isLevelUpOpen = false;
            this.physics.resume();
        });

        this.shopElements.push(overlay, modalBg, title, goldInfo, closeBtn);

        let unlockedSkills = USER_GLOBAL_DATA.unlocked_boss_skills || [];
        let isDuckSkillUnlocked = unlockedSkills.some(s => s.skill_key === 'boss_sli_wave' || s.skill_key === 'boss_duck');

        let cost = 500;

        let card = this.add.rectangle(cx, cardY, isMobile ? 540 : 520, 110, 0x113322, 0.9).setStrokeStyle(2, 0x00ffcc).setScrollFactor(0).setDepth(20002);
        let bossIcon = this.add.image(cx - (isMobile ? 210 : 200), cardY, 'boss_duck').setDisplaySize(60, 60).setScrollFactor(0).setDepth(20003);

        let skTxtStr = isDuckSkillUnlocked ? "[보스 스킬] 붕어빵 융단폭격" : "🔒 [미획득] Stage 1 클리어 필요";
        let skTxt = this.add.text(cx - (isMobile ? 160 : 150), cardY - 18, skTxtStr, { 
            fontSize: isMobile ? '16px' : '18px', fill: isDuckSkillUnlocked ? '#fff' : '#888', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
        }).setScrollFactor(0).setDepth(20003);

        let buyBtn = this.add.text(cx + (isMobile ? 150 : 150), cardY, isDuckSkillUnlocked ? `장착 (${cost}G)` : '구매 불가', {
            fontSize: '16px', fill: '#fff', backgroundColor: isDuckSkillUnlocked ? '#00aa66' : '#444444', padding: { x: 12, y: 6 }
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20003).setInteractive({ useHandCursor: true });

        buyBtn.on('pointerdown', (pointer, localX, localY, event) => {
            if(event) event.stopPropagation();
            if (!isDuckSkillUnlocked) {
                playRandomSFX(this, 'button');
                showToast(this, "🔒 Stage 1을 클리어하여 스킬을 해금해야 이용할 수 있습니다!", 2500, '#ff3333');
                return;
            }

            if (this.playerStats.gold >= cost) {
                this.playerStats.gold -= cost;
                this.goldText.setText(`${this.playerStats.gold}`);
                goldInfo.setText(`획득한 골드: ${this.playerStats.gold} G`);
                
                this.playerStats.hasEquippedBossSkill = true;
                this.bossSkillBox.setVisible(true);
                this.bossSkillBtn.setVisible(true);

                playRandomSFX(this, 'skill_fire');
                showToast(this, "✅ [붕어빵 융단폭격] 보스 스킬 장착 완료! (단축키 2번 / 쿨타임 60초)", 3000, '#00ffcc');
            } else {
                playRandomSFX(this, 'button');
                showToast(this, "❌ 골드가 부족합니다. (필요: 500 G)", 2000, '#ff3333');
            }
        });

        this.shopElements.push(card, bossIcon, skTxt, buyBtn);
    }

    applyReward(reward) {
        if (!this.playerStats[reward.statKey]) this.playerStats[reward.statKey] = 0;
        this.playerStats[reward.statKey]++;

        if (reward.id === 'clone') {
            if (this.playerStats.clone === 3) {
                this.playerStats.clone += 1;
            }
        }
        else if (reward.id === 'posion') {
            this.playerStats.attackDelay = Math.max(400, 1100 - (this.playerStats.posionLv * 233));
        }
        else if (reward.id === 'hp') { this.playerStats.maxHp += 20; this.playerStats.hp += 20; }
        else if (reward.id === 'speed') { this.playerStats.speed += 12; }
        else if (reward.id === 'magnet') { this.playerStats.magnetRange += 40; }
        else if (reward.id === 'heal') { this.playerStats.hp = Math.min(this.playerStats.hp + 30, this.playerStats.maxHp); }
        
        this.updateHpUI();
    }
}