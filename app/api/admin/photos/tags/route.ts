import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'

export async function GET(req: Request) {
  const { error } = await guardAdmin(req)
  if (error) return error

  const url = new URL(req.url)
  const q = url.searchParams.get('q') || ''
  const category = url.searchParams.get('category') || ''

  try {
    const conditions: string[] = ['1=1']
    const params: Record<string, any> = {}

    if (q) {
      conditions.push('t.name LIKE @q')
      params.q = `%${q}%`
    }

    if (category) {
      conditions.push('t.category = @category')
      params.category = category
    }

    const result = await query(
      `SELECT t.id, t.name, t.category, t.color, t.created_at,
              (SELECT COUNT(*) FROM photo_tags pt WHERE pt.tag_id = t.id) AS usage_count
       FROM tags t
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.category, t.name`,
      params
    )

    return Response.json({ tags: result.rows })
  } catch (error) {
    console.error('Tags list error:', error)
    return Response.json({ error: 'Failed to fetch tags' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const body = await req.json()
  const { name, category, color } = body as {
    name: string
    category?: string
    color?: string
  }

  if (!name || name.length > 100) {
    return Response.json({ error: 'Tag name is required (max 100 chars)' }, { status: 400 })
  }

  try {
    const result = await query(
      `INSERT INTO tags (name, category, color)
       OUTPUT INSERTED.id, INSERTED.name, INSERTED.category, INSERTED.color
       VALUES (@name, @category, @color)`,
      {
        name: name.trim(),
        category: category || 'custom',
        color: color || null,
      }
    )

    // Audit
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    await query(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES ('tag', @tagId, 'tag.created', @performedBy, @ip, @details)`,
      {
        tagId: result.rows[0]?.id,
        performedBy: ctx.adminEmail,
        ip,
        details: JSON.stringify({ name, category }),
      }
    )

    return Response.json({ tag: result.rows[0] }, { status: 201 })
  } catch (error: any) {
    if (error.message?.includes('UQ_tags_name_category')) {
      return Response.json({ error: 'Tag already exists in this category' }, { status: 409 })
    }
    console.error('Tag create error:', error)
    return Response.json({ error: 'Failed to create tag' }, { status: 500 })
  }
}
