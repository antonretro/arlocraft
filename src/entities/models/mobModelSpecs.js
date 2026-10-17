/**
 * Cuboid model specs for mobs that have no hand-written model class.
 * Coordinates follow Minecraft's model space (see BoxModel), so the UV
 * offsets line up with the vanilla entity textures in the resource pack.
 */

const HALF_PI = Math.PI / 2;

const squidTentacles = () => {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    parts.push({
      name: `tentacle${i}`,
      uv: [48, 0],
      box: [-1, 0, -1, 2, 18, 2],
      pivot: [Math.cos(angle) * 5, 15, Math.sin(angle) * 5],
      rot: [0, i * ((-Math.PI * 2) / 8) + HALF_PI, 0],
      anim: 'spin',
      amp: 0.5,
    });
  }
  return parts;
};

const spiderLegs = () => {
  const legs = [];
  const zs = [2, 1, 0, -1];
  const yRots = [Math.PI / 4, Math.PI / 8, -Math.PI / 8, -Math.PI / 4];
  const zRots = [Math.PI / 4, 0.58, 0.58, Math.PI / 4];
  for (let i = 0; i < 4; i++) {
    legs.push({
      name: `legR${i}`,
      uv: [18, 0],
      box: [-15, -1, -1, 16, 2, 2],
      pivot: [-4, 15, zs[i]],
      rot: [0, yRots[i], -zRots[i]],
      anim: i % 2 ? 'legA' : 'legB',
      amp: 0.3,
    });
    legs.push({
      name: `legL${i}`,
      uv: [18, 0],
      box: [-1, -1, -1, 16, 2, 2],
      pivot: [4, 15, zs[i]],
      rot: [0, -yRots[i], zRots[i]],
      anim: i % 2 ? 'legB' : 'legA',
      amp: 0.3,
    });
  }
  return legs;
};

const SQUID = {
  texWidth: 64,
  texHeight: 32,
  parts: [
    {
      name: 'body',
      uv: [0, 0],
      box: [-6, -8, -6, 12, 16, 12],
      pivot: [0, 8, 0],
    },
    ...squidTentacles(),
  ],
};

const SLIME = {
  texWidth: 64,
  texHeight: 32,
  parts: [
    { name: 'inner', uv: [0, 16], box: [-3, 17, -3, 6, 6, 6] },
    { name: 'eyeR', uv: [32, 0], box: [-3.25, 18, -3.5, 2, 2, 2] },
    { name: 'eyeL', uv: [32, 4], box: [1.25, 18, -3.5, 2, 2, 2] },
    { name: 'mouth', uv: [32, 8], box: [0, 21, -3.5, 1, 1, 1] },
    { name: 'outer', uv: [0, 0], box: [-4, 16, -4, 8, 8, 8] },
  ],
};

const IRON_GOLEM = {
  texWidth: 128,
  texHeight: 128,
  swing: 0.5,
  parts: [
    {
      name: 'head',
      uv: [0, 0],
      box: [-4, -12, -5.5, 8, 10, 8],
      pivot: [0, -7, -2],
    },
    {
      name: 'nose',
      uv: [24, 0],
      box: [-1, -5, -7.5, 2, 4, 2],
      pivot: [0, -7, -2],
    },
    {
      name: 'body',
      uv: [0, 40],
      box: [-9, -2, -6, 18, 12, 11],
      pivot: [0, -7, 0],
    },
    {
      name: 'waist',
      uv: [0, 70],
      box: [-4.5, 10, -3, 9, 5, 6],
      pivot: [0, -7, 0],
    },
    {
      name: 'armR',
      uv: [60, 21],
      box: [-13, -2.5, -3, 4, 30, 6],
      pivot: [0, -7, 0],
      anim: 'armA',
      amp: 0.35,
    },
    {
      name: 'armL',
      uv: [60, 58],
      box: [9, -2.5, -3, 4, 30, 6],
      pivot: [0, -7, 0],
      anim: 'armB',
      amp: 0.35,
    },
    {
      name: 'legR',
      uv: [37, 0],
      box: [-3.5, -3, -3, 6, 16, 5],
      pivot: [-4, 11, 0],
      anim: 'legA',
    },
    {
      name: 'legL',
      uv: [60, 0],
      box: [-3.5, -3, -3, 6, 16, 5],
      pivot: [5, 11, 0],
      anim: 'legB',
    },
  ],
};

