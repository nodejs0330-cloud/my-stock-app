class TitleScene extends Phaser.Scene {
            constructor() { super({ key: 'TitleScene' }); }

            create() {
                playBGM(this, 'survive_main');
                let bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'main_bg');
                
                let scale;
                if (isMobile) {
                    let scaleX = this.scale.width / bg.width;
                    let scaleY = this.scale.height / bg.height;
                    scale = Math.min(scaleX, scaleY) * 1.15;
                    bg.setY(this.scale.height / 2 - 20);
                } else {
                    scale = Math.max(this.scale.width / bg.width, this.scale.height / bg.height);
                }
                bg.setScale(scale);

                createMuteButton(this, 'TITLE');

                this.add.image(40, 55, 'goldpocket').setDisplaySize(32, 32).setScrollFactor(0).setDepth(10000);
                this.goldTxt = this.add.text(65, 55, `${USER_GLOBAL_DATA.survive_gold} G`, { 
                    fontSize: '22px', fill: '#ffd700', fontStyle: 'bold', padding: { top: 4, bottom: 4 } 
                }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000);

                let exitX = 40;
                let exitY = isMobile ? 95 : 85;

                let exitBtn = this.add.text(exitX, exitY, '◀ 메인 허브로', {
                    fontSize: '16px', fill: '#aaa', backgroundColor: '#222', padding: { x: 10, y: 6 }
                }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000).setInteractive();
                
                exitBtn.on('pointerover', () => exitBtn.setBackgroundColor('#aa7722').setFill('#fff'));
                exitBtn.on('pointerout', () => exitBtn.setBackgroundColor('#222').setFill('#aaa'));
                exitBtn.on('pointerdown', () => {
                    playRandomSFX(this, 'button');
                    window.location.href = '/game';
                });

                let gearBtn = this.add.text(this.scale.width - 180, isMobile ? 55 : 80, '⚙️', { 
                    fontSize: '28px', padding: { top: 6, bottom: 6 } 
                }).setOrigin(0.5).setScrollFactor(0).setDepth(10000).setInteractive();
                
                gearBtn.on('pointerdown', () => {
                    playRandomSFX(this, 'button');
                    isTestMode = !isTestMode;
                    showToast(this, isTestMode ? "✅ 테스트 모드 활성화 (보스 1분출현 / 시작시 15개 상자)" : "❌ 테스트 모드 비활성화");
                });

                let baseSize = isMobile ? 240 : 275; 
                let startY = isMobile ? this.scale.height - 240 : this.scale.height - 140;
                let startX = isMobile ? this.scale.width / 2 - 140 : this.scale.width / 2 - 180;
                let upgradeX = isMobile ? this.scale.width / 2 + 140 : this.scale.width / 2 + 180;

                let startBtn = this.add.image(startX, startY, 'game_start').setDisplaySize(baseSize, baseSize).setInteractive();
                if(startBtn.preFX) {
                    startBtn.preFX.setPadding(32);
                    let startGlow = startBtn.preFX.addGlow(0xffcc00, 4, 0, false);
                    startGlow.active = false;
                    startBtn.on('pointerover', () => { 
                        startGlow.active = true; 
                        this.tweens.add({ targets: startBtn, scaleX: startBtn.scaleX * 1.05, scaleY: startBtn.scaleY * 1.05, duration: 100 });
                    });
                    startBtn.on('pointerout', () => { 
                        startGlow.active = false; 
                        this.tweens.add({ targets: startBtn, scaleX: startBtn.scaleX / 1.05, scaleY: startBtn.scaleY / 1.05, duration: 100 });
                    });
                }
                startBtn.on('pointerdown', () => {
                    playRandomSFX(this, 'button');
                    this.scene.start('StageSelectScene');
                });

                let upgradeBtn = this.add.image(upgradeX, startY, 'game_upgrade').setDisplaySize(baseSize, baseSize).setInteractive();
                if(upgradeBtn.preFX) {
                    upgradeBtn.preFX.setPadding(32);
                    let upgradeGlow = upgradeBtn.preFX.addGlow(0xffcc00, 4, 0, false);
                    upgradeGlow.active = false;
                    upgradeBtn.on('pointerover', () => { 
                        upgradeGlow.active = true;
                        this.tweens.add({ targets: upgradeBtn, scaleX: upgradeBtn.scaleX * 1.05, scaleY: upgradeBtn.scaleY * 1.05, duration: 100 });
                    });
                    upgradeBtn.on('pointerout', () => { 
                        upgradeGlow.active = false;
                        this.tweens.add({ targets: upgradeBtn, scaleX: upgradeBtn.scaleX / 1.05, scaleY: upgradeBtn.scaleY / 1.05, duration: 100 });
                    });
                }
                upgradeBtn.on('pointerdown', () => {
                    playRandomSFX(this, 'button');
                    this.scene.start('UpgradeScene');
                });
            }
        }