// Core-owned portable archive writer. Never executes package source.
const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const zipStored = (files = {}) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(raw);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const centralRecord = Buffer.alloc(46);
    centralRecord.writeUInt32LE(0x02014b50, 0);
    centralRecord.writeUInt16LE(20, 4);
    centralRecord.writeUInt16LE(20, 6);
    centralRecord.writeUInt32LE(crc, 16);
    centralRecord.writeUInt32LE(content.length, 20);
    centralRecord.writeUInt32LE(content.length, 24);
    centralRecord.writeUInt16LE(nameBytes.length, 28);
    centralRecord.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, content);
    central.push(centralRecord, nameBytes);
    offset += local.length + nameBytes.length + content.length;
  }
  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, eocd]);
};

module.exports = { zipStored };