const ENDERMAN = {
  texWidth: 64,
  texHeight: 32,
  swing: 0.4,
  parts: [
    {
      name: 'head',
      uv: [0, 0],
      box: [-4, -8, -4, 8, 8, 8],
      pivot: [0, -14, 0],
    },
    {
      name: 'body',
      uv: [32, 16],
      box: [-4, 0, -2, 8, 12, 4],
      pivot: [0, -14, 0],
    },
    {
      name: 'armR',
      uv: [56, 0],
      box: [-1, -2, -1, 2, 30, 2],
      pivot: [-5, -12, 0],
      anim: 'armA',
    },
    {
      name: 'armL',
      uv: [56, 0],
      box: [-1, -2, -1, 2, 30, 2],
      pivot: [5, -12, 0],
      anim: 'armB',
    },
    {
      name: 'legR',
      uv: [56, 0],
      box: [-1, 0, -1, 2, 30, 2],
      pivot: [-2, -6, 0],
      anim: 'legA',
    },
    {
      name: 'legL',
      uv: [56, 0],
      box: [-1, 0, -1, 2, 30, 2],
      pivot: [2, -6, 0],
      anim: 'legB',
    },
  ],
};

const SPIDER = {
  texWidth: 64,
  texHeight: 32,
  parts: [
    {
      name: 'head',
      uv: [32, 4],
      box: [-4, -4, -8, 8, 8, 8],
      pivot: [0, 15, -3],
    },
    { name: 'neck', uv: [0, 0], box: [-3, -3, -3, 6, 6, 6], pivot: [0, 15, 0] },
    {
      name: 'body',
      uv: [0, 12],
      box: [-5, -4, -6, 10, 8, 12],
      pivot: [0, 15, 9],
    },
    ...spiderLegs(),
  ],
};

const WOLF = {
  texWidth: 64,
  texHeight: 32,
  parts: [
    {
      name: 'head',
      uv: [0, 0],
      box: [-2, -3, -2, 6, 6, 4],
      pivot: [-1, 13.5, -7],
    },
    {
      name: 'earR',
      uv: [16, 14],
      box: [-2, -5, 0, 2, 2, 1],
      pivot: [-1, 13.5, -7],
    },
    {
      name: 'earL',
      uv: [16, 14],
      box: [2, -5, 0, 2, 2, 1],
      pivot: [-1, 13.5, -7],
    },
    {
      name: 'snout',
      uv: [0, 10],
      box: [-0.5, 0, -5, 3, 3, 4],
      pivot: [-1, 13.5, -7],
    },
    {
      name: 'body',
      uv: [18, 14],
      box: [-3, -2, -3, 6, 9, 6],
      pivot: [0, 14, 2],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'mane',
      uv: [21, 0],
      box: [-3, -3, -3, 8, 6, 7],
      pivot: [-1, 14, -3],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'legBR',
      uv: [0, 18],
      box: [0, 0, -1, 2, 8, 2],
      pivot: [-2.5, 16, 7],
      anim: 'legA',
    },
    {
      name: 'legBL',
      uv: [0, 18],
      box: [0, 0, -1, 2, 8, 2],
      pivot: [0.5, 16, 7],
      anim: 'legB',
    },
    {
      name: 'legFR',
      uv: [0, 18],
      box: [0, 0, -1, 2, 8, 2],
      pivot: [-2.5, 16, -4],
      anim: 'legB',
    },
    {
      name: 'legFL',
      uv: [0, 18],
      box: [0, 0, -1, 2, 8, 2],
      pivot: [0.5, 16, -4],
      anim: 'legA',
    },
    {
      name: 'tail',
      uv: [9, 18],
      box: [0, 0, -1, 2, 8, 2],
      pivot: [-1, 12, 8],
      rot: [1.1, 0, 0],
      anim: 'tail',
    },
  ],
};

