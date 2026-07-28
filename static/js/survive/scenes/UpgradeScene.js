class UpgradeScene extends Phaser.Scene {
    constructor() { super({ key: 'UpgradeScene' }); }

    create() {
        playBGM(this, 'survive_main');
        createMuteButton(this, 'MENU');

        // 1. 메모리에 저장된 데이터로 우선 렌더링
        this.renderUpgradeUI();

        // 2. F12 개발자도구 콘솔 로그 연동 및 RAW 데이터 검증
        fetch('/api/survive/user_data')
            .then(res => res.json())
            .then(data => {
                console.log("%c [DB EXECUTE LOG]", "background: #222; color: #bada55; font-size: 14px; font-weight: bold;");
                if (data && data._debug_info) {
                    console.log("📌 실행된 SQL 쿼리 목록:", data._debug_info.executed_sqls);
                    console.log("📌 Raw DB Row 타입:", data._debug_info.raw_row_type);
                    console.log("📌 Raw DB Row 데이터:", data._debug_info.raw_row_data);
                    console.log("📌 파싱된 Upgrades Dict:", data._debug_info.parsed_upgrades_dict);
                }
                console.log("📌 클라이언트 응답 수신 upgrades:", data.upgrades);

                if (data && data.success && data.upgrades) {
                    USER_GLOBAL_DATA.survive_gold = data.survive_gold || 0;
                    const keyMap = ['ATTACK_POWER_LV', 'ATTACK_SPEED_LV', 'MOVE_SPEED_LV', 'MAX_HP_LV', 'MAGNET_RANGE_LV', 'DEFENSE_LV', 'EXP_BONUS_LV', 'CLONE_LV'];
                    
                    keyMap.forEach(upperKey => {
                        let lowerKey = upperKey.toLowerCase();
                        let val = Number(data.upgrades[lowerKey] !== undefined ? data.upgrades[lowerKey] : data.upgrades[upperKey]) || 0;
                        
                        USER_GLOBAL_DATA.upgrades[lowerKey] = val;
                        USER_GLOBAL_DATA.upgrades[upperKey] = val;
                    });

                    // 최신 데이터로 화면 재동기화
                    this.renderUpgradeUI();
                }
            })
            .catch(err => {
                console.error("❌ [UpgradeScene Sync Error]:", err);
            });
    }

    renderUpgradeUI() {
        let cx = this.scale.width / 2;

        let topBackBtn = this.add.text(20, isMobile ? 35 : 40, '◀ 뒤로', {
            fontSize: isMobile ? '16px' : '20px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 6 }
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000).setInteractive();

        topBackBtn.on('pointerover', () => topBackBtn.setBackgroundColor('#aa7722'));
        topBackBtn.on('pointerout', () => topBackBtn.setBackgroundColor('#333'));
        topBackBtn.on('pointerdown', () => {
            playRandomSFX(this, 'button');
            this.scene.start('TitleScene');
        });

        this.add.text(cx, isMobile ? 35 : 45, '영구 능력 강화 상점', { 
            fontSize: isMobile ? '24px' : '36px', fill: '#ffcc00', fontStyle: 'bold', padding: { top: 2, bottom: 2 } 
        }).setOrigin(0.5).setDepth(10000);

        this.goldTxt = this.add.text(cx, isMobile ? 70 : 85, `보유 골드: ${USER_GLOBAL_DATA.survive_gold} G`, { 
            fontSize: isMobile ? '16px' : '22px', fill: '#ffd700', fontStyle: 'bold', padding: { top: 2, bottom: 2 } 
        }).setOrigin(0.5).setDepth(10000);

        let up = USER_GLOBAL_DATA.upgrades;

        function getLv(k) {
            let uKey = k.toUpperCase();
            let lKey = k.toLowerCase();
            return Number(up[lKey] !== undefined ? up[lKey] : up[uKey]) || 0;
        }

        const upgradeList = [
            { key: 'ATTACK_POWER_LV', icon: 'suri', name: '공격력 강화', desc: '기본 공격력 +1', maxLv: 99 },
            { key: 'ATTACK_SPEED_LV', icon: 'ninja_posion', name: '공격속도 강화', desc: '공격 대기시간 -5%', maxLv: 99 },
            { key: 'MOVE_SPEED_LV', icon: 'ninja_speed', name: '이동속도 강화', desc: '이동속도 +10', maxLv: 99 },
            { key: 'MAX_HP_LV', icon: 'ninja_hp_posion', name: '최대체력 강화', desc: '최대 체력 +15', maxLv: 99 },
            { key: 'MAGNET_RANGE_LV', icon: 'field_magnet', name: '자력 범위 강화', desc: '습득 범위 +30', maxLv: 99 },
            { key: 'DEFENSE_LV', icon: 'earth_wall', name: '방어력 강화', desc: '피격 데미지 -1', maxLv: 99 },
            { key: 'EXP_BONUS_LV', icon: 'sli_drop1', name: '경험치 강화', desc: '경험치 +10%', maxLv: 99 },
            { key: 'CLONE_LV', icon: 'scroll_clone', name: '분신술 (영구)', desc: '기본 투사체 +1', maxLv: 1, fixedCost: 3500 }
        ];

        let startY = isMobile ? 120 : 140;
        let colWidth = isMobile ? 320 : 360;
        let rowHeight = isMobile ? 85 : 95;

        upgradeList.forEach((item, idx) => {
            let currentLv = getLv(item.key);
            let effText = "";
            if (item.key === 'ATTACK_POWER_LV') effText = `[현재: +${currentLv}]`;
            else if (item.key === 'ATTACK_SPEED_LV') effText = `[현재: -${currentLv * 5}%]`;
            else if (item.key === 'MOVE_SPEED_LV') effText = `[현재: +${currentLv * 10}]`;
            else if (item.key === 'MAX_HP_LV') effText = `[현재: +${currentLv * 15}]`;
            else if (item.key === 'MAGNET_RANGE_LV') effText = `[현재: +${currentLv * 30}]`;
            else if (item.key === 'DEFENSE_LV') effText = `[현재: -${currentLv}]`;
            else if (item.key === 'EXP_BONUS_LV') effText = `[현재: +${currentLv * 10}%]`;
            else if (item.key === 'CLONE_LV') effText = currentLv ? '[적용됨]' : '[미적용]';

            let col = idx % 2;
            let row = Math.floor(idx / 2);

            let posX = (cx - (colWidth / 2)) + (col * colWidth);
            let posY = startY + (row * rowHeight);

            let cost = item.fixedCost ? item.fixedCost : (100 + (currentLv * 150));
            let isMax = currentLv >= item.maxLv;

            this.add.rectangle(posX, posY, colWidth - 12, rowHeight - 8, 0x222233, 0.92).setStrokeStyle(2, 0x4466aa);
            this.add.image(posX - (colWidth/2) + 32, posY - 8, item.icon).setDisplaySize(30, 32);

            this.add.text(posX - (colWidth/2) + 54, posY - 26, `${item.name}`, { 
                fontSize: isMobile ? '14px' : '16px', fill: '#ffffff', fontStyle: 'bold' 
            });
            
            let descTxt = this.add.text(posX - (colWidth/2) + 54, posY - 8, `${item.desc} (Lv.${currentLv})`, { 
                fontSize: isMobile ? '11px' : '12px', fill: '#aaaaaa' 
            });

            let effTxtObj = this.add.text(posX - (colWidth/2) + 54, posY + 8, effText, { 
                fontSize: isMobile ? '10px' : '11px', fill: '#00ffcc' 
            });

            let btnText = isMax ? 'MAX' : `강화 (${cost}G)`;
            let buyBtn = this.add.text(posX, posY + 22, btnText, {
                fontSize: isMobile ? '11px' : '12px', fill: '#fff', backgroundColor: isMax ? '#444444' : '#aa6600', padding: { x: 8, y: 3 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: !isMax });

            if (!isMax) {
                buyBtn.on('pointerdown', () => {
                    playRandomSFX(this, 'button');
                    buyBtn.setText('⏳ 처리중...').disableInteractive();

                    fetch('/api/survive/upgrade', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stat_type: item.key })
                    })
                    .then(res => res.json())
                    .then(resData => {
                        if (resData && resData.success) {
                            USER_GLOBAL_DATA.survive_gold = resData.new_gold;
                            
                            let uKey = item.key.toUpperCase();
                            let lKey = item.key.toLowerCase();
                            USER_GLOBAL_DATA.upgrades[lKey] = resData.new_level;
                            USER_GLOBAL_DATA.upgrades[uKey] = resData.new_level;
                            
                            let nLv = resData.new_level;
                            descTxt.setText(`${item.desc} (Lv.${nLv})`);
                            
                            let updatedEff = "";
                            if (item.key === 'ATTACK_POWER_LV') updatedEff = `[현재: +${nLv}]`;
                            else if (item.key === 'ATTACK_SPEED_LV') updatedEff = `[현재: -${nLv * 5}%]`;
                            else if (item.key === 'MOVE_SPEED_LV') updatedEff = `[현재: +${nLv * 10}]`;
                            else if (item.key === 'MAX_HP_LV') updatedEff = `[현재: +${nLv * 15}]`;
                            else if (item.key === 'MAGNET_RANGE_LV') updatedEff = `[현재: +${nLv * 30}]`;
                            else if (item.key === 'DEFENSE_LV') updatedEff = `[현재: -${nLv}]`;
                            else if (item.key === 'EXP_BONUS_LV') updatedEff = `[현재: +${nLv * 10}%]`;
                            else if (item.key === 'CLONE_LV') updatedEff = nLv ? '[적용됨]' : '[미적용]';
                            
                            effTxtObj.setText(updatedEff);
                            this.goldTxt.setText(`보유 골드: ${resData.new_gold} G`);

                            let nCost = item.fixedCost ? item.fixedCost : (100 + (nLv * 150));
                            if (nLv >= item.maxLv) {
                                buyBtn.setText('MAX').setBackgroundColor('#444444').disableInteractive();
                            } else {
                                buyBtn.setText(`강화 (${nCost}G)`).setInteractive();
                            }
                        } else {
                            showToast(this, (resData && resData.error) || "강화 실패", 2000, '#ff3333');
                            buyBtn.setText(btnText).setInteractive();
                        }
                    })
                    .catch(err => {
                        buyBtn.setText(btnText).setInteractive();
                    });
                });
            }
        });
    }
}