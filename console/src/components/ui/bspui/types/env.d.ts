/**
 * Vite's own `ImportMetaEnv` carries a `[key: string]: any` index signature, so
 * every `import.meta.env.VITE_*` read is untyped until it is declared here.
 * See the README for what each one is for.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Optional: WhatsApp Embedded Signup. */
  readonly VITE_META_APP_ID?: string;
  /** Optional: Tech Provider login flow. */
  readonly VITE_FB_LOGIN_CONFIG_ID?: string;
}