const CAT = {
  texWidth: 64,
  texHeight: 32,
  parts: [
    {
      name: 'head',
      uv: [0, 0],
      box: [-2.5, -2, -3, 5, 4, 5],
      pivot: [0, 15, -9],
    },
    {
      name: 'nose',
      uv: [0, 24],
      box: [-1.5, 0.02, -4, 3, 2, 2],
      pivot: [0, 15, -9],
    },
    {
      name: 'earL',
      uv: [0, 10],
      box: [-2, -3, 0, 1, 1, 2],
      pivot: [0, 15, -9],
    },
    { name: 'earR', uv: [6, 10], box: [1, -3, 0, 1, 1, 2], pivot: [0, 15, -9] },
    {
      name: 'body',
      uv: [20, 0],
      box: [-2, 3, -8, 4, 16, 6],
      pivot: [0, 12, -10],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'tail1',
      uv: [0, 15],
      box: [-0.5, 0, 0, 1, 8, 1],
      pivot: [0, 15, 8],
      rot: [0.9, 0, 0],
      anim: 'tail',
    },
    {
      name: 'tail2',
      uv: [4, 15],
      box: [-0.5, 0, 0, 1, 8, 1],
      pivot: [0, 20, 14],
      rot: [1.7, 0, 0],
      anim: 'tail',
    },
    {
      name: 'legBL',
      uv: [8, 13],
      box: [-1, 0, 1, 2, 6, 2],
      pivot: [1.1, 18, 5],
      anim: 'legA',
    },
    {
      name: 'legBR',
      uv: [8, 13],
      box: [-1, 0, 1, 2, 6, 2],
      pivot: [-1.1, 18, 5],
      anim: 'legB',
    },
    {
      name: 'legFL',
      uv: [40, 0],
      box: [-1, 0, 0, 2, 10, 2],
      pivot: [1.2, 14.1, -5],
      anim: 'legB',
    },
    {
      name: 'legFR',
      uv: [40, 0],
      box: [-1, 0, 0, 2, 10, 2],
      pivot: [-1.2, 14.1, -5],
      anim: 'legA',
    },
  ],
};

const RABBIT = {
  texWidth: 64,
  texHeight: 32,
  swing: 0.4,
  parts: [
    {
      name: 'footL',
      uv: [26, 24],
      box: [-1, 5.5, -3.7, 2, 1, 7],
      pivot: [3, 17.5, 3.7],
    },
    {
      name: 'footR',
      uv: [8, 24],
      box: [-1, 5.5, -3.7, 2, 1, 7],
      pivot: [-3, 17.5, 3.7],
    },
    {
      name: 'haunchL',
      uv: [30, 15],
      box: [-1, 0, 0, 2, 4, 5],
      pivot: [3, 17.5, 3.7],
      rot: [-0.349, 0, 0],
    },
    {
      name: 'haunchR',
      uv: [16, 15],
      box: [-1, 0, 0, 2, 4, 5],
      pivot: [-3, 17.5, 3.7],
      rot: [-0.349, 0, 0],
    },
    {
      name: 'body',
      uv: [0, 0],
      box: [-3, -2, -10, 6, 5, 10],
      pivot: [0, 19, 8],
      rot: [-0.349, 0, 0],
    },
    {
      name: 'legFL',
      uv: [8, 15],
      box: [-1, 0, -1, 2, 7, 2],
      pivot: [3, 17, -1],
      rot: [-0.1745, 0, 0],
      anim: 'legA',
    },
    {
      name: 'legFR',
      uv: [0, 15],
      box: [-1, 0, -1, 2, 7, 2],
      pivot: [-3, 17, -1],
      rot: [-0.1745, 0, 0],
      anim: 'legB',
    },
    {
      name: 'head',
      uv: [32, 0],
      box: [-2.5, -4, -5, 5, 4, 5],
      pivot: [0, 16, -1],
    },
    {
      name: 'earR',
      uv: [52, 0],
      box: [-2.5, -9, -1, 2, 5, 1],
      pivot: [0, 16, -1],
      rot: [0, -0.2618, 0],
    },
    {
      name: 'earL',
      uv: [58, 0],
      box: [0.5, -9, -1, 2, 5, 1],
      pivot: [0, 16, -1],
      rot: [0, 0.2618, 0],
    },
    {
      name: 'tail',
      uv: [52, 6],
      box: [-1.5, -1.5, 0, 3, 3, 2],
      pivot: [0, 20, 7],
      rot: [-0.3491, 0, 0],
    },
    {
      name: 'nose',
      uv: [32, 9],
      box: [-0.5, -2.5, -5.5, 1, 1, 1],
      pivot: [0, 16, -1],
    },
  ],
};

