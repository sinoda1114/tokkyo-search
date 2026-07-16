import { z } from "zod";

const envSchema = z.object({
  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().optional(),

  GCP_PROJECT_ID: z.string().min(1),
  GCP_SERVICE_ACCOUNT_KEY: z.string().min(1),
  BQ_DATASET: z.string().min(1).default("patents_jp"),
  BQ_MAX_BYTES_BILLED: z.coerce.number().int().positive().default(53_687_091_200),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash-lite"),

  // 特許庁 特許情報取得API。申請中のため未設定でも起動できる（該当機能は無効化される）。
  JPO_API_USERNAME: z.string().optional(),
  JPO_API_PASSWORD: z.string().optional(),

  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`環境変数が不正です: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof Env];
  },
});

export function isJpoEnabled(): boolean {
  return Boolean(process.env.JPO_API_USERNAME && process.env.JPO_API_PASSWORD);
}
