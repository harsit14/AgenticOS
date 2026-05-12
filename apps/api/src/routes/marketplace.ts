import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { agentTemplates, agents } from '../db/schema.js';
import { eq, desc, asc, and, like, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

interface CreateTemplateBody {
  name: string;
  description?: string;
  category?: string[];
  config: Record<string, unknown>;
  tags?: string[];
  isPublic?: boolean;
  previewAvatar?: string;
  sampleConversation?: Array<{ role: string; content: string }>;
}

interface UpdateTemplateBody extends Partial<CreateTemplateBody> {
  rating?: number;
  installCount?: number;
}

interface RateTemplateBody {
  rating: number;
  review?: string;
}

interface InstallTemplateBody {
  name?: string;
  createdBy?: string;
}

export async function marketplaceRoutes(fastify: FastifyInstance) {
  // List all public templates
  fastify.get('/marketplace/templates', async (request, reply) => {
    const { category, search, sort = 'popular', limit = 20, offset = 0 } = request.query as {
      category?: string;
      search?: string;
      sort?: 'popular' | 'rating' | 'recent' | 'installs';
      limit?: number;
      offset?: number;
    };

    let query = db.select().from(agentTemplates).where(eq(agentTemplates.isPublic, true));

    // Apply filters
    let templates = await query.orderBy(desc(agentTemplates.installCount));

    // Filter by category
    if (category) {
      templates = templates.filter(t => t.category && JSON.parse(t.category as string).includes(category));
    }

    // Search by name or description
    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        (t.description && t.description.toLowerCase().includes(searchLower))
      );
    }

    // Sort
    switch (sort) {
      case 'rating':
        templates = templates.sort((a, b) => b.rating - a.rating);
        break;
      case 'recent':
        templates = templates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case 'installs':
        templates = templates.sort((a, b) => b.installCount - a.installCount);
        break;
    }

    const paginated = templates.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        templates: paginated,
        total: templates.length,
        limit,
        offset,
      },
    };
  });

  // Get template by ID
  fastify.get<{ Params: { id: string } }>('/marketplace/templates/:id', async (request, reply) => {
    const { id } = request.params;

    const template = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id)).limit(1);

    if (!template.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    return {
      success: true,
      data: template[0],
    };
  });

  // Create template from existing agent
  fastify.post<{ Params: { agentId: string }; Body: { name?: string; description?: string; category?: string[]; tags?: string[]; isPublic?: boolean } }>(
    '/marketplace/templates/from-agent/:agentId',
    async (request, reply) => {
      const { agentId } = request.params;
      const { name, description, category = [], tags = [], isPublic = false } = request.body;

      // Get the agent
      const agent = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);

      if (!agent.length) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Agent not found' },
        });
      }

      const now = new Date();
      const template = {
        id: nanoid(),
        name: name || `${agent[0].name} Template`,
        description: description || agent[0].description,
        category: JSON.stringify(category),
        authorId: agent[0].createdBy,
        authorName: 'User',
        rating: 0,
        installCount: 0,
        config: JSON.stringify({
          persona: agent[0].persona,
          tools: agent[0].tools,
          defaultModelId: agent[0].defaultModelId,
          fallbackModelId: agent[0].fallbackModelId,
          memoryConfig: agent[0].memoryConfig,
          rateLimit: agent[0].rateLimit,
        }),
        tags: JSON.stringify(tags.length ? tags : agent[0].tags),
        isPublic,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(agentTemplates).values(template);

      return reply.status(201).send({
        success: true,
        data: {
          ...template,
          category: JSON.parse(template.category as string),
          tags: JSON.parse(template.tags as string),
        },
      });
    }
  );

  // Install template (creates agent from template)
  fastify.post<{ Params: { id: string }; Body: InstallTemplateBody }>(
    '/marketplace/templates/:id/install',
    async (request, reply) => {
      const { id } = request.params;
      const { name: customName, createdBy = 'user' } = request.body;

      const template = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id)).limit(1);

      if (!template.length) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Template not found' },
        });
      }

      const config = JSON.parse(template[0].config as string);
      const now = new Date();

      // Create agent from template
      const agent = {
        id: nanoid(),
        name: customName || template[0].name.replace(' Template', ''),
        description: template[0].description || '',
        persona: JSON.stringify(config.persona),
        tools: JSON.stringify(config.tools || []),
        defaultModelId: config.defaultModelId || 'default',
        fallbackModelId: config.fallbackModelId || null,
        memoryConfig: JSON.stringify(config.memoryConfig || { strategy: 'sliding_window', maxMessages: 50 }),
        rateLimit: config.rateLimit || 60,
        createdBy,
        tags: template[0].tags,
        isTemplate: false,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(agents).values(agent);

      // Increment install count
      await db.update(agentTemplates).set({
        installCount: template[0].installCount + 1,
        updatedAt: now,
      }).where(eq(agentTemplates.id, id)).run();

      return reply.status(201).send({
        success: true,
        data: {
          agentId: agent.id,
          name: agent.name,
          message: 'Template installed successfully',
        },
      });
    }
  );

  // Rate template
  fastify.post<{ Params: { id: string }; Body: RateTemplateBody }>(
    '/marketplace/templates/:id/rate',
    async (request, reply) => {
      const { id } = request.params;
      const { rating } = request.body;

      if (rating < 1 || rating > 5) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Rating must be between 1 and 5' },
        });
      }

      const template = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id)).limit(1);

      if (!template.length) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Template not found' },
        });
      }

      // Simple average rating update (in production, track individual ratings)
      const currentRating = template[0].rating;
      const installs = template[0].installCount || 1;
      const newRating = (currentRating * (installs - 1) + rating) / installs;

      await db.update(agentTemplates).set({
        rating: newRating,
        updatedAt: new Date(),
      }).where(eq(agentTemplates.id, id)).run();

      return {
        success: true,
        data: { newRating },
      };
    }
  );

  // Get categories
  fastify.get('/marketplace/categories', async (request, reply) => {
    const templates = await db.select().from(agentTemplates).where(eq(agentTemplates.isPublic, true));

    const categoryCount = new Map<string, number>();
    templates.forEach(t => {
      const categories = JSON.parse(t.category as string) as string[];
      categories.forEach(cat => {
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
      });
    });

    const categories = Array.from(categoryCount.entries()).map(([name, count]) => ({
      name,
      count,
    })).sort((a, b) => b.count - a.count);

    return {
      success: true,
      data: categories,
    };
  });

  // Submit template for curation (private template request)
  fastify.post<{ Body: CreateTemplateBody }>('/marketplace/templates/submit', async (request, reply) => {
    const { name, description, category = [], config, tags = [], isPublic = false } = request.body;

    if (!name || !config) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and config are required' },
      });
    }

    const now = new Date();
    const template = {
      id: nanoid(),
      name,
      description: description || '',
      category: JSON.stringify(category),
      authorId: 'user',
      authorName: 'User',
      rating: 0,
      installCount: 0,
      config: JSON.stringify(config),
      tags: JSON.stringify(tags),
      isPublic,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agentTemplates).values(template);

    return reply.status(201).send({
      success: true,
      data: {
        ...template,
        category: JSON.parse(template.category as string),
        tags: JSON.parse(template.tags as string),
      },
    });
  });

  // Get user's own templates
  fastify.get('/marketplace/my-templates', async (request, reply) => {
    const { userId = 'user' } = request.query as { userId?: string };

    const templates = await db.select().from(agentTemplates)
      .where(eq(agentTemplates.authorId, userId))
      .orderBy(desc(agentTemplates.updatedAt));

    return {
      success: true,
      data: templates.map(t => ({
        ...t,
        category: JSON.parse(t.category as string),
        tags: JSON.parse(t.tags as string),
      })),
    };
  });

  // Delete template
  fastify.delete<{ Params: { id: string } }>('/marketplace/templates/:id', async (request, reply) => {
    const { id } = request.params;
    const { userId = 'user' } = request.query as { userId?: string };

    const template = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id)).limit(1);

    if (!template.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    if (template[0].authorId !== userId) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only delete your own templates' },
      });
    }

    await db.delete(agentTemplates).where(eq(agentTemplates.id, id)).run();

    return {
      success: true,
      data: { deleted: true },
    };
  });

  // Fork template
  fastify.post<{ Params: { id: string } }>('/marketplace/templates/:id/fork', async (request, reply) => {
    const { id } = request.params;
    const { name, createdBy = 'user' } = request.body as { name?: string; createdBy?: string };

    const template = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id)).limit(1);

    if (!template.length) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    const now = new Date();
    const forkedTemplate = {
      id: nanoid(),
      name: name || `${template[0].name} (Fork)`,
      description: template[0].description,
      category: template[0].category,
      authorId: createdBy,
      authorName: 'User',
      rating: 0,
      installCount: 0,
      config: template[0].config,
      tags: template[0].tags,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agentTemplates).values(forkedTemplate);

    return reply.status(201).send({
      success: true,
      data: {
        ...forkedTemplate,
        category: JSON.parse(forkedTemplate.category as string),
        tags: JSON.parse(forkedTemplate.tags as string),
      },
    });
  });
}