const HORSE_HEAD_PIVOT = [0, 4, -12];
const HORSE_HEAD_ROT = [0.5236, 0, 0];
const HORSE = {
  texWidth: 64,
  texHeight: 64,
  swing: 0.5,
  parts: [
    {
      name: 'body',
      uv: [0, 32],
      box: [-5, -8, -17, 10, 10, 22],
      pivot: [0, 11, 5],
    },
    {
      name: 'neck',
      uv: [0, 35],
      box: [-2.05, -6, -2, 4, 12, 7],
      pivot: HORSE_HEAD_PIVOT,
      rot: HORSE_HEAD_ROT,
    },
    {
      name: 'head',
      uv: [0, 13],
      box: [-3, -11, -2, 6, 5, 7],
      pivot: HORSE_HEAD_PIVOT,
      rot: HORSE_HEAD_ROT,
    },
    {
      name: 'mane',
      uv: [56, 36],
      box: [-1, -11, 5.01, 2, 16, 2],
      pivot: HORSE_HEAD_PIVOT,
      rot: HORSE_HEAD_ROT,
    },
    {
      name: 'mouth',
      uv: [0, 25],
      box: [-2, -11, -7, 4, 5, 5],
      pivot: HORSE_HEAD_PIVOT,
      rot: HORSE_HEAD_ROT,
    },
    {
      name: 'earL',
      uv: [19, 16],
      box: [0.55, -13, 4, 2, 3, 1],
      pivot: HORSE_HEAD_PIVOT,
      rot: HORSE_HEAD_ROT,
    },
    {
      name: 'earR',
      uv: [19, 16],
      box: [-2.55, -13, 4, 2, 3, 1],
      pivot: HORSE_HEAD_PIVOT,
      rot: HORSE_HEAD_ROT,
    },
    {
      name: 'tail',
      uv: [42, 36],
      box: [-1.5, 0, 0, 3, 14, 4],
      pivot: [0, 4, 11],
      rot: [0.5236, 0, 0],
      anim: 'tail',
    },
    {
      name: 'legBL',
      uv: [48, 21],
      box: [-3, -1.01, -1, 4, 11, 4],
      pivot: [4, 14, 7],
      anim: 'legA',
    },
    {
      name: 'legBR',
      uv: [48, 21],
      box: [-1, -1.01, -1, 4, 11, 4],
      pivot: [-4, 14, 7],
      anim: 'legB',
    },
    {
      name: 'legFL',
      uv: [48, 21],
      box: [-3, -1.01, -1.9, 4, 11, 4],
      pivot: [4, 14, -12],
      anim: 'legB',
    },
    {
      name: 'legFR',
      uv: [48, 21],
      box: [-1, -1.01, -1.9, 4, 11, 4],
      pivot: [-4, 14, -12],
      anim: 'legA',
    },
  ],
};

const BEE = {
  texWidth: 64,
  texHeight: 64,
  flapRate: 40,
  parts: [
    {
      name: 'body',
      uv: [0, 0],
      box: [-3.5, -4, -5, 7, 7, 10],
      pivot: [0, 19, 0],
    },
    {
      name: 'stinger',
      uv: [26, 7],
      box: [0, -1, 5, 0, 1, 2],
      pivot: [0, 19, 0],
    },
    {
      name: 'antennaL',
      uv: [2, 0],
      box: [1.5, -2, -3, 1, 2, 3],
      pivot: [0, 17, -5],
    },
    {
      name: 'antennaR',
      uv: [2, 3],
      box: [-2.5, -2, -3, 1, 2, 3],
      pivot: [0, 17, -5],
    },
    {
      name: 'wingR',
      uv: [0, 18],
      box: [-9, 0, 0, 9, 0, 6],
      pivot: [-1.5, 15, -3],
      anim: 'wingR',
      amp: 0.6,
    },
    {
      name: 'wingL',
      uv: [0, 18],
      box: [0, 0, 0, 9, 0, 6],
      pivot: [1.5, 15, -3],
      anim: 'wingL',
      amp: 0.6,
    },
    {
      name: 'legsF',
      uv: [26, 1],
      box: [-5, 0, 0, 7, 2, 0],
      pivot: [1.5, 22, -2],
    },
    {
      name: 'legsM',
      uv: [26, 3],
      box: [-5, 0, 0, 7, 2, 0],
      pivot: [1.5, 22, 0],
    },
    {
      name: 'legsB',
      uv: [26, 5],
      box: [-5, 0, 0, 7, 2, 0],
      pivot: [1.5, 22, 2],
    },
  ],
};

