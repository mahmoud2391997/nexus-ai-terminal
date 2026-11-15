// Minimal in-memory stand-in for the Prisma client, used ONLY when DATABASE_URL
// is not set (e.g. a quick no-database demo). Data lives in process memory, so it
// resets on cold starts and is not shared across serverless instances.
// Implements just the operations this app uses.
import { randomBytes } from 'node:crypto'

type Row = Record<string, unknown>
type Where = Record<string, unknown>

const DEFAULTS: Record<string, Row> = {
  toolExecution: { status: 'PENDING' },
  approvalRequest: { status: 'PENDING' },
  task: { status: 'queued' },
  oAuthConnection: { status: 'connected' },
}

const isPlainObject = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v)

function matches(row: Row, where: Where = {}): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue
    if (isPlainObject(cond)) {
      if ('in' in cond || 'gt' in cond || 'lt' in cond || 'not' in cond) {
        const v = row[key] as never
        if ('in' in cond && !(cond.in as unknown[]).includes(v)) return false
        if ('gt' in cond && !(v > (cond.gt as never))) return false
        if ('lt' in cond && !(v < (cond.lt as never))) return false
        if ('not' in cond && v === cond.not) return false
      } else if (!matches(row, cond)) {
        // compound unique key, e.g. { userId_provider: { userId, provider } }
        return false
      }
    } else if (row[key] !== cond) {
      return false
    }
  }
  return true
}

function sortRows(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] {
  if (!orderBy) return rows
  const [[field, dir]] = Object.entries(orderBy)
  return [...rows].sort((a, b) => {
    const av = (a[field] ?? 0) as never
    const bv = (b[field] ?? 0) as never
    return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === 'desc' ? -1 : 1)
  })
}

function createModel(name: string, table: Row[]) {
  const make = (data: Row): Row => {
    const now = new Date()
    return {
      id: `c${randomBytes(10).toString('hex')}`,
      createdAt: now,
      updatedAt: now,
      ...DEFAULTS[name],
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    }
  }
  const patch = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) if (v !== undefined) row[k] = v
    row.updatedAt = new Date()
  }
  const find = (args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> } = {}) =>
    sortRows(table.filter((r) => matches(r, args.where)), args.orderBy)

  return {
    async create({ data }: { data: Row }) {
      const row = make(data)
      table.push(row)
      return { ...row }
    },
    async findUnique(args: { where: Where }) {
      const r = find(args)[0]
      return r ? { ...r } : null
    },
    async findFirst(args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) {
      const r = find(args)[0]
      return r ? { ...r } : null
    },
    async findMany(args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'>; take?: number } = {}) {
      return find(args).slice(0, args.take).map((r) => ({ ...r }))
    },
    async update({ where, data }: { where: Where; data: Row }) {
      const r = table.find((x) => matches(x, where))
      if (!r) throw new Error(`${name}: record not found`)
      patch(r, data)
      return { ...r }
    },
    async updateMany({ where, data }: { where?: Where; data: Row }) {
      const rows = table.filter((r) => matches(r, where))
      rows.forEach((r) => patch(r, data))
      return { count: rows.length }
    },
    async upsert({ where, create, update }: { where: Where; create: Row; update: Row }) {
      const r = table.find((x) => matches(x, where))
      if (r) {
        patch(r, update)
        return { ...r }
      }
      const row = make(create)
      table.push(row)
      return { ...row }
    },
  }
}

export function createMemoryPrisma() {
  const tables = new Map<string, Row[]>()
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== 'string' || prop.startsWith('$') || prop === 'then') return undefined
        if (!tables.has(prop)) tables.set(prop, [])
        return createModel(prop, tables.get(prop)!)
      },
    },
  )
}
