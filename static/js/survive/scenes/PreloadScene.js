class PreloadScene extends Phaser.Scene {
            constructor() { super({ key: 'PreloadScene' }); }

            preload() {
                this.add.text(this.scale.width / 2, this.scale.height / 2, '데이터 불러오는 중...', { 
                    fontSize: '32px', fill: '#fff', padding: { top: 10, bottom: 10 } 
                }).setOrigin(0.5);

                this.load.image('main_bg', '/static/img/survive/main.png');
                this.load.image('game_start', '/static/img/survive/game_start.png');
                this.load.image('game_upgrade', '/static/img/survive/game_upgrade.png');
                
                this.load.image('boss_duck', '/static/img/survive/monster/duck/boss_duck.png');
                this.load.image('duck1', '/static/img/survive/monster/duck/duck1.png');
                this.load.image('duck2', '/static/img/survive/monster/duck/duck2.png');
                this.load.image('duck3', '/static/img/survive/monster/duck/duck3.png');
                this.load.image('golden_fish', '/static/img/survive/monster/duck/golden_fish.png');
                this.load.image('duck_skill', '/static/img/survive/monster/duck/duck_skill.png');

                this.load.audio('survive_main', '/static/bgm/survive/survive_main.mp3');
                for (let i = 1; i <= 6; i++) {
                    this.load.audio(`stage${i}`, `/static/bgm/survive/stage${i}.mp3`);
                }
                this.load.audio('final_boss', '/static/bgm/survive/final_boss.mp3');

                this.load.audio('button1', '/static/sfx/survive/button1.mp3');
                this.load.audio('button2', '/static/sfx/survive/button2.mp3');

                const sfxKeys = ['footstep', 'suri_throw', 'hit_impact', 'skill_fire', 'skill_water', 'skill_wind', 'skill_bomb', 'level_up', 'pickup', 'boss_warning', 'game_over', 'button'];
                sfxKeys.forEach(key => {
                    this.load.audio(`${key}1`, `/static/sfx/survive/${key}1.mp3`);
                    this.load.audio(`${key}2`, `/static/sfx/survive/${key}2.mp3`);
                });

                for(let i=1; i<=3; i++) this.load.audio(`skill_bolt${i}`, `/static/sfx/survive/skill_bolt${i}.mp3`);
                for(let i=1; i<=2; i++) this.load.audio(`boss_skill_used${i}`, `/static/sfx/survive/boss_skill_used${i}.mp3`);
                for(let i=1; i<=4; i++) this.load.audio(`stage1_skill${i}`, `/static/sfx/survive/stage1_skill${i}.mp3`);
                for(let i=1; i<=3; i++) this.load.audio(`hero_skill${i}`, `/static/sfx/survive/hero_skill${i}.mp3`);

                Object.keys(MONSTER_SFX_REGISTRY).forEach(key => {
                    this.load.audio(`${key}1`, `/static/sfx/survive/${key}1.mp3`);
                    this.load.audio(`${key}2`, `/static/sfx/survive/${key}2.mp3`);
                });

                this.load.image('hero_1', '/static/img/survive/hero/hero_1.png');
                this.load.image('hero_2', '/static/img/survive/hero/hero_2.png');
                this.load.image('hero_3', '/static/img/survive/hero/hero_3.png');
                this.load.image('hero_4', '/static/img/survive/hero/hero_4.png');
                this.load.image('hero_main', '/static/img/survive/hero/hero_main.png');
                this.load.image('hero_dead', '/static/img/survive/hero/hero_dead.png');

                this.load.image('suri', '/static/img/survive/eqi/suri.png');
                this.load.image('suri_vfx', '/static/img/survive/effect/suri_throw_vfx.png');
                this.load.image('fire_stream', '/static/img/survive/reword/fire_stream.png');
                this.load.image('water_dragon', '/static/img/survive/reword/water_dragon.png');
                this.load.image('rasenshuriken', '/static/img/survive/reword/rasenshuriken.png');
                this.load.image('explosive_shuriken', '/static/img/survive/reword/explosive_shuriken.png');
                this.load.image('explosion_vfx', '/static/img/survive/reword/explosion_vfx.png');
                this.load.image('bolt', '/static/img/survive/reword/bolt.png');
                this.load.image('scroll_bolt', '/static/img/survive/reword/scroll_bolt.png');

                this.load.image('earth_wall', '/static/img/survive/reword/earth_wall.png');
                this.load.image('scroll_earth_wall', '/static/img/survive/reword/scroll_earth_wall.png');
                this.load.image('ninja_posion', '/static/img/survive/reword/ninja_posion.png');
                
                this.load.image('ninja_hp_posion', '/static/img/survive/reword/ninja_hp_posion.png');
                this.load.image('ninja_speed', '/static/img/survive/reword/ninja_speed.png');
                this.load.image('clear_box', '/static/img/survive/reword/clear_box.png');

                this.load.image('meat', '/static/img/survive/reword/meat.png');
                this.load.image('field_magnet', '/static/img/survive/reword/magnet.png');

                this.load.image('sli_drop1', '/static/img/survive/monster/sli/sli_drop1.png');
                this.load.image('sli_drop3', '/static/img/survive/monster/sli/sli_drop3.png');

                this.load.image('box', '/static/img/survive/reword/box.png');
                this.load.image('rare_box', '/static/img/survive/reword/rare_box.png');
                this.load.image('scroll_fire_stream', '/static/img/survive/reword/scroll_fire_stream.png');
                this.load.image('scroll_water_dragon', '/static/img/survive/reword/scroll_water_dragon.png');
                this.load.image('scroll_rasenshuriken', '/static/img/survive/reword/scroll_rasenshuriken.png');
                this.load.image('scroll_explosive_shuriken', '/static/img/survive/reword/scroll_explosive_shuriken.png');
                this.load.image('scroll_pierce', '/static/img/survive/reword/scroll_pierce.png');
                this.load.image('scroll_clone', '/static/img/survive/reword/scroll_clone.png');
                this.load.image('scroll_magnet', '/static/img/survive/reword/scroll_magnet.png');
                
                this.load.image('goldpocket', '/static/img/survive/reword/goldpocket.png');

                ['sli', 'ssli'].forEach(prefix => {
                    for (let i = 1; i <= 4; i++) {
                        this.load.image(`${prefix}${i}`, `/static/img/survive/monster/sli/${prefix}${i}.png`);
                    }
                });

                this.load.image('grass1', '/static/img/survive/tile/grass1.png');
                this.load.image('grass4', '/static/img/survive/tile/grass4.png');
                this.load.image('grass5', '/static/img/survive/tile/grass5.png');
                this.load.image('branch', '/static/img/survive/tile/branch.png');
                this.load.image('rock1', '/static/img/survive/tile/rock1.png');
                this.load.image('rock2', '/static/img/survive/tile/rock2.png');
                this.load.image('rock3', '/static/img/survive/tile/rock3.png');
                this.load.image('tree1', '/static/img/survive/tile/tree1.png');
                this.load.image('tree2', '/static/img/survive/tile/tree2.png');
            }

            create() {
                console.log("[PreloadScene] API user_data 호출 시작");
                fetch('/api/survive/user_data')
                    .then(res => res.json())
                    .then(data => {
                        console.log("[PreloadScene] API user_data 수신 데이터:", data);
                        if (data && data.success) {
                            USER_GLOBAL_DATA.survive_gold = data.survive_gold || 0;
                            
                            if (data.upgrades) {
                                const keyMap = [
                                    'ATTACK_POWER_LV', 'ATTACK_SPEED_LV', 'MOVE_SPEED_LV', 
                                    'MAX_HP_LV', 'MAGNET_RANGE_LV', 'DEFENSE_LV', 'EXP_BONUS_LV', 'CLONE_LV'
                                ];

                                keyMap.forEach(upperKey => {
                                    let lowerKey = upperKey.toLowerCase();
                                    let val = 0;
                                    if (data.upgrades[lowerKey] !== undefined) {
                                        val = data.upgrades[lowerKey];
                                    } else if (data.upgrades[upperKey] !== undefined) {
                                        val = data.upgrades[upperKey];
                                    }
                                    val = Number(val) || 0;

                                    USER_GLOBAL_DATA.upgrades[lowerKey] = val;
                                    USER_GLOBAL_DATA.upgrades[upperKey] = val;
                                });
                            }
                            USER_GLOBAL_DATA.unlocked_boss_skills = data.unlocked_boss_skills || [];
                        } else {
                            console.error("❌ [PreloadScene] user_data 실패 응답:", data);
                        }
                        playBGM(this, 'survive_main');
                        this.scene.start('TitleScene');
                    })
                    .catch(err => {
                        console.error("❌ [PreloadScene Error] 유저 데이터 로드 중 네트워크/파싱 예외 발생:", err);
                        playBGM(this, 'survive_main');
                        this.scene.start('TitleScene');
                    });
            }
        }