const PHANTOM = {
  texWidth: 64,
  texHeight: 64,
  flapRate: 6,
  parts: [
    {
      name: 'body',
      uv: [0, 8],
      box: [-3, -2, -8, 5, 3, 9],
      pivot: [0, 16, 0],
      rot: [-0.1, 0, 0],
    },
    {
      name: 'head',
      uv: [0, 0],
      box: [-4, -2, -5, 7, 3, 5],
      pivot: [1, 17, -7],
      rot: [0.2, 0, 0],
    },
    {
      name: 'tailBase',
      uv: [3, 20],
      box: [-1.5, 0, 0, 3, 2, 6],
      pivot: [-0.5, 14, 1],
      rot: [-0.1, 0, 0],
    },
    {
      name: 'tailTip',
      uv: [4, 29],
      box: [0, 0, 0, 1, 1, 6],
      pivot: [-1, 14.5, 7],
      rot: [-0.1, 0, 0],
    },
    {
      name: 'wingBaseL',
      uv: [23, 12],
      box: [0, 0, 0, 6, 2, 9],
      pivot: [2, 14, -8],
      anim: 'wingL',
      amp: 0.35,
    },
    {
      name: 'wingBaseR',
      uv: [23, 12],
      box: [-6, 0, 0, 6, 2, 9],
      pivot: [-3, 14, -8],
      anim: 'wingR',
      amp: 0.35,
    },
    {
      name: 'wingTipL',
      uv: [16, 24],
      box: [6, 0, 0, 13, 1, 9],
      pivot: [2, 14, -8],
      anim: 'wingL',
      amp: 0.5,
    },
    {
      name: 'wingTipR',
      uv: [16, 24],
      box: [-19, 0, 0, 13, 1, 9],
      pivot: [-3, 14, -8],
      anim: 'wingR',
      amp: 0.5,
    },
  ],
};

const PIGLIN = {
  texWidth: 64,
  texHeight: 64,
  swing: 0.6,
  parts: [
    { name: 'head', uv: [0, 0], box: [-5, -8, -4, 10, 8, 8] },
    { name: 'snout', uv: [31, 1], box: [-2, -4, -5, 4, 4, 1] },
    {
      name: 'earL',
      uv: [51, 6],
      box: [0, 0, -2, 1, 5, 4],
      pivot: [4.5, -6, 0],
      rot: [0, 0, -0.5236],
    },
    {
      name: 'earR',
      uv: [39, 6],
      box: [-1, 0, -2, 1, 5, 4],
      pivot: [-4.5, -6, 0],
      rot: [0, 0, 0.5236],
    },
    { name: 'body', uv: [16, 16], box: [-4, 0, -2, 8, 12, 4] },
    {
      name: 'armR',
      uv: [40, 16],
      box: [-3, -2, -2, 4, 12, 4],
      pivot: [-5, 2, 0],
      anim: 'armA',
    },
    {
      name: 'armL',
      uv: [32, 48],
      box: [-1, -2, -2, 4, 12, 4],
      pivot: [5, 2, 0],
      anim: 'armB',
    },
    {
      name: 'legR',
      uv: [0, 16],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [-1.9, 12, 0],
      anim: 'legA',
    },
    {
      name: 'legL',
      uv: [16, 48],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [1.9, 12, 0],
      anim: 'legB',
    },
  ],
};

const HOGLIN = {
  texWidth: 128,
  texHeight: 64,
  swing: 0.5,
  parts: [
    {
      name: 'body',
      uv: [1, 1],
      box: [-8, -7, -13, 16, 14, 26],
      pivot: [0, 7, 0],
    },
    {
      name: 'head',
      uv: [61, 1],
      box: [-7, -3, -19, 14, 6, 19],
      pivot: [0, 2, -12],
      rot: [0.8727, 0, 0],
    },
    {
      name: 'legFR',
      uv: [41, 42],
      box: [-3, 0, -3, 6, 14, 6],
      pivot: [-4, 10, -8.5],
      anim: 'legA',
    },
    {
      name: 'legFL',
      uv: [66, 42],
      box: [-3, 0, -3, 6, 14, 6],
      pivot: [4, 10, -8.5],
      anim: 'legB',
    },
    {
      name: 'legBR',
      uv: [21, 45],
      box: [-2.5, 0, -2.5, 5, 11, 5],
      pivot: [-5, 13, 10],
      anim: 'legB',
    },
    {
      name: 'legBL',
      uv: [0, 45],
      box: [-2.5, 0, -2.5, 5, 11, 5],
      pivot: [5, 13, 10],
      anim: 'legA',
    },
  ],
};

const STRIDER = {
  texWidth: 64,
  texHeight: 128,
  swing: 0.7,
  parts: [
    {
      name: 'body',
      uv: [0, 0],
      box: [-8, -6, -8, 16, 14, 16],
      pivot: [0, 1, 0],
    },
    {
      name: 'legR',
      uv: [0, 32],
      box: [-2, 0, -2, 4, 16, 4],
      pivot: [-4, 8, 0],
      anim: 'legA',
    },
    {
      name: 'legL',
      uv: [0, 55],
      box: [-2, 0, -2, 4, 16, 4],
      pivot: [4, 8, 0],
      anim: 'legB',
    },
  ],
};

