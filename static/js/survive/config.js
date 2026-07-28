const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        const GAME_WIDTH = isMobile ? 720 : 1280;
        const GAME_HEIGHT = isMobile ? 1280 : 720;

        let isBgmMuted = false;
        let isSfxMuted = false;
        let globalBGM = null;

        let isTestMode = false;
        let lastSfxPlayTimes = {};

        let USER_GLOBAL_DATA = {
            survive_gold: 0,
            upgrades: {
                attack_speed_lv: 0,
                move_speed_lv: 0,
                attack_power_lv: 0,
                max_hp_lv: 0,
                magnet_range_lv: 0,
                defense_lv: 0,
                exp_bonus_lv: 0,
                clone_lv: 0
            },
            unlocked_boss_skills: []
        };

        function playBGM(scene, key) {
            if (globalBGM && globalBGM.key === key && globalBGM.isPlaying) {
                return; 
            }
            if (globalBGM) {
                globalBGM.stop();
                globalBGM.destroy();
            }
            if (scene.cache.audio.exists(key)) {
                globalBGM = scene.sound.add(key, { loop: true, volume: 0.5 });
                if (!isBgmMuted) globalBGM.play();
            }
        }

        const MONSTER_SFX_REGISTRY = {
            boss_platypus_attack: ['boss_platypus_attack1', 'boss_platypus_attack2'],
            boss_thunder_strike:  ['boss_thunder_strike1',  'boss_thunder_strike2'],
            boss_armadillo_guard: ['boss_armadillo_guard1', 'boss_armadillo_guard2'],
            boss_panda_storm:     ['boss_panda_storm1',     'boss_panda_storm2'],
            boss_dragon_roar:     ['boss_dragon_roar1',     'boss_dragon_roar2'],
            boss_dragon_breath:   ['boss_dragon_breath1',   'boss_dragon_breath2'],
            skeleton_hit:         ['skeleton_hit1',         'skeleton_hit2'],
            bat_hit:              ['bat_hit1',              'bat_hit2'],
            goblin_attack:        ['goblin_attack1',        'goblin_attack2'],
            demon_hit:            ['demon_hit1',            'demon_hit2'],
            spider_hit:           ['spider_hit1',           'spider_hit2']
        };

        class MonsterSoundManager {
            static play(scene, key) {
                if (isSfxMuted || !MONSTER_SFX_REGISTRY[key]) return;
                const candidates = MONSTER_SFX_REGISTRY[key];
                const selectedKey = candidates[Math.floor(Math.random() * candidates.length)];
                
                if (scene.cache.audio.exists(selectedKey)) {
                    scene.sound.play(selectedKey, { volume: 0.6 });
                } else if (scene.cache.audio.exists(candidates[0])) {
                    scene.sound.play(candidates[0], { volume: 0.6 });
                }
            }
        }

        function playRandomSFX(scene, baseKey, volume = 0.5) {
            if (isSfxMuted) return;

            let now = Date.now();
            if (lastSfxPlayTimes[baseKey] && now - lastSfxPlayTimes[baseKey] < 50) {
                return;
            }
            lastSfxPlayTimes[baseKey] = now;

            let num = Math.random() < 0.5 ? '1' : '2';
            let key = baseKey + num;
            
            if (scene.cache.audio.exists(key)) {
                scene.sound.play(key, { volume: volume });
            } else if (scene.cache.audio.exists(baseKey + '1')) {
                scene.sound.play(baseKey + '1', { volume: volume });
            }
        }

        function showToast(scene, msg, duration = 2000, color = '#ffcc00') {
            let cx = scene.scale.width / 2;
            let cy = isMobile ? scene.scale.height / 2 + 100 : scene.scale.height / 2;

            let bg = scene.add.rectangle(cx, cy, 450, 50, 0x000000, 0.85).setScrollFactor(0).setDepth(25000);
            let txt = scene.add.text(cx, cy, msg, { fontSize: '18px', fill: color, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(25001);

            scene.tweens.add({
                targets: [bg, txt],
                alpha: { from: 1, to: 0 },
                delay: duration,
                duration: 400,
                onComplete: () => { bg.destroy(); txt.destroy(); }
            });
        }

        // Scene별 음소거 버튼 독립 배치 함수
        function createMuteButton(scene, sceneType = 'TITLE') {
            let bgmX, sfxX, topY;

            if (sceneType === 'GAME') {
                bgmX = scene.scale.width - (isMobile ? 130 : 90);
                sfxX = scene.scale.width - (isMobile ? 70 : 40);
                topY = isMobile ? 210 : 80;
            } else if (sceneType === 'MENU') { // UpgradeScene / StageSelectScene
                bgmX = scene.scale.width - (isMobile ? 60 : 90);
                sfxX = scene.scale.width - (isMobile ? 25 : 40);
                topY = isMobile ? 35 : 35; // 최상단 안착으로 가림 방지
            } else { // TitleScene
                bgmX = scene.scale.width - (isMobile ? 120 : 90);
                sfxX = scene.scale.width - (isMobile ? 60 : 40);
                topY = isMobile ? 55 : 80;
            }

            let bgmBtn = scene.add.text(bgmX, topY, isBgmMuted ? '🔇' : '🎵', { 
                fontSize: isMobile ? '22px' : '28px',
                padding: { top: 4, bottom: 4, left: 4, right: 4 } 
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(10000)
            .setInteractive();

            bgmBtn.on('pointerdown', (p, x, y, e) => {
                if(e) e.stopPropagation();
                playRandomSFX(scene, 'button');
                isBgmMuted = !isBgmMuted;
                bgmBtn.setText(isBgmMuted ? '🔇' : '🎵');
                if (globalBGM) {
                    isBgmMuted ? globalBGM.pause() : globalBGM.resume();
                }
            });

            let sfxBtn = scene.add.text(sfxX, topY, isSfxMuted ? '🔇' : '🔊', { 
                fontSize: isMobile ? '22px' : '28px',
                padding: { top: 4, bottom: 4, left: 4, right: 4 } 
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(10000)
            .setInteractive();

            sfxBtn.on('pointerdown', (p, x, y, e) => {
                if(e) e.stopPropagation();
                isSfxMuted = !isSfxMuted;
                playRandomSFX(scene, 'button');
                sfxBtn.setText(isSfxMuted ? '🔇' : '🔊');
            });

            return { bgmBtn, sfxBtn };
        }