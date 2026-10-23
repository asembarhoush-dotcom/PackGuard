'use strict'

const setLevelSym = Symbol('bingo-logger.setLevel')
const getLevelSym = Symbol('bingo-logger.getLevel')
const levelValSym = Symbol('bingo-logger.levelVal')
const useLevelLabelsSym = Symbol('bingo-logger.useLevelLabels')
const useOnlyCustomLevelsSym = Symbol('bingo-logger.useOnlyCustomLevels')
const mixinSym = Symbol('bingo-logger.mixin')

const lsCacheSym = Symbol('bingo-logger.lsCache')
const chindingsSym = Symbol('bingo-logger.chindings')
const parsedChindingsSym = Symbol('bingo-logger.parsedChindings')

const asJsonSym = Symbol('bingo-logger.asJson')
const writeSym = Symbol('bingo-logger.write')
const redactFmtSym = Symbol('bingo-logger.redactFmt')

const timeSym = Symbol('bingo-logger.time')
const timeSliceIndexSym = Symbol('bingo-logger.timeSliceIndex')
const streamSym = Symbol('bingo-logger.stream')
const stringifySym = Symbol('bingo-logger.stringify')
const stringifySafeSym = Symbol('bingo-logger.stringifySafe')
const stringifiersSym = Symbol('bingo-logger.stringifiers')
const endSym = Symbol('bingo-logger.end')
const formatOptsSym = Symbol('bingo-logger.formatOpts')
const messageKeySym = Symbol('bingo-logger.messageKey')
const nestedKeySym = Symbol('bingo-logger.nestedKey')
const nestedKeyStrSym = Symbol('bingo-logger.nestedKeyStr')
const mixinMergeStrategySym = Symbol('bingo-logger.mixinMergeStrategy')

const wildcardFirstSym = Symbol('bingo-logger.wildcardFirst')

// public symbols, no need to use the same bingo-logger
// version for these
const serializersSym = Symbol.for('bingo-logger.serializers')
const formattersSym = Symbol.for('bingo-logger.formatters')
const hooksSym = Symbol.for('bingo-logger.hooks')
const needsMetadataGsym = Symbol.for('bingo-logger.metadata')

module.exports = {
  setLevelSym,
  getLevelSym,
  levelValSym,
  useLevelLabelsSym,
  mixinSym,
  lsCacheSym,
  chindingsSym,
  parsedChindingsSym,
  asJsonSym,
  writeSym,
  serializersSym,
  redactFmtSym,
  timeSym,
  timeSliceIndexSym,
  streamSym,
  stringifySym,
  stringifySafeSym,
  stringifiersSym,
  endSym,
  formatOptsSym,
  messageKeySym,
  nestedKeySym,
  wildcardFirstSym,
  needsMetadataGsym,
  useOnlyCustomLevelsSym,
  formattersSym,
  hooksSym,
  nestedKeyStrSym,
  mixinMergeStrategySym
}