const RAVAGER = {
  texWidth: 128,
  texHeight: 128,
  swing: 0.4,
  parts: [
    {
      name: 'body',
      uv: [0, 55],
      box: [-7, -10, -7, 14, 16, 20],
      pivot: [0, 1, 2],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'belly',
      uv: [0, 91],
      box: [-6, 6, -7, 12, 13, 18],
      pivot: [0, 1, 2],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'neck',
      uv: [68, 73],
      box: [-5, -1, -18, 10, 10, 18],
      pivot: [0, -7, 5.5],
    },
    {
      name: 'head',
      uv: [0, 0],
      box: [-8, -20, -14, 16, 20, 16],
      pivot: [0, 9, -12.5],
    },
    {
      name: 'mouth',
      uv: [0, 36],
      box: [-8, 0, -16, 16, 3, 16],
      pivot: [0, 7, -10.5],
    },
    {
      name: 'hornR',
      uv: [74, 55],
      box: [-10, -14, -8, 2, 14, 4],
      pivot: [0, 9, -12.5],
      rot: [1.0996, 0, 0],
    },
    {
      name: 'hornL',
      uv: [74, 55],
      box: [8, -14, -8, 2, 14, 4],
      pivot: [0, 9, -12.5],
      rot: [1.0996, 0, 0],
    },
    {
      name: 'legBR',
      uv: [96, 0],
      box: [-4, 0, -4, 8, 37, 8],
      pivot: [-8, -13, 18],
      anim: 'legA',
    },
    {
      name: 'legBL',
      uv: [96, 0],
      box: [-4, 0, -4, 8, 37, 8],
      pivot: [8, -13, 18],
      anim: 'legB',
    },
    {
      name: 'legFR',
      uv: [64, 0],
      box: [-4, 0, -4, 8, 37, 8],
      pivot: [-8, -13, -4],
      anim: 'legB',
    },
    {
      name: 'legFL',
      uv: [64, 0],
      box: [-4, 0, -4, 8, 37, 8],
      pivot: [8, -13, -4],
      anim: 'legA',
    },
  ],
};

const COD = {
  texWidth: 32,
  texHeight: 32,
  parts: [
    { name: 'body', uv: [0, 0], box: [-1, -2, 0, 2, 4, 7], pivot: [0, 22, 0] },
    {
      name: 'head',
      uv: [11, 0],
      box: [-1, -2, -3, 2, 4, 3],
      pivot: [0, 22, 0],
    },
    {
      name: 'nose',
      uv: [0, 0],
      box: [-1, -2, -1, 2, 3, 1],
      pivot: [0, 22, -3],
    },
    {
      name: 'finTop',
      uv: [20, -6],
      box: [0, -1, -1, 0, 1, 6],
      pivot: [0, 20, 0],
    },
    {
      name: 'tail',
      uv: [22, 3],
      box: [0, -2, 0, 0, 4, 4],
      pivot: [0, 22, 7],
      anim: 'tail',
      amp: 0.8,
    },
  ],
};

const SALMON = {
  texWidth: 32,
  texHeight: 32,
  parts: [
    {
      name: 'bodyFront',
      uv: [0, 0],
      box: [-1.5, -2.5, 0, 3, 5, 8],
      pivot: [0, 20, 0],
    },
    {
      name: 'bodyBack',
      uv: [0, 13],
      box: [-1.5, -2.5, 0, 3, 5, 8],
      pivot: [0, 20, 8],
    },
    {
      name: 'head',
      uv: [22, 0],
      box: [-1, -2, -3, 2, 4, 3],
      pivot: [0, 20, 0],
    },
    {
      name: 'tail',
      uv: [20, 10],
      box: [0, -2.5, 0, 0, 5, 6],
      pivot: [0, 20, 16],
      anim: 'tail',
      amp: 0.8,
    },
  ],
};

const TROPICAL_FISH = {
  texWidth: 32,
  texHeight: 32,
  parts: [
    {
      name: 'body',
      uv: [0, 0],
      box: [-1, -1.5, -3, 2, 3, 6],
      pivot: [0, 22, 0],
    },
    {
      name: 'tail',
      uv: [22, -6],
      box: [0, -1.5, 0, 0, 3, 6],
      pivot: [0, 22, 3],
      anim: 'tail',
      amp: 0.8,
    },
    {
      name: 'finTop',
      uv: [10, -5],
      box: [0, -3, 0, 0, 3, 6],
      pivot: [0, 20.5, -3],
    },
  ],
};

