export const MOBS = [
    { id: 'virus_grunt', name: 'Virus Grunt', hp: 20, speed: 5, xp: 50, biomes: ['forest'] },
    { id: 'bit_spitter', name: 'Bit Spitter', hp: 15, speed: 3, xp: 60, ranged: true, biomes: ['desert', 'plains'] },
    { id: 'glow_squid', name: 'Glow Squid', hp: 10, speed: 2, xp: 20, aquatic: true, biomes: ['swamp', 'ocean'] },
    { id: 'void_jelly', name: 'Void Jelly', hp: 15, speed: 1.5, xp: 40, aquatic: true, biomes: ['ocean'] },
    { id: 'stone_golem', name: 'Stone Golem', hp: 100, speed: 1.5, xp: 150, biomes: ['highlands'] },
    { id: 'sand_worm', name: 'Sand Worm', hp: 40, speed: 4, xp: 80, biomes: ['desert'] },
    { id: 'null_stalker', name: 'Null Stalker', hp: 40, speed: 7, xp: 200, biomes: ['highlands'] },
    { id: 'pixel_swarm', name: 'Pixel Swarm', hp: 5, speed: 10, xp: 10, biomes: ['plains', 'forest'] },
    { id: 'arlo_bot', name: 'Arlo Bot', hp: 50, speed: 4, xp: 0, friendly: true, biomes: ['plains'] },
    { id: 'villager_arlo', name: 'Arlo Villager', hp: 22, speed: 1.6, xp: 0, friendly: true, biomes: ['plains', 'forest'], chat: ['Hello!', 'Behold the stunning world!', 'Watch out for the virus!'] },
    { id: 'arlo_ai', name: 'Observant AI Arlo', hp: 100, speed: 0, xp: 0, friendly: true, biomes: ['highlands'], chat: ['I see everything.', 'I am the code.', 'Arlo is the path.'], texture: '/arlo_ai.png' },
    { id: 'arlo_evil', name: 'Creepy Arlo', hp: 40, speed: 6, xp: 200, biomes: ['forest'], boss: true, texture: '/arlo_creepy.png' },
    { id: 'prof_apple', name: 'Professor Apple', hp: 10, speed: 1.2, xp: 0, friendly: true, biomes: ['plains'], chat: ['Knowledge is delicious!', 'Have you seen my bow tie?', 'Synthesis is key.'], texture: '/apple_prof_mob.png' },
    { id: 'super_ball', name: 'Blue Sparkle', hp: 25, speed: 4, xp: 0, friendly: true, biomes: ['highlands'], chat: ['Up and away!', 'I will save this land!', 'Zoom!'], texture: '/blue_super_mob.png' },
    { id: 'friendly_nugget', name: 'Tater Tot', hp: 10, speed: 1.5, xp: 0, friendly: true, biomes: ['forest'], chat: ['*nugget noises*', 'Friend?', 'Roll roll roll.'], texture: '/nugget_mob.png' }
];
