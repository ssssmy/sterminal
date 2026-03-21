// 端口转发类型定义

export type PortForwardType = 'local' | 'remote' | 'dynamic'
export type TunnelStatus = 'inactive' | 'starting' | 'active' | 'error' | 'stopping'

export interface PortForward {
  id: string
  name?: string
  type: PortForwardType
  hostId: string
  // Local 转发 (-L): localBindAddr:localPort → remoteTargetAddr:remoteTargetPort
  localBindAddr: string
  localPort?: number
  remoteTargetAddr?: string
  remoteTargetPort?: number
  // Remote 转发 (-R): remoteBindAddr:remotePort → localTargetAddr:localTargetPort
  remoteBindAddr: string
  remotePort?: number
  localTargetAddr: string
  localTargetPort?: number
  // 行为
  autoStart: boolean
  appStart: boolean
  groupId?: string
  sortOrder: number
}

export interface TunnelState {
  ruleId: string
  status: TunnelStatus
  error?: string
  connectionCount: number
  startedAt?: string
}
