class StageSelectScene extends Phaser.Scene {
            constructor() { super({ key: 'StageSelectScene' }); }

            create() {
                if (!globalBGM || globalBGM.key !== 'survive_main') {
                    playBGM(this, 'survive_main');
                }

                createMuteButton(this, 'MENU');

                let topBackBtn = this.add.text(20, isMobile ? 35 : 40, '◀ 뒤로', {
                    fontSize: isMobile ? '16px' : '20px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 6 }
                }).setOrigin(0, 0.5).setDepth(10000).setInteractive();

                topBackBtn.on('pointerover', () => topBackBtn.setBackgroundColor('#aa7722'));
                topBackBtn.on('pointerout', () => topBackBtn.setBackgroundColor('#333'));
                topBackBtn.on('pointerdown', () => {
                    playRandomSFX(this, 'button');
                    this.scene.start('TitleScene');
                });

                this.add.text(this.scale.width / 2, isMobile ? 35 : 80, '스테이지 선택' + (isTestMode ? " [테스트 모드]" : ""), { 
                    fontSize: isMobile ? '28px' : '40px', fill: isTestMode ? '#ff0055' : '#fff', padding: { top: 6, bottom: 6 } 
                }).setOrigin(0.5).setDepth(10000);

                const stages = [
                    { id: 1, name: 'Stage 1: 오리너구리의 늪', time: 600, bossKey: 'boss_duck' },
                    { id: 2, name: 'Stage 2: 어둠의 묘지', time: 720, bossKey: null },
                    { id: 3, name: 'Stage 3: 작열하는 화산', time: 900, bossKey: null },
                    { id: 4, name: 'Stage 4: 심연의 끝', time: 1020, bossKey: null },
                    { id: 5, name: 'Stage 5: 잊혀진 신전', time: 1200, bossKey: null },
                    { id: 6, name: 'Stage 6: 종말의 차원', time: 1800, bossKey: null }
                ];

                stages.forEach((stage, index) => {
                    let col = isMobile ? index % 2 : index % 3;
                    let row = isMobile ? Math.floor(index / 2) : Math.floor(index / 3);

                    let cardX = isMobile ? (this.scale.width / 2) - 160 + (col * 320) : (this.scale.width / 2) - 340 + (col * 340);
                    let cardY = isMobile ? 180 + (row * 220) : 260 + (row * 220);

                    let hitBox = this.add.rectangle(cardX, cardY, 280, 180, 0x222222, 0.85).setStrokeStyle(3, 0xaa7722);

                    if (stage.bossKey) {
                        this.add.image(cardX, cardY - 30, stage.bossKey).setDisplaySize(80, 80);
                    } else {
                        this.add.rectangle(cardX, cardY - 30, 80, 80, 0x444444);
                        this.add.text(cardX, cardY - 30, 'LOCKED', { fontSize: '16px', fill: '#888', padding: { top: 4, bottom: 4 } }).setOrigin(0.5);
                    }

                    this.add.text(cardX, cardY + 45, `${stage.name}\n(보스: ${stage.time / 60}분)`, {
                        fontSize: '18px', fill: '#ddaa55', align: 'center', fontStyle: 'bold', padding: { top: 4, bottom: 4 }
                    }).setOrigin(0.5);

                    hitBox.setInteractive();
                    hitBox.on('pointerover', () => {
                        hitBox.setFillStyle(0x443322);
                        hitBox.setStrokeStyle(3, 0xffcc00);
                    });
                    hitBox.on('pointerout', () => {
                        hitBox.setFillStyle(0x222222);
                        hitBox.setStrokeStyle(3, 0xaa7722);
                    });
                    hitBox.on('pointerdown', () => {
                        playRandomSFX(this, 'button');
                        this.scene.start('GameScene', { stageData: stage });
                    });
                });
            }
        }