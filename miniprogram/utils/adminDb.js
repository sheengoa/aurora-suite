const { callAdminApi } = require('./adminAuth')

function createMarker(type) {
  return { __adminOperation: type }
}

class AdminQuery {
  constructor(collectionName) {
    this.options = {
      collectionName,
      where: null,
      orderBy: null,
      skip: 0,
      limit: 100,
      field: null
    }
    this.documentId = ''
  }

  where(where) {
    this.options.where = where
    return this
  }

  orderBy(field, direction) {
    this.options.orderBy = { field, direction }
    return this
  }

  skip(skip) {
    this.options.skip = skip
    return this
  }

  limit(limit) {
    this.options.limit = limit
    return this
  }

  field(field) {
    this.options.field = field
    return this
  }

  doc(documentId) {
    this.documentId = documentId
    return this
  }

  async get() {
    const result = await callAdminApi('list', {
      ...this.options,
      documentId: this.documentId
    })
    return { data: result.data || [] }
  }

  async add({ data }) {
    const result = await callAdminApi('add', {
      collectionName: this.options.collectionName,
      data
    })
    return { _id: result._id }
  }

  async update({ data }) {
    return callAdminApi('update', {
      collectionName: this.options.collectionName,
      documentId: this.documentId,
      data
    })
  }

  async remove() {
    return callAdminApi('remove', {
      collectionName: this.options.collectionName,
      documentId: this.documentId
    })
  }
}

module.exports = {
  collection(collectionName) {
    return new AdminQuery(collectionName)
  },
  serverDate() {
    return createMarker('serverDate')
  },
  command: {
    remove() {
      return createMarker('remove')
    }
  }
}
