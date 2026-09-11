import { SettingsAccount } from "@/components/SettingsAccount";
import { OpenAiKeyForm } from "@/components/OpenAiKeyForm";
import { SerpApiKeyForm } from "@/components/SerpApiKeyForm";
import { requirePageAuth } from "@/lib/auth";
import { openaiConfigured } from "@/lib/ai";
import { serpApiKeyConfigured } from "@/lib/secrets";

export default async function SettingsPage() {
  const user = await requirePageAuth();
  const [openai, serpapi] = await Promise.all([openaiConfigured(), serpApiKeyConfigured()]);

  return (
    <div className="mx-auto w-full max-w-md space-y-5 pt-2">
      <SettingsAccount initialEmail={user.email} />

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">API keys</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">OpenAI</h2>
        <div className="mt-3">
          <OpenAiKeyForm configured={openai} />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">SerpAPI</h2>
        <div className="mt-3">
          <SerpApiKeyForm configured={serpapi} />
        </div>
      </div>
    </div>
  );
}
