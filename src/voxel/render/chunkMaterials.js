import * as THREE from 'three';

/**
 * Materials for meshed chunks. They are ordinary Lambert materials (so the
 * scene's sun, ambient light and fog apply) patched to read the face
 * texture from the block texture array using the per-vertex `layer`
 * attribute, and to add per-vertex emission for glowing blocks.
 */
function patchForTextureArray(material, textureArray) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlockTextures = { value: textureArray };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float layer;
attribute float emit;
attribute vec4 tint;
varying vec2 vBlockUv;
varying float vLayer;
varying float vEmit;
varying vec4 vTint;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vBlockUv = uv;
vLayer = layer;
vEmit = emit;
vTint = tint;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uBlockTextures;
varying vec2 vBlockUv;
varying float vLayer;
varying float vEmit;
varying vec4 vTint;`
      )
      .replace(
        '#include <map_fragment>',
        `vec4 blockTexel = texture(uBlockTextures, vec3(vBlockUv, floor(vLayer + 0.5)));
// Biome tint. Masked faces (grass block sides) only tint grey texels, so
// the dirt stays brown while the grass overlay takes the biome colour.
float texelSat = max(blockTexel.r, max(blockTexel.g, blockTexel.b)) - min(blockTexel.r, min(blockTexel.g, blockTexel.b));
float tintAmount = vTint.a > 0.5 ? 1.0 - smoothstep(0.05, 0.14, texelSat) : 1.0;
blockTexel.rgb *= mix(vec3(1.0), vTint.rgb, tintAmount);
diffuseColor *= blockTexel;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vEmit;`
      );
  };
  // Every chunk material shares one compiled program.
  material.customProgramCacheKey = () => `voxel-chunk-${material.name}`;
  return material;
}

export function createChunkMaterials(textureArray) {
  const solid = patchForTextureArray(
    new THREE.MeshLambertMaterial({
      name: 'solid',
      vertexColors: true,
      alphaTest: 0.5,
    }),
    textureArray
  );
  const cross = patchForTextureArray(
    new THREE.MeshLambertMaterial({
      name: 'cross',
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
    textureArray
  );
  const liquid = patchForTextureArray(
    new THREE.MeshLambertMaterial({
      name: 'liquid',
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    textureArray
  );
  return { solid, cross, liquid };
}
