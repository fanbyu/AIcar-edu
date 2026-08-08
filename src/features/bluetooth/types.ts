/** 兼容导出：统一从 esp32Protocol 取指令类型与广播映射 */
export {
  type CarCommand,
  COMMAND_LABELS,
  driveBroadcast,
  driveCommandToLabel,
} from './esp32Protocol';
