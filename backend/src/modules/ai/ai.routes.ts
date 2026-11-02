import { Router, Request, Response } from 'express';
import { requireAuth, requireOwner } from '../../middleware/auth';
import { aiRateLimiter } from '../../middleware/rateLimit';
import { getDbPool } from '../../db/pool';
import { env } from '../../config/env';
import {
  draftRequestSchema,
  checkAndIncrementAiUsage,
  matchClient,
  callGemini,
  generateMockAiDraft,
  buildDraftResponse,
} from './ai.service';

export const aiRouter = Router();

aiRouter.post(
  '/draft-invoice',
  requireAuth,
  requireOwner,
  aiRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    // 1. Verify LLM configuration if explicitly configured for external Gemini
    const isGemini = env.LLM_PROVIDER === 'gemini';
    if (isGemini && (!env.LLM_API_KEY || !env.LLM_API_KEY.trim())) {
      res.status(503).json({
        error: {
          code: 'AI_NOT_CONFIGURED',
          message: 'AI invoice drafting is not configured. Please set LLM_API_KEY on the server.',
        },
      });
      return;
    }

    // 2. Validate input prompt
    const parsed = draftRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join(', '),
          details: parsed.error.format(),
        },
      });
      return;
    }

    const { prompt } = parsed.data;
    const business = req.business!;
    const pool = getDbPool();

    if (!pool) {
      res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Database connection unavailable',
        },
      });
      return;
    }

    try {
      // 3. Check persistent monthly limit for this business
      const { allowed } = await checkAndIncrementAiUsage(
        pool,
        business.id,
        env.LLM_MONTHLY_LIMIT
      );

      if (!allowed) {
        res.status(429).json({
          error: {
            code: 'MONTHLY_LIMIT_EXCEEDED',
            message: `Monthly AI invoice drafting limit of ${env.LLM_MONTHLY_LIMIT} requests reached for this business.`,
          },
        });
        return;
      }

      // 4. Generate draft via simulated provider or external Gemini
      let rawDraft;
      let provider: 'simulated' | 'gemini' = 'simulated';

      if (isGemini && env.LLM_API_KEY && env.LLM_API_KEY.trim()) {
        try {
          rawDraft = await callGemini(prompt, env.LLM_API_KEY);
          provider = 'gemini';
        } catch (geminiErr: any) {
          res.status(502).json({
            error: {
              code: 'AI_SERVICE_ERROR',
              message: geminiErr.message || 'Failed to generate invoice draft from AI service.',
            },
          });
          return;
        }
      } else {
        // High-fidelity offline simulated AI draft generator
        rawDraft = generateMockAiDraft(prompt);
        provider = 'simulated';
      }

      // 5. Match client restricted strictly to business.id
      const matchResult = await matchClient(pool, business.id, rawDraft.clientName);

      // 6. Build verified response data using integer money calculations
      const draftData = buildDraftResponse(rawDraft, matchResult, business.timezone, provider);

      res.status(200).json(draftData);
    } catch (err: any) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: err.message || 'An unexpected error occurred while generating invoice draft.',
        },
      });
    }
  }
);
