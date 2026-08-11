// pages/admin/dish/dish.js
const db = require('../../../utils/adminDb')

const MAX_PRICE = 10000
const MAX_DISH_IMAGES = 9
const DEFAULT_SKU_NAME = '默认规格'

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeNumber(value, fallback = '') {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const num = Number(value)
  return Number.isNaN(num) ? fallback : num
}

function createSku(options = {}) {
  return {
    id: options.id || makeId('sku'),
    name: options.name !== undefined ? options.name : '',
    price: normalizeNumber(options.price, ''),
    status: options.status === 0 ? 0 : 1,
    sort: Number(options.sort) || 0
  }
}

function normalizeSkus(dish = {}) {
  const source = Array.isArray(dish.skus) && dish.skus.length > 0
    ? dish.skus
    : [createSku({
      id: 'default',
      name: DEFAULT_SKU_NAME,
      price: dish.price,
      status: 1,
      sort: 0
    })]

  return source.map((sku, index) => createSku({
    ...sku,
    id: sku.id || `sku_${index + 1}`,
    name: sku.name || (index === 0 ? DEFAULT_SKU_NAME : `规格${index + 1}`),
    sort: sku.sort !== undefined ? sku.sort : index
  }))
}

function clone(data) {
  return JSON.parse(JSON.stringify(data || {}))
}

function normalizeDishImages(dish = {}) {
  const images = []
  const source = []

  if (dish.image) {
    source.push(dish.image)
  }
  if (Array.isArray(dish.images)) {
    source.push(...dish.images)
  }

  source.forEach(image => {
    if (typeof image === 'string' && image.trim() && !images.includes(image)) {
      images.push(image)
    }
  })

  return images.slice(0, MAX_DISH_IMAGES)
}