const COW = {
  texWidth: 64,
  texHeight: 32,
  swing: 0.5,
  parts: [
    { name: 'head', uv: [0, 0], box: [-4, -4, -6, 8, 8, 6], pivot: [0, 4, -8] },
    {
      name: 'hornR',
      uv: [22, 0],
      box: [-5, -5, -4, 1, 3, 1],
      pivot: [0, 4, -8],
    },
    {
      name: 'hornL',
      uv: [22, 0],
      box: [4, -5, -4, 1, 3, 1],
      pivot: [0, 4, -8],
    },
    {
      name: 'body',
      uv: [18, 4],
      box: [-6, -10, -7, 12, 18, 10],
      pivot: [0, 5, 2],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'udder',
      uv: [52, 0],
      box: [-2, 2, -8, 4, 6, 1],
      pivot: [0, 5, 2],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'legBR',
      uv: [0, 16],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [-4, 12, 7],
      anim: 'legA',
    },
    {
      name: 'legBL',
      uv: [0, 16],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [4, 12, 7],
      anim: 'legB',
    },
    {
      name: 'legFR',
      uv: [0, 16],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [-4, 12, -6],
      anim: 'legB',
    },
    {
      name: 'legFL',
      uv: [0, 16],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [4, 12, -6],
      anim: 'legA',
    },
  ],
};

const SHEEP_LEGS = [
  ['BR', -3, 7, 'legA'],
  ['BL', 3, 7, 'legB'],
  ['FR', -3, -5, 'legB'],
  ['FL', 3, -5, 'legA'],
];
const SHEEP = {
  texWidth: 64,
  texHeight: 32,
  swing: 0.5,
  parts: [
    { name: 'head', uv: [0, 0], box: [-3, -4, -6, 6, 6, 8], pivot: [0, 6, -8] },
    {
      name: 'body',
      uv: [28, 8],
      box: [-4, -10, -7, 8, 16, 6],
      pivot: [0, 5, 2],
      rot: [HALF_PI, 0, 0],
    },
    ...SHEEP_LEGS.map(([n, x, z, anim]) => ({
      name: `leg${n}`,
      uv: [0, 16],
      box: [-2, 0, -2, 4, 12, 4],
      pivot: [x, 12, z],
      anim,
    })),
    // Wool layer (sheep_fur texture).
    {
      name: 'furHead',
      uv: [0, 0],
      box: [-3, -4, -4, 6, 6, 6],
      pivot: [0, 6, -8],
      inflate: 0.6,
      overlay: true,
    },
    {
      name: 'furBody',
      uv: [28, 8],
      box: [-4, -10, -7, 8, 16, 6],
      pivot: [0, 5, 2],
      rot: [HALF_PI, 0, 0],
      inflate: 1.75,
      overlay: true,
    },
    ...SHEEP_LEGS.map(([n, x, z, anim]) => ({
      name: `furLeg${n}`,
      uv: [0, 16],
      box: [-2, 0, -2, 4, 6, 4],
      pivot: [x, 12, z],
      inflate: 0.5,
      overlay: true,
      anim,
    })),
  ],
};

const CHICKEN = {
  texWidth: 64,
  texHeight: 32,
  swing: 0.8,
  flapRate: 10,
  parts: [
    {
      name: 'head',
      uv: [0, 0],
      box: [-2, -6, -2, 4, 6, 3],
      pivot: [0, 15, -4],
    },
    {
      name: 'beak',
      uv: [14, 0],
      box: [-2, -4, -4, 4, 2, 2],
      pivot: [0, 15, -4],
    },
    {
      name: 'wattle',
      uv: [14, 4],
      box: [-1, -2, -3, 2, 2, 2],
      pivot: [0, 15, -4],
    },
    {
      name: 'body',
      uv: [0, 9],
      box: [-3, -4, -3, 6, 8, 6],
      pivot: [0, 16, 0],
      rot: [HALF_PI, 0, 0],
    },
    {
      name: 'legR',
      uv: [26, 0],
      box: [-1, 0, -3, 3, 5, 3],
      pivot: [-2, 19, 1],
      anim: 'legA',
    },
    {
      name: 'legL',
      uv: [26, 0],
      box: [-1, 0, -3, 3, 5, 3],
      pivot: [1, 19, 1],
      anim: 'legB',
    },
    {
      name: 'wingR',
      uv: [24, 13],
      box: [0, 0, -3, 1, 4, 6],
      pivot: [-4, 13, 0],
      anim: 'wingR',
      amp: 0.15,
    },
    {
      name: 'wingL',
      uv: [24, 13],
      box: [-1, 0, -3, 1, 4, 6],
      pivot: [4, 13, 0],
      anim: 'wingL',
      amp: 0.15,
    },
  ],
};

