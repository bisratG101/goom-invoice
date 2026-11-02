import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(1, 'Full name is required').max(100, 'Name must not exceed 100 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessName: z.string().min(1, 'Business name is required').max(120, 'Business name must not exceed 120 characters'),
  defaultCurrency: z.enum(['ETB', 'USD']),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
