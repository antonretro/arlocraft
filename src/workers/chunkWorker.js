import { expose, transfer } from 'comlink';
import { generateChunkData } from '../voxel/gen/generateChunk.js';
import { meshChunk } from '../voxel/mesh/meshChunk.js';

// Block render table, pushed by the main thread whenever it grows.
let blockTable = new Int32Array(0);

function transferablesOf(groups) {
  const list = [];
  for (const group of Object.values(groups)) {
    if (!group) continue;
    for (const arr of Object.values(group)) list.push(arr.buffer);
  }
  return list;
}

const api = {
  generate(params) {
    const result = generateChunkData(params);
    const outside = new Int32Array(result.outside);
    return transfer(
      { blocks: result.blocks, palette: result.palette, outside },
      [result.blocks.buffer, outside.buffer]
    );
  },

  setTable(table) {
    blockTable = table;
  },

  mesh(padded, tints) {
    const groups = meshChunk(padded, blockTable, tints);
    return transfer(groups, transferablesOf(groups));
  },
};

expose(api);
