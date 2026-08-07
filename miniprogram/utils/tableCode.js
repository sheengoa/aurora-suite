const MAX_TABLE_NUMBER_LENGTH = 64

function safeDecode(value) {
  const text = String(value || '')

  try {
    return decodeURIComponent(text)
  } catch (err) {
    return text
  }
}

function normalizeTableNumber(value) {
  return safeDecode(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_TABLE_NUMBER_LENGTH)
}

function getTableNumberFromPath(path) {
  const text = String(path || '')
  const queryIndex = text.indexOf('?')
  const query = queryIndex >= 0 ? text.slice(queryIndex + 1) : text

  if (!query || !query.includes('=')) {
    return ''
  }

  const params = query.split('&')
  const supportedKeys = ['scene', 'tableNumber']

  for (let index = 0; index < params.length; index += 1) {
    const pair = params[index].split('=')
    const key = safeDecode(pair.shift()).trim()
    const value = pair.join('=')

    if (supportedKeys.includes(key) && value) {
      return normalizeTableNumber(value)
    }
  }

  return ''
}

function parseTableNumberFromScanResult(scanResult = {}) {
  const pathTableNumber = getTableNumberFromPath(scanResult.path)
  if (pathTableNumber) {
    return pathTableNumber
  }

  const result = normalizeTableNumber(scanResult.result)
  if (!result) {
    return ''
  }

  const resultTableNumber = getTableNumberFromPath(result)
  if (resultTableNumber) {
    return resultTableNumber
  }

  if (/^https?:\/\//i.test(result) || result.includes('?')) {
    return ''
  }

  return result
}

function scanTableCodeFromCamera() {
  return new Promise((resolve, reject) => {
    wx.scanCode({
      onlyFromCamera: true,
      success: (result) => {
        const tableNumber = parseTableNumberFromScanResult(result)

        if (!tableNumber) {
          const error = new Error('未能识别桌码')
          error.code = 'INVALID_TABLE_CODE'
          reject(error)
          return
        }

        resolve(tableNumber)
      },
      fail: reject
    })
  })
}

function isScanCancelled(error) {
  const message = String((error && error.errMsg) || (error && error.message) || '')
  return message.includes('cancel')
}

module.exports = {
  getTableNumberFromPath,
  isScanCancelled,
  normalizeTableNumber,
  parseTableNumberFromScanResult,
  scanTableCodeFromCamera
}