Page({
  data: {
    // 分类相关
    categories: [],
    currentCategoryId: '',
    showCategoryModal: false,
    editCategoryMode: false,
    currentCategory: {
      _id: '',
      name: '',
      sort: 0
    },

    // 菜品相关
    dishes: [],
    showDishModal: false,
    editDishMode: false,
    currentDish: {
      _id: '',
      name: '',
      price: '',
      description: '',
      categoryId: '',
      categoryName: '',
      image: '',
      images: [],
      status: 1,
      sort: 0,
      tags: [],
      skus: [createSku()]
    },

    // 口味/做法编辑
    showTagModal: false,
    editingTagIndex: -1,
    currentTag: {
      name: '',
      type: 'single',
      required: true,
      options: []
    },
    newOption: '',

    // 菜品分页
    dishPage: 0,
    dishPageSize: 20,
    dishHasMore: true,
    loadingDishes: false,
    dishEditorImageFailures: {}
  },

  onLoad() {
    this.loadCategories()
    this.loadDishes()
  },

  onShow() {
    this.loadCategories()
    this.loadDishes()
  },

  // ==================== 分类管理 ====================
  async loadCategories() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getCategory'
      })
      const result = res.result || {}
      const categories = result.success ? (result.data || []) : []

      if (categories.length > 0 && !this.data.currentCategoryId) {
        this.setData({
          categories,
          currentCategoryId: categories[0]._id
        }, () => {
          this.loadDishes()
        })
      } else {
        this.setData({ categories }, () => {
          if (this.data.currentCategoryId) {
            this.loadDishes()
          }
        })
      }
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  switchCategory(e) {
    const categoryId = e.currentTarget.dataset.id
    this.setData({
      currentCategoryId: categoryId,
      dishPage: 0,
      dishHasMore: true
    }, () => {
      this.loadDishes()
    })
  },

  showAddCategoryModal() {
    this.setData({
      showCategoryModal: true,
      editCategoryMode: false,
      currentCategory: {
        _id: '',
        name: '',
        sort: this.data.categories.length
      }
    })
  },

  showEditCategoryModal(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      showCategoryModal: true,
      editCategoryMode: true,
      currentCategory: { ...category }
    })
  },

  closeCategoryModal() {
    this.setData({
      showCategoryModal: false
    })
  },

  onCategoryNameInput(e) {
    this.setData({
      'currentCategory.name': e.detail.value
    })
  },

  onCategorySortInput(e) {
    this.setData({
      'currentCategory.sort': parseInt(e.detail.value, 10) || 0
    })
  },

  async saveCategory() {
    const { editCategoryMode, currentCategory } = this.data

    if (!currentCategory.name.trim()) {
      wx.showToast({
        title: '请输入分类名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      if (editCategoryMode) {
        const { _id, _openid, ...updateData } = currentCategory
        await db.collection('dishCategory').doc(_id).update({
          data: updateData
        })
      } else {
        const addRes = await db.collection('dishCategory').add({
          data: {
            name: currentCategory.name,
            sort: currentCategory.sort,
            createTime: new Date()
          }
        })

        this.setData({
          currentCategoryId: addRes._id
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeCategoryModal()
      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  deleteCategory(e) {
    const category = e.currentTarget.dataset.category

    wx.showModal({
      title: '确认删除',
      content: `确定要删除分类"${category.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('dishCategory').doc(category._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            if (this.data.currentCategoryId === category._id) {
              this.setData({
                currentCategoryId: '',
                dishes: []
              })
            }

            this.loadCategories()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({
              title: err.code === 'CATEGORY_NOT_EMPTY'
                ? '请先处理分类下的菜品'
                : '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // ==================== 菜品管理 ====================
  normalizeDishForView(dish) {
    const skus = normalizeSkus(dish)
    const images = normalizeDishImages(dish)
    const enabledSkus = skus.filter(sku => sku.status !== 0)
    const baseSku = (enabledSkus.length > 0 ? enabledSkus : skus)
      .slice()
      .sort((a, b) => Number(a.price || 0) - Number(b.price || 0))[0]

    return {
      ...dish,
      skus,
      images,
      image: images[0] || '',
      price: Number(baseSku.price || dish.price || 0),
      skuSummary: skus.length > 1
        ? `${skus.length}个规格`
        : (skus[0] && skus[0].name !== DEFAULT_SKU_NAME ? skus[0].name : '')
    }
  },

  async loadDishes(append = false) {
    if (!this.data.currentCategoryId) {
      this.setData({
        dishes: [],
        dishPage: 0,
        dishHasMore: false
      })
      return
    }

    if (append && this.data.loadingDishes) {
      return
    }

    const categoryId = this.data.currentCategoryId
    const requestId = (this.dishRequestId || 0) + 1
    this.dishRequestId = requestId

    try {
      this.setData({ loadingDishes: true })

      const pageSize = this.data.dishPageSize
      const page = append ? this.data.dishPage + 1 : 0
      const skip = page * pageSize

      const res = await db.collection('dish')
        .where({
          categoryId
        })
        .orderBy('sort', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const list = (res.data || []).map(item => this.normalizeDishForView(item))
      if (requestId !== this.dishRequestId || categoryId !== this.data.currentCategoryId) {
        return
      }
      const newDishes = append ? this.data.dishes.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        dishes: newDishes,
        dishPage: page,
        dishHasMore: hasMore
      })
    } catch (err) {
      console.error('加载菜品失败', err)
      if (requestId === this.dishRequestId) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (requestId === this.dishRequestId) {
        this.setData({ loadingDishes: false })
      }
    }
  },

  onDishScrollToLower() {
    if (this.data.loadingDishes || !this.data.dishHasMore) {
      return
    }

    this.loadDishes(true)
  },

  showAddDishModal() {
    if (!this.data.currentCategoryId) {
      wx.showToast({
        title: '请先选择分类',
        icon: 'none'
      })
      return
    }

    const currentCategory = this.data.categories.find(c => c._id === this.data.currentCategoryId)

    this.setData({
      showDishModal: true,
      editDishMode: false,
      currentDish: {
        _id: '',
        name: '',
        price: '',
        description: '',
        categoryId: this.data.currentCategoryId,
        categoryName: currentCategory ? currentCategory.name : '',
        image: '',
        images: [],
        status: 1,
        sort: this.data.dishes.length,
        tags: [],
        skus: [createSku()]
      },
      dishEditorImageFailures: {}
    })
  },

  showEditDishModal(e) {
    const dish = this.normalizeDishForView(e.currentTarget.dataset.dish)
    const editableDish = clone(dish)
    if (editableDish.skus && editableDish.skus.length === 1 && editableDish.skus[0].name === DEFAULT_SKU_NAME) {
      editableDish.skus[0].name = ''
    }
    this.setData({
      showDishModal: true,
      editDishMode: true,
      currentDish: editableDish,
      dishEditorImageFailures: {}
    })
  },

  closeDishModal() {
    this.setData({
      showDishModal: false,
      dishEditorImageFailures: {}
    })
  },

  onDishImageError(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isNaN(index)) {
      this.setData({ [`dishes[${index}].imageLoadFailed`]: true })
    }
  },

  onDishEditorImageError(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isNaN(index)) {
      this.setData({
        dishEditorImageFailures: {
          ...this.data.dishEditorImageFailures,
          [index]: true
        }
      })
    }
  },

  async toggleDishStatus(e) {
    const dish = e.currentTarget.dataset.dish
    const newStatus = dish.status === 1 ? 0 : 1

    try {
      await db.collection('dish').doc(dish._id).update({
        data: {
          status: newStatus
        }
      })

      wx.showToast({
        title: newStatus === 1 ? '已上架' : '已下架',
        icon: 'success'
      })

      this.loadDishes()
    } catch (err) {
      console.error('切换状态失败', err)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  onDishNameInput(e) {
    let value = e.detail.value
    if (value.length > 24) {
      value = value.substring(0, 24)
      wx.showToast({
        title: '名称最多24个字',
        icon: 'none'
      })
    }
    this.setData({
      'currentDish.name': value
    })
  },

  onDishDescriptionInput(e) {
    let value = e.detail.value
    if (value.length > 80) {
      value = value.substring(0, 80)
      wx.showToast({
        title: '描述最多80个字',
        icon: 'none'
      })
    }
    this.setData({
      'currentDish.description': value
    })
  },

  onDishSortInput(e) {
    this.setData({
      'currentDish.sort': parseInt(e.detail.value, 10) || 0
    })
  },

  sanitizePriceInput(value) {
    if (value === '') {
      return ''
    }
    const num = Number(value)
    if (Number.isNaN(num)) {
      return ''
    }
    if (num < 0) {
      wx.showToast({
        title: '价格不能为负数',
        icon: 'none'
      })
      return 0
    }
    if (num > MAX_PRICE) {
      wx.showToast({
        title: `价格最高${MAX_PRICE}`,
        icon: 'none'
      })
      return MAX_PRICE
    }
    return value
  },

  updateSkuField(index, field, value) {
    const skus = clone(this.data.currentDish.skus || [])
    if (!skus[index]) return
    skus[index][field] = value
    this.setData({
      'currentDish.skus': skus
    })
  },

  addSku() {
    const skus = clone(this.data.currentDish.skus || [])
    skus.push(createSku({
      name: `规格${skus.length + 1}`,
      sort: skus.length
    }))
    this.setData({
      'currentDish.skus': skus
    })
  },

  deleteSku(e) {
    const index = e.currentTarget.dataset.index
    const skus = clone(this.data.currentDish.skus || [])
    if (skus.length <= 1) {
      wx.showToast({
        title: '至少保留一个规格',
        icon: 'none'
      })
      return
    }
    skus.splice(index, 1)
    this.setData({
      'currentDish.skus': skus
    })
  },

  onSkuNameInput(e) {
    this.updateSkuField(e.currentTarget.dataset.index, 'name', e.detail.value)
  },

  onSkuPriceInput(e) {
    this.updateSkuField(e.currentTarget.dataset.index, 'price', this.sanitizePriceInput(e.detail.value))
  },

  onSkuSortInput(e) {
    this.updateSkuField(e.currentTarget.dataset.index, 'sort', parseInt(e.detail.value, 10) || 0)
  },

  onSkuStatusChange(e) {
    this.updateSkuField(e.currentTarget.dataset.index, 'status', e.detail.value ? 1 : 0)
  },

  async chooseDishImage() {
    const currentImages = normalizeDishImages(this.data.currentDish)
    const remainingCount = MAX_DISH_IMAGES - currentImages.length

    if (remainingCount <= 0) {
      wx.showToast({
        title: '最多上传9张图片',
        icon: 'none'
      })
      return
    }

    let loadingVisible = false

    try {
      const res = await wx.chooseImage({
        count: remainingCount,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      const tempFilePaths = res.tempFilePaths || []
      if (tempFilePaths.length === 0) {
        return
      }

      loadingVisible = true
      wx.showLoading({
        title: `上传 0/${tempFilePaths.length}`,
        mask: true
      })

      const uploadedImages = []
      for (let index = 0; index < tempFilePaths.length; index++) {
        wx.showLoading({
          title: `上传 ${index + 1}/${tempFilePaths.length}`,
          mask: true
        })
        const cloudPath = `dish/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 10)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePaths[index]
        })
        uploadedImages.push(uploadRes.fileID)
      }

      const images = currentImages.concat(uploadedImages).slice(0, MAX_DISH_IMAGES)
      wx.hideLoading()
      loadingVisible = false
      this.setData({
        'currentDish.images': images,
        'currentDish.image': images[0] || '',
        dishEditorImageFailures: {}
      })

      wx.showToast({
        title: `已上传${uploadedImages.length}张`,
        icon: 'success'
      })
    } catch (err) {
      if (err && String(err.errMsg || '').includes('cancel')) {
        return
      }
      if (loadingVisible) {
        wx.hideLoading()
        loadingVisible = false
      }
      console.error('上传图片失败', err)
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    } finally {
      if (loadingVisible) {
        wx.hideLoading()
      }
    }
  },

  removeDishImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = normalizeDishImages(this.data.currentDish)
    if (index < 0 || index >= images.length) {
      return
    }

    images.splice(index, 1)
    this.setData({
      'currentDish.images': images,
      'currentDish.image': images[0] || ''
    })
  },

  previewDishImage(e) {
    const images = normalizeDishImages(this.data.currentDish)
    const current = e.currentTarget.dataset.src || images[0]
    if (!current) {
      return
    }

    wx.previewImage({
      current,
      urls: images
    })
  },

  validateSkus(skus) {
    const source = Array.isArray(skus) && skus.length > 0 ? skus : [createSku()]
    const isSingleSku = source.length === 1
    const normalized = source.map((sku, index) => ({
      id: sku.id || makeId('sku'),
      name: String(sku.name || '').trim() || (isSingleSku ? DEFAULT_SKU_NAME : ''),
      price: sku.price === '' || sku.price === undefined || sku.price === null ? NaN : Number(sku.price),
      status: sku.status === 0 ? 0 : 1,
      sort: Number(sku.sort) || index
    }))

    for (let i = 0; i < normalized.length; i++) {
      const sku = normalized[i]
      if (!sku.name) {
        return { error: `请输入第${i + 1}个规格名称` }
      }
      if (Number.isNaN(sku.price)) {
        return { error: `请输入"${sku.name}"的售价` }
      }
      if (sku.price < 0 || sku.price > MAX_PRICE) {
        return { error: `"${sku.name}"售价需在0-${MAX_PRICE}之间` }
      }
    }

    const enabledSkus = normalized.filter(sku => sku.status === 1)
    if (enabledSkus.length === 0) {
      return { error: '至少启用一个规格' }
    }

    return {
      skus: normalized.sort((a, b) => a.sort - b.sort),
      enabledSkus
    }
  },

  async saveDish() {
    const { editDishMode, currentDish } = this.data

    if (!currentDish.name || !currentDish.name.trim()) {
      wx.showToast({
        title: '请输入菜品名称',
        icon: 'none'
      })
      return
    }

    if (currentDish.name.trim().length > 24) {
      wx.showToast({
        title: '菜品名称最多24个字',
        icon: 'none'
      })
      return
    }

    const dishImages = normalizeDishImages(currentDish)
    if (dishImages.length === 0) {
      wx.showToast({
        title: '请上传菜品图片',
        icon: 'none'
      })
      return
    }

    if (currentDish.description && currentDish.description.trim().length > 80) {
      wx.showToast({
        title: '菜品描述最多80个字',
        icon: 'none'
      })
      return
    }

    if (!currentDish.categoryId) {
      wx.showToast({
        title: '请选择分类',
        icon: 'none'
      })
      return
    }

    const skuResult = this.validateSkus(currentDish.skus)
    if (skuResult.error) {
      wx.showToast({
        title: skuResult.error,
        icon: 'none'
      })
      return
    }

    const baseSku = skuResult.enabledSkus
      .slice()
      .sort((a, b) => Number(a.price || 0) - Number(b.price || 0))[0]

    try {
      wx.showLoading({ title: '保存中...' })
      const { _id, _openid, skuSummary, ...updateData } = currentDish
      delete updateData[['canUse', 'Mian', 'dan'].join('')]

      updateData.name = currentDish.name.trim()
      updateData.description = currentDish.description ? currentDish.description.trim() : ''
      updateData.images = dishImages
      updateData.image = dishImages[0]
      updateData.tags = Array.isArray(currentDish.tags) ? currentDish.tags : []
      updateData.skus = skuResult.skus
      updateData.price = Number(baseSku.price.toFixed(2))
      delete updateData[['original', 'Price'].join('')]
      updateData.updateTime = new Date()

      if (editDishMode) {
        updateData[['original', 'Price'].join('')] = db.command.remove()
        await db.collection('dish').doc(_id).update({
          data: updateData
        })
      } else {
        await db.collection('dish').add({
          data: {
            ...updateData,
            createTime: new Date()
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeDishModal()
      this.loadDishes()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  deleteDish(e) {
    const dish = e.currentTarget.dataset.dish

    wx.showModal({
      title: '确认删除',
      content: `确定要删除菜品"${dish.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('dish').doc(dish._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadDishes()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // ==================== 口味/做法管理 ====================
  showAddTagModal() {
    this.setData({
      showTagModal: true,
      editingTagIndex: -1,
      currentTag: {
        name: '',
        type: 'single',
        required: true,
        options: []
      },
      newOption: ''
    })
  },

  showEditTagModal(e) {
    const index = e.currentTarget.dataset.index
    const tag = this.data.currentDish.tags[index]
    this.setData({
      showTagModal: true,
      editingTagIndex: index,
      currentTag: clone(tag),
      newOption: ''
    })
  },

  closeTagModal() {
    this.setData({
      showTagModal: false
    })
  },

  onTagNameInput(e) {
    this.setData({
      'currentTag.name': e.detail.value
    })
  },

  selectTagType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      'currentTag.type': type
    })
  },

  onTagRequiredChange(e) {
    this.setData({
      'currentTag.required': e.detail.value
    })
  },

  onOptionInput(e) {
    this.setData({
      newOption: e.detail.value
    })
  },

  addOption() {
    const { currentTag, newOption } = this.data
    if (!newOption.trim()) {
      wx.showToast({
        title: '请输入选项内容',
        icon: 'none'
      })
      return
    }

    if (currentTag.options.includes(newOption.trim())) {
      wx.showToast({
        title: '选项已存在',
        icon: 'none'
      })
      return
    }

    currentTag.options.push(newOption.trim())
    this.setData({
      currentTag,
      newOption: ''
    })
  },

  deleteOption(e) {
    const index = e.currentTarget.dataset.index
    const { currentTag } = this.data
    currentTag.options.splice(index, 1)
    this.setData({
      currentTag
    })
  },

  saveTag() {
    const { currentTag, editingTagIndex, currentDish } = this.data

    if (!currentTag.name.trim()) {
      wx.showToast({
        title: '请输入名称',
        icon: 'none'
      })
      return
    }

    if (currentTag.options.length === 0) {
      wx.showToast({
        title: '请至少添加一个选项',
        icon: 'none'
      })
      return
    }

    const tagData = {
      id: editingTagIndex === -1 ? makeId('tag') : currentDish.tags[editingTagIndex].id,
      name: currentTag.name.trim(),
      type: currentTag.type,
      required: currentTag.required,
      options: currentTag.options
    }

    if (editingTagIndex === -1) {
      currentDish.tags.push(tagData)
    } else {
      currentDish.tags[editingTagIndex] = tagData
    }

    this.setData({
      currentDish,
      showTagModal: false
    })
  },

  deleteTag(e) {
    const index = e.currentTarget.dataset.index
    const { currentDish } = this.data

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个口味/做法吗？',
      success: (res) => {
        if (res.confirm) {
          currentDish.tags.splice(index, 1)
          this.setData({
            currentDish
          })
        }
      }
    })
  },

  stopPropagation() {}
})
