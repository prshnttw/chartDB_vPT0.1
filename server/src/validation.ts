import { z } from 'zod';
import { ApiError } from './errors.js';

export const parse = <T extends z.ZodTypeAny>(
    schema: T,
    data: unknown
): z.infer<T> => {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issue = result.error.issues[0];
        throw new ApiError(
            422,
            'VALIDATION_ERROR',
            `${issue.path.join('.') || 'body'}: ${issue.message}`
        );
    }
    return result.data;
};

export const uuidSchema = z.string().uuid();

export const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email('must be a valid email address');

export const passwordSchema = z
    .string()
    .min(10, 'must be at least 10 characters')
    .max(128, 'must be at most 128 characters')
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
        message: 'must contain at least one letter and one number',
    });

export const nameSchema = z.string().trim().min(1).max(100);

/** True if the email's domain is d or a subdomain of d, for any allowed d. */
export const isEmailDomainAllowed = (email: string, allowed: string[]) => {
    const domain = email.slice(email.lastIndexOf('@') + 1);
    return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
};

// Diagram payload: ChartDB's own Diagram shape, stored as JSONB. We check the
// envelope and bound the arrays; the editor owns the inner schema.
const arr = z.array(z.record(z.unknown())).max(5000).optional();
export const diagramDataSchema = z
    .object({
        databaseType: z.string().max(50),
        tables: arr,
        relationships: arr,
        dependencies: arr,
        areas: arr,
        customTypes: arr,
        notes: arr,
    })
    .passthrough();

export const diagramBodySchema = z.object({
    name: z.string().trim().min(1).max(255),
    data: diagramDataSchema,
});

export const diagramCreateSchema = diagramBodySchema.extend({
    id: uuidSchema.optional(),
});
