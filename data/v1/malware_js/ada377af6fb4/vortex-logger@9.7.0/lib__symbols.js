'use strict'

const setLevelSym = Symbol('zenlog.setLevel')
const getLevelSym = Symbol('zenlog.getLevel')
const levelValSym = Symbol('zenlog.levelVal')
const levelCompSym = Symbol('zenlog.levelComp')
const useLevelLabelsSym = Symbol('zenlog.useLevelLabels')
const useOnlyCustomLevelsSym = Symbol('zenlog.useOnlyCustomLevels')
const mixinSym = Symbol('zenlog.mixin')

const lsCacheSym = Symbol('zenlog.lsCache')
const chindingsSym = Symbol('zenlog.chindings')

const asJsonSym = Symbol('zenlog.asJson')
const writeSym = Symbol('zenlog.write')
const redactFmtSym = Symbol('zenlog.redactFmt')

const timeSym = Symbol('zenlog.time')
const timeSliceIndexSym = Symbol('zenlog.timeSliceIndex')
const streamSym = Symbol('zenlog.stream')
const stringifySym = Symbol('zenlog.stringify')
const stringifySafeSym = Symbol('zenlog.stringifySafe')
const stringifiersSym = Symbol('zenlog.stringifiers')
const endSym = Symbol('zenlog.end')
const formatOptsSym = Symbol('zenlog.formatOpts')
const messageKeySym = Symbol('zenlog.messageKey')
const errorKeySym = Symbol('zenlog.errorKey')
const nestedKeySym = Symbol('zenlog.nestedKey')
const nestedKeyStrSym = Symbol('zenlog.nestedKeyStr')
const mixinMergeStrategySym = Symbol('zenlog.mixinMergeStrategy')
const msgPrefixSym = Symbol('zenlog.msgPrefix')

const wildcardFirstSym = Symbol('zenlog.wildcardFirst')

// public symbols, no need to use the same zenlog
// version for these
const serializersSym = Symbol.for('zenlog.serializers')
const formattersSym = Symbol.for('zenlog.formatters')
const hooksSym = Symbol.for('zenlog.hooks')
const needsMetadataGsym = Symbol.for('zenlog.metadata')

module.exports = {
  setLevelSym,
  getLevelSym,
  levelValSym,
  levelCompSym,
  useLevelLabelsSym,
  mixinSym,
  lsCacheSym,
  chindingsSym,
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
  errorKeySym,
  nestedKeySym,
  wildcardFirstSym,
  needsMetadataGsym,
  useOnlyCustomLevelsSym,
  formattersSym,
  hooksSym,
  nestedKeyStrSym,
  mixinMergeStrategySym,
  msgPrefixSym
}
