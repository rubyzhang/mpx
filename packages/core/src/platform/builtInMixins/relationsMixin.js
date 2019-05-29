import { type } from '../../helper/utils'
import { is } from '../../helper/env'

const targets = []
let curTarget = null
function pushTarget (cur) {
  targets.push(curTarget)
  curTarget = cur
}

function popTarget () {
  curTarget = targets.pop()
}

function parsePath (path, absolute) {
  if (path.indexOf('/') === 0) {
    return path
  }
  const dirs = absolute.split('/').slice(0, -1)
  let relatives = path.split('/')
  relatives = relatives.filter(path => {
    if (path === '..') {
      dirs.pop()
      return false
    } else {
      return path !== '.'
    }
  })
  return dirs.concat(relatives).join('/')
}

function transferPath (relations, base) {
  const newRelations = {}
  Object.keys(relations).forEach(key => {
    newRelations[parsePath(key, base)] = relations[key]
  })
  return newRelations
}

export default function relationsMixin () {
  if (is('ali')) {
    return {
      methods: {
        getRelationNodes (path) {
          const realPath = parsePath(path, this.is)
          return this.$relationNodesMap && this.$relationNodesMap[realPath]
        },
        mpxCollectComponentSlot (children, list) {
          children.forEach(child => {
            if (child && child.props) {
              if (child.props.$isCustomComponent) {
                list.push(child)
              } else {
                const childrenType = type(child.props.children)
                if (childrenType === 'Object' || childrenType === 'Array') {
                  const slotChildren = childrenType !== 'Array' ? [child.props.children] : child.props.children
                  this.mpxCollectComponentSlot(slotChildren, list)
                }
              }
            }
          })
        },
        mpxNotifyParent () {
          if (this.mpxSlotLinkNum < this.mpxSlotChildren.length) {
            this.mpxSlotLinkNum++
            if (this.mpxSlotLinkNum === this.mpxSlotChildren.length) {
              popTarget()
            }
          }
        },
        mpxExecAllRelations (type) {
          this.mpxRelationContexts.forEach(context => {
            context.mpxExecRelation(this, type)
            this.mpxExecRelation(context, type)
          })
        },
        mpxExecRelation (target, type) {
          this.mpxCacheRelationNode(target, type)
          const relations = this.$mpxRelations || {}
          const path = target.is
          if (relations[path]) {
            typeof relations[path][type] === 'function' && relations[path][type].call(this, target)
          }
        },
        mpxCacheRelationNode (target, type) {
          const path = target.is
          const nodes = this.$relationNodesMap[path] || []
          if (type === 'linked') {
            nodes.push(target)
          } else {
            const index = nodes.indexOf(target)
            index > -1 && nodes.splice(index, 1)
          }
          this.$relationNodesMap[path] = nodes
        },
        mpxGetRelation (child) {
          const parentRelations = this.$mpxRelations || {}
          const childRelations = child.$mpxRelations || {}
          if (parentRelations[child.is] && childRelations[this.is]) {
            const parentType = parentRelations[child.is].type
            const childType = childRelations[this.is].type
            return {
              parentType,
              childType
            }
          }
        },
        mpxPropagateFindRelation (child) {
          let cur = this
          let contexts = []
          let depth = 1
          // 向上查找所有可能匹配的父级relation上下文
          while (cur) {
            const relations = cur.mpxGetRelation(child)
            if (relations) {
              if ((relations.parentType === 'child' && relations.childType === 'parent' && depth === 1) ||
                (relations.parentType === 'descendant' && relations.childType === 'ancestor')) {
                contexts.push(cur)
              }
            }
            cur = cur.mpxSlotParent
            depth++
          }
          return contexts
        }
      },
      onInit () {
        if (this.$rawOptions.relations) {
          this.$mpxRelations = transferPath(this.$rawOptions.relations, this.is)
          this.$relationNodesMap = {}
        }
        if (curTarget) {
          this.mpxSlotParent = curTarget // slot 父级
          if (this.$mpxRelations) {
            const contexts = curTarget.mpxPropagateFindRelation(this) // relation 父级|祖先
            if (contexts) {
              this.mpxRelationContexts = contexts
              this.mpxExecAllRelations('linked')
            }
          }
        }
      },
      deriveDataFromProps (nextProps) {
        this.mpxSlotParent && this.mpxSlotParent.mpxNotifyParent() // 通知slot父级，确保父级能执行popTarget
        if (this.$mpxRelations) {
          const slots = nextProps.$slots || {}
          this.mpxSlotChildren = []
          this.mpxSlotLinkNum = 0
          Object.keys(slots).forEach(key => {
            this.mpxCollectComponentSlot(slots[key], this.mpxSlotChildren)
          })
          if (this.mpxSlotChildren.length) {
            pushTarget(this)
          }
        }
      },
      didUnmount () {
        if (this.mpxRelationContexts) {
          this.mpxExecAllRelations('unlinked')
        }
      }
    }
  }
}