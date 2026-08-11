const ORDER_STATUS = {
  PENDING_ACCEPT: 0,
  PREPARING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  READY: 4
}

const FULFILLMENT_STATUS = {
  pending_accept: ORDER_STATUS.PENDING_ACCEPT,
  preparing: ORDER_STATUS.PREPARING,
  ready: ORDER_STATUS.READY,
  completed: ORDER_STATUS.COMPLETED,
  cancelled: ORDER_STATUS.CANCELLED
}

const STATUS_TEXT = {
  [ORDER_STATUS.PENDING_ACCEPT]: '待接单',
  [ORDER_STATUS.PREPARING]: '制作中',
  [ORDER_STATUS.READY]: '待取餐',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消'
}

const TRANSITIONS = {
  [ORDER_STATUS.PENDING_ACCEPT]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: []
}

function normalizeStatus(order = {}) {
  if (Number.isInteger(order.status)) return order.status
  return FULFILLMENT_STATUS[order.fulfillmentStatus] === undefined
    ? ORDER_STATUS.PENDING_ACCEPT
    : FULFILLMENT_STATUS[order.fulfillmentStatus]
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to)
}

function getStatusText(status) {
  return STATUS_TEXT[status] || '待接单'
}

function getFulfillmentStatus(status) {
  return Object.keys(FULFILLMENT_STATUS).find(key => FULFILLMENT_STATUS[key] === status) || 'pending_accept'
}

module.exports = {
  ORDER_STATUS,
  FULFILLMENT_STATUS,
  STATUS_TEXT,
  canTransition,
  getFulfillmentStatus,
  getStatusText,
  normalizeStatus
}