/**
 * Lays each part's texture net out on its own patch of a texWidth-wide
 * sheet (simple shelf packing) so a painted sheet can give every part a
 * flat colour. Used by models that are coloured in code, not from a PNG.
 */
function packPartUVs(parts, texWidth) {
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const part of parts) {
    const [, , , w, h, d] = part.box;
    const netW = Math.ceil(2 * (w + d));
    const netH = Math.ceil(h + d);
    if (x + netW > texWidth) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    part.uv = [x, y];
    x += netW;
    shelf = Math.max(shelf, netH);
  }
  return parts;
}

// The Build Bot companion: a stubby robot with a visor, an antenna and
// claw hands. Colours are painted onto a generated sheet (see BuildBot).
const BUILD_BOT = {
  texWidth: 128,
  texHeight: 128,
  swing: 0.7,
  parts: packPartUVs(
    [
      {
        name: 'legR',
        box: [-1.5, 0, -1.5, 3, 5, 3],
        pivot: [-2, 19, 0],
        anim: 'legA',
        color: '#4b5058',
      },
      {
        name: 'legL',
        box: [-1.5, 0, -1.5, 3, 5, 3],
        pivot: [2, 19, 0],
        anim: 'legB',
        color: '#4b5058',
      },
      {
        name: 'footR',
        box: [-2, 4, -2.5, 4, 1, 4],
        pivot: [-2, 19, 0],
        anim: 'legA',
        color: '#2c3036',
      },
      {
        name: 'footL',
        box: [-2, 4, -2.5, 4, 1, 4],
        pivot: [2, 19, 0],
        anim: 'legB',
        color: '#2c3036',
      },
      { name: 'body', box: [-4, 11, -3, 8, 8, 6], color: '#e0a72a' },
      { name: 'belly', box: [-2.5, 13, -3.4, 5, 4, 0.5], color: '#5fae3c' },
      { name: 'backpack', box: [-3, 12, 3, 6, 6, 2], color: '#7a7f88' },
      {
        name: 'armR',
        box: [-1, 0, -1, 2, 6, 2],
        pivot: [-5, 12, 0],
        anim: 'armA',
        color: '#9aa1ab',
      },
      {
        name: 'armL',
        box: [-1, 0, -1, 2, 6, 2],
        pivot: [5, 12, 0],
        anim: 'armB',
        color: '#9aa1ab',
      },
      {
        name: 'clawR',
        box: [-1.5, 6, -1.5, 3, 2, 3],
        pivot: [-5, 12, 0],
        anim: 'armA',
        color: '#2c3036',
      },
      {
        name: 'clawL',
        box: [-1.5, 6, -1.5, 3, 2, 3],
        pivot: [5, 12, 0],
        anim: 'armB',
        color: '#2c3036',
      },
      { name: 'neck', box: [-1.5, 10, -1.5, 3, 1, 3], color: '#2c3036' },
      { name: 'head', box: [-4.5, 3, -4, 9, 7, 8], color: '#c9ced6' },
      { name: 'visor', box: [-3.5, 5, -4.4, 7, 3, 0.5], color: '#16181c' },
      {
        name: 'eyeR',
        box: [-2.75, 5.75, -4.6, 1.5, 1.5, 0.3],
        color: '#ffe066',
      },
      {
        name: 'eyeL',
        box: [1.25, 5.75, -4.6, 1.5, 1.5, 0.3],
        color: '#ffe066',
      },
      { name: 'earR', box: [-5.5, 5, -1, 1, 3, 2], color: '#e0a72a' },
      { name: 'earL', box: [4.5, 5, -1, 1, 3, 2], color: '#e0a72a' },
      { name: 'antenna', box: [-0.5, 0.5, -0.5, 1, 2.5, 1], color: '#2c3036' },
      { name: 'antennaTip', box: [-1, -1, -1, 2, 1.5, 2], color: '#e8312f' },
    ],
    128
  ),
};

export const MOB_MODEL_SPECS = {
  build_bot: BUILD_BOT,
  cow: COW,
  sheep: SHEEP,
  chicken: CHICKEN,
  squid: SQUID,
  slime: SLIME,
  iron_golem: IRON_GOLEM,
  enderman: ENDERMAN,
  spider: SPIDER,
  wolf: WOLF,
  cat: CAT,
  rabbit: RABBIT,
  horse: HORSE,
  bee: BEE,
  phantom: PHANTOM,
  piglin: PIGLIN,
  hoglin: HOGLIN,
  strider: STRIDER,
  ravager: RAVAGER,
  cod: COD,
  salmon: SALMON,
  tropical_fish: TROPICAL_FISH,
};
