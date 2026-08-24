import { z } from 'zod';

const password = z.string().min(8).regex(/[a-zA-Z]/, 'Doit contenir une lettre').regex(/\d/, 'Doit contenir un chiffre');

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password,
  firstName: z.string().min(2).max(60),
  lastName: z.string().min(2).max(60),
  phone: z.string().regex(/^[+0-9 ]{8,20}$/).optional(),
  birthDate: z.coerce.date().optional(),
  gender: z.enum(['M', 'F']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(2).max(60).optional(),
  lastName: z.string().min(2).max(60).optional(),
  phone: z.string().regex(/^[+0-9 ]{8,20}$/).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  gender: z.enum(['M', 'F']).optional(),
  emergencyContact: z.string().max(120).optional(),
  nationalId: z.string().min(6).max(30).optional(),
  language: z.enum(['fr']).optional(),
});
